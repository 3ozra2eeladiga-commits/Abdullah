"""Собирает mono.html в один самодостаточный файл: все фото и кадры видео внутри (base64)."""
import base64, os, re, sys, urllib.request, json

src_dir = sys.argv[1]
out = sys.argv[2]
html = open(os.path.join(src_dir, 'mono.html'), encoding='utf-8').read()
cache = {}

def data_uri(b, mime='image/jpeg'):
    return f'data:{mime};base64,' + base64.b64encode(b).decode()

def fetch(url):
    if url not in cache:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60) as r:
            cache[url] = data_uri(r.read())
    return cache[url]

def local(name):
    with open(os.path.join(src_dir, name), 'rb') as f:
        return data_uri(f.read())

# внешние фото Wix (в т.ч. шаблон для этапов в JS не нужен — есть кадры видео)
html = re.sub(r'https://static\.wixstatic\.com/media/[^"\'\s)]+?/a\.jpg', lambda m: fetch(m.group(0)) if '${' not in m.group(0) else m.group(0), html)
# локальные фото
for name in sorted(os.listdir(src_dir)):
    if name.endswith('.jpg') and f'"{name}"' in html:
        html = html.replace(f'"{name}"', f'"{local(name)}"')

if '"music.mp3"' in html:
    with open(os.path.join(src_dir,'music.mp3'),'rb') as f:
        html = html.replace('"music.mp3"', '"'+data_uri(f.read(),'audio/mpeg')+'"')

def frames(d):
    fs = sorted(os.listdir(os.path.join(src_dir, d)))
    return [local(os.path.join(d, f)) for f in fs]

def b64(name, mime):
    with open(os.path.join(src_dir, name), 'rb') as f:
        return data_uri(f.read(), mime)
vids = {'v': b64('build-v.mp4', 'video/mp4'), 'h': b64('build-h.mp4', 'video/mp4')}
inject = '<script>window.VIDEOS=' + json.dumps(vids) + '</script>\n'
html = html.replace('<script>\n/* ===== Бетон от прокрутки', inject + '<script>\n/* ===== Бетон от прокрутки', 1)
assert 'window.VIDEOS' in html
# ссылки на соседние страницы в автономном файле не работают — ведём на телефон/почту
html = html.replace('href="alexey.html"', 'href="tel:+79383416141"').replace('href="index.html#contacts"', 'href="https://wa.me/79383416141"')
open(out, 'w', encoding='utf-8').write(html)
print(out, round(os.path.getsize(out) / 1e6, 1), 'MB')
