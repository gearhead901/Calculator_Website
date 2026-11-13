import os
sp = os.path.dirname(os.path.abspath(__file__))
proto = os.path.dirname(sp).replace('\\', '/') + '/prototype/'   # the repo's prototype folder
s = open(proto + 'calc_prototype_v12.html', encoding='utf-8').read()
core = open(os.path.join(sp, 'shotmap.js'), encoding='utf-8').read()
ui = open(os.path.join(sp, 'shotmap_ui.js'), encoding='utf-8').read()

def sub(a, b):
    global s
    n = s.count(a)
    if n != 1: raise SystemExit(f'{n} matches: {a[:90]!r}')
    s = s.replace(a, b)

sub('<title>Calc Workshop — prototype v12</title>', '<title>Calc Workshop — prototype v13</title>')
sub('  Calc Workshop — prototype v12  (', '  Calc Workshop — prototype v13  (')
sub("v12 adds Arm Step 3: motion profile, feedforward gains and software handoff)",
    "v12 adds Arm Step 3: motion profile, feedforward gains and software handoff;\n"
    "                                 v13 adds a shot map to Shot Trajectory: robust shots over distance × robot speed, fitted and exported for robot code)")
sub('<small>PROTOTYPE v12</small>', '<small>PROTOTYPE v13</small>')
sub('<footer>Prototype v12 ·', '<footer>Prototype v13 ·')

# robot speed toward/away from the goal adds to the ball's horizontal speed
sub("""    let x = 0, y = p.h0, vx = v*Math.cos(a), vy = v*Math.sin(a), t = 0, apex = y;""",
    """    // p.vr = robot speed straight away from the goal (shot map only); the ball keeps the robot's speed
    let x = 0, y = p.h0, vx = v*Math.cos(a) - (p.vr || 0), vy = v*Math.sin(a), t = 0, apex = y;""")
sub("""    const a = angDeg*Math.PI/180, dt = 0.004;""", """    const a = angDeg*Math.PI/180, dt = p.dt || 0.004;   // p.dt: the shot map uses a longer step""")
sub("""  return function sim(angDeg, v, record){""", """  // xStop (optional): give up once the ball is past this distance, still in the air. It can only land farther.
  return function sim(angDeg, v, record, xStop){""")
sub("""      x = nx; y = ny; vx = nvx; vy = nvy; t += dt;
      if (record) pts.push([x,y]);""", """      if (xStop !== undefined && nx > xStop) return { x:nx, t, apex, pts, hit:false };
      x = nx; y = ny; vx = nvx; vy = nvy; t += dt;
      if (record) pts.push([x,y]);""")
s = s.replace("const SHOT = {\n", core + "const SHOT = {\n", 1) if s.count("const SHOT = {\n") == 1 else s.replace("const SHOT = {\r\n", core + "const SHOT = {\r\n", 1)

# inputs
sub("""    {key:'spin', label:'Backspin', kind:'rpm', def:600, showIf:v=>v.magnus, help:'Ball spin, not flywheel speed. Lift pushes at right angles to the path: flatter shots carry farther, very steep shots can land shorter.'},
  ],""", """    {key:'spin', label:'Backspin', kind:'rpm', def:600, showIf:v=>v.magnus, help:'Ball spin, not flywheel speed. Lift pushes at right angles to the path: flatter shots carry farther, very steep shots can land shorter.'},
    {section:'Shot map (for software)'},
    {key:'dmin', label:'Closest distance', kind:'len', def:1.524, help:'Press “Build shot map” under the results to solve the grid. It takes a second or two, so it doesn’t run while you type.'},
    {key:'dmax', label:'Farthest distance', kind:'len', def:6.096},
    {key:'dstep', label:'Distance step', kind:'len', def:0.762},
    {key:'vrmin', label:'Robot speed from', kind:'speed', def:-1.524, help:'Robot speed straight toward (−) or away from (+) the goal. Sideways speed is not in the map: lead the turret by sideways speed × time of flight.'},
    {key:'vrmax', label:'Robot speed to', kind:'speed', def:1.524, help:'Set both to 0 for a robot that only shoots standing still.'},
    {key:'vrstep', label:'Robot speed step', kind:'speed', def:0.762},
    {key:'order', label:'Polynomial order', type:'select', def:'2', options:[{value:'1', label:'1st (flat plane)'}, {value:'2', label:'2nd (like 4414)'}, {value:'3', label:'3rd'}]},
  ],""")

# compute: use the shared search
c0 = s.index("  compute(v){\n    const p = { ...v };\n    const sim = makeSim(p);") if "  compute(v){\n    const p = { ...v };" in s else s.index("  compute(v){\r\n    const p = { ...v };")
c1 = s.index("    if (best){", c0)
nl = '\r\n' if '\r\n' in s[c0:c1] else '\n'
s = s[:c0] + nl.join([
"  compute(v){",
"    const sim = makeSim({ ...v, vr:0 });",
"    const warnings = [];",
"    if (v.w <= 0) warnings.push('Goal opening must be larger than zero.');",
"    if (v.amax <= v.amin) warnings.push('Max angle must be larger than min angle.');",
"    const { rows, best, near, far } = shotSolve(v, sim);",
""]) + s[c1:]
sub("""    return { rows, best, curves, near, far, warnings };""",
    """    const map = shotMap(v, false);   // only a map already built with the button
    return { rows, best, curves, near, far, warnings, map };""")
sub("""    drawTraj(document.getElementById('cvTraj'), v, r);
    drawRegion(document.getElementById('cvRegion'), v, r);
  },""", """    el.insertAdjacentHTML('beforeend', shotMapHtml(v, r));
    drawTraj(document.getElementById('cvTraj'), v, r);
    drawRegion(document.getElementById('cvRegion'), v, r);
    drawShotMap(v, r);
  },""")
sub("""function drawRegion(cv, v, r){""", ui + """function drawRegion(cv, v, r){""")

# validation
sub("""      ...this.magnusChecks(),
    ];
  },""", """      ...this.magnusChecks(),
      ...this.mapChecks(),
    ];
  },
  mapChecks(){
    const d = { ...defaultsFor(this), drag:true };
    const keep = shotMap.cache;   // don't throw away the map the user built
    const m = shotMap({ ...d, dmin:d.dist - 1, dmax:d.dist + 1, dstep:1, vrmin:-1, vrmax:1, vrstep:1 }, true);
    shotMap.cache = keep;
    const one = this.compute(d).best, p0 = m.pts.find(p => p.vr === 0 && Math.abs(p.d - d.dist) < 1e-9);
    const pm = m.pts.find(p => p.vr === -1 && Math.abs(p.d - d.dist) < 1e-9);
    // A moving robot: shooting at (θ, s) while driving away at vr is the same as a still shot with the ground speed
    const a = 50*Math.PI/180, s = 9, vr = 1.2, gx = s*Math.cos(a) - vr, gy = s*Math.sin(a);
    const moving = makeSim({ ...d, vr })(50, s).x, still = makeSim({ ...d, vr:0 })(Math.atan2(gy, gx)*180/Math.PI, Math.hypot(gx, gy)).x;
    // The fit must give back an exact quadratic
    const T = polyTerms(2), C = [3, -2, 0.5, 0.25, -0.75, 1.5], pts = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++){ const p = { d:1 + i, vr:j - 1 }; p.y = polyEval(C, T, p.d, p.vr); pts.push(p); }
    const fit = polyFit(pts, T, 'y');
    // The exported code must hold the same numbers the page uses
    const ex = shotMapExport(d, m), arr = ex.java.match(/LAUNCH_ANGLE_DEG = \\{([^}]*)\\}/)[1].split(',').map(Number);
    return [
      { name:'Shot map, standing still: same shot as the single-shot search (map uses 16 ms steps)', expected:one.s, got:p0 ? p0.s : NaN, unit:'m/s', tol:1e-3 },
      { name:'… same launch angle', expected:one.a, got:p0 ? p0.a : NaN, unit:'°', tol:0 },
      { name:'Moving robot = still shot at the ball’s ground speed', expected:still, got:moving, unit:'m', tol:1e-6 },
      { name:'Driving toward the goal needs less exit speed (1 = yes)', expected:1, got:pm && p0 && pm.s < p0.s ? 1 : 0, unit:'', tol:0 },
      { name:'Fit recovers an exact quadratic (largest coefficient error)', expected:0, got:Math.max(...fit.map((c, k) => Math.abs(c - C[k]))), unit:'', tol:1e-9 },
      { name:'Exported code holds the page’s coefficients (largest error)', expected:0, got:Math.max(...arr.map((c, k) => Math.abs(c - m.fit.a[k])/Math.max(1, Math.abs(m.fit.a[k])))), unit:'', tol:1e-7 },
    ];
  },""")

# docs
sub("""      <p>Next step from your notes: fit a polynomial to the results so a robot can look shots up live.</p>""",
    """      <p><b>Shot map.</b> Like Team 4414’s shot calculator, it repeats the search over a grid of distances and robot speeds toward or away from the goal, then fits a polynomial to the launch angle, exit speed and time of flight so the robot can work out a shot in microseconds. A moving robot gives the ball its own speed, so the shooter must make up the difference. Sideways speed is left to the turret: lead the aim by sideways speed × time of flight. The map takes a second or two to solve, so it runs only when you press <b>Build shot map</b>; change an input and it asks you to rebuild. The calculator checks that every fitted shot still lands in the goal. Clamp the inputs to the map’s range in code, because polynomials grow quickly outside the points they were fitted to. The 2nd-order fit has 6 terms: 1, d, vr, d², d·vr, vr².</p>
      <div class="eq">ball ground speed:  vx = s·cos θ − v_r      vy = s·sin θ
fit:  θ(d, v_r) = c0 + c1·d + c2·v_r + c3·d² + c4·d·v_r + c5·v_r²     (least squares; same for speed and flight time)</div>""")
sub("""<p>With drag off and the ball released at goal height, the simulator must match the textbook range formula <code>R = v²·sin(2θ)/g</code>. With drag and lift on, it must match the Projectile calculator's simulator for the same ball and shot.</p>""",
    """<p>With drag off and the ball released at goal height, the simulator must match the textbook range formula <code>R = v²·sin(2θ)/g</code>. With drag and lift on, it must match the Projectile calculator's simulator for the same ball and shot. The shot map must match the single-shot search when standing still, a moving shot must match a still shot at the same ground speed, and the fit must give back an exact quadratic.</p>""")

open(proto + 'calc_prototype_v13.html', 'w', encoding='utf-8', newline='\n').write(s.replace('\r\n', '\n'))
print('ok')
