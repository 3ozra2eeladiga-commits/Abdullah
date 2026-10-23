"""Подключение к ИИ. Какой использовать — задаётся в .env (LLM_PROVIDER).

Все провайдеры принимают одинаковые данные:
    system   — текст инструкции,
    messages — [{"role": "user"|"assistant", "content": "..."}]
и возвращают текст ответа.
"""
import logging
import time
import uuid

import requests

from . import config

log = logging.getLogger(__name__)


def _yandex(system, messages):
    r = requests.post(
        "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
        headers={
            "Authorization": f"Api-Key {config.YANDEX_API_KEY}",
            "x-folder-id": config.YANDEX_FOLDER_ID,
        },
        json={
            "modelUri": f"gpt://{config.YANDEX_FOLDER_ID}/{config.YANDEX_MODEL}",
            "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": "1500"},
            "messages": [{"role": "system", "text": system}]
            + [{"role": m["role"], "text": m["content"]} for m in messages],
        },
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["result"]["alternatives"][0]["message"]["text"]


_giga_token = {"value": "", "expires": 0}


def _gigachat_token():
    if time.time() < _giga_token["expires"] - 60:
        return _giga_token["value"]
    r = requests.post(
        "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
        headers={
            "Authorization": f"Basic {config.GIGACHAT_AUTH_KEY}",
            "RqUID": str(uuid.uuid4()),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"scope": config.GIGACHAT_SCOPE},
        verify=config.GIGACHAT_CA_BUNDLE or True,
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    _giga_token["value"] = data["access_token"]
    _giga_token["expires"] = data["expires_at"] / 1000
    return _giga_token["value"]


def _gigachat(system, messages):
    r = requests.post(
        "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {_gigachat_token()}"},
        json={
            "model": config.GIGACHAT_MODEL,
            "messages": [{"role": "system", "content": system}] + messages,
            "temperature": 0.3,
        },
        verify=config.GIGACHAT_CA_BUNDLE or True,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


_claude_client = None


def _claude(system, messages):
    global _claude_client
    import anthropic

    if _claude_client is None:
        _claude_client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    resp = _claude_client.messages.create(
        model=config.CLAUDE_MODEL,
        max_tokens=4000,
        system=system,
        messages=messages,
        output_config={"effort": "low"},
    )
    if resp.stop_reason == "refusal":
        return ""
    return "".join(b.text for b in resp.content if b.type == "text")


PROVIDERS = {"yandex": _yandex, "gigachat": _gigachat, "claude": _claude}


def complete(system, messages):
    fn = PROVIDERS.get(config.LLM_PROVIDER)
    if fn is None:
        raise ValueError(f"Неизвестный LLM_PROVIDER: {config.LLM_PROVIDER}")
    return fn(system, messages)
