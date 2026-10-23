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
