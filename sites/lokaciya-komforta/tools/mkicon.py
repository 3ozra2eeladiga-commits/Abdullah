"""Логотип-иконка: белая буква A на чёрном. Рисуется геометрически (тонкая, как шрифт сайта; на маленьких размерах — толще)."""
import sys, os
from PIL import Image, ImageDraw
out = sys.argv[1]
os.makedirs(out, exist_ok=True)

def icon(size, weight):
    S = 8
    W = size * S
    BG, FG = (10, 10, 10), (250, 250, 248)
    im = Image.new('RGB', (W, W), BG)
    d = ImageDraw.Draw(im)
    sw = W * weight
    ax, ay, base, half = W * .5, W * .19, W * .8, W * .27   # вершина, низ, полуширина
    # внешний треугольник (белый), внутренний (чёрный) — получаются ноги с острой вершиной
    d.polygon([(ax - half, base), (ax, ay), (ax + half, base)], fill=FG)
    import math
    L = math.hypot(half, base - ay)
    dx = sw / ((base - ay) / L)               # горизонтальный сдвиг = толщина ноги по перпендикуляру
    iy = ay + dx * (base - ay) / half          # вершина внутреннего треугольника
    slope = half / (base - ay)
    ext = W * .3
    d.polygon([(ax - half + dx - slope * ext, base + ext), (ax, iy), (ax + half - dx + slope * ext, base + ext)], fill=BG)
    d.rectangle([0, base, W, W], fill=BG)
    yb = W * .6
    k = (yb - ay) / (base - ay)
    xl = ax - half * k + dx * .5; xr = ax + half * k - dx * .5
    d.rectangle([xl, yb - sw * .38, xr, yb + sw * .38], fill=FG)
    return im.resize((size, size), Image.LANCZOS)

big = {512: .045, 192: .05, 180: .05}
for s, w in big.items():
    name = {512: 'icon-512.png', 192: 'icon-192.png', 180: 'apple-touch-icon.png'}[s]
    icon(s, w).save(os.path.join(out, name), optimize=True)
small = [icon(16, .11), icon(32, .09), icon(48, .075)]
small[1].save(os.path.join(out, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)], append_images=[small[0], small[2]])
icon(32, .09).save(os.path.join(out, 'favicon-32.png'))
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0a0a0a"/><g stroke="#fafaf8" stroke-width="6" stroke-linecap="butt" stroke-linejoin="miter" fill="none"><polyline points="24,80 50,20 76,80"/><line x1="33" y1="60" x2="67" y2="60" stroke-width="5"/></g></svg>'''
open(os.path.join(out, 'favicon.svg'), 'w').write(svg)
print('ok')
