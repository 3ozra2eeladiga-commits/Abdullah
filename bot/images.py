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


def _badge_color():
    """Цвет таблички с номером — из shop.json (photo_badge.color), чтобы было в стиле магазина."""
    c = (config.SHOP.get("photo_badge") or {}).get("color") or [92, 104, 72]
    return tuple(int(x) for x in c[:3])


def numbered_jpeg(url, n):
    """Фото букета с номером на табличке в стиле вывески магазина (для альбома в чате: клиент отвечает «2»):
    хаки-плашка, тонкая белая рамка внутри, крупная белая цифра."""
    data = jpeg_bytes(url)
    if Image is None:
        return data
    from PIL import ImageDraw
    img = Image.open(io.BytesIO(data)).convert("RGBA")
    s = max(70, min(img.width, img.height) // 6)       # высота таблички
    w = int(s * (1.0 if n < 10 else 1.3))
    x = y = max(14, s // 5)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rad = max(6, s // 7)
    d.rounded_rectangle([x + 3, y + 4, x + w + 3, y + s + 4], radius=rad, fill=(0, 0, 0, 70))      # мягкая тень
    d.rounded_rectangle([x, y, x + w, y + s], radius=rad, fill=_badge_color() + (245,))
    m = max(5, s // 10)
    d.rounded_rectangle([x + m, y + m, x + w - m, y + s - m], radius=max(3, rad - m // 2),
                        outline=(255, 255, 255, 230), width=max(2, s // 32))                     # рамка, как на вывеске
    txt = str(n)
    font = _font(int(s * 0.58))
    if font is None:
        return data                                    # нечем нарисовать цифру — лучше без таблички, чем пустая
    l, t, rr, b = d.textbbox((0, 0), txt, font=font)
    d.text((x + w / 2 - (rr - l) / 2 - l, y + s / 2 - (b - t) / 2 - t), txt, font=font, fill=(255, 255, 255, 255))
    img = Image.alpha_composite(img, layer).convert("RGB")
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()


def public_url(item):
    """Ссылка на jpg-версию фото на нашем сервере (её отдаёт app.py)."""
    return f"{config.PUBLIC_BASE_URL}/img/{item['code']}.jpg"
