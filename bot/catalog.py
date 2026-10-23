"""Каталог магазина: берётся прямо с сайта и обновляется сам.

У каждого товара короткий код (первые 6 символов его id), чтобы бот мог
сослаться на товар и прислать его фото.
"""
import json
import logging
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
    ("Готовые букеты (уже собраны, в наличии)", "/script/web/gb/gb", GB),
    ("Букеты: в тренде", "/script/web/rb/rb-tagsP?tags=pop", RB),
    ("Букеты: яркие «дофамины»", "/script/web/rb/rb-tagsP?tags=dofamin", RB),
    ("Композиции (в коробках, корзинах)", "/script/web/rb/rb-tagsP?tags=comp", RB),
    ("Букеты невесты", "/script/web/rb/rb-tagsP?tags=sv", RB),
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
        for name, path, kind in SOURCES:
            try:
                data = self._fetch(path)
            except Exception as e:
                log.warning("Каталог: не удалось загрузить %s: %s", name, e)
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

    def as_text(self):
        """Компактный список для ИИ: одна строка на товар."""
        lines = []
        with self._lock:
            for name, items in self.sections:
                if not items:
                    continue
                lines.append(f"\n## {name}")
                for it in items:
                    line = f"[{it['code']}] {it['title']} — {it['price']} ₽"
                    if it["stock"] is not None:
                        line += f" (в наличии: {it['stock']} шт.)"
                    lines.append(line)
        return "\n".join(lines).strip()


catalog = Catalog()
