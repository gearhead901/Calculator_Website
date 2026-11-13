/* ---------- 4b¾. Flywheel (shooter wheel) ----------
   The ball is squeezed between the wheel and a hood (or a second wheel), like a planet between a sun and a ring gear:
     sun = wheel, ring = hood (stopped) or the other wheel, planet = ball, carrier = the ball's center.
   Rolling without slip, the ball's center moves at the average of the two surface speeds, and it spins by their
   difference:   v_ball = (v1 + v2)/2,   ω_ball = (v1 − v2)/d_ball.   A hood is v2 = 0, so v_ball = v1/2.
   The shot takes energy from the spinning wheel:   ½·J·ω0² = ½·J·ω1² + ½·m·v² + ½·I_ball·ω_ball²   */
const BALL_K = { solid:0.4, hollow:2/3 };               // I_ball = k·m·r²: solid sphere 2/5, thin shell 2/3
// The ball's speed and spin per unit of wheel angular speed, and the "inertia" the ball adds during the shot (β):
// ½·β·ω1² = the ball's energy when the wheel leaves it at ω1.
function flyKin(v){
  const r = v.wheel/2000, rb = v.bdiam/2000, eta = v.ratio/100;
  const s = v.type === 'hood' ? 0 : v.topPct/100;       // second surface speed as a fraction of the main wheel's
  const kv = eta*(1 + s)/2*r, kw = eta*(1 - s)*r/(2*rb);   // v_ball = kv·ω,  ω_ball = kw·ω
  const beta = v.bmass*kv*kv + BALL_K[v.bkind]*v.bmass*rb*rb*kw*kw;
  return { r, rb, eta, s, kv, kw, beta };
}
// Spin the wheel from w0 toward wTarget (rad/s at the wheel) with the motor model used by Arm and Mechanism Startup.
function flySim(v, J, w0, wTarget, tmax = 6){
  const n = v.n, eff = v.eff/100, G = v.G;
  const Ts = v.ts*eff*n, If = v.if*n, Is = v.is*n, wf = v.fs*Math.PI/30*(v.volt/12);
  const kT = Ts/(Is - If), kB = 12/(v.fs*Math.PI/30), R = 12/(Is - If);
  const ilim = (v.ilim > 0 ? v.ilim : Infinity)*n, dt = 0.0005;
  const cur = w => Math.min((v.volt - w*G*kB)/R + If, ilim);          // total current, all motors
  const acc = w => kT*(cur(w) - If)*G/J;
  const T = [0], W = [w0], I = [cur(w0)/n];
  let t = 0, w = w0, reached = w0 >= wTarget;
  while (!reached && t < tmax){
    const k1 = acc(w), k2 = acc(w + dt/2*k1), k3 = acc(w + dt/2*k2), k4 = acc(w + dt*k3);
    const wn = w + dt/6*(k1 + 2*k2 + 2*k3 + k4);
    if (wn >= wTarget){ t += dt*(wTarget - w)/(wn - w); w = wTarget; reached = true; }
    else { t += dt; w = wn; }
    T.push(t); W.push(w); I.push(cur(w)/n);
  }
  return { T, W, I, time:reached ? t : Infinity, reached, wFree:wf/G, ilim:ilim/n };
}
const FLY = {
  id:'fly', group:'Shooter', title:'Flywheel',
  lede:'Size a shooter wheel: the wheel speed a shot needs, your headroom, spin-up and recovery times, and how much the wheel slows when the ball goes through. Works for a wheel with a hood and for two wheels.',
  inputs:[
    {section:'Shot'},
    {key:'vreq', label:'Exit speed needed', kind:'speed', def:8.24, help:'The ball’s launch speed for your hardest shot. Shot Trajectory’s “Size the flywheel” button fills this in.'},
    {key:'type', label:'Shooter', type:'select', def:'hood', options:[{value:'hood', label:'Wheel + hood'}, {value:'double', label:'Two wheels'}]},
    {key:'topPct', label:'Second wheel surface speed', kind:'pct', def:100, showIf:v => v.type === 'double',
      help:'As a % of the main wheel’s surface speed. 100% = same speed, no spin. Less gives the ball spin.'},
    {key:'ratio', label:'Slip efficiency (100% = no slip)', kind:'pct', def:100,
      help:'How much of the ideal no-slip ball speed you get. Not ball speed ÷ wheel speed: the hood already halves that. Design at 100% with headroom; lower it to what software measures from video of real shots.'},
    {key:'wrap', label:'Hood contact arc', kind:'deg', def:90, showIf:v => v.type === 'hood', help:'How far around the wheel the ball rides on the hood. Sets the contact time.'},
    {section:'Wheel'},
    {key:'wheel', label:'Wheel diameter', kind:'lenS', def:101.6},
    {key:'J', label:'Spinning inertia', kind:'moi', def:0.0029264, help:'Everything turning at wheel speed: wheels, any extra flywheel, shafts, pulleys. From CAD. A second wheel geared to this one counts too.'},
    {section:'Motor and gearing'},
    ...motorInputs(),
    {key:'n', label:'Number of motors', kind:'count', def:2},
    {key:'G', label:'Gear ratio (motor : wheel)', kind:'ratio', def:1, help:'1 = direct drive. Below 1 speeds the wheel up (e.g. 0.67 = 2:3 step-up).'},
    {key:'volt', label:'Voltage', kind:'volt', def:12},
    {key:'ilim', label:'Current limit / motor', kind:'amp', def:60, help:'Stator current limit. 0 = none.'},
    {key:'Jr', label:'Rotor inertia / motor', kind:'moi', def:0},
    {key:'eff', label:'Gearbox efficiency', kind:'pct', def:95},
    {section:'Ball'},
    {key:'bmass', label:'Ball mass', kind:'mass', def:0.215},
    {key:'bdiam', label:'Ball diameter', kind:'lenS', def:150},
    {key:'bkind', label:'Ball type', type:'select', def:'solid', options:[{value:'solid', label:'Solid (foam, rubber)'}, {value:'hollow', label:'Hollow shell'}]},
    {key:'shots', label:'Shots in a row (plot)', kind:'count', def:3},
  ],
  onChange(key, v){ return fillMotor(key, v); },
  compute(v){
    const warnings = [];
    if (!motorOk(v)) return { bad:true, warnings:[MOTOR_BAD] };
    if (!(v.wheel > 0 && v.bdiam > 0 && v.bmass > 0 && v.J > 0 && v.G > 0 && v.ratio > 0)) return { bad:true, warnings:['Wheel size, inertia, gear ratio, slip efficiency and the ball all need to be bigger than zero.'] };
    const k = flyKin(v), J = v.J + v.n*v.Jr*v.G*v.G;                  // each rotor turns G× faster than the wheel: it counts × G²
    const keep = Math.sqrt(J/(J + k.beta));                             // ω1/ω0 through one shot
    const w1 = v.vreq/k.kv, w0 = w1/keep;                               // wheel speed as the ball leaves, and the set point before the shot
    const sim0 = flySim(v, J, 0, w0), wFree = sim0.wFree;
    const rec = flySim(v, J, w1, w0);
    const rpm = w => w*30/Math.PI;
    const headroom = 1 - w0/wFree;
    if (headroom < 0) warnings.push('The wheel can’t reach the speed this shot needs. Gear it faster, use a bigger wheel or more motors, or raise the slip efficiency if you have measured it.');
    else if (headroom < 0.15) warnings.push(`Only ${fmtNum(headroom*100,0)}% headroom: a sagging battery or a worn ball could leave the shot short. 20% or more is a common target.`);
    if (v.ratio > 100) warnings.push('A slip efficiency over 100% is faster than a no-slip ball can go; check the measurement.');
    const vc = v.vreq, spin = k.kw*w1*30/Math.PI;                        // ball speed (m/s) and spin (rpm)
    const eBall = 0.5*k.beta*w1*w1;
    const tContact = v.type === 'hood' ? (v.wrap*Math.PI/180)*(k.r + k.rb)/vc : null;
    // a burst of shots fired as soon as the wheel is back at speed
    const burst = { T:[], W:[], I:[] };
    let t0 = 0;
    const add = (s, w0s) => { s.T.forEach((t, i) => { burst.T.push(t0 + t); burst.W.push(rpm(s.W[i])); burst.I.push(s.I[i]); }); t0 += s.T[s.T.length - 1]; };
    if (sim0.reached){
      add(sim0);
      for (let i = 0; i < Math.max(1, Math.round(v.shots)); i++){
        burst.T.push(t0); burst.W.push(rpm(w1)); burst.I.push(burst.I[burst.I.length-1]);   // the shot: speed drops at once
        const r2 = flySim(v, J, w1, w0); if (!r2.reached) break; add(r2);
      }
    }
    return { k, J, keep, w0, w1, wFree, headroom, spinup:sim0.time, recovery:rec.time, sim0, rec, vc, spin, eBall, tContact, burst, warnings,
      peakI:Math.max(...sim0.I), surf:w1*k.r };
  },
  renderOut(el, v, r){
    if (r.bad){ el.innerHTML = warnBox(r.warnings); return; }
    const rpm = w => Math.round(w*30/Math.PI), t = x => !Number.isFinite(x) ? 'never' : x < 1 ? fmtNum(x*1000,0)+' ms' : fmtNum(x,2)+' s';
    const motorRpm = r.w0*v.G*30/Math.PI;
    el.innerHTML = `
      <div class="tiles">
        ${tile('Wheel set point', rpm(r.w0)+' rpm', 'primary')}
        ${tile('Headroom', `${fmtNum(r.headroom*100,0)}%`, 'primary')}
        ${tile('Spin-up from rest', t(r.spinup), 'primary')}
        ${tile('Recovery after a shot', t(r.recovery))}
        ${tile('Speed lost per shot', `${rpm(r.w0) - rpm(r.w1)} rpm<div style="font-size:12px;font-weight:400;opacity:.75">${fmtNum((1 - r.keep)*100,1)}%</div>`)}
        ${tile('Wheel surface speed', fmtK(r.surf,'speed'))}
        ${tile('Ball spin', Math.round(r.spin)+' rpm')}
        ${tile('Energy to the ball', fmtNum(r.eBall,1)+' J')}
        ${tile('Max wheel speed', rpm(r.wFree)+' rpm')}
        ${tile('Motor speed at set point', Math.round(motorRpm)+' rpm')}
        ${r.tContact !== null ? tile('Contact time', fmtNum(r.tContact*1000,0)+' ms') : ''}
        ${tile('Peak current / motor', fmtK(r.peakI,'amp'))}
      </div>
      ${warnBox(r.warnings)}
      <p class="help">Set point = the wheel speed before the shot. The ball takes energy as it goes through, so the wheel leaves it at ${rpm(r.w1)} rpm, which is what gives ${fmtK(r.vc,'speed')}. Headroom = how far below the wheel’s top speed the set point is.</p>
      <div class="panels two">
        <figure class="panel"><figcaption>WHEEL SPEED · spin-up, then ${Math.max(1, Math.round(v.shots))} shots as fast as it recovers</figcaption><canvas id="flyRpm"></canvas>
          ${legend([['wheel rpm',COL.blue],['set point',COL.green,1],['current / motor × 10 (A)',COL.orange]])}</figure>
        <figure class="panel"><figcaption>THE SHOT AS A PLANETARY GEARBOX · wheel = sun, ${v.type === 'hood' ? 'hood = ring (stopped)' : 'second wheel = ring'}, ball = planet</figcaption>
          ${flySVG(v, r)}</figure>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">${gotoBtn('shot', { spin:Math.round(r.spin), magnus:r.spin > 1, mass:v.bmass, diam:v.bdiam }, 'Send ball spin and size to Shot Trajectory')}</div>`;
    flyPlot(v, r);
  },
  validation(){
    const d = defaultsFor(this), big = { ...d, J:1e6 };                  // huge inertia: the shot doesn't slow the wheel
    const hood = this.compute(big), dbl = this.compute({ ...big, type:'double', topPct:100 });
    // Willis equation for a planetary, ring stopped: ω_carrier = ω_sun·R_sun/(R_sun + R_ring), R_ring = R_sun + d_ball
    const Rs = d.wheel/2000, Rr = Rs + d.bdiam/1000, wS = 300, wC = wS*Rs/(Rs + Rr), vCarrier = wC*(Rs + d.bdiam/2000);
    const kin = flyKin(d);
    const r = this.compute(d);
    // no current limit: ω(t) = ω_free·(1 − e^(−t/τ)), τ = J·ω_free / stall torque at the wheel
    const v2 = { ...d, ilim:0, Jr:0 }, r2 = this.compute(v2), Ts = v2.ts*v2.eff/100*v2.n*v2.G, tau = r2.J*r2.wFree/Ts;
    const tExact = -tau*Math.log(1 - r2.w0/r2.wFree), tRec = tExact + tau*Math.log(1 - r2.w1/r2.wFree);
    return [
      { name:'Hood, no slip: ball speed = ½ × wheel surface speed', expected:0.5, got:hood.vc/hood.surf, unit:'', tol:1e-9 },
      { name:'… matches a planetary with the ring stopped (Willis equation)', expected:vCarrier, got:kin.kv*wS, unit:'m/s', tol:1e-9 },
      { name:'… ball spin = wheel surface speed ÷ ball diameter', expected:kin.r*300/(d.bdiam/1000), got:kin.kw*300, unit:'rad/s', tol:1e-9 },
      { name:'Two wheels at the same speed: ball speed = surface speed, no spin', expected:1, got:dbl.vc/dbl.surf + Math.abs(dbl.spin), unit:'', tol:1e-9 },
      { name:'Energy: ½J(ω0² − ω1²) = ½mv² + ½Iω²', expected:0.5*d.bmass*r.vc**2 + 0.5*0.4*d.bmass*(d.bdiam/2000)**2*(r.vc/(d.bdiam/2000))**2, got:0.5*r.J*(r.w0**2 - r.w1**2), unit:'J', tol:1e-9 },
      { name:'Spin-up, no current limit: matches ω_free·(1 − e^(−t/τ))', expected:tExact, got:r2.spinup, unit:'s', tol:1e-4 },
      { name:'Recovery = spin-up time to ω0 − spin-up time to ω1 (no limit)', expected:tRec, got:r2.recovery, unit:'s', tol:1e-4 },
    ];
  },
  docs(){ return `
    <div><h3>How it works</h3>
      <p>The ball is squeezed between the wheel and the hood (or a second wheel). That is a <b>planetary gearbox</b>: the wheel is the sun, the hood is the ring (stopped), the ball is a planet and the ball’s center is the carrier. Rolling without slip, the ball’s center moves at the average of the two surface speeds and spins by their difference. With the hood stopped, that is half the wheel’s surface speed, however big the hood’s radius is. Two wheels at the same speed give the full surface speed and no spin.</p>
      <div class="eq">ball speed   v = (v1 + v2) / 2 × slip efficiency        hood: v2 = 0
ball spin    ω_b = (v1 − v2) / d_ball
shot energy  ½·J·ω0² = ½·J·ω1² + ½·m·v² + ½·k·m·r_b²·ω_b²     (k = 2/5 solid, 2/3 hollow)
             ω1 = ω0·√(J / (J + β)),  β = the ball's energy per ½ω1²
spin-up      J·dω/dt = motor torque × G × efficiency   (current limit, back-EMF; same model as Arm)</div>
      <p>The <b>slip efficiency</b> covers slip and the ball squashing (100% = no slip, the ideal result above). Leave it at 100% to design with headroom, and replace it with what software measures from real shots (frame-by-frame video works). The set point is the wheel speed <i>before</i> the shot: the ball slows the wheel as it goes through, and it leaves at the slower speed. The planetary view also says where the ball goes: it rides an arc around the wheel and leaves along the tangent where the hood ends, so the hood sets the launch angle.</p>
      <p>Spinning inertia J is everything turning at wheel speed. Motor rotors count too: a rotor turning G times faster than the wheel adds n·J_rotor·G² at the wheel.</p>
    </div>
    <div><h3>Validation</h3>
      <p>The ball’s speed must match a planetary gearbox with the ring stopped (the Willis equation); the energy taken from the wheel must equal the ball’s; and with no current limit the spin-up must match the exact exponential.</p>
      ${validationTable(this)}
    </div>`; }
};
// Speed and current over a spin-up and a burst of shots
function flyPlot(v, r){
  const cv = document.getElementById('flyRpm'); if (!cv || !r.burst.T.length) return;
  const B = r.burst, tEnd = Math.max(B.T[B.T.length-1], 0.1), w0 = r.w0*30/Math.PI;
  const yMax = Math.max(w0, ...B.I.map(i => i*10))*1.12;
  const f = frame(cv, [0, tEnd], [0, yMax], 's', null, 'time (s)', 'wheel rpm  /  current per motor × 10 (A)');
  drawSeries(f, [{ pts:B.T.map((t, i) => [t, B.W[i]]), col:COL.blue, w:2.5 }, { pts:[[0, w0], [tEnd, w0]], col:COL.green, w:1.5, dash:1 },
    { pts:B.T.map((t, i) => [t, B.I[i]*10]), col:COL.orange, w:1.5 }]);
}
// The planetary picture, to scale: wheel (sun), hood or second wheel (ring), ball (planet), with the speeds
function flySVG(v, r){
  const Rw = v.wheel/2, Rb = v.bdiam/2, hood = v.type === 'hood';
  const arrowDef = `<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${COL.text}"/></marker></defs>`;
  const arrow = (x, y, dx, dy, col, lab) => `<line x1="${x}" y1="${y}" x2="${x+dx}" y2="${y+dy}" stroke="${col}" stroke-width="2.5" marker-end="url(#ah)"/>
    <text x="${x+dx+6}" y="${y+dy+4}" fill="${col}" font-size="11">${lab}</text>`;
  const foot = `<text x="10" y="292" fill="${COL.text}" font-size="11">ball center = carrier: ${fmtNum(r.vc/r.surf*100,0)}% of the wheel’s surface speed, spinning ${Math.round(r.spin)} rpm</text>`;
  const L = 70;                                            // arrow length for the wheel's surface speed
  if (hood){
    const sc = 120/(Rw + 2*Rb), R = Rw*sc, rb = Rb*sc, ring = R + 2*rb, cx = 165, cy = 150;
    const a = -50*Math.PI/180, bx = cx + (R + rb)*Math.cos(a), by = cy + (R + rb)*Math.sin(a), tx = -Math.sin(a), ty = Math.cos(a);
    const arc = (d0, d1) => { const p = d => [cx + ring*Math.cos(d*Math.PI/180), cy + ring*Math.sin(d*Math.PI/180)]; const [x0, y0] = p(d0), [x1, y1] = p(d1);
      return `M ${x0} ${y0} A ${ring} ${ring} 0 0 1 ${x1} ${y1}`; };
    return `<svg viewBox="0 0 420 300" style="height:300px" preserveAspectRatio="xMidYMid meet">${arrowDef}
      <path d="${arc(-170, 10)}" fill="none" stroke="${COL.text}" stroke-width="5"/>
      <text x="${cx - ring + 4}" y="${cy + 28}" fill="${COL.text}" font-size="11">hood = ring (stopped)</text>
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="rgba(79,141,245,.18)" stroke="${COL.blue}" stroke-width="2"/>
      <text x="${cx}" y="${cy + 4}" fill="${COL.blue}" font-size="12" text-anchor="middle">wheel = sun</text>
      <circle cx="${bx}" cy="${by}" r="${rb}" fill="rgba(240,164,58,.22)" stroke="${COL.orange}" stroke-width="2"/>
      <text x="${bx}" y="${by - rb - 6}" fill="${COL.orange}" font-size="11" text-anchor="middle">ball = planet</text>
      ${arrow(cx + R*Math.cos(a), cy + R*Math.sin(a), tx*L, ty*L, COL.blue, fmtK(r.surf,'speed'))}
      ${arrow(bx, by, tx*L*r.vc/r.surf, ty*L*r.vc/r.surf, COL.orange, fmtK(r.vc,'speed'))}
      ${foot}</svg>`;
  }
  // two wheels: main wheel below, ball, second wheel above; the ball moves to the right
  const sc = 250/(2*Rw + 2*Rb + 2*Rw), R = Rw*sc, rb = Rb*sc, x = 150, y1 = 280 - R, yb = y1 - R - rb, y2 = yb - rb - R, top = r.surf*v.topPct/100;
  return `<svg viewBox="0 0 420 300" style="height:300px" preserveAspectRatio="xMidYMid meet">${arrowDef}
    <circle cx="${x}" cy="${y1}" r="${R}" fill="rgba(79,141,245,.18)" stroke="${COL.blue}" stroke-width="2"/>
    <text x="${x}" y="${y1 + 4}" fill="${COL.blue}" font-size="12" text-anchor="middle">wheel = sun</text>
    <circle cx="${x}" cy="${y2}" r="${R}" fill="rgba(167,123,243,.15)" stroke="${COL.purple}" stroke-width="2"/>
    <text x="${x}" y="${y2 + 4}" fill="${COL.purple}" font-size="12" text-anchor="middle">second wheel = ring</text>
    <circle cx="${x}" cy="${yb}" r="${rb}" fill="rgba(240,164,58,.22)" stroke="${COL.orange}" stroke-width="2"/>
    ${arrow(x, y1 - R, L, 0, COL.blue, fmtK(r.surf,'speed'))}
    ${arrow(x, y2 + R, L*top/r.surf, 0, COL.purple, fmtK(top,'speed'))}
    ${arrow(x + rb + 4, yb, L*r.vc/r.surf, 0, COL.orange, 'ball ' + fmtK(r.vc,'speed'))}
    ${foot}</svg>`;
}
