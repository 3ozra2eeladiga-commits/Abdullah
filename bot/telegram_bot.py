"""Telegram — «пульт» для сотрудников. Клиенты сюда не попадают.

Чужим людям бот отвечает только их ID (нужен, чтобы добавить сотрудника) и больше ничего.

Что умеет сотрудник:
- получать заказы и вопросы от бота;
- ответить на вопрос: нажать «Ответить» на сообщении бота и написать текст — бот передаст его клиенту;
- /pause (ответом на сообщение) — бот замолкает с этим клиентом, пишет сотрудник;
  /resume — бот снова отвечает этому клиенту;
- /test — режим проверки: сотрудник сам пишет боту как клиент (без Инстаграма). /test ещё раз — выключить.
"""
import logging
import threading
import time

import requests

from . import config, db, images

log = logging.getLogger(__name__)

API = "https://api.telegram.org/bot{token}/{method}"
_test_chats = set()


def call(method, files=None, **params):
    r = requests.post(API.format(token=config.TELEGRAM_TOKEN, method=method),
                      data=params if files else None, json=None if files else params,
                      files=files, timeout=70)
    data = r.json()
    if not data.get("ok"):
        log.warning("Telegram %s: %s", method, data)
    return data.get("result")


def send(chat_id, text, **extra):
    return call("sendMessage", chat_id=chat_id, text=text[:4000], **extra)


def send_photo(chat_id, item):
    try:
        caption = f"{item['title']} — {item['price']} ₽"
        if images.Image is None:
            # Без pillow фото остаётся в .webp — отдаём Telegram ссылку, он скачает сам
            call("sendPhoto", chat_id=chat_id, photo=item["images"][0], caption=caption)
        else:
            data = images.jpeg_bytes(item["images"][0])
            call("sendPhoto", files={"photo": ("photo.jpg", data, "image/jpeg")}, chat_id=chat_id, caption=caption)
    except Exception as e:
        log.warning("Не удалось отправить фото %s: %s", item["code"], e)


def staff_chats():
    if config.TELEGRAM_ORDERS_CHAT:
        return [config.TELEGRAM_ORDERS_CHAT]
    return [str(i) for i in config.TELEGRAM_STAFF_IDS]


def notify_staff(client, text):
    """Сообщение сотрудникам. Ответ на него уйдёт этому клиенту."""
    for chat in staff_chats():
        msg = send(chat, text)
        if msg:
            db.link_staff_message(chat, msg["message_id"], client)


# ---------- Обработка сообщений от сотрудников ----------

def _handle(msg, deliver):
    chat_id = msg["chat"]["id"]
    user_id = msg.get("from", {}).get("id")
    text = (msg.get("text") or "").strip()

    if user_id not in config.TELEGRAM_STAFF_IDS:
        if text.startswith("/start") or text.startswith("/myid"):
            send(chat_id, f"Ваш ID: {user_id}\nДоступ к боту закрыт. Передайте этот номер администратору.")
        return

    if text.startswith("/start") or text.startswith("/help"):
        send(chat_id, "Здравствуйте! Сюда будут приходить заказы и вопросы из Инстаграма.\n\n"
                      "• Ответить клиенту: нажмите «Ответить» на сообщении бота и напишите текст.\n"
                      "• /pause — ответом на сообщение: бот замолчит с этим клиентом.\n"
                      "• /resume — ответом на сообщение: бот снова отвечает.\n"
                      "• /test — проверить бота: пишите сюда как клиент.\n"
                      f"• /myid — ваш ID ({user_id}).")
        return
    if text.startswith("/myid"):
        send(chat_id, f"Ваш ID: {user_id}, ID этого чата: {chat_id}")
        return
    if text.startswith("/test"):
        if chat_id in _test_chats:
            _test_chats.discard(chat_id)
            send(chat_id, "Режим проверки выключен.")
        else:
            _test_chats.add(chat_id)
            send(chat_id, "🧪 Режим проверки включён. Пишите как клиент, например: «Здравствуйте, сколько стоят розы?»\n"
                          "Выключить — снова /test")
        return

    reply_to = msg.get("reply_to_message")
    if reply_to:
        client = db.client_for_staff_message(chat_id, reply_to["message_id"])
        if client:
            if text.startswith("/pause"):
                db.pause(client, 24 * 365)
                send(chat_id, "⏸ Бот молчит с этим клиентом. Включить — /resume ответом на сообщение.")
            elif text.startswith("/resume"):
                db.resume(client)
                send(chat_id, "▶️ Бот снова отвечает этому клиенту.")
            elif text:
                deliver(client, text, from_staff=True)
                send(chat_id, "✅ Передал клиенту.")
            return

    if chat_id in _test_chats and text:
        deliver(f"tg:{chat_id}", text, from_staff=False)
        return

    send(chat_id, "Чтобы ответить клиенту, нажмите «Ответить» на сообщении бота. Проверить бота — /test")


def run_polling(deliver):
    """Получает сообщения из Telegram (в отдельном потоке)."""
    offset = None
    call("deleteWebhook")
    while True:
        try:
            updates = call("getUpdates", timeout=50, offset=offset, allowed_updates=["message"]) or []
            for u in updates:
                offset = u["update_id"] + 1
                if "message" in u:
                    try:
                        _handle(u["message"], deliver)
                    except Exception:
                        log.exception("Ошибка при обработке сообщения Telegram")
        except Exception:
            log.exception("Ошибка Telegram, повтор через 5 сек")
            time.sleep(5)


def start(deliver):
    if not config.TELEGRAM_TOKEN:
        log.warning("TELEGRAM_TOKEN не задан — Telegram выключен")
        return
    threading.Thread(target=run_polling, args=(deliver,), daemon=True).start()
