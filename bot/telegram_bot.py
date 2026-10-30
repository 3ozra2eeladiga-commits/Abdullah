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


STAFF_PHOTO_MARK = "📦 В заказ:"  # подпись фото в карточке заказа для флориста (это не выбор клиента)


def send_photo(chat_id, item, caption=None, link=True, **extra):
    try:
        caption = caption or f"{item['title']} — {item['price']} ₽"
        if images.Image is None:
            # Без pillow фото остаётся в .webp — отдаём Telegram ссылку, он скачает сам
            msg = call("sendPhoto", chat_id=chat_id, photo=item["images"][0], caption=caption, **extra)
        else:
            data = images.jpeg_bytes(item["images"][0])
            msg = call("sendPhoto", files={"photo": ("photo.jpg", data, "image/jpeg")},
                       chat_id=chat_id, caption=caption, **extra)
        if msg and link:
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


def notify_staff_photo(client, photo, caption, buttons=None):
    """Пересылает фото сотрудникам (photo — ссылка или file_id Telegram), можно с кнопками.
    Ответ сотрудника на это фото уйдёт данному клиенту. Если фото не ушло — шлём хотя бы текст."""
    for chat in staff_chats():
        msg = call("sendPhoto", chat_id=chat, photo=photo, caption=caption[:1000], **_keyboard(buttons))
        if not msg:
            msg = send(chat, caption + "\n(фото клиента не удалось переслать — посмотрите в переписке)",
                       **_keyboard(buttons))
        if msg:
            db.link_staff_message(chat, msg["message_id"], client)


_hooks = {}   # обработчики из app: on_photo (фото от клиента), on_check / on_photo_button (кнопки)


def _client_photo(client, msg):
    """Клиент прислал фото. Бот картинок не видит — отдаём в app: там фото копятся, пока клиент не скажет,
    что хочет, и потом уходят флористу с кнопками «есть / нет / другое»."""
    caption = (msg.get("caption") or "").strip()
    file_id = msg["photo"][-1]["file_id"]  # самое крупное фото
    if _hooks.get("on_photo"):
        _hooks["on_photo"](client, file_id, caption)


def staff_chats():
    if config.TELEGRAM_ORDERS_CHAT:
        return [config.TELEGRAM_ORDERS_CHAT]
    return [str(i) for i in config.TELEGRAM_STAFF_IDS]


def _keyboard(buttons):
    return {"reply_markup": {"inline_keyboard": buttons}} if buttons else {}


def notify_staff(client, text, buttons=None):
    """Сообщение сотрудникам (buttons — inline-кнопки). Ответ на него уйдёт этому клиенту."""
    for chat in staff_chats():
        msg = send(chat, text, **_keyboard(buttons))
        if msg:
            db.link_staff_message(chat, msg["message_id"], client)


def notify_staff_order(client, items, text, buttons=None):
    """Новый заказ сотрудникам: сначала ФОТО заказанных товаров (что собирать), потом карточка заказа.
    Отвечают именно на карточку — текст уйдёт клиенту."""
    for chat in staff_chats():
        for it in items:
            # Подпись «В заказ:» и без привязки к товару: в режиме /test это фото видно в том же чате,
            # и ответ на него не должен считаться выбором клиента.
            send_photo(chat, it, caption=f"{STAFF_PHOTO_MARK} {it['title']} — {it['price']} ₽", link=False)
        msg = send(chat, text, **_keyboard(buttons))
        if msg:
            db.link_staff_message(chat, msg["message_id"], client)


def photo_bytes(photo):
    """Байты фото клиента: Telegram file_id или ссылка (Инстаграм). Ошибка — None."""
    try:
        if str(photo).startswith("http"):
            return requests.get(photo, timeout=30).content
        f = call("getFile", file_id=photo)
        return requests.get(f"https://api.telegram.org/file/bot{config.TELEGRAM_TOKEN}/{f['file_path']}", timeout=30).content
    except Exception as e:
        log.warning("Не удалось скачать фото: %s", e)
        return None


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
    ref = (r.get("caption") or r.get("text") or "").strip()
    return "" if ref.startswith(STAFF_PHOTO_MARK) else ref


# ---------- Обработка сообщений от сотрудников ----------

def _handle(msg, deliver):
    chat_id = msg["chat"]["id"]
    user_id = msg.get("from", {}).get("id")
    text = (msg.get("text") or "").strip()

    secret = config.secret_reply_for(text)              # секретный код — отвечаем и больше ничего не делаем
    if secret:
        send(chat_id, secret)
        return
    if not config.is_staff(user_id):
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
                      "• /resume или /reset без ответа на сообщение — снять паузу/начать заново ВАШ разговор "
                      "(и здесь, и в Telegram магазина).\n"
                      "• /biz — кому бот отвечает в Telegram магазина.\n"
                      f"• /myid — ваш ID ({user_id}).")
        return
    if text.startswith("/myid"):
        send(chat_id, f"Ваш ID: {user_id}, ID этого чата: {chat_id}")
        return
    if text.startswith("/biz"):
        _biz_command(chat_id, text)
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
    if not msg.get("reply_to_message") and text.startswith(("/resume", "/reset")):
        # Команды для СВОЕГО разговора с ботом (без ответа на сообщение): и в режиме /test,
        # и в Telegram магазина (сотрудник проверяет бота как клиент) — снимаем паузу, «обиду» и счётчики.
        for own in (f"tg:{chat_id}", f"tgb:{user_id}"):
            db.resume(own)
            for k in ("rude", "offtopic"):
                db.del_setting(f"{k}:{own}")
            if text.startswith("/reset"):
                db.clear_history(own)
        if not db.is_test_mode(chat_id):
            send(chat_id, "🔄 Ваш разговор с ботом в Telegram магазина начат заново."
                 if text.startswith("/reset") else "▶️ Бот снова отвечает вам в Telegram магазина.")
            return
        if text.startswith("/reset"):
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


def biz_open():
    """True — бот отвечает всем клиентам бизнес-аккаунта; по умолчанию — только разрешённым."""
    return db.get_setting("biz_mode") == "all"


def biz_allowed_ids():
    ids = {int(x) for x in (db.get_setting("biz_allow") or "").split(",") if x.strip().lstrip("-").isdigit()}
    return ids | set(config.TELEGRAM_STAFF_IDS)


def biz_allowed(user_id):
    return biz_open() or user_id in biz_allowed_ids() or config.is_staff(user_id)


def _biz_remember(user):
    """Запоминаем последних писавших (чтобы сотрудник мог добавить нужного по /biz)."""
    uid = user.get("id")
    name = " ".join(x for x in (user.get("first_name"), user.get("last_name")) if x) or "без имени"
    if user.get("username"):
        name += f" @{user['username']}"
    seen = [x for x in (db.get_setting("biz_seen") or "").split("\n") if x and not x.startswith(f"{uid}|")]
    seen.insert(0, f"{uid}|{name}")
    db.set_setting("biz_seen", "\n".join(seen[:10]))


def _biz_command(chat_id, text):
    """/biz — кому бот отвечает в бизнес-аккаунте; /biz_add ID, /biz_del ID, /biz_all, /biz_only."""
    cmd, _, arg = text.partition(" ")
    arg = arg.strip()
    allow = [x for x in (db.get_setting("biz_allow") or "").split(",") if x.strip()]
    if cmd == "/biz_add" and arg.lstrip("-").isdigit():
        if arg not in allow:
            allow.append(arg)
        db.set_setting("biz_allow", ",".join(allow))
        send(chat_id, f"✅ Добавил {arg}: бот будет ему отвечать.")
        return
    if cmd == "/biz_del" and arg.lstrip("-").isdigit():
        db.set_setting("biz_allow", ",".join(x for x in allow if x != arg))
        send(chat_id, f"🗑 Убрал {arg}.")
        return
    if cmd == "/biz_all":
        db.set_setting("biz_mode", "all")
        send(chat_id, "🌸 Бот теперь отвечает ВСЕМ клиентам. Вернуть «только свои» — /biz_only")
        return
    if cmd == "/biz_only":
        db.set_setting("biz_mode", "only")
        send(chat_id, "🔒 Бот отвечает только разрешённым. Список — /biz")
        return
    seen = [x.split("|", 1) for x in (db.get_setting("biz_seen") or "").split("\n") if "|" in x]
    lines = ["🌸 Бот отвечает ВСЕМ клиентам." if biz_open() else
             "🔒 Бот отвечает только разрешённым (остальным молчит):",
             "Разрешены: " + (", ".join(str(x) for x in sorted(biz_allowed_ids())) or "никто")]
    if seen:
        lines.append("\nНедавно писали магазину (бот им молчал):")
        lines += [f"• {name} — /biz_add {uid}" for uid, name in seen]
    lines.append("\n/biz_add ID — добавить, /biz_del ID — убрать, /biz_all — отвечать всем, /biz_only — только своим")
    send(chat_id, "\n".join(lines))


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

    # Режим «только свои»: пока бот не готов, отвечает лишь разрешённым (Абдулла, хозяйка);
    # остальным клиентам молчит — им отвечают флористы сами.
    if from_id == chat_id and not biz_allowed(chat_id):
        _biz_remember(msg.get("from", {}))
        return

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


def _handle_callback(cq, on_check):
    """Сотрудник нажал кнопку: под заявкой (chk:<действие>:<номер заказа>), под фото клиента (ph:…:<номер>)
    или под вопросом бота (q:yes|no|other:<номер вопроса>)."""
    user_id = cq.get("from", {}).get("id")
    if not config.is_staff(user_id):
        call("answerCallbackQuery", callback_query_id=cq["id"], text="Нет доступа")
        return
    parts = (cq.get("data") or "").split(":")
    handler = {"chk": on_check, "ph": _hooks.get("on_photo_button"),
               "q": _hooks.get("on_question")}.get(parts[0]) if len(parts) == 3 else None
    if not handler or not parts[2].isdigit():
        call("answerCallbackQuery", callback_query_id=cq["id"])
        return
    result = handler(int(parts[2]), parts[1])
    call("answerCallbackQuery", callback_query_id=cq["id"], text=result[:200])
    m = cq.get("message") or {}
    if m:
        # Кнопки убираем, чтобы не нажали второй раз (что отмечено — видно в следующем сообщении бота).
        call("editMessageReplyMarkup", chat_id=m["chat"]["id"], message_id=m["message_id"],
             reply_markup={"inline_keyboard": []})


def run_polling(deliver, on_check):
    """Получает сообщения из Telegram (в отдельном потоке)."""
    offset = None
    call("deleteWebhook")
    allowed = ["message", "callback_query", "business_connection", "business_message"]
    while True:
        try:
            updates = call("getUpdates", timeout=50, offset=offset, allowed_updates=allowed) or []
            for u in updates:
                offset = u["update_id"] + 1
                try:
                    if "message" in u:
                        _handle(u["message"], deliver)
                    elif "callback_query" in u:
                        _handle_callback(u["callback_query"], on_check)
                    elif "business_message" in u:
                        _handle_business(u, deliver)
                    elif "business_connection" in u:
                        _handle_business_connection(u)
                except Exception:
                    log.exception("Ошибка при обработке обновления Telegram")
        except Exception:
            log.exception("Ошибка Telegram, повтор через 5 сек")
            time.sleep(5)


def start(deliver, on_check, on_photo=None, on_photo_button=None, on_question=None):
    _hooks.update(on_photo=on_photo, on_photo_button=on_photo_button, on_question=on_question)
    if not config.TELEGRAM_TOKEN:
        log.warning("TELEGRAM_TOKEN не задан — Telegram выключен")
        return
    threading.Thread(target=run_polling, args=(deliver, on_check), daemon=True).start()
