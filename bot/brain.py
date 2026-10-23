"""«Мозг» бота: собирает инструкцию для ИИ, получает ответ и разбирает команды в нём.

ИИ отвечает клиенту обычным текстом и может добавить служебные метки:
    [ФОТО abc123]              — прислать фото товара с этим кодом
    [ЗАКАЗ]{...json...}[/ЗАКАЗ] — заказ готов, отправить сотрудникам
    [ВОПРОС]текст[/ВОПРОС]      — спросить сотрудника, клиент ждёт
    [ОПЕРАТОР]                  — передать разговор живому сотруднику
Клиент эти метки не видит.
"""
import datetime
import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

from . import config, db, llm
from .catalog import catalog

log = logging.getLogger(__name__)

RULES = """Ты — вежливый онлайн-помощник цветочного магазина. Ты переписываешься с клиентами в Директе Инстаграма.
Твоя задача: помочь выбрать букет или цветы, ответить на вопросы и оформить заказ.

КАК ОТВЕЧАТЬ
- Пиши коротко (2–5 предложений), тепло, на «вы», на языке клиента. 1–2 смайлика максимум.
- Предлагай конкретные варианты из каталога ниже: 2–3 штуки, с ценой. Спроси повод и бюджет, если они неизвестны.
- Никогда не придумывай товары, цены, скидки и сроки, которых нет в каталоге или правилах.
- Если просят то, чего нет в каталоге (другой цвет, сорт, особая сборка) — предложи похожее из каталога
  и, если клиент настаивает, спроси сотрудника через метку [ВОПРОС].
- Если спросят, бот ли ты, — честно скажи, что ты онлайн-помощник магазина, и что при желании подключится сотрудник.

ФОТО — ОБЯЗАТЕЛЬНО
- Каждый раз, когда предлагаешь клиенту товары, покажи их фото: в самом конце ответа поставь метки [ФОТО код]
  для каждого предложенного товара (не больше 3). Пример ответа:
  «Посмотрите эти варианты 🌸 25 роз — 2799 ₽, букет из красных розочек — 2699 ₽. Какой нравится?
  [ФОТО 9f1c3b] [ФОТО a3119e]»
- Код — 6 символов в квадратных скобках в начале строки каталога. В тексте коды не пиши, только в метках [ФОТО].

ТОЛЬКО ЗДЕСЬ, БЕЗ САЙТА
- Никогда не отправляй клиента на сайт, не давай ссылок и не говори «посмотрите на сайте».
  Всё показывай сам (фото, цены) и оформляй заказ прямо в этой переписке.
- Если подходящего нет среди товаров ниже — задай уточняющий вопрос или спроси сотрудника через [ВОПРОС].

ОФОРМЛЕНИЕ ЗАКАЗА — узнай по очереди (не всё сразу):
1) что именно и сколько; 2) дата и время; 3) доставка или самовывоз (из какого магазина);
4) адрес доставки; 5) имя и телефон получателя; 6) имя и телефон заказчика; 7) нужна ли открытка и текст.
Когда всё известно — повтори клиенту итог и сумму товаров и спроси «Всё верно?».
После подтверждения клиента напиши, что заказ передан, и сотрудник пришлёт ссылку на оплату и подтвердит стоимость доставки.
В этот же ответ добавь метку:
[ЗАКАЗ]{"товары": [{"код": "...", "название": "...", "кол-во": 1, "цена": 0}], "сумма_товаров": 0,
"дата": "...", "время": "...", "получение": "доставка|самовывоз", "адрес": "...",
"получатель": "имя, телефон", "заказчик": "имя, телефон", "открытка": "...", "комментарий": "..."}[/ЗАКАЗ]

ВОПРОС СОТРУДНИКУ
- Если не знаешь ответа или вопрос из списка «Что бот НЕ решает сам» — напиши клиенту «Уточню у флориста, минутку 🌸»
  и добавь [ВОПРОС]коротко суть вопроса и что хочет клиент[/ВОПРОС].
- Сообщения с пометкой «[Ответ сотрудника магазина]» — это ответ сотрудника. Передай его клиенту своими словами.

ПЕРЕДАТЬ ЧЕЛОВЕКУ
- Если клиент злится, жалуется, просит живого человека — извинись, скажи, что сотрудник скоро напишет,
  и добавь метку [ОПЕРАТОР].
"""

# ИИ пишет метку по-разному: [ФОТО 9f1c3b], [Фото: 9f1c3b], (фото 9f1c3b), [9f1c3b] — понимаем все варианты
PHOTO_RE = re.compile(r"[\[(]\s*(?:фото|photo)?\s*[:#№-]?\s*([0-9a-f]{6})\s*[\])]|(?:фото|photo)\s*[:#№-]?\s*([0-9a-f]{6})\b", re.I)
LINK_RE = re.compile(r"\S*(?:https?://|www\.)\S+|\S*naromashke\.ru\S*", re.I)
ORDER_RE = re.compile(r"\[ЗАКАЗ\](.*?)\[/ЗАКАЗ\]", re.S)
QUESTION_RE = re.compile(r"\[ВОПРОС\](.*?)\[/ВОПРОС\]", re.S)
HANDOFF_RE = re.compile(r"\[ОПЕРАТОР\]")

STAFF_PREFIX = "[Ответ сотрудника магазина]"


@dataclass
class Reply:
    text: str = ""
    photos: list = field(default_factory=list)  # товары каталога
    order: dict | None = None
    order_raw: str = ""
    question: str = ""
    handoff: bool = False


CODE_RE = re.compile(r"\b([0-9a-f]{6})\b")


def system_prompt(history):
    catalog.ensure_fresh()
    shop_info = Path(config.SHOP_INFO_FILE).read_text(encoding="utf-8")
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3)))
    # Подбираем товары по последним сообщениям клиента + те, что уже обсуждали
    query = " ".join([m["content"] for m in history if m["role"] == "user"][-4:])
    discussed = {c for m in history if m["role"] == "assistant" for c in CODE_RE.findall(m["content"])}
    return (
        f"{RULES}\nСейчас: {now:%d.%m.%Y %H:%M} (Москва).\n\n"
        f"# ПРАВИЛА МАГАЗИНА\n{shop_info}\n\n"
        f"# КАТАЛОГ (код — название — цена)\n"
        f"Если подходящего товара нет в списке ниже — спроси клиента подробнее (повод, цветы, бюджет).\n"
        f"{catalog.relevant_text(query, discussed)}"
    )


def _merge_roles(messages):
    """Склеивает подряд идущие сообщения одной роли — так требуют некоторые ИИ."""
    out = []
    for m in messages:
        if out and out[-1]["role"] == m["role"]:
            out[-1] = {"role": m["role"], "content": out[-1]["content"] + "\n\n" + m["content"]}
        else:
            out.append(dict(m))
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


def parse(raw):
    reply = Reply()
    for m in PHOTO_RE.finditer(raw):
        item = catalog.get(m.group(1) or m.group(2))
        if item and item["images"] and item not in reply.photos and len(reply.photos) < 3:
            reply.photos.append(item)
    if not reply.photos:
        # ИИ забыл метки — ищем в тексте названия товаров и показываем их фото
        low = raw.lower()
        for item in catalog.by_code.values():
            title = item["title"].lower()
            if len(title) >= 8 and title in low and item["images"] and len(reply.photos) < 3:
                reply.photos.append(item)
    m = ORDER_RE.search(raw)
    if m:
        reply.order_raw = m.group(1).strip()
        try:
            reply.order = json.loads(reply.order_raw)
        except json.JSONDecodeError:
            log.warning("Не удалось разобрать заказ: %s", reply.order_raw)
    m = QUESTION_RE.search(raw)
    if m:
        reply.question = m.group(1).strip()
    reply.handoff = bool(HANDOFF_RE.search(raw))
    text = ORDER_RE.sub("", raw)
    text = QUESTION_RE.sub("", text)
    text = PHOTO_RE.sub(lambda m: "" if catalog.get(m.group(1) or m.group(2)) else m.group(0), text)
    text = HANDOFF_RE.sub("", text)
    text = LINK_RE.sub("", text)
    # Фразы про сайт убираем: клиент оформляет всё в переписке
    text = re.sub(r"[^.!?\n]*сайт[^.!?\n]*[.!?]?", "", text, flags=re.I)
    text = re.sub(r"[ \t]+([,.!?])", r"\1", text)      # пробел перед знаком препинания
    text = re.sub(r"[,;]\s*$", "", text, flags=re.M)     # висящая запятая в конце строки
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"^[ \t]+", "", text, flags=re.M)
    reply.text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return reply


def respond(client, incoming, from_staff=False):
    """Записывает входящее сообщение, спрашивает ИИ и возвращает разобранный ответ."""
    content = f"{STAFF_PREFIX} {incoming}" if from_staff else incoming
    db.add_message(client, "user", content)
    history = db.history(client)
    raw = llm.complete(system_prompt(history), _merge_roles(history))
    db.add_message(client, "assistant", raw)
    return parse(raw)
