"""Фото с сайта в формате .webp, а Инстаграм принимает только jpg/png — переводим в jpg."""
import io
from functools import lru_cache

import requests

from . import config

try:
    from PIL import Image
except ImportError:  # pillow не установился — фото отдаём как есть (.webp)
    Image = None


@lru_cache(maxsize=200)
def jpeg_bytes(url):
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    if Image is None:
        return r.content
    img = Image.open(io.BytesIO(r.content)).convert("RGB")
    img.thumbnail((1280, 1280))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()


def public_url(item):
    """Ссылка на jpg-версию фото на нашем сервере (её отдаёт app.py)."""
    return f"{config.PUBLIC_BASE_URL}/img/{item['code']}.jpg"
