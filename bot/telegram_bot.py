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
from .catalog import catalog

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


def send_photo(chat_id, item, **extra):
    try:
        caption = f"{item['title']} — {item['price']} ₽"
        if images.Image is None:
            # Без pillow фото остаётся в .webp — отдаём Telegram ссылку, он скачает сам
            msg = call("sendPhoto", chat_id=chat_id, photo=item["images"][0], caption=caption, **extra)
        else:
            data = images.jpeg_bytes(item["images"][0])
            msg = call("sendPhoto", files={"photo": ("photo.jpg", data, "image/jpeg")},
                       chat_id=chat_id, caption=caption, **extra)
        if msg:
            db.link_photo(chat_id, msg["message_id"], item["code"])  # запоминаем: это фото = этот букет
        return msg
    except Exception as e:
        log.warning("Не удалось отправить фото %s: %s", item["code"], e)


# ---------- Отправка КЛИЕНТУ (tgb — бизнес-аккаунт @na_romashkee, tg — тестовый режим) ----------

def _biz_conn_id():
    """id бизнес-подключения Telegram — чтобы бот отвечал от имени аккаунта магазина."""
    return db.get_setting("biz_conn_id")


def _client_label(client):
    kind, cid = client.split(":", 1)
    return {"tgb": f"клиент Telegram {cid}", "tg": f"🧪 тест (Telegram {cid})",
            "ig": f"Инстаграм-клиент {cid}"}.get(kind, cid)


def send_client(client, text):
    """Сообщение клиенту. tgb — через бизнес-аккаунт магазина, tg — обычная отправка (тест)."""
    kind, cid = client.split(":", 1)
    if kind != "tgb":
        send(cid, text)
        return
    conn = _biz_conn_id()
    extra = {"business_connection_id": conn} if conn else {}
    for i in range(0, max(len(text), 1), 4000):
        msg = call("sendMessage", chat_id=cid, text=text[i:i + 4000] or " ", **extra)
        if msg:
            db.remember_sent(f"biz:{cid}:{msg['message_id']}")  # чтобы не принять свой ответ за ответ сотрудника


def send_client_photo(client, item):
    kind, cid = client.split(":", 1)
    if kind != "tgb":
        send_photo(cid, item)
        return
    conn = _biz_conn_id()
    extra = {"business_connection_id": conn} if conn else {}
    msg = send_photo(cid, item, **extra)
    if msg:
        db.remember_sent(f"biz:{cid}:{msg['message_id']}")


def notify_staff_photo(client, photo, caption):
    """Пересылает фото сотрудникам (photo — ссылка или file_id Telegram).
    Ответ сотрудника на это фото уйдёт данному клиенту. Если фото не ушло — шлём хотя бы текст."""
    for chat in staff_chats():
        msg = call("sendPhoto", chat_id=chat, photo=photo, caption=caption[:1000])
        if not msg:
            msg = send(chat, caption + "\n(фото клиента не удалось переслать — посмотрите в переписке)")
        if msg:
            db.link_staff_message(chat, msg["message_id"], client)


def _client_photo(client, msg):
    """Клиент прислал фото букета. Бот не видит картинок — просим номер и страхуем пересылкой флористу."""
    caption = (msg.get("caption") or "").strip()
    file_id = msg["photo"][-1]["file_id"]  # самое крупное фото
    db.add_message(client, "user", "[клиент прислал фото букета]" + (f": {caption}" if caption else ""))
    reply = ("Спасибо 🌸 Если этот букет с нашего сайта — напишите, пожалуйста, его НОМЕР (он под фото, "
             "например №600), и я сразу его найду и оформлю. А фото я на всякий случай уже передала "
             "флористу — подберём точь-в-точь или похожее.")
    send_client(client, reply)
    db.add_message(client, "assistant", reply)
    staff_note = (f"📸 Клиент прислал фото букета ({_client_label(client)}).\n"
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


def _recognize_voice(voice):
    """Скачивает голосовое и превращает в текст. Возвращает (текст, сообщение_об_ошибке) — одно пустое."""
    if voice.get("duration", 0) > speech.MAX_SECONDS:
        return "", (f"Голосовое длиннее {speech.MAX_SECONDS} секунд — пока понимаю только короткие. "
                    "Запишите покороче или напишите текстом 🙏")
    try:
        file = call("getFile", file_id=voice["file_id"])
        url = f"https://api.telegram.org/file/bot{config.TELEGRAM_TOKEN}/{file['file_path']}"
        audio = requests.get(url, timeout=30).content
        text = speech.recognize_ogg(audio)
    except Exception as e:
        log.warning("Не удалось распознать голосовое: %s", e)
        return "", "Не получилось разобрать голосовое 😔 Напишите, пожалуйста, текстом."
    if not text:
        return "", "Не расслышал 🙈 Повторите, пожалуйста, или напишите текстом."
    return text, ""


def _quoted_ref(msg, chat_id=None):
    """Если клиент ответил (reply) на фото/сообщение — возвращает ссылку на букет (его подпись), чтобы бот понял,
    о каком именно букете речь. Сначала НАДЁЖНО: по id нашего фото находим точный букет (не зависим от того,
    отдал ли Telegram подпись). Иначе — берём подпись/текст из ответа. Передаётся в respond отдельно (quote)."""
    r = msg.get("reply_to_message")
    if not r:
        return ""
    if chat_id is not None:
        code = db.photo_code(chat_id, r.get("message_id"))
        if code:
            it = catalog.get(code)
            if it:
                return f"{it['title']} — {it['price']} ₽"
    return (r.get("caption") or r.get("text") or "").strip()


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
        text, err = _recognize_voice(msg["voice"])
        if err:
            send(chat_id, err)
            return
        if not text:
            return
        send(chat_id, f"🎤 Распознал: «{text}»")

    # Клиент прислал фото букета (режим проверки) — бот не видит картинок, отдаём флористу.
    if (msg.get("photo") and db.is_test_mode(chat_id)
            and not msg.get("reply_to_message") and not text.startswith("/")):
        _client_photo(f"tg:{chat_id}", msg)
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
        deliver(f"tg:{chat_id}", text, from_staff=False, quote=_quoted_ref(msg, chat_id))
        return

    send(chat_id, "Чтобы ответить клиенту, нажмите «Ответить» на сообщении бота. Проверить бота — /test")


# ---------- Клиенты из бизнес-аккаунта @na_romashkee (Telegram Business) ----------

def _handle_business_connection(update):
    """Магазин подключил/обновил бота в настройках Telegram Business — запоминаем id подключения."""
    bc = update.get("business_connection", {})
    conn = bc.get("id")
    if conn:
        db.set_setting("biz_conn_id", conn)
        log.info("Telegram Business: подключение %s (включено=%s)", conn, bc.get("is_enabled"))


def _handle_business(update, deliver):
    """Сообщение в личных чатах бизнес-аккаунта магазина. Клиент -> бот отвечает; сотрудник сам -> бот молчит."""
    msg = update.get("business_message")
    if not msg:
        return  # отредактированные/удалённые сообщения не обрабатываем
    conn = msg.get("business_connection_id")
    if conn:
        db.set_setting("biz_conn_id", conn)
    chat_id = msg.get("chat", {}).get("id")
    from_id = msg.get("from", {}).get("id")
    if chat_id is None:
        return
    client = f"tgb:{chat_id}"

    # В личном чате id чата == id собеседника-клиента. Если отправитель НЕ клиент — это владелец аккаунта:
    # либо наш собственный ответ (вернулся обновлением), либо живой сотрудник ответил сам.
    if from_id != chat_id:
        if db.was_sent_by_bot(f"biz:{chat_id}:{msg.get('message_id')}"):
            return  # это наш же ответ, не реагируем
        db.pause(client, config.HUMAN_PAUSE_HOURS)  # сотрудник вступил в разговор — бот умолкает
        return

    text = (msg.get("text") or msg.get("caption") or "").strip()
    if msg.get("voice") and not text:
        text, err = _recognize_voice(msg["voice"])
        if err:
            send_client(client, err)
            return
        if not text:
            return
    if msg.get("photo"):
        _client_photo(client, msg)
        return
    if text:
        deliver(client, text, quote=_quoted_ref(msg, chat_id))


def run_polling(deliver):
    """Получает сообщения из Telegram (в отдельном потоке)."""
    offset = None
    call("deleteWebhook")
    allowed = ["message", "business_connection", "business_message"]
    while True:
        try:
            updates = call("getUpdates", timeout=50, offset=offset, allowed_updates=allowed) or []
            for u in updates:
                offset = u["update_id"] + 1
                try:
                    if "message" in u:
                        _handle(u["message"], deliver)
                    elif "business_message" in u:
                        _handle_business(u, deliver)
                    elif "business_connection" in u:
                        _handle_business_connection(u)
                except Exception:
                    log.exception("Ошибка при обработке обновления Telegram")
        except Exception:
            log.exception("Ошибка Telegram, повтор через 5 сек")
            time.sleep(5)


def start(deliver):
    if not config.TELEGRAM_TOKEN:
        log.warning("TELEGRAM_TOKEN не задан — Telegram выключен")
        return
    threading.Thread(target=run_polling, args=(deliver,), daemon=True).start()
