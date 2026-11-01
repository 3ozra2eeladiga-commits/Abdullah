"""Простая база SQLite: переписки, заказы, вопросы сотрудникам, паузы."""
import json
import sqlite3
import threading
import time

from . import config

_lock = threading.Lock()
_conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
_conn.row_factory = sqlite3.Row
_conn.executescript(
    """
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client TEXT NOT NULL,
        role TEXT NOT NULL,          -- user | assistant
        content TEXT NOT NULL,
        created REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_client ON messages(client, id);
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client TEXT NOT NULL,
        data TEXT NOT NULL,
        created REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS staff_threads (
        tg_chat TEXT NOT NULL,
        tg_message INTEGER NOT NULL,  -- сообщение в Telegram, на которое отвечает сотрудник
        client TEXT NOT NULL,
        PRIMARY KEY (tg_chat, tg_message)
    );
    CREATE TABLE IF NOT EXISTS pauses (
        client TEXT PRIMARY KEY,
        until REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sent_ids (
        mid TEXT PRIMARY KEY          -- id сообщений, отправленных ботом (чтобы отличать от сотрудников)
    );
    CREATE TABLE IF NOT EXISTS test_chats (
        chat TEXT PRIMARY KEY         -- чаты сотрудников с включённым режимом /test
    );
    CREATE TABLE IF NOT EXISTS client_city (
        client TEXT PRIMARY KEY,      -- выбранный клиентом город (Пятигорск / Минеральные Воды)
        city TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,         -- разные настройки бота (например, id бизнес-подключения Telegram)
        value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_orders (
        client TEXT PRIMARY KEY,      -- собранный заказ, ждёт подтверждения клиента перед отправкой флористу
        data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS photo_msgs (
        tg_chat TEXT NOT NULL,        -- какому букету (code) соответствует отправленное фото —
        tg_message INTEGER NOT NULL,  -- чтобы по ответу (reply) на фото точно знать выбранный букет
        code TEXT NOT NULL,
        PRIMARY KEY (tg_chat, tg_message)
    );
    """
)


def _exec(sql, args=()):
    with _lock:
        cur = _conn.execute(sql, args)
        _conn.commit()
        return cur


def add_message(client, role, content):
    _exec("INSERT INTO messages(client, role, content, created) VALUES (?,?,?,?)",
          (client, role, content, time.time()))


def history(client, limit=None):
    """Переписка клиента — только по ТЕКУЩЕМУ заказу: после отправленной заявки начинается новая
    (иначе слова прошлого заказа — «доставка», «завтра» — путают новый)."""
    limit = limit or config.HISTORY_LIMIT
    start = int(get_setting(f"hist_from:{client}") or 0)
    rows = _exec("SELECT role, content FROM messages WHERE client=? AND id>? ORDER BY id DESC LIMIT ?",
                 (client, start, limit)).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def save_order(client, data):
    cur = _exec("INSERT INTO orders(client, data, created) VALUES (?,?,?)",
                (client, json.dumps(data, ensure_ascii=False), time.time()))
    return cur.lastrowid


def get_order(order_id):
    """(клиент, данные заказа) по номеру — или None."""
    row = _exec("SELECT client, data FROM orders WHERE id=?", (order_id,)).fetchone()
    return (row["client"], json.loads(row["data"])) if row else None


_MONTHS_RU = ("январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр")


def _target_day(data, created):
    """На какой день заказ (дата доставки/самовывоза): «сегодня/завтра» — от дня оформления, «02.11», «8 марта».
    Не понятно — рабочий день оформления (после 22:00 — следующий)."""
    import datetime as _dt
    import re as _re
    msk = _dt.timezone(_dt.timedelta(hours=3))
    base = _dt.datetime.fromtimestamp(created, msk)
    d = str((data or {}).get("дата") or "").lower()
    for word, add in (("послезавтра", 2), ("завтра", 1), ("сегодня", 0)):
        if word in d:
            return base.date() + _dt.timedelta(days=add)
    m = _re.search(r"\b(\d{1,2})[./](\d{1,2})", d)
    day = mon = None
    if m:
        day, mon = int(m.group(1)), int(m.group(2))
    else:
        m = _re.search(r"\b(\d{1,2})\s+([а-яё]+)", d)
        if m:
            mon = next((i + 1 for i, w in enumerate(_MONTHS_RU) if m.group(2).startswith(w)), None)
            day = int(m.group(1))
    if day and mon:
        try:
            t = _dt.date(base.year, mon, day)
            return t if t >= base.date() - _dt.timedelta(days=1) else _dt.date(base.year + 1, mon, day)
        except ValueError:
            pass
    hh, mm = (int(x) for x in (config.DAY_CLOSE or "22:00").split(":"))
    return (base + _dt.timedelta(minutes=24 * 60 - hh * 60 - mm)).date()


def order_no(order_id):
    """Номер заказа «на свой день»: у заказов на один и тот же день — №1, №2, №3… (по порядку оформления).
    В базе номер остаётся сквозным (id) — для ссылок и кнопок."""
    cached = get_setting(f"dayno:{order_id}")
    if cached and get_setting(f"dayof:{order_id}") and get_setting(f"dayver:{order_id}") == "2":
        return int(cached)
    row = _exec("SELECT data, created FROM orders WHERE id=?", (order_id,)).fetchone()
    if not row:
        return order_id
    try:
        target = _target_day(json.loads(row["data"]), row["created"])
    except ValueError:
        return order_id
    n = 0
    for r in _exec("SELECT id, data, created FROM orders WHERE created>=? AND id<=?",
                   (row["created"] - 120 * 86400, order_id)).fetchall():
        try:
            if _target_day(json.loads(r["data"]), r["created"]) == target:
                n += 1
        except ValueError:
            continue
    set_setting(f"dayno:{order_id}", n)
    set_setting(f"dayof:{order_id}", target.strftime("%d.%m"))
    set_setting(f"dayver:{order_id}", "2")
    return n


def order_day(order_id):
    """Рабочий день, к которому относится номер заказа («31.10»)."""
    order_no(order_id)
    return get_setting(f"dayof:{order_id}") or ""


def recent_orders(since_ts):
    """Заказы, созданные после since_ts: [(id, client, data, created)], старые сначала."""
    rows = _exec("SELECT id, client, data, created FROM orders WHERE created>=? ORDER BY id", (since_ts,)).fetchall()
    out = []
    for r in rows:
        try:
            out.append((r["id"], r["client"], json.loads(r["data"]), r["created"]))
        except ValueError:
            continue
    return out


def last_order_id(client):
    row = _exec("SELECT id FROM orders WHERE client=? ORDER BY id DESC LIMIT 1", (client,)).fetchone()
    return row["id"] if row else None


def order_created(order_id):
    row = _exec("SELECT created FROM orders WHERE id=?", (order_id,)).fetchone()
    return row["created"] if row else 0


def update_order(order_id, data):
    _exec("UPDATE orders SET data=? WHERE id=?", (json.dumps(data, ensure_ascii=False), order_id))


def has_order(client):
    """Был ли заказ в текущей переписке (после /reset старые заказы не считаются)."""
    return _exec("SELECT 1 FROM orders o WHERE client=? AND created >= "
                 "(SELECT MIN(created) FROM messages WHERE client=?) LIMIT 1",
                 (client, client)).fetchone() is not None


def link_staff_message(tg_chat, tg_message, client):
    _exec("INSERT OR REPLACE INTO staff_threads VALUES (?,?,?)", (str(tg_chat), tg_message, client))


def client_for_staff_message(tg_chat, tg_message):
    row = _exec("SELECT client FROM staff_threads WHERE tg_chat=? AND tg_message=?",
                (str(tg_chat), tg_message)).fetchone()
    return row["client"] if row else None


def pause(client, hours):
    _exec("INSERT OR REPLACE INTO pauses VALUES (?,?)", (client, time.time() + hours * 3600))


def resume(client):
    _exec("DELETE FROM pauses WHERE client=?", (client,))


def is_paused(client):
    row = _exec("SELECT until FROM pauses WHERE client=?", (client,)).fetchone()
    return bool(row and row["until"] > time.time())


def remember_sent(mid):
    if mid:
        _exec("INSERT OR IGNORE INTO sent_ids VALUES (?)", (mid,))


def was_sent_by_bot(mid):
    return _exec("SELECT 1 FROM sent_ids WHERE mid=?", (mid,)).fetchone() is not None


def set_test_mode(chat, on):
    if on:
        _exec("INSERT OR IGNORE INTO test_chats VALUES (?)", (str(chat),))
    else:
        _exec("DELETE FROM test_chats WHERE chat=?", (str(chat),))


def is_test_mode(chat):
    return _exec("SELECT 1 FROM test_chats WHERE chat=?", (str(chat),)).fetchone() is not None


def new_conversation(client):
    """Заявка отправлена — следующий заказ этого клиента начинаем с чистого листа."""
    row = _exec("SELECT MAX(id) AS m FROM messages WHERE client=?", (client,)).fetchone()
    set_setting(f"hist_from:{client}", (row["m"] if row and row["m"] else 0))


def clear_history(client):
    _exec("DELETE FROM messages WHERE client=?", (client,))
    _exec("DELETE FROM settings WHERE key=?", (f"hist_from:{client}",))
    _exec("DELETE FROM client_city WHERE client=?", (client,))
    _exec("DELETE FROM pending_orders WHERE client=?", (client,))
    _exec("DELETE FROM settings WHERE key IN (?,?,?,?)",
          tuple(f"{k}:{client}" for k in ("upsize", "addons", "lastq", "cards_shown")))
    _exec("DELETE FROM settings WHERE key IN (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          (f"editorder:{client}", f"photo_item:{client}", f"cphotos:{client}", f"addto:{client}", f"wantcard:{client}", f"wantcard_text:{client}", f"draft:{client}", f"cardtext:{client}", f"cardstep:{client}", f"site_sent:{client}", f"prev_items:{client}", f"nocard:{client}", f"shown:{client}", f"chosen:{client}", f"ocheck:{client}"))
    _exec("DELETE FROM settings WHERE key IN (?,?,?,?)", (f"rude:{client}", f"pack:{client}", f"surprise:{client}", f"contacts:{client}"))
    _exec("DELETE FROM settings WHERE key IN (?,?,?,?)", (f"await:{client}", f"awaitmsgs:{client}",
                                                     f"nightorder:{client}", f"closed_note:{client}"))
    _exec("DELETE FROM settings WHERE key IN (?,?,?,?,?)", (f"noaddr:{client}", f"notime:{client}", f"placeq:{client}",
                                                         f"addr_extra:{client}", f"addr_base:{client}"))
    _exec("DELETE FROM settings WHERE key IN (?,?)", (f"seen:{client}", f"asap:{client}"))
    _exec("DELETE FROM settings WHERE key IN (?,?)", (f"lateask:{client}", f"florist_note:{client}"))
    _exec("DELETE FROM settings WHERE key IN (?,?)", (f"pickup_shop:{client}", f"replace_note:{client}"))
    _exec("DELETE FROM settings WHERE key IN (?,?)", (f"closed_note:{client}", f"waitnote:{client}"))
    _exec("DELETE FROM settings WHERE key IN (?,?)", (f"contacts:{client}", f"offtopic:{client}"))


def set_city(client, city):
    _exec("INSERT OR REPLACE INTO client_city VALUES (?,?)", (client, city))


def get_city(client):
    row = _exec("SELECT city FROM client_city WHERE client=?", (client,)).fetchone()
    return row["city"] if row else None


def set_setting(key, value):
    _exec("INSERT OR REPLACE INTO settings VALUES (?,?)", (key, str(value)))


def del_setting(key):
    _exec("DELETE FROM settings WHERE key=?", (key,))


def get_setting(key, default=None):
    row = _exec("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def set_pending_order(client, data):
    """Собранный заказ, который ждёт подтверждения клиента перед отправкой флористу."""
    _exec("INSERT OR REPLACE INTO pending_orders VALUES (?,?)", (client, json.dumps(data, ensure_ascii=False)))


def get_pending_order(client):
    row = _exec("SELECT data FROM pending_orders WHERE client=?", (client,)).fetchone()
    return json.loads(row["data"]) if row else None


def clear_pending_order(client):
    _exec("DELETE FROM pending_orders WHERE client=?", (client,))


def link_photo(tg_chat, tg_message, code):
    """Запоминаем, какому букету (code) соответствует отправленное фото (по id сообщения Telegram)."""
    _exec("INSERT OR REPLACE INTO photo_msgs VALUES (?,?,?)", (str(tg_chat), tg_message, code))


def photo_code(tg_chat, tg_message):
    row = _exec("SELECT code FROM photo_msgs WHERE tg_chat=? AND tg_message=?",
                (str(tg_chat), tg_message)).fetchone()
    return row["code"] if row else None


def count_user_messages_since(client, ts):
    row = _exec("SELECT COUNT(*) AS n FROM messages WHERE client=? AND role='user' AND created>=?", (client, ts)).fetchone()
    return int(row["n"]) if row else 0


def count_orders_since(client, ts):
    row = _exec("SELECT COUNT(*) AS n FROM orders WHERE client=? AND created>=?", (client, ts)).fetchone()
    return int(row["n"]) if row else 0
