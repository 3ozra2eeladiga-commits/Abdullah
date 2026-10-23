"""Каталог магазина: берётся прямо с сайта и обновляется сам.

У каждого товара короткий код (первые 6 символов его id), чтобы бот мог
сослаться на товар и прислать его фото.
"""
import json
import logging
import re
import threading
import time

import requests

from . import config

log = logging.getLogger(__name__)

# (название раздела, адрес данных на сайте, тип ответа)
RB = "rb"  # букеты/композиции: список с maxPrice
GB = "gb"  # готовые букеты: список с amount/saleAmount
IT = "it"  # товары поштучно: {"cat": [...], "it": [...]} c остатком balancePlus

SOURCES = [
    ("ГОТОВЫЕ букеты — уже собраны (только если букет нужен сегодня или завтра)", "/script/web/gb/gb", GB),
    ("КОЛЛЕКЦИЯ: букеты в тренде", "/script/web/rb/rb-tagsP?tags=pop", RB),
    ("КОЛЛЕКЦИЯ: яркие букеты «дофамины»", "/script/web/rb/rb-tagsP?tags=dofamin", RB),
    ("КОЛЛЕКЦИЯ: композиции в коробках и корзинах", "/script/web/rb/rb-tagsP?tags=comp", RB),
    ("КОЛЛЕКЦИЯ: букеты невесты", "/script/web/rb/rb-tagsP?tags=sv", RB),
    ("Розы и цветы поштучно", "/script/web/it/it?id={c}&catid={c}&path=yes&c=c7f2a256-735b-4612-86f1-cff336e0c118", IT),
    ("К букету: подарки, шары, игрушки", "/script/web/it/it?id={c}&catid={c}&path=yes&c=8c9dd332-96e5-4603-811c-a708e4f14e58", IT),
    ("Растения в горшках", "/script/web/it/it?id={c}&catid={c}&path=yes&c=ed636e4e-6813-47ad-8416-d8d6a5005772", IT),
    ("Для дома: вазы, декор", "/script/web/it/it?id={c}&catid={c}&path=yes&c=e003fd55-4de5-477b-a9d8-7d9e2b35f553", IT),
]


class Catalog:
    def __init__(self):
        self.sections = []  # [(название, [товар, ...])]
        self.by_code = {}
        self.loaded_at = 0
        self._lock = threading.Lock()

    def _fetch(self, path):
        if "{c}" in path:
            path, cat = path.rsplit("&c=", 1)
            path = path.replace("{c}", cat)
        r = requests.get(config.SHOP_SITE + path, timeout=30)
        r.raise_for_status()
        return json.loads(r.content.decode("utf-8-sig"))

    @staticmethod
    def _item(raw, kind):
        if kind == GB:
            price = raw.get("trueSaleAmount") or raw.get("saleAmount") or raw.get("amount")
        else:
            price = raw.get("maxPrice")
        images = [raw.get("logo")] + list(raw.get("images") or [])
        return {
            "code": raw["id"].replace("-", "")[:6],
            "id": raw["id"],
            "title": " ".join((raw.get("title") or "").split()),
            "description": " ".join((raw.get("description") or "").split()),
            "price": int(float(price or 0)),
            "stock": int(raw["balancePlus"]) if raw.get("balancePlus") not in (None, "") else None,
            "images": [i for i in images if i],
        }

    def refresh(self):
        sections, by_code = [], {}
        previous = dict(self.sections)
        for name, path, kind in SOURCES:
            try:
                data = self._fetch(path)
            except Exception as e:
                log.warning("Каталог: не удалось загрузить %s: %s", name, e)
                # Сайт не ответил — оставляем этот раздел из прошлой загрузки
                old = [it for it in previous.get(name, []) if it["code"] not in by_code]
                by_code.update({it["code"]: it for it in old})
                sections.append((name, old))
                continue
            raw_items = data["it"] if kind == IT else data
            items = []
            for raw in raw_items:
                item = self._item(raw, kind)
                if item["code"] in by_code or item["price"] <= 0:
                    continue
                if item["stock"] is not None and item["stock"] <= 0:
                    continue
                by_code[item["code"]] = item
                items.append(item)
            sections.append((name, items))
        if by_code:
            with self._lock:
                self.sections, self.by_code = sections, by_code
                self.loaded_at = time.time()
            log.info("Каталог обновлён: %d товаров", len(by_code))

    def ensure_fresh(self):
        if time.time() - self.loaded_at > config.CATALOG_REFRESH_MINUTES * 60:
            self.refresh()

    def get(self, code):
        return self.by_code.get(code.strip().lower())

    @staticmethod
    def _line(it):
        line = f"[{it['code']}] {it['title']} — {it['price']} ₽"
        if it["stock"] is not None:
            line += f" (в наличии: {it['stock']} шт.)"
        return line

    def as_text(self):
        """Весь каталог: одна строка на товар."""
        lines = []
        with self._lock:
            for name, items in self.sections:
                if items:
                    lines.append(f"\n## {name}")
                    lines += [self._line(it) for it in items]
        return "\n".join(lines).strip()

    def relevant_text(self, query, keep_codes=(), limit=40):
        """Только подходящие под разговор товары — чтобы не отправлять ИИ весь каталог (дорого).

        query — последние сообщения клиента, keep_codes — товары, уже упомянутые в разговоре.
        """
        q = query.lower()
        budget = _budget(q)
        stems = {_stem(w) for w in re.findall(r"[а-яёa-z]+", q) if len(w) >= 3 and w not in STOP_WORDS}
        wanted_sections = {name for name, pattern in SECTION_HINTS if re.search(pattern, q)}

        with self._lock:
            sections = list(self.sections)
        overview, scored = [], []
        for name, items in sections:
            if not items:
                continue
            prices = [it["price"] for it in items]
            overview.append(f"- {name}: {len(items)} шт., от {min(prices)} до {max(prices)} ₽")
            if name in ONLY_IF_ASKED and name not in wanted_sections:
                continue
            for it in items:
                title = it["title"].lower()
                score = sum(1 for s in stems if s in title) * 2
                if name in wanted_sections:
                    score += 1
                if it["code"] in keep_codes:
                    score += 100
                if budget and it["price"] > budget and it["code"] not in keep_codes:
                    continue
                if score:
                    scored.append((score, name, it))

        if len([s for s in scored if s[0] < 100]) < 8:
            # Ничего конкретного не спросили — показываем ходовые букеты
            for name, items in sections:
                if name in DEFAULT_SECTIONS:
                    scored += [(0.5, name, it) for it in items if not budget or it["price"] <= budget]

        # С бюджетом — сначала то, что ближе к бюджету (дороже), а не самое дешёвое
        scored.sort(key=lambda s: (-s[0], -s[2]["price"] if budget else 0))
        picked, seen = {}, set()
        per_section = max(8, limit // 3)  # чтобы один раздел не занял всё место (готовые vs коллекция)
        for score, name, it in scored:
            if it["code"] in seen or len(seen) >= limit:
                continue
            if score < 100 and len(picked.get(name, [])) >= per_section:
                continue
            seen.add(it["code"])
            picked.setdefault(name, []).append(it)

        lines = ["Разделы каталога:", *overview, ""]
        lines.append("Подходящие товары" + (f" (бюджет до {budget} ₽)" if budget else "") + ":")
        for name, items in picked.items():
            lines.append(f"\n## {name}")
            lines += [self._line(it) for it in items]
        return "\n".join(lines)


STOP_WORDS = set("""здравствуйте добрый день вечер утро привет сколько стоит стоят стоимость цена цены есть
хочу хотим хотела хотел нужен нужна нужно можно какие какой какая букет букеты букетик цветы цветов
пожалуйста спасибо подскажите скажите будет есть ваш ваши вас нас мне для или это как что где когда
рублей руб тысяч""".split())

SECTION_HINTS = [
    ("Растения в горшках", r"горш|растен|комнатн|домой растение|фикус|орхиде"),
    ("Для дома: вазы, декор", r"ваз|декор|интерьер|кашпо"),
    ("К букету: подарки, шары, игрушки", r"шар|игрушк|открытк|подар|сладк|конфет"),
    ("КОЛЛЕКЦИЯ: букеты невесты", r"невест|свадьб"),
    ("КОЛЛЕКЦИЯ: композиции в коробках и корзинах", r"композиц|коробк|корзин|сухоцвет"),
    ("Розы и цветы поштучно", r"поштучн|штучн|\d+\s*(роз|шт)|сорт"),
]
# Эти разделы показываем, только если клиент сам о них спросил (иначе на «розы» вылезают букеты невесты и вазы)
ONLY_IF_ASKED = {"КОЛЛЕКЦИЯ: букеты невесты", "Растения в горшках", "Для дома: вазы, декор"}
# Если клиент не назвал ничего конкретного — показываем коллекцию и готовые (ИИ выберет по дате)
DEFAULT_SECTIONS = {"ГОТОВЫЕ букеты — уже собраны (только если букет нужен сегодня или завтра)", "КОЛЛЕКЦИЯ: букеты в тренде", "КОЛЛЕКЦИЯ: яркие букеты «дофамины»"}


def _stem(word):
    """Грубое отсечение окончания: «розы» -> «роз», «шарики» -> «шар», «тюльпаны» -> «тюльп»."""
    return word[:min(6, max(3, len(word) - 3))]


def _budget(q):
    """«до 3000», «3 тыс», «бюджет 5000» -> число рублей."""
    m = re.search(r"(?:до|бюджет|за|около|не дороже)\s*(\d[\d\s]{2,6})", q) or \
        re.search(r"(\d[\d\s]{2,6})\s*(?:₽|р\b|руб)", q)
    if m:
        return int(re.sub(r"\s", "", m.group(1)))
    m = re.search(r"(\d+)\s*(?:тыс|к\b)", q)
    return int(m.group(1)) * 1000 if m else None


catalog = Catalog()
