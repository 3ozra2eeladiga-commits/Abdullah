"""Фото с сайта в формате .webp, а Инстаграм принимает только jpg/png — переводим в jpg."""
import io
import os
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


_FONT = os.path.join(os.path.dirname(__file__), "fonts", "DejaVuSans-Bold.ttf")   # шрифт в репозитории: на сервере
                                                                                  # системного может не быть


def _font(size):
    from PIL import ImageFont
    for f in (_FONT, "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "DejaVuSans-Bold.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)       # Pillow ≥ 10.1
    except TypeError:
        return None


def numbered_jpeg(url, n):
    """Фото букета с крупным номером в розовом кружке (для альбома в чате: клиент отвечает «2»)."""
    data = jpeg_bytes(url)
    if Image is None:
        return data
    from PIL import ImageDraw
    img = Image.open(io.BytesIO(data)).convert("RGB")
    d = ImageDraw.Draw(img)
    r = max(36, min(img.width, img.height) // 11)
    x = y = max(12, r // 3)
    d.ellipse([x - 3, y - 3, x + 2 * r + 3, y + 2 * r + 3], fill=(255, 255, 255))          # белая окантовка
    d.ellipse([x, y, x + 2 * r, y + 2 * r], fill=(233, 30, 99))
    txt = str(n)
    font = _font(int(r * (1.25 if len(txt) == 1 else 1.0)))
    if font is None:
        return data                                    # нечем нарисовать цифру — лучше без кружка, чем пустой
    l, t, rr, b = d.textbbox((0, 0), txt, font=font)
    d.text((x + r - (rr - l) / 2 - l, y + r - (b - t) / 2 - t), txt, font=font, fill=(255, 255, 255))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()


def public_url(item):
    """Ссылка на jpg-версию фото на нашем сервере (её отдаёт app.py)."""
    return f"{config.PUBLIC_BASE_URL}/img/{item['code']}.jpg"
