"""Все настройки берутся из файла .env (см. .env.example)."""
import json
import os

from dotenv import load_dotenv

load_dotenv()


def _list(name):
    return [x.strip() for x in os.getenv(name, "").split(",") if x.strip()]


# --- Магазин ---
# Всё, что относится к конкретному магазину, лежит в одной папке (по умолчанию shop/):
#   shop.json     — города, сайты, соседние посёлки, правила доставки, имя флориста;
#   shop_info.md  — адреса, часы, правила обычным текстом (бот читает как «правила магазина»);
#   ai_model.txt  — какая модель ИИ.
# Для другого магазина — своя папка и SHOP_DIR=... в .env. Код при этом не меняется.
SHOP_DIR = os.getenv("SHOP_DIR", "shop")


def _load_shop():
    try:
        with open(os.path.join(SHOP_DIR, "shop.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


SHOP = _load_shop()
SHOP_NAME = SHOP.get("shop_name", "")
FLORIST_NAME = SHOP.get("florist_name", "")
REGION = SHOP.get("region", "")
FREE_DELIVERY_FROM = int((SHOP.get("delivery") or {}).get("free_from", 1500))
DELIVERY_PRICE = int((SHOP.get("delivery") or {}).get("price", 250))
DELIVERY_BY_FLORIST = bool((SHOP.get("delivery") or {}).get("price_by_florist"))
WINDOW_HOURS = int((SHOP.get("delivery") or {}).get("window_hours", 1))
HOLIDAY_WINDOW_HOURS = int((SHOP.get("delivery") or {}).get("holiday_window_hours", 2))
HOLIDAYS = list((SHOP.get("delivery") or {}).get("holidays") or [])
SHOP_INFO_FILE = os.getenv("SHOP_INFO_FILE", os.path.join(SHOP_DIR, "shop_info.md"))
CATALOG_REFRESH_MINUTES = int(os.getenv("CATALOG_REFRESH_MINUTES", "60"))


def cards_city():
    """Город, с сайта которого берём открытки для всех городов (shop.json → cards_city), иначе — первый город."""
    return SHOP.get("cards_city") or ((SHOP.get("cities") or [{}])[0].get("name"))


def city_list():
    """Города магазина (из shop.json): [{name, site, aliases, nearby, nearby_match}, ...]."""
    return SHOP.get("cities") or []


def cities():
    """{город: адрес сайта-каталога}. CITY_SITES в .env (Город=адрес,...) — если задан, важнее shop.json."""
    env = os.getenv("CITY_SITES", "")
    if env:
        out = {}
        for part in env.split(","):
            if "=" in part:
                name, url = part.split("=", 1)
                out[name.strip()] = url.strip().rstrip("/")
        return out
    return {c["name"]: c.get("site", "").rstrip("/") for c in city_list() if c.get("name")}


# --- "Мозг": yandex | gigachat | claude ---
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "yandex").lower()

YANDEX_API_KEY = os.getenv("YANDEX_API_KEY", "")
YANDEX_FOLDER_ID = os.getenv("YANDEX_FOLDER_ID", "")


def _yandex_model():
    """Модель можно задать файлом <папка магазина>/ai_model.txt (приоритет), иначе из .env, иначе Pro.

    Файл в репозитории позволяет менять модель через git-пуш, без входа на сервер."""
    try:
        v = open(os.path.join(SHOP_DIR, "ai_model.txt"), encoding="utf-8").read().strip()
        if v:
            return v
    except OSError:
        pass
    return os.getenv("YANDEX_MODEL") or "yandexgpt/latest"


YANDEX_MODEL = _yandex_model()
# Визуальная модель для распознавания фото клиента (букет / открытка / не цветы). Пусто — не распознаём.
VISION_MODEL = os.getenv("VISION_MODEL", "gemma-3-27b-it/latest")

GIGACHAT_AUTH_KEY = os.getenv("GIGACHAT_AUTH_KEY", "")
GIGACHAT_SCOPE = os.getenv("GIGACHAT_SCOPE", "GIGACHAT_API_PERS")
GIGACHAT_MODEL = os.getenv("GIGACHAT_MODEL", "GigaChat-2-Pro")
GIGACHAT_CA_BUNDLE = os.getenv("GIGACHAT_CA_BUNDLE", "")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-5-5")

# --- Instagram ---
IG_ACCESS_TOKEN = os.getenv("IG_ACCESS_TOKEN", "")
IG_APP_SECRET = os.getenv("IG_APP_SECRET", "")
IG_VERIFY_TOKEN = os.getenv("IG_VERIFY_TOKEN", "")
IG_API_VERSION = os.getenv("IG_API_VERSION", "v21.0")

# --- Telegram (только для сотрудников) ---
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")
# Только числа; если туда по ошибке попал токен или текст — пропускаем, чтобы бот всё равно запустился
TELEGRAM_STAFF_IDS = [int(x) for x in _list("TELEGRAM_STAFF_IDS") if x.lstrip("-").isdigit()]
if len(TELEGRAM_STAFF_IDS) != len(_list("TELEGRAM_STAFF_IDS")):
    print("ВНИМАНИЕ: в TELEGRAM_STAFF_IDS должны быть только числа (ID из /start). Лишнее пропущено.")
# Куда слать заказы и вопросы: ID группы сотрудников. Если пусто - каждому из STAFF_IDS.


def is_staff(user_id):
    """Сотрудник из .env или временный доступ из temp_staff.json ([{"id": 123, "until": "2026-10-28T09:00+03:00"}]).
    Временный доступ сам заканчивается в указанное время. Заказы/вопросы временным НЕ приходят — только /test."""
    if user_id in TELEGRAM_STAFF_IDS:
        return True
    from datetime import datetime, timezone
    try:
        with open("temp_staff.json", encoding="utf-8") as f:
            for g in json.load(f):
                if int(g["id"]) == user_id and datetime.now(timezone.utc) < datetime.fromisoformat(g["until"]):
                    return True
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return False


TELEGRAM_ORDERS_CHAT = os.getenv("TELEGRAM_ORDERS_CHAT", "")

# --- Сервер ---
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")
PORT = int(os.getenv("PORT", "8080"))
DB_PATH = os.getenv("DB_PATH", "flowerbot.db")
HISTORY_LIMIT = int(os.getenv("HISTORY_LIMIT", "20"))
# Если сотрудник сам ответил клиенту в Директе, бот молчит с этим клиентом N часов.
HUMAN_PAUSE_HOURS = float(os.getenv("HUMAN_PAUSE_HOURS", "6"))

# --- Секретный код: написал боту ровно это (регистр/пробелы/знаки не важны) — бот отвечает секретным текстом.
# Вариант 1 — в .env на сервере: SECRET_CODE и SECRET_REPLY (перенос строки — «\n»).
# Вариант 2 — без доступа к серверу: в <папка магазина>/secret.json лежит ЗАШИФРОВАННЫЙ ответ (репозиторий
# публичный!). Ключ — сам код, его в репозитории нет; расшифровать ответ можно только зная код.
SECRET_CODE = os.getenv("SECRET_CODE", "")
SECRET_REPLY = os.getenv("SECRET_REPLY", "").replace("\\n", "\n")
SECRET_ITER = 300_000                      # медленный ключ — чтобы код было долго подбирать перебором


def _secret_norm(t):
    return "".join(ch for ch in (t or "").lower().replace("ё", "е") if ch.isalnum())


def _secret_keys(code, salt):
    import hashlib
    raw = hashlib.pbkdf2_hmac("sha256", _secret_norm(code).encode(), bytes.fromhex(salt), SECRET_ITER, 64)
    return raw[:32], raw[32:]              # ключ шифра, ключ проверки


def _xor_stream(key, data):
    import hashlib
    out = bytearray()
    for i in range(0, len(data), 32):
        block = hashlib.sha256(key + i.to_bytes(8, "big")).digest()
        out += bytes(a ^ b for a, b in zip(data[i:i + 32], block))
    return bytes(out)


def secret_encrypt(code, reply):
    """Для подготовки secret.json (запускается вручную): возвращает словарь для файла."""
    import hashlib
    salt = os.urandom(16).hex()
    k_enc, k_chk = _secret_keys(code, salt)
    return {"salt": salt, "check": hashlib.sha256(k_chk).hexdigest(),
            "data": _xor_stream(k_enc, reply.encode()).hex()}


def secret_reply_for(text):
    """Ответ на секретный код или None. Быстрый отсев: код длинный и без пробелов-слов не бывает пустым."""
    n = _secret_norm(text)
    if not n or len(n) < 8 or len(n) > 40:
        return None
    if SECRET_CODE and SECRET_REPLY:
        return SECRET_REPLY if n == _secret_norm(SECRET_CODE) else None
    try:
        with open(os.path.join(SHOP_DIR, "secret.json"), encoding="utf-8") as f:
            box = json.load(f)
    except (OSError, ValueError):
        return None
    import hashlib
    k_enc, k_chk = _secret_keys(text, box["salt"])
    if hashlib.sha256(k_chk).hexdigest() != box.get("check"):
        return None
    return _xor_stream(k_enc, bytes.fromhex(box["data"])).decode("utf-8", "replace")


def is_secret_code(text):
    return secret_reply_for(text) is not None
