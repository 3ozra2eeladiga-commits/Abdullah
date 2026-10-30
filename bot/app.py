"""Главный файл: запускает сервер, Telegram и связывает всё вместе.

Запуск:  python -m bot.app
"""
import json
import logging
import os
import re
import subprocess
import sys
import threading
from collections import defaultdict

from flask import Flask, Response, abort, request
from waitress import serve

from . import brain, config, db, images, instagram, llm, telegram_bot
from .catalog import catalog

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("flowerbot")


def _version():
    """Короткий хэш текущего коммита — чтобы видеть, какая версия кода реально запущена на сервере."""
    try:
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return subprocess.check_output(["git", "-C", root, "log", "-1", "--format=%h %s"],
                                       text=True, timeout=5).strip()
    except Exception:
        return "неизвестно"


VERSION = _version()

app = Flask(__name__)
_client_locks = defaultdict(threading.Lock)

# Клиент спрашивает о судьбе заказа: «получили?», «когда привезут?», «где заказ?», «доставили?»
STATUS_RE = re.compile(r"получил|доставил|доставлен|привез|привёз|когда\s+(?:будет|привез|достав|приед)|где\s+(?:заказ|букет|курьер)|"
                       r"статус|заказ\s+(?:принят|оформлен|готов)|курьер|едет|в\s+пути|оплат", re.I)
SORRY = "Извините, у нас небольшая техническая заминка 🙏 Сотрудник скоро ответит вам."


# ---------- Куда отправлять ответ клиенту ----------

def _send_text(client, text):
    kind, cid = client.split(":", 1)
    if kind == "ig":
        instagram.send_text(cid, text)
    else:  # tgb — бизнес-аккаунт магазина, tg — тестовый режим
        telegram_bot.send_client(client, text)


def _send_photo(client, item):
    kind, cid = client.split(":", 1)
    if kind == "ig":
        instagram.send_photo(cid, item)
    else:
        telegram_bot.send_client_photo(client, item)


def _label(client):
    kind, cid = client.split(":", 1)
    return {"ig": f"Инстаграм-клиент {cid}", "tgb": f"клиент Telegram {cid}",
            "tg": f"🧪 тестовый клиент (Telegram {cid})"}.get(kind, cid)


def _order_ready(o):
    """Последняя проверка перед отправкой флористу: все ключевые поля на месте.
    Независимая страховка — даже если где-то в логике ошибка, неполный заказ флористу не уйдёт."""
    if not isinstance(o, dict) or not o.get("товары"):
        return False
    need = ["заказчик", "получатель", "дата", "время"]
    if o.get("получение") == "доставка":
        need.append("адрес")
    return all(str(o.get(k) or "").strip() not in ("", "—") for k in need)


def _format_order(order_id, client, reply):
    o = reply.order
    if not o:
        # JSON не распознался — показываем аккуратно, без «сырого кода»
        return (f"🔎 ЗАЯВКА НА ПРОВЕРКУ №{order_id}\n{_label(client)}\n\n"
                "⚠️ Заказ не распознался автоматически. Детали — в переписке с клиентом.\n"
                "Ответьте на это сообщение, чтобы написать клиенту.")

    def val(x):
        return str(x).strip() if str(x if x is not None else "").strip() not in ("", "—", "...", "…") else "—"

    def given(x):  # поле реально заполнено (ИИ иногда оставляет «...» из шаблона)
        return val(x) != "—"

    pickup = o.get("получение") == "самовывоз"
    lines = [f"🔎 ЗАЯВКА НА ПРОВЕРКУ №{order_id}", _label(client), "━━━━━━━━━━━━━━", "🛍 ТОВАР:"]
    for it in o.get("товары", []):
        qty = it.get("кол-во", 1)
        each = it.get("цена_за_шт") or it.get("цена")
        total = it.get("сумма") or (each * qty if isinstance(each, (int, float)) else each)
        lines.append(f"   • {val(it.get('название'))} × {qty} = {val(total)} ₽")
    try:
        extra = int(o.get("доплата") or 0)
    except (TypeError, ValueError):
        extra = 0
    if extra:
        lines.append(f"   ➕ {'Собрать ПЫШНЕЕ: добавить цветов на' if extra > 0 else 'Собрать СКРОМНЕЕ: на'} "
                     f"{abs(extra)} ₽{'' if extra > 0 else ' меньше'}")
    if given(o.get("упаковка")):
        lines.append(f"   🎀 Упаковка: {val(o['упаковка'])}")
    lines.append(f"   💰 Сумма товаров: {val(o.get('сумма_товаров'))} ₽")
    lines.append("")
    win = brain._delivery_window(o.get("дата"), o.get("время")) if not pickup else ""
    when = f"{val(o.get('дата'))}, {val(o.get('время'))}" + (f" (окно {win})" if win else "")
    lines.append(f"🕒 Когда: {when}")
    if pickup:
        lines.append(f"🏪 Самовывоз — {val(o.get('город'))}, {val(o.get('адрес'))}")
    else:
        lines.append(f"🚗 Доставка — {val(o.get('город'))}, {val(o.get('адрес'))}")
        dp = str(o.get("доставка_цена") or "").strip()
        lines.append("   стоимость доставки: " + ("бесплатно" if dp == "0" else f"{dp} ₽" if dp.isdigit() else
                                                  "назовите клиенту при подтверждении" if dp == "уточнят" else val(dp)))
    lines += [
        "",
        f"👤 Заказчик: {val(o.get('заказчик'))}",
        f"🎁 Получатель: {val(o.get('получатель'))}",
    ]
    if given(o.get("открытка")):
        lines.append(f"✉️ Текст открытки (написать от руки): {val(o['открытка'])}")
    if given(o.get("комментарий")):
        lines.append(f"📝 Комментарий: {val(o['комментарий'])}")
    lines += ["━━━━━━━━━━━━━━",
              "👉 Клиенту НЕ подтверждали заказ: проверьте, есть ли букет/цветы и свежие ли они, и нажмите кнопку.",
              "Ответьте на это сообщение — текст уйдёт клиенту."]
    return "\n".join(lines)


def deliver(client, text, from_staff=False, quote=""):
    """Главная функция: сообщение (от клиента или от сотрудника) -> ответ клиенту.
    quote — текст сообщения, на которое клиент ответил (reply), для распознавания букета."""
    secret = None if from_staff else config.secret_reply_for(text)
    if secret:                                          # секретный код: ответ сразу, в историю и ИИ не попадает
        _send_text(client, secret)
        return
    with _client_locks[client]:
        # Клиент прислал фото и теперь пишет, что хочет («у вас есть такой?») — фото с вопросом флористу.
        if not from_staff and not db.is_paused(client) and _photo_buf(client).get("photos"):
            old = _photo_timers.pop(client, None)
            if old:
                old.cancel()
            buf = _photo_buf(client)
            db.add_message(client, "user", text)
            buf.setdefault("texts", []).append(text)
            _photo_question(client, buf)
            return
        if not from_staff and db.is_paused(client):
            db.add_message(client, "user", text)
            # Бот молчит (клиента ведёт сотрудник), но вопрос о заказе/доставке не должен потеряться — флористу.
            if STATUS_RE.search(text or ""):
                telegram_bot.notify_staff(client, f"📦 Клиент спрашивает о заказе/доставке ({_label(client)}):\n"
                                                  f"«{text}»\nОтветьте клиенту в чате или ответом на это сообщение.")
            if client.startswith("tg:"):
                # В режиме проверки «клиент» — сам сотрудник: подсказываем, почему бот молчит
                telegram_bot.send(client.split(":", 1)[1],
                                  "⏸ Бот сейчас молчит с этим клиентом: разговор передан сотруднику.\n"
                                  "/resume — снова включить бота, /reset — начать проверку заново.")
            return
        try:
            reply = brain.respond(client, text, from_staff=from_staff, quote=quote)
        except Exception:
            log.exception("Ошибка ИИ для %s", client)
            _send_text(client, SORRY)
            telegram_bot.notify_staff(client, f"⚠️ Бот не смог ответить ({_label(client)}).\n"
                                              f"Сообщение клиента: {text}\nОтветьте на это сообщение, чтобы написать клиенту.")
            return

        order_id = db.save_order(client, reply.order) if reply.order else None
        if order_id and reply.text:
            reply.text += f"\nНомер заказа: №{order_id}"   # по нему клиент может спросить или отменить
        if reply.text:
            _send_text(client, brain.pretty(reply.text))  # короткими абзацами — легче читать
        for item in reply.photos:
            _send_photo(client, item)

        # Клиенту сказали «передала флористу» — значит, флорист ОБЯЗАН получить заявку. Если каких-то полей не
        # хватает, она всё равно уходит, но с пометкой — флорист уточнит у клиента. Заказ не должен теряться.
        if reply.order:
            # Фото заказанных товаров — чтобы флорист сразу видел, что собирать.
            items = []
            for it in reply.order.get("товары", []):
                code = (it.get("код") or "").strip().lower()
                obj = catalog.get(code) if code else brain._find_by_title(str(it.get("название") or ""), None)
                if obj and obj.get("images"):
                    items.append(obj)
            card = _format_order(order_id, client, reply)
            if not _order_ready(reply.order):
                log.warning("Неполный заказ отправлен флористу с пометкой (%s): %s", client, reply.order)
                card = "⚠️ В ЗАКАЗЕ НЕ ХВАТАЕТ ДАННЫХ — уточните у клиента (см. прочерки «—»)\n\n" + card
            db.set_setting(f"ostatus:{order_id}", "check")
            db.set_setting(f"ocheck:{client}", order_id)
            telegram_bot.notify_staff_order(client, items, card, buttons=_check_buttons(order_id))
        elif reply.order_raw:
            log.warning("Заказ не распознан (%s): %s", client, reply.order_raw)
        if reply.staff_note:                     # дополнение к отправленному заказу, отмена и т.п.
            telegram_bot.notify_staff_order(client, reply.staff_photos, f"{reply.staff_note}\n{_label(client)}")
        if reply.question:
            if reply.question.rstrip().endswith("?"):
                # Вопрос флористу — с кнопками «Да / Нет / Другое», чтобы ответить в одно касание.
                qid = int(db.get_setting("q_seq") or 0) + 1
                db.set_setting("q_seq", qid)
                db.set_setting(f"q:{qid}", json.dumps({"client": client, "q": reply.question}, ensure_ascii=False))
                telegram_bot.notify_staff(client, f"❓ ВОПРОС ОТ БОТА\n{_label(client)}\n\n{reply.question}\n\n"
                                                  "Нажмите кнопку или ответьте на это сообщение — бот передаст клиенту.",
                                          buttons=[[{"text": QUESTION_ACTIONS["yes"], "callback_data": f"q:yes:{qid}"},
                                                    {"text": QUESTION_ACTIONS["no"], "callback_data": f"q:no:{qid}"}],
                                                   [{"text": QUESTION_ACTIONS["other"], "callback_data": f"q:other:{qid}"}]])
            else:
                telegram_bot.notify_staff(client, f"❓ ВОПРОС ОТ БОТА\n{_label(client)}\n\n{reply.question}\n\n"
                                                  "Ответьте на это сообщение — бот передаст ответ клиенту.")
        if reply.handoff:
            db.pause(client, 24)
            telegram_bot.notify_staff(client, f"🙋 Клиент просит живого сотрудника ({_label(client)}).\n"
                                              f"Последнее сообщение: {text}\n"
                                              "Бот замолчал с ним на сутки. Ответьте клиенту в Директе "
                                              "или ответом на это сообщение. /resume — включить бота обратно.")


# ---------- Проверка наличия флористом (кнопки под заявкой) ----------

CHECK_ACTIONS = {
    "ok": ("✅ Всё верно", "Всё в наличии, заказ подтверждён 🌸 Сейчас пришлём ссылку на оплату."),
    "no": ("❌ Что-то не в наличии", "Кое-чего из заказа сейчас нет 🙏 Флорист скоро напишет и предложит замену."),
    "other": ("✍️ Другое — отвечу сам", "Флорист ответит вам в ближайшее время 🌸"),
}


def _check_buttons(order_id, actions=("ok", "no", "other")):
    return [[{"text": CHECK_ACTIONS[a][0], "callback_data": f"chk:{a}:{order_id}"}] for a in actions]


QUESTION_ACTIONS = {"yes": "✅ Да", "no": "❌ Нет", "other": "✍️ Другое — отвечу сам"}


def on_question(qid, action):
    """Флорист нажал кнопку под вопросом бота. Передаём ответ клиенту. Возвращает текст для флориста."""
    try:
        data = json.loads(db.get_setting(f"q:{qid}") or "{}")
    except ValueError:
        data = {}
    client, q = data.get("client"), (data.get("q") or "").strip()
    if not client or action not in QUESTION_ACTIONS:
        return "Вопрос не найден."
    if db.get_setting(f"q_done:{qid}"):
        return "На этот вопрос уже ответили."
    db.set_setting(f"q_done:{qid}", action)
    if action == "yes":
        text = f"Уточнила у флориста: «{q}» — да, можно ✅🌸"
    elif action == "no":
        text = f"Уточнила у флориста: «{q}» — к сожалению, нет 🙏 Можем подобрать другой вариант."
    else:
        text = "Флорист посмотрит и скоро напишет вам сама 🌸"
    with _client_locks[client]:
        _send_text(client, text)
        db.add_message(client, "assistant", text)
    if action == "other":
        telegram_bot.notify_staff(client, f"✍️ Напишите клиенту ответ на вопрос «{q}» — ответом на это сообщение.")
    return f"{QUESTION_ACTIONS[action]} — клиенту отправлено."


def on_check(order_id, action):
    """Флорист нажал кнопку под заявкой. Сообщаем клиенту результат проверки. Возвращает текст для флориста."""
    action = {"swap": "no"}.get(action, action)        # старые заявки с кнопкой «Нужна замена»
    row = db.get_order(order_id)
    if not row or action not in CHECK_ACTIONS:
        return "Заявка не найдена."
    client, _ = row
    if db.get_setting(f"ostatus:{order_id}") != "check":
        return f"По заявке №{order_id} уже отмечено, повторно не отправляю."
    label, text = CHECK_ACTIONS[action]
    with _client_locks[client]:
        _send_text(client, text)
        db.add_message(client, "assistant", text)
        db.set_setting(f"ostatus:{order_id}", action)
        db.del_setting(f"ocheck:{client}")
        db.del_setting(f"waitnote:{client}")
        if action in ("no", "other"):
            db.pause(client, config.HUMAN_PAUSE_HOURS)    # дальше с клиентом говорит флорист, бот не мешает
    if action == "ok":
        telegram_bot.notify_staff(client, f"✅ Заявка №{order_id} подтверждена, клиенту написали.\n"
                                          "Отправьте ссылку на оплату — ответом на это сообщение.")
    elif action == "other":
        telegram_bot.notify_staff(client, f"✍️ Заявка №{order_id}: клиенту написали, что вы скоро ответите.\n"
                                          "Напишите клиенту сами (в чате или ответом на это сообщение). "
                                          f"Бот молчит с ним {config.HUMAN_PAUSE_HOURS:g} ч; "
                                          "/resume ответом на это сообщение — включить бота.")
    else:
        telegram_bot.notify_staff(client, f"❌ Заявка №{order_id}: клиенту написали, что чего-то нет в наличии и "
                                          "флорист скоро свяжется.\nНапишите клиенту сами (в чате или ответом на это "
                                          f"сообщение). Бот молчит с ним {config.HUMAN_PAUSE_HOURS:g} ч; "
                                          "/resume ответом на это сообщение — включить бота.")
    return f"{label} — клиенту отправлено."


# ---------- Фото от клиента: ждём, что он хочет, потом каждое фото — флористу с кнопками ----------
# Бот картинок не видит: это может быть букет, открытка, что угодно. Поэтому фото копятся, пока клиент не напишет
# («у вас есть такой?»); нужен город (из какого магазина). Потом КАЖДОЕ фото — отдельным сообщением флористу:
# «✅ Есть / ❌ Нет — предложить другие / ✍️ Другое (отвечу сам)».
PHOTO_WAIT_SEC = 3          # несколько фото (альбом) приходят пачкой — ждём, пока придут все
PHOTO_NUDGE_SEC = 90        # прислал фото и молчит — через полторы минуты спросим, что подсказать
_photo_timers = {}


def _photo_buf(client):
    try:
        return json.loads(db.get_setting(f"cphotos:{client}") or "") or {}
    except ValueError:
        return {}


def _save_photo_buf(client, buf):
    if buf.get("photos"):
        db.set_setting(f"cphotos:{client}", json.dumps(buf, ensure_ascii=False))
    else:
        db.del_setting(f"cphotos:{client}")


def _later(client, sec, fn):
    old = _photo_timers.pop(client, None)
    if old:
        old.cancel()
    t = threading.Timer(sec, fn, args=(client,))
    t.daemon = True
    _photo_timers[client] = t
    t.start()


def on_client_photo(client, photo, caption=""):
    """Клиент прислал фото (Telegram file_id или ссылка из Инстаграма) — запоминаем и ждём остальные/текст."""
    with _client_locks[client]:
        if db.is_paused(client):
            return                          # клиента ведёт флорист — он и видит фото в чате
        buf = _photo_buf(client)
        buf.setdefault("photos", []).append(photo)
        if caption:
            buf.setdefault("texts", []).append(caption)
        _save_photo_buf(client, buf)
        db.add_message(client, "user", "[клиент прислал фото]" + (f": {caption}" if caption else ""))
    _later(client, PHOTO_WAIT_SEC, _photos_settled)


def _photos_settled(client):
    with _client_locks[client]:
        buf = _photo_buf(client)
        if not buf.get("photos"):
            return
        if buf.get("texts"):
            _photo_question(client, buf)    # подпись к фото уже есть — сразу к делу
            return
    _later(client, PHOTO_NUDGE_SEC, _photo_nudge)


def _photo_nudge(client):
    with _client_locks[client]:
        buf = _photo_buf(client)
        if buf.get("photos") and not buf.get("texts") and not buf.get("nudged"):
            text = "Подскажите, что хотите по фото — такой букет? 🌸"
            _send_text(client, text)
            db.add_message(client, "assistant", text)
            buf["nudged"] = True
            _save_photo_buf(client, buf)


def _photo_question(client, buf):
    """Есть фото и слова клиента. Нужен город — потом каждое фото флористу с кнопками. Вызывать под блокировкой."""
    texts = buf.get("texts", [])
    city = db.get_city(client) or next((catalog.match_city(t) for t in texts if catalog.match_city(t)), None)
    if not city:
        if not buf.get("asked_city"):
            text = (f"В какой город нужны цветы — {', '.join(catalog.city_names)} или рядом? "
                    "Сразу спрошу флориста про фото 🌸")
            _send_text(client, text)
            db.add_message(client, "assistant", text)
            buf["asked_city"] = True
            _save_photo_buf(client, buf)
            return
        text = "Подскажите город — и сразу спрошу флориста 🌸"
        _send_text(client, text)
        db.add_message(client, "assistant", text)
        return
    db.set_city(client, city)
    question = " ".join(t for t in texts if not (catalog.match_city(t) and len(t) < 30)) or "есть такой?"
    card = bool(re.search(r"открытк|конверт", " ".join(texts), re.I))
    # Смотрим, что на фото: селфи / еда / вещи — флористу не шлём (это не букет); открытка — спрашиваем про открытку.
    kinds = [llm.classify_image(telegram_bot.photo_bytes(p)) for p in buf["photos"]]
    if kinds and all(k == "другое" for k in kinds):
        text = "На фото не вижу цветов 🙂 Пришлите, пожалуйста, фото букета или открытки, которую хотите, — сразу спрошу флориста."
        _send_text(client, text)
        db.add_message(client, "assistant", text)
        _save_photo_buf(client, {})
        return
    if kinds and any(k == "открытка" for k in kinds) and not any(k in ("букет", "цветы") for k in kinds):
        card = True
    buf["photos"] = [p for p, k in zip(buf["photos"], kinds) if k != "другое"] or buf["photos"]
    what = "открытку" if card else "букет"
    photos = buf["photos"]
    for n, photo in enumerate(photos, 1):
        qid = int(db.get_setting("phq_seq") or 0) + 1
        db.set_setting("phq_seq", qid)
        db.set_setting(f"phq:{qid}", json.dumps({"client": client, "card": card, "q": question,
                                                 "n": n if len(photos) > 1 else 0}, ensure_ascii=False))
        part = f" ({n} из {len(photos)})" if len(photos) > 1 else ""
        telegram_bot.notify_staff_photo(
            client, photo,
            f"📸 Клиент спрашивает {what} по фото{part}\n{_label(client)}, {city}\n«{question}»\nЕсть в наличии?",
            buttons=[[{"text": "✅ Есть", "callback_data": f"ph:ok:{qid}"}],
                     [{"text": "❌ Нет — предложить другие", "callback_data": f"ph:no:{qid}"}],
                     [{"text": "✍️ Другое — отвечу сам", "callback_data": f"ph:other:{qid}"}]])
    _save_photo_buf(client, {})
    many = len(photos) > 1
    when = (f"флорист ответит {brain.opening_text(city if city in catalog.city_names else None)} (магазин сейчас закрыт)"
            if brain.shops_closed_now(city if city in catalog.city_names else None) else "ответим за пару минут")
    text = f"Спросила флориста, есть ли {'такие' if many else 'такой'} в наличии — {when} 🌸"
    _send_text(client, text)
    db.add_message(client, "assistant", text)


def on_photo_button(qid, action):
    """Флорист нажал кнопку под фото клиента. Возвращает текст для флориста."""
    try:
        rec = json.loads(db.get_setting(f"phq:{qid}") or "")
    except ValueError:
        rec = None
    if not rec or action not in ("ok", "no", "other"):
        return "Вопрос не найден."
    if rec.get("done"):
        return "По этому фото уже ответили."
    client = rec["client"]
    rec["done"] = action
    db.set_setting(f"phq:{qid}", json.dumps(rec, ensure_ascii=False))
    if action == "other":
        return "Ответьте клиенту сами — ответом на это фото (или в чате)."
    with _client_locks[client]:
        city = db.get_city(client)
        photos = []
        if action == "ok" and rec.get("card"):
            text = "Такая открытка есть 🌸 Добавим?"
        elif action == "ok":
            # Букет с фото есть — он и есть выбранный букет: оформляем его (цену в заявке подтвердит флорист).
            n = rec.get("n") or 0
            db.set_setting(f"chosen:{client}", f"photo:{qid}")
            db.set_setting(f"photo_item:{client}", f"Букет как на фото клиента{f' (фото {n})' if n else ''}")
            nq = brain._next_question([m["content"] for m in db.history(client) if m["role"] == "user"],
                                      city, brain._known_order(client))
            db.set_setting(f"lastq:{client}", nq)
            text = f"Букет{f' с фото {n}' if n else ''} есть в наличии 🌸 Оформляем! {nq}"
        else:
            text = ("Такой открытки сейчас нет 😔 Вот похожие:" if rec.get("card")
                    else "Такого сейчас нет 😔 Вот похожие — может, что-то понравится?")
            cc = catalog.get_city(city) if city else None
            if rec.get("card"):
                photos = catalog.cards(city, limit=5)
            elif cc:
                photos = cc.relevant_items(rec.get("q") or "популярные букеты", limit=5, bouquets_only=True)[:5] \
                    or cc.relevant_items("популярные букеты", limit=5, bouquets_only=True)[:5]
            if photos:
                db.set_setting(f"shown:{client}", ",".join(p["code"] for p in photos))
        _send_text(client, text)
        for it in photos:
            _send_photo(client, it)
        db.add_message(client, "assistant", text)
    return "Клиенту отправлено."


def _handle_client_photos(client, image_urls, caption=""):
    """Инстаграм: фото клиента — так же, как в Telegram (копим, ждём слова, потом флористу с кнопками)."""
    for i, url in enumerate(image_urls):
        on_client_photo(client, url, caption if i == 0 else "")


def _handle_instagram(payload):
    for ev in instagram.parse_events(payload):
        client = f"ig:{ev['client']}"
        if ev["type"] == "staff_reply":
            db.pause(client, config.HUMAN_PAUSE_HOURS)
            continue
        if ev.get("image_urls"):
            # Фото букета отдаём флористу; остальной текст (если был) идёт отдельным сообщением.
            _handle_client_photos(client, ev["image_urls"], ev.get("text", ""))
            continue
        text = ev["text"]
        other = [a for a in ev["attachments"] if a != "image"]
        if other:
            note = {"audio": "голосовое сообщение", "video": "видео"}
            kinds = ", ".join(note.get(a, a or "вложение") for a in other)
            text = (text + f"\n[Клиент прислал: {kinds}. Ты пока не можешь их открыть — "
                           f"вежливо попроси описать словами.]").strip()
        if text:
            deliver(client, text)


# ---------- Адреса сервера ----------

@app.get("/webhook")
def webhook_verify():
    """Инстаграм проверяет наш адрес при подключении."""
    if (request.args.get("hub.mode") == "subscribe"
            and request.args.get("hub.verify_token") == config.IG_VERIFY_TOKEN):
        return request.args.get("hub.challenge", "")
    abort(403)


@app.post("/webhook")
def webhook_receive():
    body = request.get_data()
    if not instagram.signature_ok(body, request.headers.get("X-Hub-Signature-256")):
        abort(403)
    payload = json.loads(body or b"{}")
    threading.Thread(target=_handle_instagram, args=(payload,), daemon=True).start()
    return "ok"


@app.get("/img/<code>.jpg")
def image(code):
    item = catalog.get(code)
    if not item or not item["images"]:
        abort(404)
    return Response(images.jpeg_bytes(item["images"][0]), mimetype="image/jpeg")


@app.get("/")
def health():
    by_city = ", ".join(f"{name}: {len(c.by_code)}" for name, c in catalog.by_city.items())
    diag = "".join(f"\n{k}: {v}" for k, v in llm.DIAG.items())
    return f"Бот работает. Версия: {VERSION}\nТоваров в каталоге — {by_city}{diag}"


def _disable_windows_quick_edit():
    """В Windows щелчок по чёрному окну ставит программу на паузу (режим «Выделить»). Отключаем это."""
    if sys.platform != "win32":
        return
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-10)  # ввод консоли
        mode = ctypes.c_uint32()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            ENABLE_QUICK_EDIT_MODE, ENABLE_EXTENDED_FLAGS = 0x0040, 0x0080
            kernel32.SetConsoleMode(handle, (mode.value & ~ENABLE_QUICK_EDIT_MODE) | ENABLE_EXTENDED_FLAGS)
    except Exception:
        log.warning("Не удалось отключить паузу от щелчка мышкой — не щёлкайте по окну бота")


def main():
    _disable_windows_quick_edit()
    catalog.refresh()
    telegram_bot.start(deliver, on_check, on_photo=on_client_photo, on_photo_button=on_photo_button,
                       on_question=on_question)
    log.info("Сервер запущен на порту %s", config.PORT)
    serve(app, host="0.0.0.0", port=config.PORT, threads=8)


if __name__ == "__main__":
    main()
