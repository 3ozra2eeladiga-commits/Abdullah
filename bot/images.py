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
    """Фото букета с крупным номером в зелёном кружке с листиком (для альбома в чате: клиент отвечает «2»)."""
    data = jpeg_bytes(url)
    if Image is None:
        return data
    from PIL import ImageDraw
    img = Image.open(io.BytesIO(data)).convert("RGB")
    d = ImageDraw.Draw(img)
    r = max(36, min(img.width, img.height) // 11)
    x = max(12, r // 3)
    y = x + r // 3                                     # чуть ниже — листику есть место сверху
    # Природный вид: зелёный «бутон» с белой окантовкой и листиком сбоку (Абдулла: зелёный, про цветы).
    import math
    cx, cy = x + r, y + r
    leaf = []                                          # листик-«лодочка» с острым кончиком, вправо-вверх
    L, W, ang = r * 1.05, r * 0.34, -0.5
    pts = [(2 * L * u / 30, W * math.sin(math.pi * u / 30) ** 0.8) for u in range(31)]
    for px, py in pts + [(px, -py) for px, py in reversed(pts)]:
        px += r * 0.55                                 # растёт из-за кружка
        leaf.append((cx + px * math.cos(ang) - py * math.sin(ang), cy + px * math.sin(ang) + py * math.cos(ang)))
    d.polygon(leaf, fill=(129, 199, 132), outline=(255, 255, 255))
    vx, vy = cx + (r * 0.55 + 2 * L * 0.85) * math.cos(ang), cy + (r * 0.55 + 2 * L * 0.85) * math.sin(ang)  # прожилка
    d.line([(cx, cy), (vx, vy)], fill=(232, 245, 233), width=max(2, r // 14))
    d.ellipse([x - 4, y - 4, x + 2 * r + 4, y + 2 * r + 4], fill=(255, 255, 255))          # белая окантовка
    d.ellipse([x, y, x + 2 * r, y + 2 * r], fill=(56, 142, 60))                           # листовой зелёный
    d.ellipse([x + r * 0.18, y + r * 0.18, x + 2 * r - r * 0.18, y + 2 * r - r * 0.18],
              outline=(165, 214, 167), width=max(2, r // 16))                              # тонкое светлое кольцо
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
