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


def numbered_jpeg(url, n):
    """Фото букета с крупным номером в кружке (для альбома в чате: клиент отвечает «2»)."""
    data = jpeg_bytes(url)
    if Image is None:
        return data
    from PIL import ImageDraw, ImageFont
    img = Image.open(io.BytesIO(data)).convert("RGB")
    d = ImageDraw.Draw(img)
    r = max(40, img.width // 9)
    x, y = r // 3, r // 3
    d.ellipse([x, y, x + 2 * r, y + 2 * r], fill=(255, 255, 255), outline=(233, 30, 99), width=max(4, r // 8))
    font = None
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "DejaVuSans-Bold.ttf", "arial.ttf"):
        try:
            font = ImageFont.truetype(f, int(r * 1.3))
            break
        except OSError:
            continue
    txt = str(n)
    if font:
        w = d.textlength(txt, font=font)
        d.text((x + r - w / 2, y + r * 0.22), txt, font=font, fill=(233, 30, 99))
    else:
        d.text((x + r * 0.8, y + r * 0.8), txt, fill=(233, 30, 99))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()


def public_url(item):
    """Ссылка на jpg-версию фото на нашем сервере (её отдаёт app.py)."""
    return f"{config.PUBLIC_BASE_URL}/img/{item['code']}.jpg"
