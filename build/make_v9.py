import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()

def sub(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        raise SystemExit(f'expected {count} match(es), found {n}: {old[:70]!r}')
    s = s.replace(old, new)

# ---- header / version ----
sub('<title>Calc Workshop — prototype v8</title>', '<title>Calc Workshop — prototype v9</title>')
sub('  Calc Workshop — prototype v8  (', '  Calc Workshop — prototype v9  (')
sub('v8 adds a max fire rate (ball-to-ball collision limit) to the Projectile calculator)',
    'v8 adds a max fire rate (ball-to-ball collision limit) to the Projectile calculator;\n'
    '                                 v9 adds backspin lift (Magnus) to Shot Trajectory, with its own on/off switch in both shooter calculators)')
sub('<small>PROTOTYPE v8</small>', '<small>PROTOTYPE v9</small>')
sub('<footer>Prototype v8 ·', '<footer>Prototype v9 ·')

# ---- shared lift coefficient + Shot Trajectory simulator ----
sub('''function makeSim(p){
  // k = drag constant: a_drag = −k·|v|·v   (from F = ½·ρ·Cd·A·v²)
  const area = Math.PI * (p.diam/1000/2)**2;
  const k = p.drag ? 0.5*RHO*p.cd*area/p.mass : 0;
  const acc = (vx, vy) => { const s = Math.hypot(vx, vy); return [-k*s*vx, -G - k*s*vy]; };''',
'''// Backspin lift coefficient from the spin ratio S = r·ω / |v| (the fit ambcalc uses). Shared by both shooter calculators.
const magnusCl = S => S < 0.1 ? 1.6*S : 0.6*S + 0.1;
function makeSim(p){
  // kd = drag constant: a_drag = −kd·|v|·v   (from F = ½·ρ·Cd·A·v²)
  // kl·C_L = lift constant: a_lift = kl·C_L·|v|·(−v_y, v_x)   (from F = ½·ρ·C_L·A·v², at right angles to the path)
  const area = Math.PI * (p.diam/1000/2)**2, rho = p.rho || RHO, r = p.diam/2000, w = (p.spin || 0)*Math.PI/30;
  const kd = p.drag ? 0.5*rho*p.cd*area/p.mass : 0;
  const kl = p.magnus && w > 0 ? 0.5*rho*area/p.mass : 0;
  const acc = (vx, vy) => { const s = Math.hypot(vx, vy), kL = kl && s > 0 ? kl*magnusCl(r*w/s) : 0;
    return [-kd*s*vx - kL*s*vy, -G - kd*s*vy + kL*s*vx]; };''')

sub('''    {section:'Air drag'},
    {key:'drag', label:'Include air drag', type:'check', def:false},
    {key:'mass', label:'Ball mass', kind:'mass', def:0.215, showIf:v=>v.drag},
    {key:'diam', label:'Ball diameter', kind:'lenS', def:150, showIf:v=>v.drag},
    {key:'cd', label:'Drag coefficient (Cd)', kind:'none', def:0.47, showIf:v=>v.drag, help:'0.47 is a smooth sphere — a placeholder until you measure your ball.'},''',
'''    {section:'Air drag & spin'},
    {key:'drag', label:'Include air drag', type:'check', def:false},
    {key:'magnus', label:'Include backspin lift (Magnus)', type:'check', def:false},
    {key:'mass', label:'Ball mass', kind:'mass', def:0.215, showIf:v=>v.drag || v.magnus},
    {key:'diam', label:'Ball diameter', kind:'lenS', def:150, showIf:v=>v.drag || v.magnus},
    {key:'cd', label:'Drag coefficient (Cd)', kind:'none', def:0.47, showIf:v=>v.drag, help:'0.47 is a smooth sphere — a placeholder until you measure your ball.'},
    {key:'spin', label:'Backspin', kind:'rpm', def:600, showIf:v=>v.magnus, help:'Ball spin, not flywheel speed. Lift pushes at right angles to the path: flatter shots carry farther, very steep shots can land shorter.'},''')

sub('''      { name:'60°, 10 m/s', expected:100*Math.sin(2*Math.PI/3)/G, got:sim(60,10).x, unit:'m', tol:1e-3 },
    ];
  },''',
'''      { name:'60°, 10 m/s', expected:100*Math.sin(2*Math.PI/3)/G, got:sim(60,10).x, unit:'m', tol:1e-3 },
      ...this.magnusChecks(),
    ];
  },
  magnusChecks(){
    // Same ball and shot through both shooter simulators (same air density): they must agree. Projectile steps
    // every 1 ms with a simpler update and stops at the first step past the goal height, so it lands about 1.5 cm short.
    const ball = { drag:true, magnus:true, cd:0.47, diam:177.8, spin:600 }, h0 = 0.6, H = 2;
    const shot = (o, a, s) => makeSim({ h0, H, mass:0.2268, rho:RHO_AIR, ...ball, ...o })(a, s).x;
    const proj = (o, a, s) => projFly({ mode:'height', bmass:0.2268, ...ball, ...o }, h0, s, a*Math.PI/180, (x,y,vx,vy) => vy <= 0 && y <= H).x;
    const off = shot({ magnus:false }, 50, 9);
    return [
      { name:'Drag + 600 rpm backspin, 50°, 9 m/s: matches the Projectile simulator', expected:proj({}, 50, 9), got:shot({}, 50, 9), unit:'m', tol:0.025 },
      { name:'… lift only (no drag)', expected:proj({ drag:false }, 50, 9), got:shot({ drag:false }, 50, 9), unit:'m', tol:0.025 },
      { name:'Lift on with 0 rpm spin = lift off', expected:off, got:shot({ spin:0 }, 50, 9), unit:'m', tol:1e-9 },
      { name:'Backspin carries the ball farther (1 = yes)', expected:1, got:shot({}, 50, 9) > off ? 1 : 0, unit:'', tol:0 },
    ];
  },''')

sub('''      <div class="eq">gravity:  a = (0, −g)
drag:     a = −k·|v|·v      k = ½·ρ·Cd·A / m
score   = min( speed margin / σ_speed , angle margin / σ_angle )</div>
      <p>Next steps from your notes: add Magnus lift (spin), then fit a polynomial to the results so a robot can look shots up live.</p>''',
'''      <div class="eq">gravity:  a = (0, −g)
drag:     a = −k·|v|·v      k = ½·ρ·Cd·A / m
lift:     a = ½·ρ·C_L·A·|v| / m · (−v_y, v_x)     (at right angles to the path, up for backspin)
          S = r·ω / |v|,   C_L = 1.6·S  if S &lt; 0.1,  else 0.6·S + 0.1
score   = min( speed margin / σ_speed , angle margin / σ_angle )</div>
      <p>Drag and backspin lift each have their own switch, so you can see what each one does. The lift model is the same one the Projectile calculator uses; the C_L fit is for typical sports balls, so treat it as a trend until you measure your game piece.</p>
      <p>Next step from your notes: fit a polynomial to the results so a robot can look shots up live.</p>''')
sub('''      <p>With drag off and the ball released at goal height, the simulator must match the textbook range formula <code>R = v²·sin(2θ)/g</code>.</p>''',
'''      <p>With drag off and the ball released at goal height, the simulator must match the textbook range formula <code>R = v²·sin(2θ)/g</code>. With drag and lift on, it must match the Projectile calculator's simulator for the same ball and shot.</p>''')

# ---- Projectile simulator: separate drag and lift switches ----
sub('''  const dt = 0.001, r = v.diam/2000, m = v.bmass, w = v.spin*Math.PI/30, drag = v.drag && v.mode !== 'launch';''',
'''  const dt = 0.001, r = v.diam/2000, m = v.bmass, w = (v.spin || 0)*Math.PI/30;
  const drag = v.drag && v.mode !== 'launch', lift = v.magnus && v.mode !== 'launch' && w > 0, cd = drag ? v.cd : 0;''')
sub('''    if (drag){
      const sp = Math.hypot(vx, vy), S = r*w/sp, Cl = S < 0.1 ? 1.6*S : 0.6*S + 0.1, k = Math.PI/2*RHO_AIR*r*r*sp/m;   // ½ρA·|v|/m
      ax = -k*(Cl*vy + v.cd*vx); ay = k*(Cl*vx - v.cd*vy) - G0;
    }''',
'''    if (drag || lift){
      const sp = Math.hypot(vx, vy), Cl = lift && sp > 0 ? magnusCl(r*w/sp) : 0, k = Math.PI/2*RHO_AIR*r*r*sp/m;   // ½ρA·|v|/m
      ax = -k*(Cl*vy + cd*vx); ay = k*(Cl*vx - cd*vy) - G0;
    }''')

sub('''    {key:'drag', label:'Include drag & spin', type:'check', def:false, showIf:v => v.mode !== 'launch'},
    {key:'cd', label:'Drag coefficient', kind:'none', def:0.47, showIf:v => v.drag && v.mode !== 'launch', help:'~0.47 for a smooth sphere, higher for foam/dimpled balls.'},
    {key:'bmass', label:'Ball mass', kind:'mass', def:0.2268, showIf:v => v.drag && v.mode !== 'launch'},
    {key:'spin', label:'Backspin', kind:'rpm', def:0, showIf:v => v.drag && v.mode !== 'launch'},''',
'''    {key:'drag', label:'Include air drag', type:'check', def:false, showIf:v => v.mode !== 'launch'},
    {key:'magnus', label:'Include backspin lift (Magnus)', type:'check', def:false, showIf:v => v.mode !== 'launch'},
    {key:'cd', label:'Drag coefficient', kind:'none', def:0.47, showIf:v => v.drag && v.mode !== 'launch', help:'~0.47 for a smooth sphere, higher for foam/dimpled balls.'},
    {key:'bmass', label:'Ball mass', kind:'mass', def:0.2268, showIf:v => (v.drag || v.magnus) && v.mode !== 'launch'},
    {key:'spin', label:'Backspin', kind:'rpm', def:600, showIf:v => v.magnus && v.mode !== 'launch', help:'Ball spin, not flywheel speed. Lift pushes at right angles to the path: flatter shots carry farther, very steep shots can land shorter.'},''')
sub('''{key:'mode', label:'Find', type:'select', def:'dist', options:[{value:'dist', label:'Height & angle at a distance'}, {value:'height', label:'Distance & angle at a height'}, {value:'launch', label:'Launch speed & angle (no drag)'}]},''',
'''{key:'mode', label:'Find', type:'select', def:'dist', options:[{value:'dist', label:'Height & angle at a distance'}, {value:'height', label:'Distance & angle at a height'}, {value:'launch', label:'Launch speed & angle (no drag or spin)'}]},''')

# ambcalc check: its "drag" case includes spin, so turn lift on too
sub("dd = { ...d, drag:true, cd:0.47, diam:177.8, bmass:0.5*0.453592, spin:600 };",
    "dd = { ...d, drag:true, magnus:true, cd:0.47, diam:177.8, bmass:0.5*0.453592, spin:600 };")
# fire-rate drag check: drag only, no lift
sub("drag:true, cd:0.47, bmass:0.2268, spin:0 });", "drag:true, magnus:false, cd:0.47, bmass:0.2268, spin:0 });")

sub('''      <div class="eq">no drag:  a = (0, −g)
with drag & spin (ambcalc's model):
  S  = r·ω / |v|       (spin ratio)
  C_L = 1.6·S  if S &lt; 0.1,  else 0.6·S + 0.1
  a  = ½ρA|v|/m · (−C_L·v_y − C_D·v_x,  C_L·v_x − C_D·v_y) − (0, g)''',
'''      <div class="eq">no drag or spin:  a = (0, −g)
with drag and/or backspin lift (ambcalc's model):
  S  = r·ω / |v|       (spin ratio)
  C_L = 1.6·S  if S &lt; 0.1,  else 0.6·S + 0.1     (0 when lift is off)
  C_D = drag coefficient                            (0 when drag is off)
  a  = ½ρA|v|/m · (−C_L·v_y − C_D·v_x,  C_L·v_x − C_D·v_y) − (0, g)''')

open(dst, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
