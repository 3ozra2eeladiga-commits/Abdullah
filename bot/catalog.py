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

# Открытки: в каталоге они бывают и «открытка», и «конверт», и «карточка»
CARD_RE = re.compile(r"открытк|конверт|карточк", re.I)
# Кому адресована открытка (по надписи): маме, папе, бабушке.
CARD_RECIPIENTS = [r"\bмам", r"\bпап|отц|отец", r"бабуш|бабул"]
# Повод из текста открытки → какие открытки к нему подходят (по надписи в названии).
# Третье поле True — «праздник»: если он назван, открытка обязана быть про него (папе на день рождения
# не «Люблю тебя, папа», а «С днём рождения»/«Поздравляю»).
CARD_THEMES = [
    (r"рожден|днюх|\bдр\b", r"рожден|поздравля", True),
    (r"юбиле", r"юбиле|поздравля", True),
    (r"свадьб|горько|молодожен|бракосочет", r"горько", True),
    (r"поздрав|праздн", r"поздравля", True),
    (r"\bмам|\bмать", r"\bмам", False),
    (r"\bпап|отц|отец", r"\bпап|отц|отец", False),
    (r"бабуш|бабул", r"бабуш|бабул", False),
    (r"любл|любим", r"любл", False),
    (r"спасиб|благодар", r"спасиб", False),
]

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
    def __init__(self, base_url):
        self.base_url = base_url
        self.sections = []  # [(название, [товар, ...])]
        self.by_code = {}
        self.loaded_at = 0
        self._lock = threading.Lock()

    def _fetch(self, path):
        if "{c}" in path:
            path, cat = path.rsplit("&c=", 1)
            path = path.replace("{c}", cat)
        r = requests.get(self.base_url + path, timeout=30)
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

    def find_by_id(self, item_id):
        """Товар по id из ссылки сайта (bukid). Сначала точное совпадение, иначе по первым 6 символам."""
        item_id = str(item_id).strip().lower().removeprefix("item-")
        code = item_id.replace("-", "")[:6]
        with self._lock:
            for it in self.by_code.values():
                if it["id"].lower() == item_id:
                    return it
            return self.by_code.get(code)

    def section_of(self, code):
        """В каком разделе каталога лежит товар."""
        with self._lock:
            for name, items in self.sections:
                if any(it["code"] == code for it in items):
                    return name
        return None

    def cards(self, limit=6):
        """Открытки из каталога (в названии «открытк»), в наличии и с фото — от дешёвых к дорогим."""
        with self._lock:
            out = [it for it in self.by_code.values()
                   if CARD_RE.search(it["title"]) and it["images"]
                   and (it["stock"] is None or it["stock"] > 0)]
        # Первой — открытка «с полем для записи»: на ней пишут текст клиента.
        return sorted(out, key=lambda x: ("запис" not in x["title"].lower(), x["price"]))[:limit]

    def find_by_flower(self, pattern, limit=5):
        """Товары с этим цветком в названии: (поштучные, букеты). Только в наличии и с фото."""
        pieces, bouquets = [], []
        with self._lock:
            for name, items in self.sections:
                is_piece = name == PIECE_SECTION
                is_bouquet = name not in NON_BOUQUET
                if not (is_piece or is_bouquet):
                    continue
                for it in items:
                    if (it["stock"] is not None and it["stock"] <= 0) or not it["images"]:
                        continue
                    if pattern.search(it["title"].lower()):
                        (pieces if is_piece else bouquets).append(it)
        return pieces[:limit], bouquets[:limit]

    def find_by_number(self, num):
        """Товар по номеру с сайта (№600). Возвращает товар или None."""
        target = str(num).strip().lstrip("№#").strip()
        if not target.isdigit():
            return None
        pat = re.compile(r"№\s*0*" + re.escape(target) + r"\b")
        with self._lock:
            for it in self.by_code.values():
                if pat.search(it["title"]):
                    return it
        return None

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

    def relevant_text(self, query, keep_codes=(), limit=40, bouquets_only=False):
        """Только подходящие под разговор товары — чтобы не отправлять ИИ весь каталог (дорого).

        query — последние сообщения клиента, keep_codes — товары, уже упомянутые в разговоре.
        bouquets_only — только букеты/композиции (без поштучных цветов, открыток, подарков и т.п.).
        """
        q = query.lower()
        budget = _budget(q)
        need_qty = _quantity(q)  # сколько штук просит клиент (для поштучных цветов)
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
            # Нужны только букеты — не подмешиваем поштучные цветы, открытки, подарки, вазы, растения
            if bouquets_only and name in NON_BOUQUET:
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
                # Поштучные цветы: показываем только те, которых в наличии хватает на нужное количество
                if need_qty and it["stock"] is not None and it["stock"] < need_qty and it["code"] not in keep_codes:
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

    def relevant_items(self, query, keep_codes=(), limit=12, bouquets_only=False):
        """Плоский список подходящих товаров (с фото) — чтобы код сам добивал показ до нужного числа фото."""
        text = self.relevant_text(query, keep_codes, limit, bouquets_only=bouquets_only)
        out = []
        for m in re.finditer(r"\[([0-9a-f]{6})\]", text):
            it = self.by_code.get(m.group(1))
            if it and it["images"] and it not in out:
                out.append(it)
        return out


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
# Не букеты: при показе букетных вариантов код их не подмешивает (поштучные цветы, открытки, подарки, вазы, растения)
NON_BOUQUET = {"Розы и цветы поштучно", "К букету: подарки, шары, игрушки",
               "Растения в горшках", "Для дома: вазы, декор"}
# Раздел поштучных цветов (роза по 1 шт и т.п.)
PIECE_SECTION = "Розы и цветы поштучно"
# Если клиент не назвал ничего конкретного — показываем коллекцию и готовые (ИИ выберет по дате)
DEFAULT_SECTIONS = {"ГОТОВЫЕ букеты — уже собраны (только если букет нужен сегодня или завтра)", "КОЛЛЕКЦИЯ: букеты в тренде", "КОЛЛЕКЦИЯ: яркие букеты «дофамины»"}


def _stem(word):
    """Грубое отсечение окончания: «розы» -> «роз», «шарики» -> «шар», «тюльпаны» -> «тюльп»."""
    return word[:min(6, max(3, len(word) - 3))]


def _budget(q):
    """«до 3000», «3 тыс», «бюджет 5000», «недорого/бюджетно» -> число рублей."""
    m = re.search(r"(?:до|бюджет|за|около|не дороже)\s*(\d[\d\s]{2,6})", q) or \
        re.search(r"(\d[\d\s]{2,6})\s*(?:₽|р\b|руб)", q)
    if m:
        return int(re.sub(r"\s", "", m.group(1)))
    m = re.search(r"(\d+)\s*(?:тыс|к\b)", q)
    if m:
        return int(m.group(1)) * 1000
    # «недорого», «бюджетно», «подешевле», «эконом» — около 3000 ₽
    if re.search(r"недорог|бюджетн|подешевл|эконом|скромн|что подешевле", q):
        return 3000
    return None


def _quantity(q):
    """«15 роз», «букет из 51 розы», «101 шт» -> число штук. Игнорирует цены (₽, руб)."""
    best = None
    for m in re.finditer(r"(\d{1,4})\s*(шт|штук|роз|тюльпан|цвет|гвоздик|хризантем|гербер|пион|ромаш|альстромер|эустом)", q):
        n = int(m.group(1))
        if 1 <= n <= 1001:
            best = max(best or 0, n)
    return best


class Catalogs:
    """Каталоги всех городов. Для каждого города — свой сайт."""

    def __init__(self):
        self.by_city = {name: Catalog(url) for name, url in config.cities().items()}

    @property
    def city_names(self):
        return list(self.by_city)

    def match_city(self, text):
        """Определяет, КАКОЙ МАГАЗИН (каталог) подходит под город из текста.

        Города-магазины, их другие написания (aliases) и соседние посёлки (nearby_match) берутся из shop.json:
        например, Иноземцево → Минводы; Лермонтов, Железноводск → Пятигорск.
        Настоящий город доставки сохраняется отдельно (в заказе).
        """
        t = " " + (text or "").lower()
        conf = {c.get("name"): c for c in config.city_list()}
        # Прямое совпадение с городом-магазином (или его другим написанием)
        for name in self.by_city:
            c = conf.get(name, {})
            if name.lower() in t or any(a.lower() in t for a in c.get("aliases", [])):
                return name
        # Соседние города/посёлки → ближайший магазин
        for name in self.by_city:
            if any(n.lower() in t for n in conf.get(name, {}).get("nearby_match", [])):
                return name
        return None

    def get_city(self, city):
        return self.by_city.get(city)

    def refresh(self):
        for c in self.by_city.values():
            c.refresh()

    def ensure_fresh(self):
        for c in self.by_city.values():
            c.ensure_fresh()

    def get(self, code, city=None):
        if city and city in self.by_city:
            return self.by_city[city].get(code)
        for c in self.by_city.values():  # запасной поиск по всем городам
            it = c.get(code)
            if it:
                return it
        return None

    def find_by_number(self, num, city=None):
        """Товар по номеру с сайта (№600) — сначала в каталоге нужного города."""
        if city and city in self.by_city:
            it = self.by_city[city].find_by_number(num)
            if it:
                return it
        for c in self.by_city.values():
            it = c.find_by_number(num)
            if it:
                return it
        return None

    def cards(self, city=None, limit=6, text=None):
        """Открытки на выбор. Если известен текст открытки (text) — только подходящие по смыслу
        («С днём рождения» → открытки/конверты про день рождения и «Поздравляю») плюс простая с полем для записи.
        Не к месту («Люблю тебя, папа» на день рождения) — не предлагаем."""
        c = self.by_city.get(city) if city else None
        cats = [c] if c else list(self.by_city.values())
        out = []
        for c in cats:
            out += c.cards(1000 if text is not None else limit)
        if text is not None:
            t = text.lower().replace("ё", "е")
            hit = [(title_re, holiday) for text_re, title_re, holiday in CARD_THEMES if re.search(text_re, t)]
            want = [w for w, holiday in hit if holiday] or [w for w, _ in hit]
            # Открытка, адресованная другому человеку («…папа», когда текст маме), — не к месту.
            whom = {r for r in CARD_RECIPIENTS if re.search(r, t)}

            def fits(x):
                title = x["title"].lower().replace("ё", "е")
                if "запис" in title:
                    return True
                if any(re.search(r, title) for r in CARD_RECIPIENTS if r not in whom):
                    return False
                return any(re.search(w, title) for w in want)
            out = [x for x in out if fits(x)]
        seen = set()
        out = [x for x in out if not (x["title"] in seen or seen.add(x["title"]))]
        return sorted(out, key=lambda x: ("запис" not in x["title"].lower(), x["price"]))[:limit]

    def is_addon(self, item, city=None):
        """Дополнение к букету (открытка, шар, игрушка…), а не сам букет — его добавляют к заказу, а не меняют букет."""
        if CARD_RE.search(item["title"]):
            return True
        for c in ([self.by_city[city]] if city in self.by_city else list(self.by_city.values())):
            sec = c.section_of(item["code"])
            if sec:
                return "к букету" in sec.lower()
        return False

    def find_by_flower(self, pattern, city=None, limit=5):
        """(поштучные, букеты) с этим цветком — в каталоге нужного города."""
        c = self.by_city.get(city) if city else None
        if c:
            return c.find_by_flower(pattern, limit)
        pieces, bouquets = [], []
        for c in self.by_city.values():
            p, b = c.find_by_flower(pattern, limit)
            pieces += p
            bouquets += b
        return pieces[:limit], bouquets[:limit]

    def find_by_id(self, item_id, city=None):
        """Товар по id из ссылки сайта (bukid) — сначала в каталоге нужного города."""
        if city and city in self.by_city:
            it = self.by_city[city].find_by_id(item_id)
            if it:
                return it
        for c in self.by_city.values():
            it = c.find_by_id(item_id)
            if it:
                return it
        return None

    @property
    def total_items(self):
        return sum(len(c.by_code) for c in self.by_city.values())


catalog = Catalogs()
