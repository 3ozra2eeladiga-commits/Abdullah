"""Инстаграм Директ (Instagram API с входом через Instagram).

Инстаграм присылает сообщения клиентов на наш адрес /webhook,
а ответы мы отправляем через graph.instagram.com.
"""
import hashlib
import hmac
import logging

import requests

from . import config, db, images

log = logging.getLogger(__name__)


def _url(path):
    return f"https://graph.instagram.com/{config.IG_API_VERSION}/{path}"


def _send(recipient_id, message):
    r = requests.post(
        _url("me/messages"),
        headers={"Authorization": f"Bearer {config.IG_ACCESS_TOKEN}"},
        json={"recipient": {"id": recipient_id}, "message": message},
        timeout=30,
    )
    if r.status_code != 200:
        log.warning("Instagram: ошибка отправки %s: %s", r.status_code, r.text)
        return None
    mid = r.json().get("message_id")
    db.remember_sent(mid)
    return mid


def send_text(recipient_id, text):
    # Ограничение Инстаграма — 1000 символов на сообщение
    for i in range(0, len(text), 1000):
        _send(recipient_id, {"text": text[i:i + 1000]})


def send_photo(recipient_id, item):
    _send(recipient_id, {"attachment": {"type": "image", "payload": {"url": images.public_url(item)}}})


def signature_ok(body, header):
    """Проверка, что запрос действительно от Инстаграма."""
    if not config.IG_APP_SECRET:
        return True
    expected = "sha256=" + hmac.new(config.IG_APP_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header or "")


def parse_events(payload):
    """Достаёт из запроса Инстаграма понятные события.

    Возвращает список словарей:
      {"type": "message", "client": id, "text": "...", "attachments": [...]}
      {"type": "staff_reply", "client": id}   — сотрудник сам ответил в Директе
    """
    events = []
    for entry in payload.get("entry", []):
        for ev in entry.get("messaging", []):
            msg = ev.get("message")
            if not msg or msg.get("is_deleted"):
                continue
            if msg.get("is_echo"):
                # Наше же сообщение или ответ сотрудника из приложения Инстаграм
                if not db.was_sent_by_bot(msg.get("mid")):
                    events.append({"type": "staff_reply", "client": ev["recipient"]["id"]})
                continue
            atts = msg.get("attachments", [])
            events.append({
                "type": "message",
                "client": ev["sender"]["id"],
                "text": msg.get("text", ""),
                "attachments": [a.get("type") for a in atts],
                # ссылки на присланные фото — чтобы переслать флористу (бот не видит картинок)
                "image_urls": [a.get("payload", {}).get("url") for a in atts
                               if a.get("type") == "image" and a.get("payload", {}).get("url")],
            })
    return events
