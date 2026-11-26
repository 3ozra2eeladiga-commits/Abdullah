import sys, math, xml.etree.ElementTree as ET
f, LAT, LON, R = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
root = ET.parse(f).getroot()
nodes = {}
for n in root.iter('node'):
    nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')), {t.get('k'): t.get('v') for t in n.findall('tag')})
def xy(la, lo): return ((lo - LON) * 111320 * math.cos(math.radians(LAT)), (la - LAT) * 110540)   # x east, y north, metres
def bearing(x, y):
    a = (math.degrees(math.atan2(x, y)) + 360) % 360
    return ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'][int((a + 22.5) // 45) % 8]
KEYS = ['name', 'amenity', 'shop', 'leisure', 'tourism', 'historic', 'office', 'landuse', 'religion', 'building', 'building:levels', 'addr:street', 'addr:housenumber', 'construction', 'natural', 'man_made']
items = []; streets = {}; btypes = {}; levels = {}
for w in root.iter('way'):
    tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
    pts = [xy(*nodes[nd.get('ref')][:2]) for nd in w.findall('nd') if nd.get('ref') in nodes]
    if not pts: continue
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts); d = math.hypot(cx, cy)
    if 'highway' in tags and tags.get('name'):
        dm = min(math.hypot(*p) for p in pts)
        best = min(pts, key=lambda p: math.hypot(*p))
        if dm < R and (tags['name'] not in streets or dm < streets[tags['name']][0]): streets[tags['name']] = (dm, bearing(*best), tags.get('highway'))
        continue
    if d > R: continue
    if 'building' in tags:
        btypes[tags['building']] = btypes.get(tags['building'], 0) + 1
        if tags.get('building:levels'): levels[tags['building:levels']] = levels.get(tags['building:levels'], 0) + 1
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; size = (max(xs) - min(xs), max(ys) - min(ys))
    interesting = any(k in tags for k in ['name', 'amenity', 'shop', 'leisure', 'tourism', 'historic', 'office', 'religion', 'landuse', 'natural', 'man_made']) or tags.get('building') not in (None, 'yes', 'house', 'residential', 'garage', 'garages', 'shed', 'detached') or max(size) > 35
    if interesting: items.append((d, bearing(cx, cy), size, {k: tags[k] for k in KEYS if k in tags}))
for n, (la, lo, tags) in nodes.items():
    if not tags: continue
    x, y = xy(la, lo); d = math.hypot(x, y)
    if d <= R and any(k in tags for k in ['name', 'amenity', 'shop', 'leisure', 'tourism', 'historic', 'office']): items.append((d, bearing(x, y), None, {k: tags[k] for k in KEYS if k in tags}))
print('STREETS within', R, 'm:'); [print('  %4.0f m %-2s %s (%s)' % (v[0], v[1], k, v[2])) for k, v in sorted(streets.items(), key=lambda kv: kv[1][0])]
print('BUILDING TYPES:', btypes, 'LEVELS:', levels)
print('OBJECTS:')
for d, b, size, t in sorted(items, key=lambda i: i[0]): print('  %4.0f m %-2s %s %s' % (d, b, ('%dx%d' % (size[0], size[1])) if size else 'point', t))
