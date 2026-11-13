import os
sp = os.path.dirname(os.path.abspath(__file__))
proto = os.path.dirname(sp).replace('\\', '/') + '/prototype/'   # the repo's prototype folder
s = open(proto + 'calc_prototype_v11.html', encoding='utf-8').read()
step3 = open(os.path.join(sp, 'arm_step3.js'), encoding='utf-8').read()

def sub(a, b):
    global s
    n = s.count(a)
    if n != 1: raise SystemExit(f'{n} matches: {a[:90]!r}')
    s = s.replace(a, b)

sub('<title>Calc Workshop — prototype v11</title>', '<title>Calc Workshop — prototype v12</title>')
sub('  Calc Workshop — prototype v11  (', '  Calc Workshop — prototype v12  (')
sub("v11 splits Arm into Step 1 (ratio search for holding current) and Step 2 (refine with real stages))",
    "v11 splits Arm into Step 1 (ratio search for holding current) and Step 2 (refine with real stages);\n"
    "                                 v12 adds Arm Step 3: motion profile, feedforward gains and software handoff)")
sub('<small>PROTOTYPE v11</small>', '<small>PROTOTYPE v12</small>')
sub('<footer>Prototype v11 ·', '<footer>Prototype v12 ·')

# units for angular speed / acceleration / jerk
sub("  moi:   { metric:['kg·cm²',1e-4,3], imperial:['lb·in²',2.9263965e-4,3] }, // mass moment of inertia (base kg·m²)\n",
    "  moi:   { metric:['kg·cm²',1e-4,3], imperial:['lb·in²',2.9263965e-4,3] }, // mass moment of inertia (base kg·m²)\n"
    "  degps: { metric:['°/s',1,0],    imperial:['°/s',1,0] },\n"
    "  degps2:{ metric:['°/s²',1,0],   imperial:['°/s²',1,0] },\n"
    "  degps3:{ metric:['°/s³',1,0],   imperial:['°/s³',1,0] },\n")

# Step 3 code goes right before the ARM object
sub("// Holding current per motor for a total ratio G (worst angle).", step3 + "// Holding current per motor for a total ratio G (worst angle).")

# inputs
sub("""          help:k === 1 ? 'Everything spinning on the shaft after this stage: driven gear, the next pinion, shaft, hubs, sprockets, even a flywheel. Get it from CAD. The last stage’s shaft is the arm shaft.' : undefined},
      ];
    }),
  ],""",
"""          help:k === 1 ? 'Everything spinning on the shaft after this stage: driven gear, the next pinion, shaft, hubs, sprockets, even a flywheel. Get it from CAD. The last stage’s shaft is the arm shaft.' : undefined},
      ];
    }),
    {section:'Step 3 · Motion profile (with software)'},
    {key:'ptype', label:'Profile', type:'select', def:'mm', options:[{value:'mm', label:'CTRE Motion Magic (S-curve, with jerk)'}, {value:'trap', label:'WPILib TrapezoidProfile (no jerk)'}]},
    {key:'pgoal', label:'How hard to drive it', type:'select', def:'brisk', options:[{value:'gentle', label:'Gentle: 40% of the fastest it can follow'}, {value:'brisk', label:'Brisk: 70%'}, {value:'race', label:'Race: 90%'}, {value:'custom', label:'Custom: type your own'}],
      help:'Settles expectations: a gentle arm is slow and draws little current; a race arm uses nearly all the voltage and current it has.'},
    {key:'pvel', label:'Cruise velocity', kind:'degps', def:180, showIf:v => v.pgoal === 'custom'},
    {key:'pacc', label:'Acceleration', kind:'degps2', def:720, showIf:v => v.pgoal === 'custom'},
    {key:'pjerk', label:'Jerk', kind:'degps3', def:7200, showIf:v => v.pgoal === 'custom' && v.ptype === 'mm', help:'0 = no jerk limit (trapezoid).'},
    {key:'kS', label:'Static friction kS', kind:'volt', def:0, help:'Voltage just to get the arm moving. Measure it on the robot; 0 if unknown.'},
  ],""")

# compute: run Step 3 when Step 2 has stages
sub("""    if (!(v.Jr > 0)) warnings.push('Rotor inertia is 0. At high ratios the motors can be a big share of the inertia; enter it if you know it.');
    return { hold, holdAt, rows, rec, fastest, ref, warnings };""",
"""    if (!(v.Jr > 0)) warnings.push('Rotor inertia is 0. At high ratios the motors can be a big share of the inertia; enter it if you know it.');
    const p3 = ref ? armStep3(v, ref.m, cosMax) : null;
    return { hold, holdAt, rows, rec, fastest, ref, p3, warnings };""")
sub("""    el.innerHTML = html;
    armPlots(v, r);
  },""", """    el.innerHTML = html + armStep3Html(v, r);
    armPlots(v, r); armStep3Plots(v, r);
  },""")
sub("""  lede:'Size an arm in two steps. Step 1: enter the motor and the arm, and search ratios for the fastest one that holds the arm within your current target. Step 2: enter your real gear stages and their inertias, and refine.',""",
    """  lede:'Size an arm in three steps. Step 1: search ratios for the fastest one that holds the arm within your current target. Step 2: enter your real gear stages and their inertias. Step 3: pick a motion profile with software, and get the feedforward gains, profile limits and a simulation setup.',""")

# validation
sub("""      ...this.searchChecks(base),
    ];""", """      ...this.searchChecks(base),
      ...this.profileChecks(base),
    ];""")
sub("""  searchChecks(base){""", """  profileChecks(base){
    // Step 3: the profile timing and the feedforward gains against hand formulas
    const v = { ...base, n:2, eff:90, ilim:60, mload:5, len:600, a0:-45, a1:90, s1a:1, s1b:60, kS:0, volt:12 };
    const m = armModel(v), ff = armFF(v, m), D = 135*Math.PI/180;
    const tr = armProfile(v, m, ff, 2, 8, 0), sc = armProfile(v, m, ff, 2, 8, 80);
    const race = armStep3({ ...v, ptype:'mm', pgoal:'race' }, m, 1);
    const wf = 6065*Math.PI/30;
    return [
      { name:'Trapezoid move time = D/v + v/a', expected:D/2 + 2/8, got:tr.time, unit:'s', tol:1.5e-3 },
      { name:'… S-curve (jerk) adds a/j', expected:D/2 + 2/8 + 8/80, got:sc.time, unit:'s', tol:1.5e-3 },
      { name:'… and ends on the end angle', expected:90, got:sc.X[sc.X.length-1]*180/Math.PI, unit:'°', tol:0.01 },
      { name:'kG = 12 V · T_g / (n · T_stall · eff · G)', expected:12*m.Cg/(2*7.16*0.9*60), got:ff.kG, unit:'V', tol:1e-9 },
      { name:'kV = 12 V / arm free speed', expected:12/(wf/60), got:ff.kV, unit:'V·s/rad', tol:1e-9 },
      { name:'Feedforward voltage = R·(i − I_f) + back-EMF at every step', expected:0,
        got:Math.max(...sc.V.map((x, i) => Math.abs(x - (12/(2*372.4)*(sc.I[i]*2 - 4) + 12/wf*60*sc.W[i])))), unit:'V', tol:1e-9 },
      { name:'Race profile stays within 12 V and the 60 A limit (1 = yes)', expected:1, got:race.pr && race.pr.peakV <= 12.0001 && race.pr.peakI <= 60.0001 ? 1 : 0, unit:'', tol:0 },
    ];
  },
  searchChecks(base){""")

# docs
sub("""<p><b>Step 1</b> searches ratios""", """<div class="eq">Step 3 feedforward (WPILib ArmFeedforward form):
  V  = kS·sign(ω) + kG·cos θ + kV·ω + kA·α
  kG = R·T_g / (k_T·G)      kV = G·k_B      kA = R·J / (k_T·G)      (R, k_T for all motors together)
fastest profile:  cruise ω ≤ (V − kS − kG·cos θ_worst) / kV
                  accel  α ≤ the current limit, and the voltage left at cruise speed</div>
      <p><b>Step 3</b> builds the profile (trapezoid, or an S-curve with a jerk limit) every 1 ms and works out the voltage and current the feedforward needs at each instant, assuming the arm follows the profile exactly. It also finds the fastest profile the gearbox can follow even at the worst angle for gravity, and scales it for Gentle, Brisk and Race. The handoff values are in Phoenix 6 mechanism rotations (set SensorToMechanismRatio to the gear ratio, and zero the arm at horizontal for Arm_Cosine) and in WPILib radians.</p>
      <p><b>Step 1</b> searches ratios""")
open(proto + 'calc_prototype_v12.html', 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
