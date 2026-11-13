"""Build data/wcp_parts.json: WCP's gears, pulleys, sprockets and timing belts, with teeth, pitch, bore and width.

Reads WCP's public product list (wcproducts.com/products.json, a standard Shopify store feed) and works out each
part's details from its product name, which WCP writes in a fixed pattern, e.g.
    15t Steel Spur Gear (20 DP, 16t Center Distance, 1/2" Rounded Hex Bore)
    30t x 9mm Wide Aluminum Pulley (HTD 5mm, 8mm SplineXS Bore)
    36t Aluminum Double Hub Sprocket (#25 Chain, 1/2" Hex Bore)
    44t x 15mm Wide Timing Belt (HTD 5mm)
Also intake wheels (diameter, width, bore, durometer) and PlanetaryX stages (3:1, 4:1, 5:1 gear sets).
Bundles, kits and bevel gears are left out. Chain is sold by length, so it isn't a "part" here.

Run it again each season to refresh the list:
    python tools/wcp_parts.py            # downloads the catalog, writes data/wcp_parts.json
    python tools/wcp_parts.py --from DIR # parse saved products.json pages (p1.json, p2.json, ...) instead
The calculators carry a copy of this list, so after refreshing, rebuild the prototype with the new data.
"""
import argparse, datetime, glob, json, os, re, sys, time, urllib.request
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'wcp_parts.json')
FEED = 'https://wcproducts.com/products.json?limit=250&page={}'
PITCHES = r'(HTD 5mm|HTD 3mm|GT2 3mm|GT3 3mm)'

def fetch():
    products = []
    for page in range(1, 40):
        req = urllib.request.Request(FEED.format(page), headers={'User-Agent': 'Mozilla/5.0 (calc-workshop parts list)'})
        with urllib.request.urlopen(req, timeout=30) as r:
            batch = json.loads(r.read().decode('utf-8'))['products']
        if not batch: break
        products += batch
        time.sleep(1)   # be gentle with their server
    return products

def load(folder):
    products = []
    for f in sorted(glob.glob(os.path.join(folder, 'p*.json')), key=lambda f: int(re.sub(r'\D', '', os.path.basename(f)) or 0)):
        products += json.load(open(f, encoding='utf-8'))['products']
    return products

def bore_of(title):
    """The bore from the last bracket, e.g. '1/2in Hex', '8mm SplineXS', '1/4in Round', 'CIM'."""
    m = re.search(r'\(([^()]*)\)\s*$', title)
    if not m: return None
    for c in (s.strip() for s in m.group(1).split(',')):
        c = c.replace('"', 'in')
        if c.endswith(' Bore'): return c[:-5]
        if c.endswith(' ID'): return c[:-3] + ' Round'
        if c.endswith(' Round'): return c
        if c.endswith(' Motor'): return c[:-6]
        if 'Bearing' in c: return c
    return None

def width_of(title):
    m = re.search(r'x\s*([\d./]+)\s*("|mm)\s*Wide', title)
    return None if not m else m.group(1) + ('in' if m.group(2) == '"' else 'mm')

def wheel_of(title):
    """Intake / roller wheels, e.g. '4" OD x 1" Wide Straight Flex Wheel (1/2" Hex, 45A)'. od in inches."""
    m = re.match(r'^(?:(\d+)T x )?([\d.]+)"\s*OD x ([\d./]+)"\s*(?:Wide|WD) (.*?)\s*Wheel \(([^,()]+)(?:,\s*(\d+)A)?\)\s*$', title)
    if not m: return None
    style = m.group(4).strip() or 'Flex'
    if m.group(1): style = f'{style} {m.group(1)}T'   # WCP's own label (e.g. 6T star)
    w = {'type': 'wheel', 'od': float(m.group(2)), 'width': m.group(3) + 'in', 'style': style,
         'bore': m.group(5).replace(' Bore', '').replace('"', 'in').strip()}
    if m.group(6): w['durometer'] = int(m.group(6))
    return w

def parse(products):
    parts, skipped = [], Counter()
    for p in products:
        t = p['title'].strip(); tl = t.lower()
        if 'bundle' in tl or re.search(r'\bkit\b', tl): skipped['bundle or kit'] += 1; continue
        pl = re.match(r'^(\d+):1 PlanetaryX Gear Set$', t)    # one PlanetaryX stage
        if pl:
            for v in p['variants']:
                if v.get('sku'): parts.append({'type': 'planetary', 'ratio': int(pl.group(1)), 'system': 'PlanetaryX', 'sku': v['sku'].strip(), 'name': t, 'handle': p['handle']})
            continue
        w = wheel_of(t)
        if w:
            for v in p['variants']:
                if v.get('sku'): parts.append(dict(w, sku=v['sku'].strip(), name=t, handle=p['handle']))
            continue
        m = re.match(r'^(\d+)t\b', t)
        if not m: continue
        part = {'teeth': int(m.group(1)), 'name': t, 'handle': p['handle'], 'bore': bore_of(t), 'width': width_of(t)}
        mat = re.search(r'\b(Aluminum|Steel|Plastic|Polycarbonate|Delrin|Nylon)\b', t)
        if mat: part['material'] = mat.group(1)
        if re.search(r'\bspur gear\b', tl):
            dp = re.search(r'(\d+)\s*DP', t)
            if not dp: skipped['gear without DP'] += 1; continue
            part.update(type='gear', pitch=dp.group(1) + ' DP')
            cd = re.search(r'(\d+)t (?:Center Distance|CD)\b', t)   # WCP writes both
            if cd and int(cd.group(1)) != part['teeth']: part['cdTeeth'] = int(cd.group(1))
        elif 'pulley' in tl:
            pr = re.search(PITCHES, t)
            if not pr: skipped['pulley without profile'] += 1; continue
            part.update(type='pulley', pitch=pr.group(1))
        elif 'sprocket' in tl:
            ch = re.search(r'#(25|35)', t)
            if not ch: skipped['sprocket without chain size'] += 1; continue
            part.update(type='sprocket', pitch='#' + ch.group(1))
        elif 'timing belt' in tl:
            pr = re.search(PITCHES, t)
            if not pr: skipped['belt without profile'] += 1; continue
            part.update(type='belt', pitch=pr.group(1), bore=None)
        else:
            skipped['other (bevel gears etc.)'] += 1; continue
        for v in p['variants']:
            if not v.get('sku'): continue
            q = dict(part, sku=v['sku'].strip())
            if v.get('title') and v['title'] != 'Default Title': q['option'] = v['title']
            parts.append({k: q[k] for k in ['sku', 'type', 'teeth', 'pitch', 'bore', 'width', 'material', 'cdTeeth', 'option', 'name', 'handle'] if q.get(k) is not None})
    parts.sort(key=lambda x: (x['type'], x.get('pitch', ''), x.get('teeth', 0), x.get('od', 0), x.get('ratio', 0), x['sku']))
    return parts, skipped

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='src', help='folder of saved products.json pages')
    a = ap.parse_args()
    products = load(a.src) if a.src else fetch()
    parts, skipped = parse(products)
    out = {'vendor': 'WCP', 'source': 'https://wcproducts.com/products.json', 'date': datetime.date.today().isoformat(),
           'products_read': len(products), 'parts': parts}
    json.dump(out, open(OUT, 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
    c = Counter((x['type'], x.get('pitch', '')) for x in parts)
    print(f'{len(parts)} parts from {len(products)} products -> {os.path.relpath(OUT, ROOT)}')
    for k, n in sorted(c.items()): print(f'  {k[0]:9} {k[1]:8} {n}')
    print('  no bore:', [x['sku'] for x in parts if x['type'] not in ('belt', 'planetary') and not x.get('bore')])
    print('  skipped:', dict(skipped))

if __name__ == '__main__':
    main()
