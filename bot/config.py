"""Все настройки берутся из файла .env (см. .env.example)."""
import os

from dotenv import load_dotenv

load_dotenv()


def _list(name):
    return [x.strip() for x in os.getenv(name, "").split(",") if x.strip()]


# --- Магазин ---
# У каждого города свой сайт-каталог. Формат: Город=адрес, через запятую.
CITY_SITES = os.getenv("CITY_SITES", "Пятигорск=https://naromashke.ru,Минеральные Воды=https://mw.naromashke.ru")
SHOP_INFO_FILE = os.getenv("SHOP_INFO_FILE", "shop/shop_info.md")
CATALOG_REFRESH_MINUTES = int(os.getenv("CATALOG_REFRESH_MINUTES", "60"))


def cities():
    out = {}
    for part in CITY_SITES.split(","):
        if "=" in part:
            name, url = part.split("=", 1)
            out[name.strip()] = url.strip().rstrip("/")
    return out

# --- "Мозг": yandex | gigachat | claude ---
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "yandex").lower()

YANDEX_API_KEY = os.getenv("YANDEX_API_KEY", "")
YANDEX_FOLDER_ID = os.getenv("YANDEX_FOLDER_ID", "")


def _yandex_model():
    """Модель можно задать файлом shop/ai_model.txt (приоритет), иначе из .env, иначе Pro.

    Файл в репозитории позволяет менять модель через git-пуш, без входа на сервер."""
    try:
        v = open("shop/ai_model.txt", encoding="utf-8").read().strip()
        if v:
            return v
    except OSError:
        pass
    return os.getenv("YANDEX_MODEL") or "yandexgpt/latest"


YANDEX_MODEL = _yandex_model()

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
TELEGRAM_ORDERS_CHAT = os.getenv("TELEGRAM_ORDERS_CHAT", "")

# --- Сервер ---
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")
PORT = int(os.getenv("PORT", "8080"))
DB_PATH = os.getenv("DB_PATH", "flowerbot.db")
HISTORY_LIMIT = int(os.getenv("HISTORY_LIMIT", "20"))
# Если сотрудник сам ответил клиенту в Директе, бот молчит с этим клиентом N часов.
HUMAN_PAUSE_HOURS = float(os.getenv("HUMAN_PAUSE_HOURS", "6"))
