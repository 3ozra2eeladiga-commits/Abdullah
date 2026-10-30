"""Подключение к ИИ. Какой использовать — задаётся в .env (LLM_PROVIDER).

Все провайдеры принимают одинаковые данные:
    system   — текст инструкции,
    messages — [{"role": "user"|"assistant", "content": "..."}]
и возвращают текст ответа.
"""
import base64
import logging
import re
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
    if r.status_code != 200:
        raise RuntimeError(f"YandexGPT ответил ошибкой {r.status_code}: {r.text[:500]}")
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

# Шаблонные «отказы» ИИ (чаще всего ложное срабатывание фильтра YandexGPT на безобидную просьбу).
REFUSAL_RE = re.compile(
    r"не могу обсуждать эту тему|не могу обсуждать данную тему|не могу ответить на (?:этот|ваш) вопрос|"
    r"давайте (?:сменим тему|поговорим о ч[её]м-?нибудь|обсудим что-?нибудь)|не могу помочь с (?:этим|этой)|"
    r"эта тема выходит за рамки|не хоч[уе]тся (?:говорить|обсуждать)|не могу поддержать (?:эту|этот)|"
    r"как языковая модель|\bя (?:всего лишь )?(?:бот|ии|искусственный интеллект)\b",
    re.I,
)


def is_refusal(text):
    return bool(text) and bool(REFUSAL_RE.search(text))


def complete(system, messages, attempts=3):
    """Спрашивает ИИ. При временной ошибке (сеть, 429, 5xx, пустой ответ или шаблонный отказ) повторяет
    попытку, чтобы разговор с клиентом не прерывался из-за случайного сбоя или ложного фильтра."""
    fn = PROVIDERS.get(config.LLM_PROVIDER)
    if fn is None:
        raise ValueError(f"Неизвестный LLM_PROVIDER: {config.LLM_PROVIDER}")
    last_error = None
    last_refusal = ""
    for i in range(attempts):
        try:
            text = fn(system, messages)
            if text and text.strip():
                if not is_refusal(text):
                    return text
                last_refusal = text  # отказ фильтра — пробуем ещё раз
                last_error = RuntimeError("ИИ отказался отвечать (фильтр)")
            else:
                last_error = RuntimeError("пустой ответ ИИ")
        except Exception as e:
            last_error = e
            log.warning("ИИ не ответил (попытка %d/%d): %s", i + 1, attempts, e)
        time.sleep(1.5 * (i + 1))  # 1.5с, 3с — короткая пауза перед повтором
    if last_refusal:
        return last_refusal  # все попытки — отказ; brain заменит его на мягкий переспрос
    raise last_error


IMAGE_KINDS = ("букет", "открытка", "цветы", "другое")

# Последний результат распознавания (фото, голосовые) — показываем на странице статуса, чтобы видеть причину сбоя.
DIAG = {}


def note_diag(kind, ok, detail=""):
    detail = re.sub(r"b1g\w+|aje\w+", "…", str(detail))[:400]      # id папки/ключа не светим
    DIAG[kind] = f"{time.strftime('%d.%m %H:%M')} — " + ("работает" if ok else f"ОШИБКА: {detail}")


def classify_image(data):
    """Что на фото клиента: «букет», «открытка», «цветы» (поштучно/в горшке) или «другое» (селфи, еда, документы…).
    Визуальная модель Yandex AI Studio (OpenAI-совместимый API). Ошибка/нет ключа — None (бот работает как раньше)."""
    if not data or not config.YANDEX_API_KEY or not config.YANDEX_FOLDER_ID:
        return None
    try:
        r = requests.post(
            "https://llm.api.cloud.yandex.net/v1/chat/completions",
            headers={"Authorization": f"Api-Key {config.YANDEX_API_KEY}", "x-folder-id": config.YANDEX_FOLDER_ID},
            json={
                "model": f"gpt://{config.YANDEX_FOLDER_ID}/{config.VISION_MODEL}",
                "temperature": 0,
                "max_tokens": 10,
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": "Что на фото? Ответь ОДНИМ словом: букет, открытка, цветы или другое "
                                             "(другое — если на фото нет цветов и открыток: человек, еда, вещи, документ)."},
                    {"type": "image_url",
                     "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(data).decode()}},
                ]}],
            },
            timeout=40,
        )
        if r.status_code != 200:
            log.warning("Распознавание фото: ошибка %s %s", r.status_code, r.text[:300])
            note_diag("Фото", False, f"{r.status_code} {r.text[:100]}")
            return None
        ans = (r.json()["choices"][0]["message"]["content"] or "").strip().lower()
        note_diag("Фото", True)
        return next((k for k in IMAGE_KINDS if k[:5] in ans), None)
    except Exception as e:
        log.warning("Распознавание фото не удалось: %s", e)
        note_diag("Фото", False, e)
        return None
