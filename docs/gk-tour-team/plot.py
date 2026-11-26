import sys, math, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.iter('node')}
ways = []
for w in root.iter('way'):
    tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
    ways.append((tags, [nodes[nd.get('ref')] for nd in w.findall('nd') if nd.get('ref') in nodes]))
plot = [p for t, p in ways if t.get('addr:housenumber') == '20' and 'Шевченко' in t.get('addr:street', '') and t.get('landuse')][0]
LAT = sum(p[0] for p in plot) / len(plot); LON = sum(p[1] for p in plot) / len(plot)
xy = lambda p: ((p[1] - LON) * 111320 * math.cos(math.radians(LAT)), (p[0] - LAT) * 110540)
print('PLOT centre', round(LAT, 6), round(LON, 6)); print('PLOT outline (x east, y north, m):', [tuple(round(c) for c in xy(p)) for p in plot])
print('STREET SEGMENTS within 120 m (name, from, to, direction deg from north):')
seen = set()
for t, pts in ways:
    if 'highway' not in t: continue
    P = [xy(p) for p in pts]
    for a, b in zip(P, P[1:]):
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        if math.hypot(mx, my) < 130:
            key = (t.get('name', t.get('highway')), round(mx / 10), round(my / 10))
            if key in seen: continue
            seen.add(key); ang = math.degrees(math.atan2(b[0] - a[0], b[1] - a[1])) % 180
            print('  %-26s %s -> %s  dir %3.0f  %s' % (t.get('name', '(' + t.get('highway') + ')'), tuple(round(c) for c in a), tuple(round(c) for c in b), ang, t.get('highway')))
print('BUILDINGS within 130 m (centre x,y; size; tags):')
for t, pts in ways:
    if 'building' not in t and 'amenity' not in t and 'leisure' not in t and t.get('landuse') is None: continue
    P = [xy(p) for p in pts]; cx = sum(p[0] for p in P) / len(P); cy = sum(p[1] for p in P) / len(P)
    if math.hypot(cx, cy) < 130 and pts is not plot:
        xs = [p[0] for p in P]; ys = [p[1] for p in P]
        print('  (%4.0f,%4.0f) %3.0fx%-3.0f %s' % (cx, cy, max(xs) - min(xs), max(ys) - min(ys), {k: v for k, v in t.items() if k in ('name', 'amenity', 'building', 'building:levels', 'addr:street', 'addr:housenumber', 'landuse', 'leisure')}))
