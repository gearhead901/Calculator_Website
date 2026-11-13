
/* ---------- 4f2. Arm (revolute joint) ---------- */
/* Built on Mechanism Startup's motor model (same current, back-EMF and current-limit equations, RK4 steps),
   with what an arm adds: gravity that changes with the arm angle (cos θ), an arm tube as well as the load,
   and the inertia of the motor rotors and every gear-stage shaft scaled to the arm by ratio².
   The idea comes from a team spreadsheet (motor + gearbox + arm inertia, holding current, time to lift). */
const ARM_STAGES = [1, 2, 3, 4];
// Ratios, reflected inertia and gravity constant. Gtot (optional) replaces the total ratio by changing stage 1 only.
function armModel(v, Gtot){
  const st = ARM_STAGES.map(k => ({ k, a:v['s'+k+'a'], b:v['s'+k+'b'], J:v['s'+k+'J'] || 0 })).filter(s => s.a > 0 && s.b > 0);
  const ratios = st.map(s => s.b/s.a);
  if (Gtot && ratios.length) ratios[0] = Gtot / ratios.slice(1).reduce((p, x) => p*x, 1);
  const G = ratios.reduce((p, x) => p*x, 1), n = Math.max(1, Math.round(v.n)), L = v.len/1000;
  // each stage's output shaft turns (product of the ratios after it) times faster than the arm
  const parts = [{ label:`Motor rotors (${n} × rotor × ${fmtNum(G,1)}²)`, J:n*(v.Jr || 0)*G*G }];
  st.forEach((s, i) => { const after = ratios.slice(i+1).reduce((p, x) => p*x, 1);
    parts.push({ label:i === st.length-1 ? `Stage ${s.k} shaft (the arm shaft, × 1²)` : `Stage ${s.k} shaft (× ${fmtNum(after,2)}²)`, J:s.J*after*after }); });
  parts.push({ label:'Arm load (point mass: m·L²)', J:v.mload*L*L }, { label:'Arm tube (uniform rod: m·L²/3)', J:v.mtube*L*L/3 });
  const J = parts.reduce((p, x) => p + x.J, 0);
  const Cg = G0*(v.mload*L + v.mtube*L/2);                                // gravity torque with the arm horizontal (N·m)
  return { stages:st, ratios, G, n, L, parts, J, Cg };
}
function armSim(v, m){
  const n = m.n, eff = v.eff/100, G = m.G;
  const Ts = v.ts*eff*n, If = v.if*n, Is = v.is*n, wf = v.fs*Math.PI/30;
  const kT = Ts/(Is - If), kB = 12/wf, R = 12/(Is - If);                // same motor model as Mechanism Startup
  const ilim = (v.ilim > 0 ? v.ilim : Infinity)*n;
  const th0 = v.a0*Math.PI/180, th1 = v.a1*Math.PI/180, dt = 0.001, Vb = v.volt;
  const deriv = (th, w) => {                                             // → [dθ/dt, dω/dt, current]
    let i = (Vb - w*G*kB)/R + If;
    i = Math.min(Math.abs(i), ilim)*Math.sign(i);
    return [w, (kT*(i - If)*G - m.Cg*Math.cos(th))/m.J, i];
  };
  const T = [0], X = [th0], W = [0], I = [], lim = [];
  let reached = false, stuck = false;
  while (T[T.length-1] < v.tmax){
    const x = X[X.length-1], w = W[W.length-1];
    if (x >= th1){ reached = true; break; }
    const k1 = deriv(x, w);
    if (w <= 1e-9 && k1[1] <= 0){ stuck = true; break; }                 // stopped and can't speed up: gravity wins
    const k2 = deriv(x + dt/2*k1[0], w + dt/2*k1[1]), k3 = deriv(x + dt/2*k2[0], w + dt/2*k2[1]), k4 = deriv(x + dt*k3[0], w + dt*k3[1]);
    I.push(k1[2]); lim.push(Math.abs(k1[2]) >= ilim);
    X.push(x + dt/6*(k1[0] + 2*k2[0] + 2*k3[0] + k4[0]));
    W.push(w + dt/6*(k1[1] + 2*k2[1] + 2*k3[1] + k4[1]));
    T.push(T[T.length-1] + dt);
  }
  let time = T[T.length-1], wEnd = W[W.length-1];
  if (reached && X.length > 1){                                          // interpolate the moment it crosses the end angle
    const j = X.length - 1, f = (th1 - X[j-1])/(X[j] - X[j-1]);
    time = T[j-1] + f*dt; wEnd = W[j-1] + f*(W[j] - W[j-1]);
  }
  I.push(I.length ? I[I.length-1] : 0); lim.push(lim.length ? lim[lim.length-1] : false);
  return { T, X, W, I, lim, time, wEnd, reached, stuck, kT, ilim };
}
const ARM = {
  id:'arm', group:'Power Transmission', title:'Arm',
  lede:'How long does an arm take to swing from one angle to another, how much current does it take to hold it, and how much of the inertia is really the motors and gearbox? Built on the Mechanism Startup simulator, with gravity that changes as the arm turns.',
  inputs:[
    {section:'Motor'},
    ...motorInputs(),
    {key:'n', label:'Number of motors', kind:'count', def:2},
    {key:'volt', label:'Voltage', kind:'volt', def:12},
    {key:'ilim', label:'Current limit / motor', kind:'amp', def:60, help:'Stator current limit. 0 = none.'},
    {key:'Jr', label:'Rotor inertia / motor', kind:'moi', def:0, help:'The motor rotor plus the pinion on its shaft, from the vendor or your CAD. It counts × ratio², so at high ratios it can rival the whole arm.'},
    {section:'Gear stages (driver → driven, 0 = unused)'},
    ...ARM_STAGES.flatMap(k => {
      const used = v => v['s'+k+'a'] > 0 && v['s'+k+'b'] > 0;
      return [
        {key:'s'+k+'a', label:`Stage ${k} driver`, kind:'teeth', def:[12,18,15,0][k-1], help:k === 1 ? 'Tooth counts, or 1 → 5 for a 5:1 planetary stage.' : undefined},
        {key:'s'+k+'b', label:`Stage ${k} driven`, kind:'teeth', def:[60,54,105,0][k-1]},
        {key:'s'+k+'J', label:`Stage ${k} output shaft inertia`, kind:'moi', def:0, showIf:used,
          help:k === 1 ? 'Everything spinning on the shaft after this stage: driven gear, the next pinion, shaft, hubs, sprockets, even a flywheel. Get it from CAD. The last stage’s shaft is the arm shaft.' : undefined},
      ];
    }),
    {key:'eff', label:'Gearbox efficiency', kind:'pct', def:90},
    {section:'Arm'},
    {key:'len', label:'Pivot to load', kind:'lenS', def:609.6, help:'Distance from the pivot to the load’s center of mass. The arm tube is assumed to be this long too.'},
    {key:'mload', label:'Load at the end', kind:'mass', def:4.5359237, help:'Treated as a point mass (intake, game piece, wrist).'},
    {key:'mtube', label:'Arm tube mass', kind:'mass', def:0.90718474, help:'Treated as a uniform rod from the pivot to the load. 0 = none.'},
    {key:'a0', label:'Start angle', kind:'deg', def:-45, help:'0° = horizontal, 90° = straight up, −90° = hanging straight down.'},
    {key:'a1', label:'End angle', kind:'deg', def:90},
    {section:'Simulation'},
    {key:'rmin', label:'Sweep from ratio', kind:'ratio', def:20},
    {key:'rmax', label:'Sweep to ratio', kind:'ratio', def:400},
    {key:'tmax', label:'Max time', kind:'s', def:3},
  ],
  onChange(key, v){ return fillMotor(key, v); },
  compute(v){
    if (!motorOk(v)) return { bad:true, warnings:[MOTOR_BAD] };
    const m = armModel(v);
    if (!m.stages.length) return { bad:true, warnings:['Enter at least one gear stage (driver and driven both above zero).'] };
    if (!(v.len > 0 && v.mload >= 0 && v.mtube >= 0 && v.mload + v.mtube > 0)) return { bad:true, warnings:['Pivot-to-load distance must be above zero, and the arm needs some mass.'] };
    if (!(v.a1 > v.a0)) return { bad:true, warnings:['End angle must be bigger than the start angle (this calculator lifts the arm).'] };
    if (!(v.eff > 0 && v.tmax > 0 && v.rmin > 0 && v.rmax > v.rmin)) return { bad:true, warnings:['Efficiency and max time must be above zero, and the sweep needs 0 < "from" < "to".'] };
    const sim = armSim(v, m), warnings = [], n = m.n;
    // Holding: the worst angle in the range is the one closest to horizontal
    const th0 = v.a0*Math.PI/180, th1 = v.a1*Math.PI/180;
    const cosMax = th0 <= 0 && th1 >= 0 ? 1 : Math.max(Math.cos(th0), Math.cos(th1));
    const hold = m.Cg*cosMax, holdAt = th0 <= 0 && th1 >= 0 ? 0 : (Math.cos(th0) >= Math.cos(th1) ? v.a0 : v.a1);
    const holdI = hold/(sim.kT*m.G)/n + v.if;                               // per motor
    const Rm = 12/(v.is - v.if), holdHeat = holdI*holdI*Rm;                 // per motor
    const maxT = sim.kT*(Math.min(v.is*n, sim.ilim) - v.if*n)*m.G;          // most torque at the arm (at the limit)
    const sweep = []; for (let i = 0; i <= 40; i++){ const G = v.rmin*(v.rmax/v.rmin)**(i/40), mm = armModel(v, G), s = armSim(v, mm);
      sweep.push({ G, time:s.reached ? s.time : NaN, holdI:hold/(s.kT*G)/n + v.if }); }
    const ok = sweep.filter(p => Number.isFinite(p.time)), best = ok.length ? ok.reduce((a, b) => b.time < a.time ? b : a) : null;
    if (sim.stuck) warnings.push('Gravity wins: the motors can’t lift the arm past the heaviest point at this ratio and current limit.');
    else if (!sim.reached) warnings.push(`It did not reach the end angle within ${v.tmax} s.`);
    if (v.ilim > 0 && holdI > v.ilim) warnings.push(`Holding the arm at ${fmtNum(holdAt,0)}° needs ${fmtNum(holdI,1)} A per motor, more than the ${fmtNum(v.ilim,0)} A current limit.`);
    if (!(v.Jr > 0)) warnings.push('Rotor inertia is 0. At high ratios the motors can be a big share of the inertia; enter it if you know it.');
    const peakI = Math.max(...sim.I.map(Math.abs))/n;
    return { m, sim, hold, holdAt, holdI, holdHeat, maxT, sweep, best, peakI, limited:sim.lim.some(Boolean), warnings };
  },
  renderOut(el, v, r){
    if (r.bad){ el.innerHTML = warnBox(r.warnings); return; }
    const s = r.sim, m = r.m, rest = m.ratios.slice(1).reduce((p, x) => p*x, 1);
    el.innerHTML = `
      <div class="tiles">
        ${tile('Time to end angle', s.reached ? fmtNum(s.time,3)+' s' : (s.stuck ? 'stalls' : `> ${v.tmax} s`), 'primary')}
        ${tile('Holding current / motor', fmtK(r.holdI,'amp'), 'primary')}
        ${tile('Total ratio', fmtNum(m.G,2)+' : 1')}
        ${tile('Fastest ratio in sweep', r.best ? fmtNum(r.best.G,1)+' : 1' : '—')}
        ${tile('Its time', r.best ? fmtNum(r.best.time,3)+' s' : '—')}
        ${tile('Peak current / motor', fmtK(r.peakI,'amp'))}
        ${tile('Hit current limit?', r.limited ? 'Yes' : 'No')}
        ${tile('Inertia at the arm', fmtK(m.J,'moi'))}
        ${tile('Worst holding torque', fmtK(r.hold,'torque'))}
        ${tile('Torque margin', fmtNum(r.maxT/r.hold,2)+' ×')}
        ${tile('Holding heat / motor', fmtNum(r.holdHeat,0)+' W')}
      </div>
      ${warnBox(r.warnings)}
      ${r.best ? `<p class="help">The sweep changes stage 1 only (the other stages stay as entered). For ${fmtNum(r.best.G,1)} : 1, stage 1 would be about ${fmtNum(r.best.G/rest,2)} : 1.</p>` : ''}
      <p class="help">Worst holding angle in this range: ${fmtNum(r.holdAt,0)}°. Torque margin = most torque the motors can make at the current limit ÷ the worst holding torque. Holding heat assumes the arm is held still at that angle.</p>
      <figure class="panel"><figcaption>INERTIA AT THE ARM · where it comes from</figcaption>
        <table><tr><th>Part</th><th>Inertia at the arm</th><th>Share</th></tr>
        ${m.parts.map(p => `<tr><td>${p.label}</td><td>${fmtK(p.J,'moi')}</td><td>${fmtNum(p.J/m.J*100,1)} %</td></tr>`).join('')}
        <tr><td><b>Total</b></td><td><b>${fmtK(m.J,'moi')}</b></td><td></td></tr></table></figure>
      <div class="panels two">
        <figure class="panel"><figcaption>TIME TO END ANGLE vs GEAR RATIO</figcaption><canvas id="armSweep"></canvas>
          ${legend([['time to end angle (s)',COL.white],['your ratio',COL.red,1]])}</figure>
        <figure class="panel"><figcaption>MOTION AT ${fmtNum(m.G,2)} : 1</figcaption><canvas id="armSim"></canvas>
          ${legend([['arm angle (°)',COL.blue],['current / motor (A)',COL.orange],['current-limited',COL.red,1]])}</figure>
      </div>`;
    armPlots(v, r);
  },
  validation(){
    const base = { motor:'custom', fs:6065, ts:7.16, if:2, is:374.4, n:1, volt:12, ilim:20, Jr:0, eff:100,
      s1a:1, s1b:100, s1J:0, s2a:0, s2b:0, s3a:0, s3b:0, s4a:0, s4b:0, len:500, mload:1, mtube:0, a0:-30, a1:60, rmin:20, rmax:400, tmax:5 };
    // 1. Reflected inertia: rotor × G², each shaft × (ratio after it)², load m·L², tube m·L²/3
    const vj = { ...base, n:2, Jr:1e-4, s1a:1, s1b:5, s1J:2e-4, s2a:10, s2b:40, s2J:3e-3, mload:2, mtube:1, len:400 };
    const Jexp = 2*1e-4*400 + 2e-4*16 + 3e-3*1 + 2*0.16 + 1*0.16/3;
    // 2. Current-limited the whole way (huge inertia keeps it slow): energy balance gives the end speed
    const ve = { ...base, s1J:50 }, me = armModel(ve), se = armSim(ve, me);
    const tq = se.kT*(20 - 2)*100, wE = Math.sqrt(2*(tq*Math.PI/2 - me.Cg*(Math.sin(Math.PI/3) - Math.sin(-Math.PI/6)))/me.J);
    // 3. A tiny swing through horizontal ≈ constant gravity = Mechanism Startup with the same motor and load
    const vs = { ...base, ilim:60, s1b:50, len:300, mload:5, a0:-1, a1:1 };
    const sa = armSim(vs, armModel(vs));
    const su = startupSim({ fs:6065, ts:7.16, if:2, is:374.4, n:1, volt:12, ilim:60, radius:300, mass:5, load:5, eff:100,
      by:'pos', units:'rot', tRot:2, stop:'speed', tmax:5, dt:1 }, 50);
    // 4. The team spreadsheet's arm: 5 lb at 12 in, horizontal (it used g = 9.8: 6.774 N·m)
    const sheet = armModel({ ...base, mload:5*0.45359237, len:304.8 });
    // 5. Too heavy: 20 kg at 1 m on one motor at 20:1 can't lift
    const sh = { ...base, s1b:20, ilim:0, mload:20, len:1000, a0:-90, a1:90 }, ss = armSim(sh, armModel(sh));
    return [
      { name:'Inertia at the arm: n·J_r·G² + Σ J_shaft·(ratio after)² + m·L² + m_tube·L²/3', expected:Jexp, got:armModel(vj).J, unit:'kg·m²', tol:1e-12 },
      { name:'Current-limited swing −30° → 60°: end speed from ½Jω² = T·Δθ − m·g·L·Δ(sin θ)', expected:wE, got:se.wEnd, unit:'rad/s', tol:1e-4 },
      { name:'… current limit held the whole time (1 = yes)', expected:1, got:se.lim.slice(0, -1).every(Boolean) ? 1 : 0, unit:'', tol:0 },
      { name:'±1° swing through horizontal matches Mechanism Startup (constant load)', expected:su.time, got:sa.time, unit:'s', tol:1.5e-3 },
      { name:'Team spreadsheet arm, 5 lb at 12 in: gravity torque (sheet used g = 9.8)', expected:6.774, got:sheet.Cg, unit:'N·m', tol:0.01 },
      { name:'Too heavy (20 kg at 1 m, 1 motor, 20:1) → stalls (1 = yes)', expected:1, got:ss.stuck ? 1 : 0, unit:'', tol:0 },
    ];
  },
  docs(){ return `
    <div><h3>How it works</h3>
      <div class="eq">gravity  T_g = g·(m_load·L + m_tube·L/2)·cos θ      θ = 0 horizontal, 90° up
inertia  J = n·J_rotor·G² + Σ J_shaft·(ratio after that shaft)² + m_load·L² + m_tube·L²/3
current  i = (V − ω·G·k_B)/R + I_f   (capped at the limit)
accel.   α = (k_T·(i − I_f)·G − T_g) / J
holding  I_hold = T_g,max / (k_T·G·n) + I_f      per motor
k_T = T_s·eff·n/(I_s−I_f)·n   k_B = 12/ω_f   R = 12/(I_s−I_f)</div>
      <p>The motor model is the same one Mechanism Startup uses. Every 1 ms it works out the current from the back-EMF, caps it at the limit, subtracts gravity for the arm’s current angle and steps the angle and speed forward with RK4. The end time is interpolated to the moment the arm crosses the end angle.</p>
      <p><b>Why the inertia table matters:</b> a part spinning faster than the arm feels heavier to the motors by the square of its speed ratio. A motor rotor behind a 100:1 gearbox counts 10 000 times its own inertia. Each stage’s inertia box is for everything on that stage’s output shaft, so a flywheel or heavy sprocket shows up where it really is.</p>
      <p>The ratio sweep changes stage 1 only and keeps the other stages, so the shaft inertias stay where you put them. It does not include a counterbalance or braking to a stop at the end angle yet.</p>
    </div>
    <div><h3>Validation</h3>
      <p>Checks: the inertia sum by hand; an energy balance for a swing where the current limit holds the whole time (constant motor torque, gravity changing with the angle); a tiny swing through horizontal against Mechanism Startup; and the gravity torque from the team spreadsheet this calculator was based on.</p>
      ${validationTable(this)}</div>`; }
};
function armPlots(v, r){
  const cs = document.getElementById('armSweep'), cm = document.getElementById('armSim'); if (!cs || !cm) return;
  const pts = r.sweep.map(p => [p.G, p.time]), tm = Math.max(1e-3, ...pts.map(p => p[1]).filter(Number.isFinite))*1.08;
  let f = frame(cs, [v.rmin, v.rmax], [0, tm], 'ratio', 's', 'total gear ratio (: 1, log scale)', 'time to end angle (s)', { xlog:true });
  drawSeries(f, [{ pts, col:COL.white, w:2.5 }]);
  if (r.m.G >= v.rmin && r.m.G <= v.rmax) vline(f, r.m.G, COL.red, 0, tm);
  if (r.best){ f.c.fillStyle = '#fff'; f.c.strokeStyle = COL.green; f.c.lineWidth = 1.5; star(f.c, f.X(r.best.G), f.Y(r.best.time), 8); }
  const s = r.sim, n = r.m.n;
  const ang = s.X.map((x, i) => [s.T[i], x*180/Math.PI]), amps = s.I.map((x, i) => [s.T[i], x/n]);
  const yr = range([...ang.map(p => p[1]), ...amps.map(p => p[1]), 0]);
  f = frame(cm, [0, Math.max(s.T[s.T.length-1], 1e-3)], [Math.min(0, yr[0])*1.08, yr[1]*1.08], 's', null, 'time (s)', 'angle (°)  /  current per motor (A)');
  drawSeries(f, [{ pts:ang, col:COL.blue, w:2.5 }, { pts:amps, col:COL.orange, w:2 },
    { pts:amps.map((p, i) => [p[0], s.lim[i] ? p[1] : NaN]), col:COL.red, w:3, dash:1 }]);
}
