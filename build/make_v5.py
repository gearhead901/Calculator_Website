import re, sys
path, block_path = sys.argv[1], sys.argv[2]
src = open(path, encoding='utf-8', newline='').read()
block = open(block_path, encoding='utf-8').read()

def sub1(old, new, s, count=1):
    n = s.count(old)
    if n != count: raise SystemExit(f'expected {count} of {old!r}, found {n}')
    return s.replace(old, new)

# 1. replace the beam section
start = src.index('/* ---------- 4n. Beam bending & twist ---------- */')
end = src.index('/* ---------- 4o. Lead screw ---------- */')
src = src[:start] + block + src[end:]

# 2. ambcalc cross-check now uses the "ends" option instead of "mode"
src = sub1("beam:c => { const b = { ...defaultsFor(c), mode:'btwn',", "beam:c => { const b = { ...defaultsFor(c), ends:'fixed',", src)

# 3. stress kind for the custom yield-strength field
src, n = re.subn(r"(\n  watt: [^\n]*\n)", r"\1  mpa:   { metric:['MPa',1,1],    imperial:['ksi',6.8947573,2] },\n", src)
if n != 1: raise SystemExit('watt line not found')
src = sub1("<small>PROTOTYPE v4</small>", "<small>PROTOTYPE v5</small>", src)

# 4. move Mechanism Ratio / Startup / Drivetrain to Power Transmission
for cid in ('mech', 'startup', 'drive'):
    src = sub1(f"id:'{cid}', group:'Mechanisms',", f"id:'{cid}', group:'Power Transmission',", src)

# 5. menu order (groups appear in the order of their first calculator) — numbers follow this order
order = ['shot','proj', 'gear','belt','gbox','swap','planet','mcurve','mech','startup','drive',
         'screw', 'beam','cant','twist','buckle', 'bend']
names = {'shot':'SHOT','proj':'PROJ','gear':'GEAR','belt':'BELT','gbox':'GBOX','swap':'SWAP','planet':'PLANET','mcurve':'MCURVE',
         'mech':'MECH','startup':'STARTUP','drive':'DRIVE','screw':'SCREW','beam':'BEAM','cant':'CANT','twist':'TWIST','buckle':'BUCKLE','bend':'BEND'}
src = sub1("const CALCS = [BEND, BEAM, SHOT, PROJ, GEAR, BELT, GBOX, SWAP, PLANET, MCURVE, MECH, STARTUP, SCREW, DRIVE];",
           "// Menu order: groups appear in the order of their first calculator. Page numbers (01, 02 …) follow this list.\n"
           "const CALCS = [" + ", ".join(names[c] for c in order) + "];\n"
           "CALCS.forEach((c, i) => c.num = String(i + 1).padStart(2, '0'));", src)
src, n = re.subn(r", num:'\d\d',", ",", src)
print('removed hard-coded nums:', n)

# 6. open on the first calculator in the menu
src = sub1("CALCS.forEach(c => state.values[c.id] = defaultsFor(c));",
           "state.calc = CALCS[0].id;\nCALCS.forEach(c => state.values[c.id] = defaultsFor(c));", src)

# 7. version labels
src = sub1("<title>Calc Workshop — prototype v4</title>", "<title>Calc Workshop — prototype v5</title>", src)
src = sub1("  Calc Workshop — prototype v4  (v2 Chain & Belt C-C; v3 Mechanism Ratio; v4 adds the rest of the ambcalc.com set)",
           "  Calc Workshop — prototype v5  (v2 Chain & Belt C-C; v3 Mechanism Ratio; v4 the rest of the ambcalc.com set;\n"
           "                                 v5 regroups the menu and splits Beam Bending into a Beams & Columns group with Column Buckling)", src)
src = sub1("<footer>Prototype v4 ·", "<footer>Prototype v5 ·", src)
open(path, 'w', encoding='utf-8', newline='').write(src)
print('ok')
