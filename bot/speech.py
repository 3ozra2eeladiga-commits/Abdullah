"""Распознавание голосовых сообщений через Yandex SpeechKit.

Нужна роль ai.speechkit-stt.user у сервисного аккаунта и область действия
yc.ai.speechkitStt.execute у API-ключа (тот же YANDEX_API_KEY).
Короткий режим SpeechKit принимает до 30 секунд и до 1 МБ (формат OGG/Opus — как у голосовых Telegram).
"""
import logging

import requests

from . import config

log = logging.getLogger(__name__)

MAX_SECONDS = 30


class SpeechError(Exception):
    pass


def recognize_ogg(audio_bytes):
    r = requests.post(
        "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize",
        params={"folderId": config.YANDEX_FOLDER_ID, "lang": "ru-RU"},
        headers={"Authorization": f"Api-Key {config.YANDEX_API_KEY}"},
        data=audio_bytes,
        timeout=30,
    )
    if r.status_code != 200:
        raise SpeechError(f"SpeechKit ответил ошибкой {r.status_code}: {r.text[:300]}")
    return (r.json().get("result") or "").strip()
