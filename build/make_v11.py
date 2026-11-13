import os
sp = os.path.dirname(os.path.abspath(__file__))
proto = os.path.dirname(sp).replace('\\', '/') + '/prototype/'   # the repo's prototype folder
s = open(proto + 'calc_prototype_v10.html', encoding='utf-8').read()
new_arm = open(os.path.join(sp, 'arm_v11_new.js'), encoding='utf-8').read()
new_plots = open(os.path.join(sp, 'arm_v11_plots.js'), encoding='utf-8').read()

def sub(a, b):
    global s
    n = s.count(a)
    if n != 1: raise SystemExit(f'{n} matches: {a[:80]!r}')
    s = s.replace(a, b)

# version labels
sub('<title>Calc Workshop — prototype v10</title>', '<title>Calc Workshop — prototype v11</title>')
sub('  Calc Workshop — prototype v10  (', '  Calc Workshop — prototype v11  (')
sub("v10 adds the Arm calculator: Mechanism Startup's motor model with cos-θ gravity and gear-stage inertia)",
    "v10 adds the Arm calculator: Mechanism Startup's motor model with cos-θ gravity and gear-stage inertia;\n"
    "                                 v11 splits Arm into Step 1 (ratio search for holding current) and Step 2 (refine with real stages))")
sub('<small>PROTOTYPE v10</small>', '<small>PROTOTYPE v11</small>')
sub('<footer>Prototype v10 ·', '<footer>Prototype v11 ·')

# replace ARM object head (through renderOut) and armPlots
a0 = s.index('const ARM = {')
a1 = s.index('  validation(){', a0)
s = s[:a0] + new_arm + s[a1:]
p0 = s.index('function armPlots(v, r){')
p1 = s.index('\n}\n', p0) + 3
s = s[:p0] + new_plots + s[p1:]

# validation: add the search checks
sub("""      { name:'Too heavy (20 kg at 1 m, 1 motor, 20:1) → stalls (1 = yes)', expected:1, got:ss.stuck ? 1 : 0, unit:'', tol:0 },
    ];
  },""",
"""      { name:'Too heavy (20 kg at 1 m, 1 motor, 20:1) → stalls (1 = yes)', expected:1, got:ss.stuck ? 1 : 0, unit:'', tol:0 },
      ...this.searchChecks(base),
    ];
  },
  searchChecks(base){
    // Step 1 search: holding current = m·g·L / (k_T·eff·G·n) + I_f, and the pick is the fastest row at or under the target
    const v = { ...base, n:2, eff:90, ilim:60, mload:5, len:600, a0:-45, a1:90, hmax:8, rmin:20, rmax:200, rstep:10, tmax:3, s1a:12, s1b:60 };
    const r = this.compute(v), hold = G0*5*0.6, kT = 7.16*0.9/372.4;
    const meets = r.rows.filter(x => Number.isFinite(x.time) && x.holdI <= 8), i = r.rec ? r.rows.indexOf(r.rec) : -1;
    return [
      { name:'Search: holding current at 100:1 = m·g·L / (k_T·eff·G·n) + I_f', expected:hold/(kT*100)/2 + 2, got:r.rows.find(x => Math.abs(x.G - 100) < 1e-9).holdI, unit:'A', tol:1e-9 },
      { name:'… recommended ratio holds at or under the 8 A target (1 = yes)', expected:1, got:r.rec && r.rec.holdI <= 8 ? 1 : 0, unit:'', tol:0 },
      { name:'… and is the fastest of the rows that do', expected:Math.min(...meets.map(x => x.time)), got:r.rec ? r.rec.time : NaN, unit:'s', tol:0 },
      { name:'… the next ratio down is over the target (1 = yes)', expected:1, got:i > 0 && r.rows[i-1].holdI > 8 ? 1 : 0, unit:'', tol:0 },
    ];
  },""")

# docs
sub("<p>The ratio sweep changes stage 1 only and keeps the other stages, so the shaft inertias stay where you put them. It does not include a counterbalance or braking to a stop at the end angle yet.</p>",
    "<p><b>Step 1</b> searches ratios from “from” to “to” in fixed steps, like the team spreadsheet’s gear ratio planner. For each ratio it works out the holding current at the worst angle (the one closest to horizontal) and simulates the lift with one ideal stage and the motor rotors’ inertia. It recommends the <b>fastest ratio whose holding current is at or under your target</b>: a bigger ratio holds with less current but lifts slower. <b>Step 2</b> uses your real stages and shaft inertias. Neither step includes a counterbalance or braking to a stop at the end angle yet.</p>")
sub("holding  I_hold = T_g,max / (k_T·G·n) + I_f      per motor",
    "holding  I_hold = T_g,max / (k_T·G·n) + I_f      per motor, at the worst angle\nStep 1   pick = the fastest ratio with I_hold ≤ your max holding current")
sub("<p>Checks: the inertia sum by hand;", "<p>Checks: the Step 1 holding current and pick; the inertia sum by hand;")

open(proto + 'calc_prototype_v11.html', 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
