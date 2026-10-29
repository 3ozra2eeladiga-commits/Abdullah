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
    limit = limit or config.HISTORY_LIMIT
    rows = _exec("SELECT role, content FROM messages WHERE client=? ORDER BY id DESC LIMIT ?",
                 (client, limit)).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def save_order(client, data):
    cur = _exec("INSERT INTO orders(client, data, created) VALUES (?,?,?)",
                (client, json.dumps(data, ensure_ascii=False), time.time()))
    return cur.lastrowid


def get_order(order_id):
    """(клиент, данные заказа) по номеру — или None."""
    row = _exec("SELECT client, data FROM orders WHERE id=?", (order_id,)).fetchone()
    return (row["client"], json.loads(row["data"])) if row else None


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


def clear_history(client):
    _exec("DELETE FROM messages WHERE client=?", (client,))
    _exec("DELETE FROM client_city WHERE client=?", (client,))
    _exec("DELETE FROM pending_orders WHERE client=?", (client,))
    _exec("DELETE FROM settings WHERE key IN (?,?,?,?)",
          tuple(f"{k}:{client}" for k in ("upsize", "addons", "lastq", "cards_shown")))
    _exec("DELETE FROM settings WHERE key IN (?,?,?,?,?,?,?,?)",
          (f"cardtext:{client}", f"cardstep:{client}", f"site_sent:{client}", f"prev_items:{client}", f"nocard:{client}", f"shown:{client}", f"chosen:{client}", f"ocheck:{client}"))


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
