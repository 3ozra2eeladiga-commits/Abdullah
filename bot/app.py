"""Главный файл: запускает сервер, Telegram и связывает всё вместе.

Запуск:  python -m bot.app
"""
import datetime
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
from collections import defaultdict

from flask import Flask, Response, abort, request
from waitress import serve

from . import brain, config, db, images, instagram, llm, payments, telegram_bot
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
    name = telegram_bot.client_name(client)
    if kind == "tgb" and name:
        return f"👤 Клиент в Telegram: {name}"
    return {"ig": f"Инстаграм-клиент {cid}", "tgb": f"клиент Telegram {cid}",
            "tg": f"🧪 тестовый клиент (Telegram {cid})"}.get(kind, cid)


def _order_ready(o):
    """Последняя проверка перед отправкой флористу: все ключевые поля на месте.
    Независимая страховка — даже если где-то в логике ошибка, неполный заказ флористу не уйдёт."""
    if not isinstance(o, dict) or not o.get("товары"):
        return False
    need = ["заказчик", "дата", "время"]
    if o.get("получение") == "доставка":
        need += ["адрес", "получатель"]          # при самовывозе получателя нет
    return all(str(o.get(k) or "").strip() not in ("", "—") for k in need)


def _format_order(order_id, client, reply):
    o = reply.order
    if not o:
        # JSON не распознался — показываем аккуратно, без «сырого кода»
        return (f"🔎 ЗАЯВКА НА ПРОВЕРКУ №{db.order_no(order_id)} (за {db.order_day(order_id)})\n{_label(client)}\n\n"
                "⚠️ Заказ не распознался автоматически. Детали — в переписке с клиентом.\n"
                "Ответьте на это сообщение, чтобы написать клиенту.")

    def val(x):
        v = str(x if x is not None else "").strip()
        return v if v not in ("", "—", "...", "…") and v.lower() not in ("null", "none") else "—"

    def given(x):  # поле реально заполнено (ИИ иногда оставляет «...» из шаблона)
        return val(x) != "—"

    pickup = o.get("получение") == "самовывоз"
    lines = [telegram_bot.city_tag(client), f"🔎 ЗАЯВКА НА ПРОВЕРКУ №{db.order_no(order_id)} (за {db.order_day(order_id)})", _label(client), "━━━━━━━━━━━━━━",
             "🛍 ТОВАР:"]
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
    if pickup:                                  # самовывоз: получателя нет — забирает сам заказчик
        lines += ["", f"👤 Заберёт: {val(o.get('заказчик'))}"]
    else:
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


SALAM_RE = re.compile(r"сала[мн]\w*\s*(?:у|о)?\s*але[йи]?к[уи]м|ассалам|салам\b|salam", re.I)

# Клиент просит живого человека: «свяжите с сотрудником», «хочу поговорить с менеджером», «позовите флориста».
HUMAN_REQ_RE = re.compile(
    r"(?:свяж|соедин|позов|перевед|переключ|дайте|хочу|нужен|нужна|можно|пообщат|поговор|общат)\w*[^.?!]{0,30}"
    r"(?:сотрудни|человек|оператор|менеджер|флорист|администратор|продавц|живы|живой|живому|хозяйк)"
    r"|^\W*(?:сотрудник|оператор|менеджер|человек|флорист)\W*$", re.I)


# Клиент недоволен ботом / запутался — сразу к флористу, не мучаем.
STUCK_RE = re.compile(r"не\s+понима\w*|не\s+понял\w*\s+(?:меня|вопрос)|ты\s+(?:бот|робот)|что\s+за\s+бот|"
                      r"тупо\w*|бред|бесполезн|достал\w*|задолбал\w*|сколько\s+можно|я\s+же\s+(?:сказал|написал)\w*"
                      r"|опять\s+то\s+же|по\s+кругу", re.I)


def _bot_stuck(client, new_text):
    """Бот в третий раз подряд пишет то же самое — значит, не понимает клиента."""
    norm = lambda x: re.sub(r"\W+", "", (x or "").lower())[:120]
    last = [norm(m["content"]) for m in db.history(client, 10) if m["role"] == "assistant"][-4:]
    return bool(norm(new_text)) and last.count(norm(new_text)) >= 3


def _to_human(client, text, saved=False):
    """Клиент просит сотрудника: всё, что он прислал (и фото), — флористу; бот замолкает. Под блокировкой.
    saved — сообщение клиента уже записано в историю."""
    buf = _photo_buf(client)
    for photo in buf.get("photos", []):
        telegram_bot.notify_staff_photo(client, photo, f"📸 Фото от клиента\n{_label(client)}")
    _save_photo_buf(client, {})
    if not saved:
        db.add_message(client, "user", text)
    city = db.get_city(client)
    closed = brain.shops_closed_now(city)
    telegram_bot.notify_staff_wait(client, f"🙋 Клиент просит живого сотрудника ({_label(client)}{', ' + city if city else ''}):\n"
                                      f"«{text}»\nНапишите клиенту в чате или ответом на это сообщение. "
                                      f"Бот молчит с ним {config.HUMAN_PAUSE_HOURS:g} ч; /resume ответом — включить бота.")
    reply = ("Хорошо, передала флористу 🌸 Она напишет вам здесь "
             + (f"{brain.opening_text(city)}, когда откроется магазин." if closed else "в ближайшее время."))
    _send_text(client, reply)
    db.add_message(client, "assistant", reply)
    db.pause(client, config.HUMAN_PAUSE_HOURS)


def deliver(client, text, from_staff=False, quote=""):
    """Главная функция: сообщение (от клиента или от сотрудника) -> ответ клиенту.
    quote — текст сообщения, на которое клиент ответил (reply), для распознавания букета."""
    secret = None if from_staff else config.secret_reply_for(text)
    if secret:                                          # секретный код: ответ сразу, в историю и ИИ не попадает
        _send_text(client, secret)
        return
    with _client_locks[client]:
        if not from_staff and not db.is_paused(client) and STUCK_RE.search(text or "") \
                and len(db.history(client, 6)) >= 4:       # недоволен ботом посреди разговора
            _to_human(client, text)
            return
        if not from_staff and not db.is_paused(client) and HUMAN_REQ_RE.search(text or "") \
                and not re.search(r"\bдля\b|букет|цвет|роз|подар", text or "", re.I):   # «букет для менеджера» — не то
            _to_human(client, text)
            return
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
                telegram_bot.notify_staff_wait(client, f"📦 Клиент спрашивает о заказе/доставке ({_label(client)}):\n"
                                                  f"«{text}»\nОтветьте клиенту в чате или ответом на это сообщение.")
            if client.startswith("tg:"):
                # В режиме проверки «клиент» — сам сотрудник: подсказываем, почему бот молчит
                telegram_bot.send(client.split(":", 1)[1],
                                  "⏸ Бот сейчас молчит с этим клиентом: разговор передан сотруднику.\n"
                                  "/resume — снова включить бота, /reset — начать проверку заново.")
            return
        try:
            reply = brain.respond(client, text, from_staff=from_staff, quote=quote)
            if not from_staff and reply and reply.text and not reply.order and _bot_stuck(client, reply.text):
                _to_human(client, f"(бот не понимает клиента — повторяет одно и то же) {text}", saved=True)
                return
        except Exception:
            log.exception("Ошибка ИИ для %s", client)
            _send_text(client, SORRY)
            telegram_bot.notify_staff(client, f"⚠️ Бот не смог ответить ({_label(client)}).\n"
                                              f"Сообщение клиента: {text}\nОтветьте на это сообщение, чтобы написать клиенту.")
            return

        order_id = db.save_order(client, reply.order) if reply.order else None
        if order_id:
            brain.start_new_order(client)          # следующий заказ — с нуля (без «доставка/завтра» прошлого)
        if order_id and reply.text:
            reply.text += f"\nНомер заказа: №{db.order_no(order_id)}"   # по нему клиент может спросить или отменить
        if reply.text and not from_staff and re.search(r"шалом|shalom", text or "", re.I) \
                and not re.search(r"шалом", reply.text, re.I):
            reply.text = re.sub(r"^\s*здравствуйте!?\s*(?:🌸\s*)?", "", reply.text, count=1, flags=re.I)
            reply.text = f"Шалом! 🤝\n{reply.text}"
        elif reply.text and not from_staff and SALAM_RE.search(text or "") and not re.search(r"алейкум", reply.text, re.I):
            # «Салам алейкум» — отвечаем тем же, с улыбкой, и продолжаем как обычно.
            greet = "Ва алейкум ассалам! 🤝 Мир вашему дому — а цветы мы принесём 😊"
            if re.match(r"\s*здравствуйте!?", reply.text, re.I):
                reply.text = re.sub(r"^\s*здравствуйте!?\s*(?:🌸\s*)?", greet + " ", reply.text, count=1, flags=re.I)
            else:
                reply.text = f"Ва алейкум ассалам! 🤝\n{reply.text}"
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
            db.set_setting(f"oawait:{order_id}", client)      # пока флорист реально не напишет клиенту
            db.set_setting(f"ocheck:{client}", order_id)
            telegram_bot.notify_staff_order(client, items, card, buttons=_check_buttons(order_id))
            telegram_bot.ring(order_id, lambda oid=order_id: db.get_setting(f"ostatus:{oid}") == "check", client,
                              quiet=brain.shops_closed_now(db.get_city(client)))
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
            telegram_bot.notify_staff_wait(client, f"🙋 Клиент просит живого сотрудника ({_label(client)}).\n"
                                              f"Последнее сообщение: {text}\n"
                                              "Бот замолчал с ним на сутки. Ответьте клиенту в Директе "
                                              "или ответом на это сообщение. /resume — включить бота обратно.")


# ---------- Проверка наличия флористом (кнопки под заявкой) ----------

CHECK_ACTIONS = {
    "ok": ("✅ Всё верно", "Всё в наличии, заказ подтверждён 🌸 Флорист напишет вам в ближайшие минуты ⏱ — "
                          "уточнит детали и пришлёт оплату."),
    "no": ("❌ Что-то не в наличии", "Кое-чего из заказа сейчас нет 🙏 Флорист напишет вам в ближайшие минуты ⏱ "
                                    "и предложит замену."),
    "other": ("✍️ Другое — отвечу сам", "Флорист напишет вам в ближайшие минуты ⏱ 🌸"),
}


def _check_buttons(order_id, actions=("ok", "no", "other")):
    return [[{"text": CHECK_ACTIONS[a][0], "callback_data": f"chk:{a}:{order_id}"}] for a in actions]


def on_more(client):
    """Кнопка «💐 Ещё варианты клиенту»: отправляем клиенту 5 букетов, которых он ещё не видел (его город,
    по его запросу). Флористу не нужно идти на сайт. Возвращает текст для флориста."""
    city = db.get_city(client) or next(iter(catalog.city_names), None)
    cc = catalog.get_city(city) if city else None
    if not cc:
        return "Каталог города не загружен — попробуйте позже."
    seen = set()
    for k in ("shown", "seen"):
        seen |= {c for c in (db.get_setting(f"{k}:{client}") or "").split(",") if c}
    query = " ".join(m["content"] for m in db.history(client, 12) if m["role"] == "user") or "популярные букеты"
    items = [it for it in cc.relevant_items(query, limit=60, bouquets_only=True) if it["code"] not in seen][:5] \
        or [it for it in cc.relevant_items("популярные букеты", limit=60, bouquets_only=True) if it["code"] not in seen][:5]
    if not items:
        return "Новых вариантов не нашлось — клиенту уже показали всё подходящее."
    with _client_locks[client]:
        text = "Вот ещё варианты от флориста 🌸 Какой нравится? Ответьте «этот» на фото."
        _send_text(client, text)
        for it in items:
            _send_photo(client, it)
        db.add_message(client, "assistant", text)
        db.set_setting(f"shown:{client}", ",".join(it["code"] for it in items))
        db.set_setting(f"seen:{client}", ",".join((list(seen) + [it["code"] for it in items])[-200:]))
    return f"Отправила клиенту {len(items)} новых вариантов 💐"


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
        telegram_bot.notify_staff_wait(client, f"✍️ Напишите клиенту ответ на вопрос «{q}» — ответом на это сообщение.")
    return f"{QUESTION_ACTIONS[action]} — клиенту отправлено."


def on_check(order_id, action):
    """Флорист нажал кнопку под заявкой. Сообщаем клиенту результат проверки. Возвращает текст для флориста."""
    action = {"swap": "no"}.get(action, action)        # старые заявки с кнопкой «Нужна замена»
    row = db.get_order(order_id)
    if not row or action not in CHECK_ACTIONS:
        return "Заявка не найдена."
    client, _ = row
    if db.get_setting(f"ostatus:{order_id}") != "check":
        return f"По заявке №{db.order_no(order_id)} уже отмечено, повторно не отправляю."
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
        # Кнопка «💳 Оплата» (QR Точки, on_pay) готова, но пока отключена — Абдулла: «пока отбой».
        # Нажатие кнопки — это ответ БОТА. Флорист должна сама написать клиенту (оплата, детали) — до этого
        # заявка висит в «📭 Без ответа», а здесь — кнопки «💬 Написать клиенту» / «✅ Ответила клиенту».
        telegram_bot.notify_staff_wait(client, f"✅ Заявка №{db.order_no(order_id)}: клиенту написали «всё в наличии, "
                                               "флорист напишет в ближайшие минуты».\n"
                                               "👉 Напишите клиенту сами: детали и оплата.")
    elif action == "other":
        telegram_bot.notify_staff_wait(client, f"✍️ Заявка №{db.order_no(order_id)}: клиенту написали, что вы скоро ответите.\n"
                                          "Напишите клиенту сами (в чате или ответом на это сообщение). "
                                          f"Бот молчит с ним {config.HUMAN_PAUSE_HOURS:g} ч; "
                                          "/resume ответом на это сообщение — включить бота.")
    else:
        telegram_bot.notify_staff_wait(client, f"❌ Заявка №{db.order_no(order_id)}: клиенту написали, что чего-то нет в наличии и "
                                          "флорист скоро свяжется.\nНапишите клиенту сами (в чате или ответом на это "
                                          f"сообщение). Бот молчит с ним {config.HUMAN_PAUSE_HOURS:g} ч; "
                                          "/resume ответом на это сообщение — включить бота.")
    name = telegram_bot.client_name(client)
    return f"№{db.order_no(order_id)}{f' ({name})' if name else ''}: {label} — клиенту отправлено."


# ---------- Кнопки внизу у сотрудников: «📭 Без ответа», «📋 Заказы на сегодня» — коротко, без долгой прокрутки ----------

_MSK_TZ = datetime.timezone(datetime.timedelta(hours=3))


def _order_day(o, created):
    """На какой день заказ: «сегодня/завтра» считаем от дня оформления, «02.11» — как есть."""
    d = str(o.get("дата") or "").lower()
    base = datetime.datetime.fromtimestamp(created, _MSK_TZ).date()
    for word, add in (("послезавтра", 2), ("завтра", 1), ("сегодня", 0)):
        if word in d:
            return base + datetime.timedelta(days=add)
    return brain._resolve_date(d)


def _num(oid):
    """«№4» — номер за сегодня; заказ, оформленный в другой день, — «№4 от 30.10» (чтобы номера не путались)."""
    day = db.order_day(oid)
    return f"№{db.order_no(oid)}" + ("" if not day or day == _biz_today().strftime("%d.%m") else f" от {day}")


def _close_minutes():
    hh, mm = (int(x) for x in (config.DAY_CLOSE or "22:00").split(":"))
    return hh * 60 + mm


def _short_line(oid, client, o):
    """«№12 · 14:00 · Крайнего 90 · Иван» — одна строка на заказ."""
    when = str(o.get("время") or "").strip()
    pickup = (o.get("получение") or "").lower().startswith("самовывоз")
    where = ("самовывоз " if pickup else "") + str(o.get("адрес") or "").replace("ул. ", "")
    raw = str(o.get("заказчик") or "")
    who = "🎁 сюрприз" if "сюрприз" in raw.lower() else re.split(r"[,(]", raw)[0].strip()
    if not brain._meaningful(who) or brain._name_from(who) == "" and "сюрприз" not in who:
        who = telegram_bot.client_name(client).split(" @")[0]             # «null», «Точно» → имя из Telegram
    parts = [_num(oid), when if brain._meaningful(when) else "", where[:40], who[:20]]
    return " · ".join(p for p in parts if p and p not in ("—", "..."))


def _day_start(now=None):
    """Начало рабочего дня магазина: последнее закрытие (22:00 МСК). Заказы после закрытия — уже следующего дня."""
    now = now or time.time()
    d = datetime.datetime.fromtimestamp(now, _MSK_TZ)
    close = d.replace(hour=_close_minutes() // 60, minute=_close_minutes() % 60, second=0, microsecond=0)
    if close > d:
        close -= datetime.timedelta(days=1)
    return close.timestamp()


def _biz_today(now=None):
    """Какой день сейчас «рабочий»: после 22:00 — уже завтрашний (заказы принимаем на него)."""
    return (datetime.datetime.fromtimestamp(now or time.time(), _MSK_TZ)
            + datetime.timedelta(minutes=24 * 60 - _close_minutes())).date()


def _answered(oid):
    """Флорист РЕАЛЬНО написал клиенту после заявки (в чате или через бота). Нажатие «Всё верно» — это лишь статус."""
    return not db.get_setting(f"oawait:{oid}")


_MARKS = {"check": "⏳ ждёт проверки", "ok": "✅ подтверждён", "no": "❌ нет в наличии", "other": "✍️ флорист отвечает сама"}


def _status_line(oid):
    st = db.get_setting(f"ostatus:{oid}") or ""
    who = db.get_setting(f"owho:{oid}") or ""
    line = _MARKS.get(st, "• статус неизвестен") + (f" — {who.split(' @')[0]}" if who and st != "check" else "")
    return line + ("" if _answered(oid) else " · 💬 клиенту ещё не писали")


def on_report(kind):
    now = time.time()
    rows = db.recent_orders(now - 7 * 86400)
    if kind == "noanswer":
        rows = [r for r in rows if r[3] >= _day_start(now)]          # только сегодняшние заявки
        left = [(oid, c, o) for oid, c, o, _t in rows if not _answered(oid)]       # по порядку номеров
        unchecked = [x for x in left if db.get_setting(f"ostatus:{x[0]}") == "check"]
        checked = [x for x in left if db.get_setting(f"ostatus:{x[0]}") != "check"]
        lines = []
        if unchecked:                                   # самое срочное — никто даже не нажал кнопку
            lines.append("⏳ Не проверены (никто не нажал кнопку):")
            lines += [f"• {_short_line(oid, c, o)}" for oid, c, o in unchecked]
        if checked:
            lines.append(("\n" if lines else "") + "💬 Проверены, но клиенту не написали:")
            lines += [f"• {_short_line(oid, c, o)}\n   {_status_line(oid).split(' · ')[0]}" for oid, c, o in checked]
        # Клиенты, которым флорист должен ответить сама (просил сотрудника, вопрос, «Другое»), а ответа ещё нет.
        waiting = sorted([w for w in telegram_bot.waiting_clients() if w[1] >= _day_start(now)], key=lambda x: x[1])
        if waiting:
            lines.append(("\n" if lines else "") + "🙋 Клиент ждёт ответа:")
        for c, since in waiting:
            name = telegram_bot.client_name(c).split(" @")[0] or c.split(":", 1)[-1]
            lines.append(f"• {name} — {max(1, int((now - since) // 60))} мин")
        ids = [oid for oid, _c, _o in unchecked + checked][:24]
        return (("📭 Без ответа:\n\n" + "\n".join(lines[:40])) if lines else "📭 Всем ответили 👍"), ids
    today = _biz_today(now)
    after_close = today != datetime.datetime.now(_MSK_TZ).date()   # после 22:00 — список уже на завтра
    first = (f"📋 Магазин закрыт — заказы на завтра, {today:%d.%m}" if after_close
             else f"📋 Заказы на сегодня, {today:%d.%m}")
    out, ids = [], []
    for title, day in ((first, today), (f"📅 На {today + datetime.timedelta(days=1):%d.%m}",
                                        today + datetime.timedelta(days=1))):
        items = [(oid, c, o) for oid, c, o, created in rows if _order_day(o, created) == day]
        items.sort(key=lambda x: (datetime.datetime.strptime(db.order_day(x[0]) or "01.01", "%d.%m").timetuple().tm_yday,
                                  db.order_no(x[0])))
        if not items and day != today:
            continue
        out.append(f"{title} ({len(items)}):" if items else f"{title}: заказов нет.")
        out += [f"• {_short_line(oid, c, o)}\n   {_status_line(oid)}" for oid, c, o in items[:20]]   # по номерам
        ids += [oid for oid, _c, _o in items]
        out.append("")
    return "\n".join(out).strip(), ids[:24]


def day_summary():
    """Итоги дня: сколько заявок с открытия до закрытия и что осталось без ответа (с кнопками «№…»)."""
    now = time.time()
    start = _day_start(now - 300)                       # итоги — за рабочий день, который только что закончился
    rows = [r for r in db.recent_orders(start) if start <= r[3] <= now]
    st = [db.get_setting(f"ostatus:{oid}") or "" for oid, _c, _o, _t in rows]
    left = [oid for (oid, _c, _o, _t) in rows if not _answered(oid)]
    o_, c_ = config.DAY_OPEN, config.DAY_CLOSE
    text = (f"📊 Итоги дня {_biz_today(now - 300):%d.%m} (с {o_} до {c_}):\n"
            f"Всего заявок: {len(rows)}\n✅ подтверждено: {st.count('ok')}\n❌ нет в наличии: {st.count('no')}\n"
            f"✍️ флорист отвечает сама: {st.count('other')}\n⏳ не проверено: {st.count('check')}\n"
            f"💬 клиенту ещё не писали: {len(left)}")
    if left:
        text += "\n\nКлиенту не писали — нажмите номер, чтобы открыть заявку:"
    return text, left[-24:]


def _send_to_staff(text, ids):
    rows = [[{"text": _num(i), "callback_data": f"show:x:{i}"} for i in ids[k:k + 4]] for k in range(0, len(ids), 4)]
    for chat in telegram_bot.staff_chats():
        telegram_bot.send(chat, text, **({"reply_markup": {"inline_keyboard": rows}} if rows else {}),
                          **({"disable_notification": True} if telegram_bot.quiet_now() else {}))


def _remind_unchecked():
    """Заявку никто не проверил (не нажал кнопку) 15 минут — напоминаем со звонком; потом ещё раз через 15 и 30 мин.
    Ночью (тихие часы) не напоминаем — утром она будет в «📭 Без ответа»."""
    if telegram_bot.quiet_now():
        return
    now = time.time()
    for oid, client, _o, created in db.recent_orders(now - 2 * 3600):
        if db.get_setting(f"ostatus:{oid}") != "check":
            continue
        n = int(db.get_setting(f"oremind:{oid}") or 0)
        mins = int((now - created) // 60)
        if n < 3 and mins >= config.REMIND_MIN * (n + 1):
            db.set_setting(f"oremind:{oid}", n + 1)
            telegram_bot.notify_staff(client, f"⏰ Заявка №{db.order_no(oid)} не проверена уже {mins} мин! Нажмите номер и проверьте.",
                                      buttons=[[{"text": f"№{db.order_no(oid)}", "callback_data": f"show:x:{oid}"}]])
            telegram_bot.ring(oid, lambda o=oid: db.get_setting(f"ostatus:{o}") == "check", client)


def _daily_loop():
    """Каждый день: в DAY_CLOSE — итоги дня; утром в MORNING_AT — свежий список «Заказы на сегодня»."""
    while True:
        try:
            now = datetime.datetime.now(_MSK_TZ)
            hm, day = now.strftime("%H:%M"), now.strftime("%Y-%m-%d")
            if hm >= config.DAY_CLOSE and db.get_setting("daily_sum") != day:
                db.set_setting("daily_sum", day)
                _send_to_staff(*day_summary())
            if config.MORNING_AT <= hm < "11:00" and db.get_setting("daily_morning") != day:   # только утром
                db.set_setting("daily_morning", day)
                text, ids = on_report("today")
                _send_to_staff("☀️ Доброе утро! " + text, ids)
            _remind_unchecked()
        except Exception as e:                                      # отчёт не должен ронять бота
            log.warning("Ежедневный отчёт не удался: %s", e)
        time.sleep(60)


def on_show(chat, order_id):
    """Кнопка «№17» под списком — присылаем эту заявку целиком; не разобрана — снова с кнопками."""
    row = db.get_order(order_id)
    if not row:
        telegram_bot.send(chat, "Заявка не найдена.")
        return
    client, o = row
    card = _format_order(order_id, client, type("R", (), {"order": o})())
    st = db.get_setting(f"ostatus:{order_id}") or ""
    if st and st != "check":
        who = db.get_setting(f"owho:{order_id}") or ""
        card += f"\n\n✅ Уже отмечено: {CHECK_ACTIONS.get(st, (st,))[0]}" + (f" — {who}" if who else "")
    msg = telegram_bot.send(chat, card, **({"reply_markup": {"inline_keyboard": _check_buttons(order_id)}}
                                           if st == "check" else {}))
    if msg:
        db.link_staff_message(chat, msg["message_id"], client)


# ---------- Оплата через СБП Точки: кнопка «💳 Оплата» → QR и ссылка ИМЕННО этому клиенту ----------

def _order_total(o):
    """(сумма товаров, доставка или None, если доставку назначает флорист)."""
    try:
        goods = int(float(o.get("сумма_товаров") or 0))
    except (TypeError, ValueError):
        goods = 0
    if (o.get("получение") or "").lower().startswith("самовывоз"):
        return goods, 0
    dp = str(o.get("доставка_цена") or "").strip()
    return goods, (int(dp) if dp.isdigit() else None)


def on_pay(order_id, action):
    """«💳 Оплата» под подтверждённой заявкой (action = go) или сумма (action = число) → QR клиенту."""
    row = db.get_order(order_id)
    if not row:
        return "Заявка не найдена."
    client, o = row
    if not payments.configured():
        return "Оплата через Точку ещё не подключена (нужен ключ API Точки на сервере)."
    if action == "go":
        goods, delivery = _order_total(o)
        if delivery is None:                       # доставку назначает флорист — спрашиваем итоговую сумму
            sent = telegram_bot.notify_staff(
                client, f"💳 Заказ №{db.order_no(order_id)}: товары {goods} ₽ + доставка.\n"
                        "Ответьте на это сообщение ИТОГОВОЙ суммой (например, 3143) — бот отправит клиенту QR и ссылку.",
                buttons=[[{"text": f"💳 Отправить {goods} ₽ (без доставки)", "callback_data": f"pay:{goods}:{order_id}"}]])
            for chat, mid in sent or []:
                db.set_setting(f"payprompt:{chat}:{mid}", order_id)
            return "Укажите итоговую сумму — ответом на сообщение бота."
        amount = goods + delivery
    elif str(action).isdigit():
        amount = int(action)
    else:
        return "Не поняла сумму."
    if amount <= 0:
        return "Сумма заказа неизвестна — ответьте на сообщение бота итоговой суммой."
    try:
        link, png, qrc = payments.create_qr(amount, f"Заказ №{db.order_no(order_id)}, {config.SHOP_NAME}".strip(", "))
    except Exception as e:
        log.warning("Точка: QR не создан: %s", e)
        return f"Не получилось создать QR в Точке: {str(e)[:120]}"
    text = (f"Оплата заказа №{db.order_no(order_id)} — {amount} ₽ 🌸\nОткройте ссылку — откроется приложение вашего банка:\n{link}"
            "\nИли отсканируйте QR-код. После оплаты мы сразу увидим её.")
    with _client_locks[client]:
        if png:
            telegram_bot.send_client_photo_bytes(client, png, text)
        else:
            _send_text(client, text)
        db.add_message(client, "assistant", text)
    if qrc:
        db.set_setting(f"payqr:{order_id}", qrc)
        threading.Thread(target=_watch_payment, args=(order_id, client, qrc, amount), daemon=True).start()
    return f"Отправила клиенту QR и ссылку на {amount} ₽ 💳"


def _watch_payment(order_id, client, qrc, amount):
    """Проверяем каждые 30 с (до 3 ч): оплатил — сообщаем флористу и благодарим клиента."""
    for _ in range(360):
        time.sleep(30)
        if payments.is_paid(qrc):
            telegram_bot.notify_staff(client, f"💰 Заказ №{db.order_no(order_id)} ОПЛАЧЕН — {amount} ₽")
            thanks = "Оплата получена, спасибо! 🌸"
            _send_text(client, thanks)
            db.add_message(client, "assistant", thanks)
            return


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
    names = list(catalog.city_names)
    city = db.get_city(client) or next((catalog.match_city(t) for t in texts if catalog.match_city(t)), None)
    if not city and buf.get("asked_city"):         # ответ цифрой на «1 — Пятигорск, 2 — …»
        num = next((t.strip() for t in reversed(texts) if re.fullmatch(r"\s*\d\s*", t)), "")
        if num and 1 <= int(num) <= len(names):
            city = names[int(num) - 1]
    if not city:
        if not buf.get("asked_city"):
            opts = "\n".join(f"{i} — {n}" for i, n in enumerate(names, 1))
            text = f"Сейчас спрошу флориста про фото 🌸 Из какого города заказ?\n{opts}\nОтветьте цифрой"
            _send_text(client, text)
            db.add_message(client, "assistant", text)
            buf["asked_city"] = True
            _save_photo_buf(client, buf)
            return
        city = "город не указан"                   # второй раз не переспрашиваем — флорист уточнит сам
    if city in names:
        db.set_city(client, city)
    question = " ".join(t for t in texts if not (catalog.match_city(t) and len(t) < 30)
                        and not re.fullmatch(r"\s*\d\s*", t)) or "есть такой?"
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
            telegram_bot.staff_answered(client)    # флорист ответила в Директе — отметка «Ответила»
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
    threading.Thread(target=_daily_loop, daemon=True).start()
    telegram_bot.start(deliver, on_check, on_photo=on_client_photo, on_photo_button=on_photo_button, on_more=on_more,
                       on_pay=on_pay, on_report=on_report, on_show=on_show,
                       on_question=on_question)
    log.info("Сервер запущен на порту %s", config.PORT)
    serve(app, host="0.0.0.0", port=config.PORT, threads=8)


if __name__ == "__main__":
    main()
