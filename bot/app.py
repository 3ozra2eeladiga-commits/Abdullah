"""Главный файл: запускает сервер, Telegram и связывает всё вместе.

Запуск:  python -m bot.app
"""
import json
import logging
import sys
import threading
from collections import defaultdict

from flask import Flask, Response, abort, request
from waitress import serve

from . import brain, config, db, images, instagram, telegram_bot
from .catalog import catalog

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("flowerbot")

app = Flask(__name__)
_client_locks = defaultdict(threading.Lock)

SORRY = "Извините, у нас небольшая техническая заминка 🙏 Сотрудник скоро ответит вам."


# ---------- Куда отправлять ответ клиенту ----------

def _send_text(client, text):
    kind, cid = client.split(":", 1)
    if kind == "ig":
        instagram.send_text(cid, text)
    else:
        telegram_bot.send(cid, text)


def _send_photo(client, item):
    kind, cid = client.split(":", 1)
    if kind == "ig":
        instagram.send_photo(cid, item)
    else:
        telegram_bot.send_photo(cid, item)


def _label(client):
    kind, cid = client.split(":", 1)
    return f"Инстаграм-клиент {cid}" if kind == "ig" else f"🧪 тестовый клиент (Telegram {cid})"


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
    if o.get("упаковка"):
        lines.append(f"   🎀 Упаковка: {val(o['упаковка'])}")
    lines.append(f"   💰 Сумма товаров: {val(o.get('сумма_товаров'))} ₽")
    lines.append("")
    when = f"{val(o.get('дата'))}, {val(o.get('время'))}"
    lines.append(f"🕒 Когда: {when}")
    if pickup:
        lines.append(f"🏪 Самовывоз — {val(o.get('город'))}, {val(o.get('адрес'))}")
    else:
        lines.append(f"🚗 Доставка — {val(o.get('город'))}, {val(o.get('адрес'))}")
        lines.append(f"   стоимость доставки: {val(o.get('доставка_цена'))}")
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


def deliver(client, text, from_staff=False):
    """Главная функция: сообщение (от клиента или от сотрудника) -> ответ клиенту."""
    with _client_locks[client]:
        if not from_staff and db.is_paused(client):
            db.add_message(client, "user", text)
            if client.startswith("tg:"):
                # В режиме проверки «клиент» — сам сотрудник: подсказываем, почему бот молчит
                telegram_bot.send(client.split(":", 1)[1],
                                  "⏸ Бот сейчас молчит с этим клиентом: разговор передан сотруднику.\n"
                                  "/resume — снова включить бота, /reset — начать проверку заново.")
            return
        try:
            reply = brain.respond(client, text, from_staff=from_staff)
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

        if reply.order or reply.order_raw:
            order_id = db.save_order(client, reply.order or {"raw": reply.order_raw})
            telegram_bot.notify_staff(client, _format_order(order_id, client, reply))
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
        reply = "Секундочку, гляну по этому букету 🌸 Уточню наличие и цену — и всё оформим."
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
    return f"Бот работает. Товаров в каталоге — {by_city}"


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
