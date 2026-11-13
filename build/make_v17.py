import os, json
sp = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(sp).replace('\\', '/') + '/'      # the repo folder (build/ is inside it)
proto = root + 'prototype/'
s = open(proto + 'calc_prototype_v16.html', encoding='utf-8').read()
intake = open(os.path.join(sp, 'intake_v17.js'), encoding='utf-8').read()
data = json.load(open(root + 'data/wcp_parts.json', encoding='utf-8'))
KEYS = ['sku', 'type', 'teeth', 'pitch', 'bore', 'width', 'material', 'cdTeeth', 'od', 'style', 'durometer', 'name', 'handle']
parts = [{k: p[k] for k in KEYS if k in p} for p in data['parts']]

def sub(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: raise SystemExit(f'{c} matches (want {n}): {a[:90]!r}')
    s = s.replace(a, b)

sub('<title>Calc Workshop — prototype v16</title>', '<title>Calc Workshop — prototype v17</title>')
sub('  Calc Workshop — prototype v16  (', '  Calc Workshop — prototype v17  (')
sub("v16 adds the Flywheel calculator: the shot as a planetary gearbox, headroom, spin-up, recovery)",
    "v16 adds the Flywheel calculator: the shot as a planetary gearbox, headroom, spin-up, recovery;\n"
    "                                 v17 adds the Intake calculator, and WCP wheels to the parts list)")
sub('<small>PROTOTYPE v16</small>', '<small>PROTOTYPE v17</small>')
sub('<footer>Prototype v16 ·', '<footer>Prototype v17 ·')

# the parts list, now with wheels
a = s.index('const WCP_PARTS = [\n'); b = s.index('\n];\n', a) + 4
s = s[:a] + 'const WCP_PARTS = [\n' + ',\n'.join(json.dumps(p, ensure_ascii=False, separators=(',', ':')) for p in parts) + '\n];\n' + s[b:]
sub("const WCP_DATE = '2026-11-12';", f"const WCP_DATE = '{data['date']}';")
sub("   '#25'...), bore, width, material, cdTeeth (a gear that meshes at a different tooth count's spacing), name, handle.",
    "   '#25'...), bore, width, material, cdTeeth (a gear that meshes at a different tooth count's spacing), name, handle.\n"
    "   Wheels (type 'wheel') have od (inches), style and durometer instead of teeth and pitch.")
# the parts-list check: gears, pulleys, sprockets and belts by teeth and pitch; wheels by diameter
sub("  const bad = WCP_PARTS.filter(p => !p.name.startsWith(p.teeth + 't') ||",
    "  const bad = WCP_PARTS.filter(p => p.type === 'wheel' ? !p.name.startsWith(p.od + '\"') && !p.name.includes(' x ' + p.od + '\"') : !p.name.startsWith(p.teeth + 't') ||")
sub("every part’s tooth count and pitch are in its name", "every part’s tooth count and pitch (wheels: diameter) are in its name")

# Intake goes after the parts block, before Gear Ratio
sub("const GEAR_POS = ", intake + "const GEAR_POS = ")
sub(" PROJ, FLY, SCREW,", " PROJ, FLY, SCREW, INTAKE,")
open(proto + 'calc_prototype_v17.html', 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(s), len(parts))
