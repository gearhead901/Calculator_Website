import os, json
sp = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(sp).replace('\\', '/') + '/'      # the repo folder (build/ is inside it)
proto = root + 'prototype/'
s = open(proto + 'calc_prototype_v17.html', encoding='utf-8').read()
rf = open(os.path.join(sp, 'rfind_v18.js'), encoding='utf-8').read()
data = json.load(open(root + 'data/wcp_parts.json', encoding='utf-8'))
KEYS = ['sku', 'type', 'teeth', 'pitch', 'bore', 'width', 'material', 'cdTeeth', 'od', 'style', 'durometer', 'ratio', 'system', 'name', 'handle']
parts = [{k: p[k] for k in KEYS if k in p} for p in data['parts']]
def sub(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: raise SystemExit(f'{c} matches (want {n}): {a[:90]!r}')
    s = s.replace(a, b)
sub('<title>Calc Workshop — prototype v17</title>', '<title>Calc Workshop — prototype v18</title>')
sub('  Calc Workshop — prototype v17  (', '  Calc Workshop — prototype v18  (')
sub("v17 adds the Intake calculator, and WCP wheels to the parts list)",
    "v17 adds the Intake calculator, and WCP wheels to the parts list;\n"
    "                                 v18 adds the Ratio Finder: 1–3 stages of WCP gears, belts, chain and PlanetaryX)")
sub('<small>PROTOTYPE v17</small>', '<small>PROTOTYPE v18</small>')
sub('<footer>Prototype v17 ·', '<footer>Prototype v18 ·')
a = s.index('const WCP_PARTS = [\n'); b = s.index('\n];\n', a) + 4
s = s[:a] + 'const WCP_PARTS = [\n' + ',\n'.join(json.dumps(p, ensure_ascii=False, separators=(',', ':')) for p in parts) + '\n];\n' + s[b:]
sub("   Wheels (type 'wheel') have od (inches), style and durometer instead of teeth and pitch.",
    "   Wheels (type 'wheel') have od (inches), style and durometer instead of teeth and pitch.\n"
    "   PlanetaryX stages (type 'planetary') have ratio (3, 4 or 5) and system.")
sub("  const bad = WCP_PARTS.filter(p => p.type === 'wheel' ?",
    "  const bad = WCP_PARTS.filter(p => p.type === 'planetary' ? !p.name.startsWith(p.ratio + ':1') : p.type === 'wheel' ?")
sub('  #toast{', '''  .chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;white-space:nowrap;background:#33405a;color:#e6eaf0}
  .chip.gear{background:#27497e} .chip.belt{background:#1f5e4a} .chip.chain{background:#6b4a1c} .chip.planetary{background:#4f3a7a}
  .stagelist{margin:4px 0 12px;padding-left:18px} .stagelist li{margin:6px 0}
  #toast{''')
sub("const GEAR_POS = ", rf + "const GEAR_POS = ")
sub("const CALCS = [MCURVE, MECH, DRIVE, STARTUP, ARM, GEAR, BELT, GBOX,", "const CALCS = [MCURVE, MECH, DRIVE, STARTUP, ARM, GEAR, BELT, RFIND, GBOX,")
open(proto + 'calc_prototype_v18.html', 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(s), len(parts))

# ---- clearer belt / chain length labels (the belt's own teeth, the chain's links: not pulley or sprocket teeth) ----
s = open(proto + 'calc_prototype_v18.html', encoding='utf-8').read()
sub("    {key:'count', label:'Belt teeth / chain links', kind:'teeth', def:100, showIf:v => v.mode === 'count'},",
    "    {key:'count', label:'Belt length (teeth on the belt) or chain links', kind:'teeth', def:100, showIf:v => v.mode === 'count'},")
sub("        ${tile(g.chain ? 'Chain size' : 'Belt size', `${r.count} ${noun}`, 'primary')}",
    "        ${tile(g.chain ? 'Chain to order' : 'Belt to order', `${r.count} ${g.chain ? 'links' : 'teeth'}<div style=\"font-size:12px;font-weight:400;opacity:.75\">${g.chain ? 'chain links' : 'teeth on the belt'}</div>`, 'primary')}")
sub("<th>${g.chain ? 'Links' : 'Belt teeth'}</th><th>C-C</th>",
    "<th>${g.chain ? 'Chain links' : 'Belt teeth (on the belt)'}</th><th>C-C</th>")
sub("    {key:'clinks', label:'Belt teeth / chain links', kind:'teeth', def:80, showIf:v => v.cur === 'belt'},",
    "    {key:'clinks', label:'Belt length (teeth on the belt) or chain links', kind:'teeth', def:80, showIf:v => v.cur === 'belt'},")
sub("<th>C-C</th><th>Off by</th><th>Belt teeth / links</th></tr>",
    "<th>C-C</th><th>Off by</th><th>Belt teeth (on the belt) / chain links</th></tr>")
open(proto + 'calc_prototype_v18.html', 'w', encoding='utf-8', newline='\n').write(s)
print('labels ok')

# ---- C-C: keep the distances in the nearby-sizes table on one line ----
s = open(proto + 'calc_prototype_v18.html', encoding='utf-8').read()
sub("""            <td class="mono">${fmtK(n.C,'lenS')}</td>${v.mode === 'cc' ? `<td class="mono">${fmtSign(n.C - v.target,'lenS')}</td>` : ''}""",
    """            <td class="mono" style="white-space:nowrap">${fmtK(n.C,'lenS')}</td>${v.mode === 'cc' ? `<td class="mono" style="white-space:nowrap">${fmtSign(n.C - v.target,'lenS')}</td>` : ''}""")
open(proto + 'calc_prototype_v18.html', 'w', encoding='utf-8', newline='\n').write(s)
print('nowrap ok')
