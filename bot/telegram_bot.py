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

from . import config, db, images, speech

log = logging.getLogger(__name__)

API = "https://api.telegram.org/bot{token}/{method}"


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


def notify_staff_photo(client, photo, caption):
    """Пересылает фото сотрудникам (photo — ссылка или file_id Telegram).
    Ответ сотрудника на это фото уйдёт данному клиенту."""
    for chat in staff_chats():
        msg = call("sendPhoto", chat_id=chat, photo=photo, caption=caption[:1000])
        if msg:
            db.link_staff_message(chat, msg["message_id"], client)


def _client_photo_test(chat_id, msg):
    """Режим проверки: «клиент» прислал фото букета. Бот не видит картинок — пересылаем флористу,
    а клиенту отвечаем по-человечески, без выдуманных названий и цен."""
    client = f"tg:{chat_id}"
    caption = (msg.get("caption") or "").strip()
    file_id = msg["photo"][-1]["file_id"]  # самое крупное фото
    db.add_message(client, "user", "[клиент прислал фото букета]" + (f": {caption}" if caption else ""))
    reply = "Секундочку, гляну по этому букету 🌸 Уточню наличие и цену — и всё оформим."
    send(chat_id, reply)
    db.add_message(client, "assistant", reply)
    staff_note = (f"📸 Клиент прислал фото букета (🧪 тест, Telegram {chat_id}).\n"
                  + (f"Подпись клиента: «{caption}»\n" if caption else "")
                  + "Посмотрите фото и ответьте на это сообщение с ценой/наличием — бот передаст клиенту.")
    notify_staff_photo(client, file_id, staff_note)


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


def _voice_to_text(chat_id, voice):
    """Скачивает голосовое из Telegram и превращает в текст. Пустая строка — не получилось."""
    if voice.get("duration", 0) > speech.MAX_SECONDS:
        send(chat_id, f"Голосовое длиннее {speech.MAX_SECONDS} секунд — пока понимаю только короткие. "
                      "Запишите покороче или напишите текстом 🙏")
        return ""
    try:
        file = call("getFile", file_id=voice["file_id"])
        url = f"https://api.telegram.org/file/bot{config.TELEGRAM_TOKEN}/{file['file_path']}"
        audio = requests.get(url, timeout=30).content
        text = speech.recognize_ogg(audio)
    except Exception as e:
        log.warning("Не удалось распознать голосовое: %s", e)
        send(chat_id, "Не получилось разобрать голосовое 😔 Напишите, пожалуйста, текстом.")
        return ""
    if not text:
        send(chat_id, "Не расслышал 🙈 Повторите, пожалуйста, или напишите текстом.")
    return text


# ---------- Обработка сообщений от сотрудников ----------

def _handle(msg, deliver):
    chat_id = msg["chat"]["id"]
    user_id = msg.get("from", {}).get("id")
    text = (msg.get("text") or "").strip()

    if user_id not in config.TELEGRAM_STAFF_IDS:
        if text.startswith("/start") or text.startswith("/myid"):
            send(chat_id, f"Ваш ID: {user_id}\nДоступ к боту закрыт. Передайте этот номер администратору.")
        return

    if msg.get("voice") and not text:
        text = _voice_to_text(chat_id, msg["voice"])
        if not text:
            return
        send(chat_id, f"🎤 Распознал: «{text}»")

    # Клиент прислал фото букета (режим проверки) — бот не видит картинок, отдаём флористу.
    if (msg.get("photo") and db.is_test_mode(chat_id)
            and not msg.get("reply_to_message") and not text.startswith("/")):
        _client_photo_test(chat_id, msg)
        return

    # Стикер / фото / гифка и т.п. без текста — в режиме проверки не роняем разговор, а передаём боту пометку
    if not text and db.is_test_mode(chat_id) and any(msg.get(k) for k in
            ("sticker", "photo", "animation", "video", "document", "video_note")):
        kind = next(k for k in ("sticker", "photo", "animation", "video", "document", "video_note") if msg.get(k))
        names = {"sticker": "стикер", "photo": "фото", "animation": "гифку", "video": "видео",
                 "document": "файл", "video_note": "видео-кружок"}
        text = f"[Клиент прислал {names.get(kind, kind)}, без текста]"

    if text.startswith("/start") or text.startswith("/help"):
        send(chat_id, "Здравствуйте! Сюда будут приходить заказы и вопросы из Инстаграма.\n\n"
                      "• Ответить клиенту: нажмите «Ответить» на сообщении бота и напишите текст.\n"
                      "• /pause — ответом на сообщение: бот замолчит с этим клиентом.\n"
                      "• /resume — ответом на сообщение: бот снова отвечает.\n"
                      "• /test — проверить бота: пишите сюда как клиент. /reset — начать проверку заново.\n"
                      f"• /myid — ваш ID ({user_id}).")
        return
    if text.startswith("/myid"):
        send(chat_id, f"Ваш ID: {user_id}, ID этого чата: {chat_id}")
        return
    if text.startswith("/test"):
        if db.is_test_mode(chat_id):
            db.set_test_mode(chat_id, False)
            send(chat_id, "Режим проверки выключен.")
        else:
            db.set_test_mode(chat_id, True)
            db.resume(f"tg:{chat_id}")
            send(chat_id, "🧪 Режим проверки включён. Пишите как клиент, например: «Здравствуйте, сколько стоят розы?»\n"
                          "/reset — начать разговор заново. Выключить — снова /test")
        return
    if db.is_test_mode(chat_id) and not msg.get("reply_to_message") and text.startswith(("/resume", "/reset")):
        # Команды для своего тестового разговора (без ответа на сообщение)
        db.resume(f"tg:{chat_id}")
        if text.startswith("/reset"):
            db.clear_history(f"tg:{chat_id}")
            send(chat_id, "🔄 Начали заново: бот забыл тестовый разговор. Пишите как новый клиент.")
        else:
            send(chat_id, "▶️ Бот снова отвечает в режиме проверки.")
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

    if db.is_test_mode(chat_id) and text:
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
