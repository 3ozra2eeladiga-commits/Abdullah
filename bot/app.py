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

from . import brain, config, db, images, instagram, telegram_bot
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
        return (f"🌸 НОВЫЙ ЗАКАЗ №{order_id}\n{_label(client)}\n\n"
                "⚠️ Заказ не распознался автоматически. Детали — в переписке с клиентом.\n"
                "Ответьте на это сообщение, чтобы написать клиенту.")

    def val(x):
        return str(x).strip() if x not in (None, "", "—") else "—"

    pickup = o.get("получение") == "самовывоз"
    lines = [f"🌸 НОВЫЙ ЗАКАЗ №{order_id}", _label(client), "━━━━━━━━━━━━━━", "🛍 ТОВАР:"]
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
    if o.get("упаковка"):
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
        lines.append("   стоимость доставки: " + ("бесплатно" if dp == "0" else f"{dp} ₽" if dp.isdigit() else val(dp)))
    lines += [
        "",
        f"👤 Заказчик: {val(o.get('заказчик'))}",
        f"🎁 Получатель: {val(o.get('получатель'))}",
    ]
    if o.get("открытка"):
        lines.append(f"✉️ Открытка: {val(o['открытка'])}")
    if o.get("комментарий"):
        lines.append(f"📝 Комментарий: {val(o['комментарий'])}")
    lines += ["━━━━━━━━━━━━━━",
              "👉 Отправьте клиенту ссылку на оплату и подтвердите заказ.",
              "Ответьте на это сообщение — текст уйдёт клиенту."]
    return "\n".join(lines)


def deliver(client, text, from_staff=False, quote=""):
    """Главная функция: сообщение (от клиента или от сотрудника) -> ответ клиенту.
    quote — текст сообщения, на которое клиент ответил (reply), для распознавания букета."""
    with _client_locks[client]:
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

        if reply.text:
            _send_text(client, reply.text)
        for item in reply.photos:
            _send_photo(client, item)

        # Клиенту сказали «заказ принят» — значит, флорист ОБЯЗАН его получить. Если каких-то полей не хватает,
        # заказ всё равно уходит, но с пометкой — флорист уточнит у клиента. Заказ не должен теряться.
        if reply.order:
            order_id = db.save_order(client, reply.order)
            # Фото заказанных товаров — чтобы флорист сразу видел, что собирать.
            items = []
            for it in reply.order.get("товары", []):
                code = (it.get("код") or "").strip().lower()
                obj = catalog.get(code) if code else None
                if obj and obj.get("images"):
                    items.append(obj)
            card = _format_order(order_id, client, reply)
            if not _order_ready(reply.order):
                log.warning("Неполный заказ отправлен флористу с пометкой (%s): %s", client, reply.order)
                card = "⚠️ В ЗАКАЗЕ НЕ ХВАТАЕТ ДАННЫХ — уточните у клиента (см. прочерки «—»)\n\n" + card
            telegram_bot.notify_staff_order(client, items, card)
        elif reply.order_raw:
            log.warning("Заказ не распознан (%s): %s", client, reply.order_raw)
        if reply.question:
            telegram_bot.notify_staff(client, f"❓ ВОПРОС ОТ БОТА\n{_label(client)}\n\n{reply.question}\n\n"
                                              "Ответьте на это сообщение — бот передаст ответ клиенту.")
        if reply.handoff:
            db.pause(client, 24)
            telegram_bot.notify_staff(client, f"🙋 Клиент просит живого сотрудника ({_label(client)}).\n"
                                              f"Последнее сообщение: {text}\n"
                                              "Бот замолчал с ним на сутки. Ответьте клиенту в Директе "
                                              "или ответом на это сообщение. /resume — включить бота обратно.")


def _handle_client_photos(client, image_urls, caption=""):
    """Клиент прислал фото букета. Бот не видит картинок — пересылаем флористу,
    а клиенту отвечаем по-человечески, без выдуманных названий и цен."""
    with _client_locks[client]:
        if db.is_paused(client):
            return
        db.add_message(client, "user", "[клиент прислал фото букета]" + (f": {caption}" if caption else ""))
        reply = ("Спасибо 🌸 Если этот букет с нашего сайта — напишите, пожалуйста, его НОМЕР (он под фото, "
                 "например №600), и я сразу его найду и оформлю. А фото я на всякий случай уже передала "
                 "флористу — подберём точь-в-точь или похожее.")
        _send_text(client, reply)
        db.add_message(client, "assistant", reply)
        staff_note = (f"📸 Клиент прислал фото букета ({_label(client)}).\n"
                      + (f"Подпись клиента: «{caption}»\n" if caption else "")
                      + "Посмотрите фото и ответьте на это сообщение с ценой/наличием — бот передаст клиенту.")
        for url in image_urls:
            telegram_bot.notify_staff_photo(client, url, staff_note)


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
    return f"Бот работает. Версия: {VERSION}\nТоваров в каталоге — {by_city}"


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
    telegram_bot.start(deliver)
    log.info("Сервер запущен на порту %s", config.PORT)
    serve(app, host="0.0.0.0", port=config.PORT, threads=8)


if __name__ == "__main__":
    main()
