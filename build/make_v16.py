import os
sp = os.path.dirname(os.path.abspath(__file__))
proto = os.path.dirname(sp).replace('\\', '/') + '/prototype/'   # the repo's prototype folder
s = open(proto + 'calc_prototype_v15.html', encoding='utf-8').read()
fly = open(os.path.join(sp, 'fly_v16.js'), encoding='utf-8').read()
def sub(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: raise SystemExit(f'{c} matches (want {n}): {a[:90]!r}')
    s = s.replace(a, b)
sub('<title>Calc Workshop — prototype v15</title>', '<title>Calc Workshop — prototype v16</title>')
sub('  Calc Workshop — prototype v15  (', '  Calc Workshop — prototype v16  (')
sub("v15 adds WCP part numbers and an order list to Gear Ratio and Chain & Belt C-C (data/wcp_parts.json, made by tools/wcp_parts.py))",
    "v15 adds WCP part numbers and an order list to Gear Ratio and Chain & Belt C-C (data/wcp_parts.json, made by tools/wcp_parts.py);\n"
    "                                 v16 adds the Flywheel calculator: the shot as a planetary gearbox, headroom, spin-up, recovery)")
sub('<small>PROTOTYPE v15</small>', '<small>PROTOTYPE v16</small>')
sub('<footer>Prototype v15 ·', '<footer>Prototype v16 ·')
# the calculator goes after Shot Trajectory's helpers, before Gear Ratio's parts block
sub("/* ---------- 4b½. WCP parts", fly + "/* ---------- 4b½. WCP parts")
sub("const CALCS = [MCURVE, MECH, DRIVE, STARTUP, ARM, GEAR, BELT, GBOX, SWAP, PLANET, SHOT, PROJ,", "const CALCS = [MCURVE, MECH, DRIVE, STARTUP, ARM, GEAR, BELT, GBOX, SWAP, PLANET, SHOT, PROJ, FLY,")
sub("  ['Mechanisms','Elevator'], ['Shooter','Flywheel Energy'],", "  ['Mechanisms','Elevator'],")
# Shot Trajectory → Flywheel
sub("    el.insertAdjacentHTML('beforeend', shotMapHtml(v, r));",
    "    if (r.best) el.insertAdjacentHTML('beforeend', `<div style=\"margin-top:12px\">${gotoBtn('fly', { vreq:+r.best.s.toFixed(4), bmass:v.mass, bdiam:v.diam }, 'Size the flywheel for this shot →')}</div>`);\n"
    "    el.insertAdjacentHTML('beforeend', shotMapHtml(v, r));")
open(proto + 'calc_prototype_v16.html', 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(s))
