import re, sys
path = sys.argv[1]
src = open(path, encoding='utf-8').read()   # universal newlines: CRLF becomes LF while editing


def sub1(old, new, count=1):
    global src
    n = src.count(old)
    if n != count: raise SystemExit(f'expected {count} of {old!r}, found {n}')
    src = src.replace(old, new)

# --- motors: drop discontinued VEXpro motors (BAG, Mini CIM) and the Falcon 500 ---
for key in ('falcon', 'falconfoc', 'minicim', 'bag'):
    src, n = re.subn(r"\['" + key + r"','[^\]]*\],[ \t]*", "", src)
    if n != 1: raise SystemExit(f'motor {key}: {n}')
src = re.sub(r"\n[ \t]+\n", "\n", src)   # drop the now-empty lines
sub1("rpm = free speed, ts = stall torque (N·m), if = free current (A), is = stall current (A).\n",
     "rpm = free speed, ts = stall torque (N·m), if = free current (A), is = stall current (A).\n"
     "   Discontinued VEXpro motors (BAG, Mini CIM) and the Falcon 500 are left out.\n")

# --- gear bore types: Falcon spline -> Kraken spline, drop BAG ---
sub1("falcon:{ label:'Falcon Gear', clr:0.293 }", "kraken:{ label:'Kraken Spline', clr:0.293 }")
sub1("  bag:{ label:'BAG Gear', clr:0.157 },", "")
sub1("falcon:'8/10 9/10 10/12 11/12 12 13/14 14'", "kraken:'8/10 9/10 10/12 11/12 12 13/14 14'", 2)  # VEX + WCP (VEX line removed below)
sub1("cim:'12 14 15 16 17 35', falcon:'12 14 16'", "cim:'12 14 15 16 17 35', kraken:'12 14 16'")
sub1("m775:'6/8 8/10', m550:'6/8 8/10', bag:'6/8 8/10', splinexl:", "m775:'6/8 8/10', m550:'6/8 8/10', splinexl:")

# --- gear catalogs: VEX is out of FRC ---
start = src.index("  vex:{ label:'VEX', hex12:evens(18,84)")
end = src.index("  wcp:{ label:'WCP'")
src = src[:start] + src[end:]
sub1("// 20 DP gear catalogs from ambcalc.com (ref/gears-*.json).", "// 20 DP gear catalogs from ambcalc.com (ref/gears-*.json), minus VEX (discontinued in FRC).")
sub1("you can build from VEX, WCP, REV and AndyMark 20 DP gears", "you can build from WCP, REV and AndyMark 20 DP gears")
sub1("    {key:'vex', label:'VEX', type:'check', def:true}, {key:'wcp', label:'WCP', type:'check', def:true},",
     "    {key:'wcp', label:'WCP', type:'check', def:true},")
sub1("if (!['vex','wcp','rev','am'].some(k => v[k]))", "if (!['wcp','rev','am'].some(k => v[k]))")
sub1("{key:'type1', label:'Bore', type:'select', def:'falcon',", "{key:'type1', label:'Bore', type:'select', def:'kraken',")
sub1("const one = this.compute({ ratio:2, dev:0, stages:'1', vex:true, wcp:false,", "const one = this.compute({ ratio:2, dev:0, stages:'1', wcp:true,")
sub1("{ name:'VEX ½\" hex, exactly 2:1 in one stage: 18:36 … 42:84 = 13 pairs', expected:13,",
     "{ name:'WCP ½\" hex, exactly 2:1 in one stage: 16:32 … 42:84 = 14 pairs', expected:14,")
sub1("{ name:'Smallest one is 18:36 → C-C = (18+36)/40 in', expected:54/40*25.4,",
     "{ name:'Smallest one is 16:32 → C-C = (16+32)/40 in', expected:48/40*25.4,")

# --- planetaries ---
sub1("  versaplanetary:{ label:'VEX VersaPlanetary', stages:[3,4,5,7,9,10] },\n", "")

# --- menu: Power Transmission first, starting Motor Curves, Mechanism Ratio, Drivetrain ---
sub1("const CALCS = [SHOT, PROJ, GEAR, BELT, GBOX, SWAP, PLANET, MCURVE, MECH, STARTUP, DRIVE, SCREW, BEAM, CANT, TWIST, BUCKLE, BEND];",
     "const CALCS = [MCURVE, MECH, DRIVE, STARTUP, GEAR, BELT, GBOX, SWAP, PLANET, SHOT, PROJ, SCREW, BEAM, CANT, TWIST, BUCKLE, BEND];")

# --- version labels ---
sub1("<title>Calc Workshop — prototype v5</title>", "<title>Calc Workshop — prototype v6</title>")
sub1("  Calc Workshop — prototype v5  (", "  Calc Workshop — prototype v6  (")
sub1("                                 v5 regroups the menu and splits Beam Bending into a Beams & Columns group with Column Buckling)",
     "                                 v5 regroups the menu and splits Beam Bending into a Beams & Columns group with Column Buckling;\n"
     "                                 v6 puts Power Transmission first and removes discontinued VEXpro parts and the Falcon 500)")
sub1("<small>PROTOTYPE v5</small>", "<small>PROTOTYPE v6</small>")
sub1("<footer>Prototype v5 ·", "<footer>Prototype v6 ·")
open(path, 'w', encoding='utf-8', newline='\n').write(src)
print('ok')
