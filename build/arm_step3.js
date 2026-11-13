/* ---- Arm Step 3: motion profile and software handoff ----
   The arm follows a motion profile (CTRE Motion Magic, or WPILib TrapezoidProfile) and a feedforward supplies the
   voltage. The feedforward gains come from the same motor model as Steps 1–2, written in WPILib ArmFeedforward form:
     V = kS·sign(ω) + kG·cos θ + kV·ω + kA·α
   Assumes the arm tracks the profile exactly (ideal feedforward), so these are the voltage and current the move needs. */
function armFF(v, m){
  const n = m.n, eff = v.eff/100, wf = v.fs*Math.PI/30;
  const kTc = v.ts*eff/(v.is - v.if);                  // N·m at the motor per amp of total current (all motors, with eff)
  const Rc = 12/(n*(v.is - v.if));                     // resistance of all motors together (same model as Startup)
  const kB = 12/wf;                                    // volts per motor rad/s
  const perT = Rc/(kTc*m.G);                           // volts per N·m needed at the arm
  return { kS:v.kS || 0, kG:perT*m.Cg, kV:kB*m.G, kA:perT*m.J, perT, kTc };
}
// Trapezoid (or triangle, if the move is too short to reach cruise) for distance D, cruise vm, acceleration am
function profileTrap(D, vm, am){
  const tA = vm/am;
  if (am*tA*tA >= D){ const vp = Math.sqrt(D*am); return { vp, tA:vp/am, tC:0, T:2*vp/am }; }
  return { vp:vm, tA, tC:(D - am*tA*tA)/vm, T:2*tA + (D - am*tA*tA)/vm };
}
// Sample the profile every 1 ms. A jerk limit is applied by averaging the trapezoid's velocity over Tj = a/j,
// which ramps the acceleration up and down over Tj (an S-curve) and adds Tj to the move time.
function armProfile(v, m, ff, vm, am, jm){
  const D = (v.a1 - v.a0)*Math.PI/180, tp = profileTrap(D, vm, am), dt = 0.001;
  const Nj = jm > 0 ? Math.max(1, Math.round(am/jm/dt)) : 1, Nt = Math.ceil(tp.T/dt), N = Nt + Nj;
  const vt = t => t <= 0 || t >= tp.T ? 0 : t < tp.tA ? am*t : t < tp.tA + tp.tC ? tp.vp : am*(tp.T - t);
  const raw = Array.from({ length:N + 1 }, (_, k) => vt(k*dt)), W = [];
  let s = 0; for (let k = 0; k <= N; k++){ s += raw[k]; if (k >= Nj) s -= raw[k - Nj]; W.push(s/Nj); }
  let sum = 0; for (let k = 1; k <= N; k++) sum += (W[k] + W[k-1])/2*dt;
  const scale = sum > 0 ? D/sum : 1; for (let k = 0; k <= N; k++) W[k] *= scale;   // land exactly on the end angle
  const T = [], X = [], A = [], V = [], I = [];
  let th = v.a0*Math.PI/180, n = m.n, If = v.if*n;
  for (let k = 0; k <= N; k++){
    if (k) th += (W[k] + W[k-1])/2*dt;
    const a = ((W[Math.min(N, k+1)]) - W[Math.max(0, k-1)])/((Math.min(N, k+1) - Math.max(0, k-1))*dt);
    const tau = m.J*a + m.Cg*Math.cos(th);                                  // torque the arm needs (N·m)
    T.push(k*dt); X.push(th); A.push(a);
    V.push(ff.kS*Math.sign(W[k]) + ff.perT*tau + ff.kV*W[k]);
    I.push((tau/(ff.kTc*m.G) + If)/n);                                       // per motor (negative = braking)
  }
  return { T, X, W, A, V, I, time:N*dt, peakV:Math.max(...V.map(Math.abs)), peakI:Math.max(...I.map(Math.abs)), vm, am, jm };
}
const ARM_GOALS = { gentle:0.4, brisk:0.7, race:0.9 };
function armStep3(v, m, cosMax){
  const ff = armFF(v, m), D = (v.a1 - v.a0)*Math.PI/180, mm = v.ptype === 'mm', warnings = [];
  // Fastest profile the gearbox can follow (worst-case gravity over the whole move, no margin):
  //   cruise:       kS + kG·cos θ_worst + kV·ω ≤ V
  //   acceleration: limited by the current limit, and by the voltage left over at cruise speed
  const head = v.volt - ff.kS - ff.kG*cosMax;
  const iM = v.ilim > 0 ? Math.min(v.ilim, v.is) : v.is;
  const aCur = (ff.kTc*(iM - v.if)*m.n*m.G - m.Cg*cosMax)/m.J;
  let best = null;
  if (head > 0 && aCur > 0) for (let p = 0.05; p <= 1.0001; p += 0.05){
    const wc = p*head/ff.kV, a = Math.min(aCur, (head - ff.kV*wc)/ff.kA);
    if (!(a > 0)) continue;
    const t = profileTrap(D, wc, a).T + (mm ? 0.1 : 0);
    if (!best || t < best.t) best = { wc, a, t };
  }
  if (!best){ warnings.push('The motors can’t hold this arm at its worst angle with the voltage and current available, so no profile is possible.'); return { ff, warnings }; }
  let vm, am, jm;
  if (v.pgoal === 'custom'){ vm = v.pvel*Math.PI/180; am = v.pacc*Math.PI/180; jm = mm ? v.pjerk*Math.PI/180 : 0; }
  else { const f = ARM_GOALS[v.pgoal]; vm = f*best.wc; am = f*best.a; jm = mm ? am/0.1 : 0; }   // jerk: ramp accel over 0.1 s
  if (!(vm > 0 && am > 0)) return { ff, warnings:['Cruise velocity and acceleration must be above zero.'] };
  const pr = armProfile(v, m, ff, vm, am, jm);
  if (pr.peakV > v.volt*1.0001) warnings.push(`The profile needs up to ${fmtNum(pr.peakV,1)} V, more than the ${fmtNum(v.volt,1)} V available. The arm will fall behind it; slow the profile down.`);
  if (v.ilim > 0 && pr.peakI > v.ilim*1.0001) warnings.push(`The profile needs up to ${fmtNum(pr.peakI,0)} A per motor, over the ${fmtNum(v.ilim,0)} A current limit. The limit will cut in and the arm will fall behind.`);
  const holdEnd = (m.Cg*Math.cos(v.a1*Math.PI/180)/(ff.kTc*m.G) + v.if*m.n)/m.n;
  const fastest = profileTrap(D, best.wc, best.a).T + (mm ? 0.1 : 0);
  return { ff, pr, best, fastest, holdEnd, mm, warnings };
}
function armStep3Html(v, r){
  const step = t => `<h3 style="margin:22px 0 10px;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)">${t}</h3>`;
  let h = step('Step 3 · Motion profile and software handoff');
  const p3 = r.p3;
  if (!p3) return h + `<p class="help">Enter your gear stages in Step 2 first.</p>`;
  if (!p3.pr) return h + warnBox(p3.warnings);
  const pr = p3.pr, ff = p3.ff, m = r.ref.m, n = m.n, rot = 2*Math.PI, deg = 180/Math.PI;
  const goal = v.pgoal === 'custom' ? 'Custom' : `${v.pgoal[0].toUpperCase()+v.pgoal.slice(1)} (${ARM_GOALS[v.pgoal]*100}% of the fastest)`;
  const f4 = x => Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(1) : Math.abs(x) >= 1 ? x.toFixed(3) : x.toPrecision(4)) : '—';
  const motor = (MOTOR_DB[v.motor] || {}).label || 'custom motor';
  const effL = 1.5*G0*m.J/m.Cg;                                   // SingleJointedArmSim treats the arm as a uniform rod
  h += `
    <div class="tiles">
      ${tile('Move time', fmtNum(pr.time,3)+' s', 'primary')}
      ${tile('Profile', goal, 'primary')}
      ${tile('Fastest it can follow', fmtNum(p3.fastest,3)+' s')}
      ${tile('Peak current / motor', fmtK(pr.peakI,'amp'))}
      ${tile('Peak voltage', fmtNum(pr.peakV,2)+' V')}
      ${tile('Uses', `${fmtNum(pr.peakV/v.volt*100,0)}% of voltage${v.ilim > 0 ? `, ${fmtNum(pr.peakI/v.ilim*100,0)}% of current limit` : ''}`)}
      ${tile('Cruise velocity', fmtNum(pr.vm*deg,0)+' °/s')}
      ${tile('Acceleration', fmtNum(pr.am*deg,0)+' °/s²')}
      ${tile('Holding current at end angle', fmtK(p3.holdEnd,'amp'))}
    </div>
    ${warnBox(p3.warnings)}
    <p class="help">“Fastest” is the quickest profile whose voltage and current stay within limits even at the worst angle for gravity. Gentle, Brisk and Race use 40%, 70% and 90% of its velocity and acceleration${p3.mm ? ', with jerk set so the acceleration ramps over 0.1 s' : ''}. This assumes the arm follows the profile exactly, so it shows what the feedforward has to supply; PID only cleans up the error.</p>
    <div class="panels two">
      <figure class="panel"><figcaption>PROFILE · angle and speed</figcaption><canvas id="armProf"></canvas>
        ${legend([['arm angle (°)',COL.blue],['speed (°/s ÷ 10)',COL.green]])}</figure>
      <figure class="panel"><figcaption>WHAT IT NEEDS · voltage and current</figcaption><canvas id="armNeed"></canvas>
        ${legend([['voltage (V)',COL.purple],['current / motor (A)',COL.orange],['limits',COL.red,1]])}</figure>
    </div>
    <figure class="panel" style="margin-top:12px"><figcaption>SOFTWARE HANDOFF · paste-ready values (check units and sign conventions on the robot)</figcaption>
      <div class="eq">// CTRE Phoenix 6 (Talon FX). Arm units: mechanism rotations, with
// Feedback.SensorToMechanismRatio = ${f4(m.G)}   and 0 = arm horizontal (needed for Arm_Cosine)
Slot0.GravityType = GravityTypeValue.Arm_Cosine
Slot0.kS = ${f4(ff.kS)}      // V        (static friction: measure it, not calculated)
Slot0.kG = ${f4(ff.kG)}      // V        to hold the arm level
Slot0.kV = ${f4(ff.kV*rot)}      // V per rot/s
Slot0.kA = ${f4(ff.kA*rot)}      // V per rot/s²
MotionMagic.MotionMagicCruiseVelocity = ${f4(pr.vm/rot)}   // rot/s
MotionMagic.MotionMagicAcceleration   = ${f4(pr.am/rot)}   // rot/s²
MotionMagic.MotionMagicJerk           = ${f4(pr.jm/rot)}   // rot/s³ (0 = trapezoid)

// WPILib (radians)
new ArmFeedforward(${f4(ff.kS)}, ${f4(ff.kG)}, ${f4(ff.kV)}, ${f4(ff.kA)});   // kS, kG, kV, kA
new TrapezoidProfile.Constraints(${f4(pr.vm)}, ${f4(pr.am)});        // rad/s, rad/s²
new SingleJointedArmSim(
    new DCMotor(12, ${f4(v.ts*v.eff/100)}, ${f4(v.is)}, ${f4(v.if)}, ${f4(v.fs*Math.PI/30)}, ${n}),   // ${motor}; stall torque × ${fmtNum(v.eff,0)}% gearbox efficiency
    ${f4(m.G)}, ${f4(m.J)}, ${f4(effL)},          // gearing, MOI at the arm (kg·m², incl. rotors and shafts), length (m)*
    ${f4(v.a0/deg)}, ${f4(v.a1/deg)}, true, ${f4(v.a0/deg)});   // min, max, gravity, start (rad)
// * SingleJointedArmSim treats the arm as a uniform rod, so this "length" (1.5·g·J / T_g) makes its
//   gravity match this arm. It is not the real arm length.</div></figure>`;
  return h;
}
function armStep3Plots(v, r){
  const cp = document.getElementById('armProf'), cn = document.getElementById('armNeed');
  if (!r.p3 || !r.p3.pr || !cp || !cn) return;
  const pr = r.p3.pr, deg = 180/Math.PI, step = Math.max(1, Math.floor(pr.T.length/600));
  const pick = arr => arr.map((y, i) => [pr.T[i], y]).filter((p, i) => i % step === 0 || i === arr.length - 1);
  const ang = pick(pr.X.map(x => x*deg)), spd = pick(pr.W.map(w => w*deg/10));
  let yr = range([...ang.map(p => p[1]), ...spd.map(p => p[1]), 0]);
  let f = frame(cp, [0, pr.time], [Math.min(0, yr[0])*1.08, yr[1]*1.08], 's', null, 'time (s)', 'angle (°)  /  speed (°/s ÷ 10)');
  drawSeries(f, [{ pts:ang, col:COL.blue, w:2.5 }, { pts:spd, col:COL.green, w:2 }]);
  const vol = pick(pr.V), cur = pick(pr.I);
  yr = range([...vol.map(p => p[1]), ...cur.map(p => p[1]), v.volt, v.ilim > 0 ? v.ilim : 0, 0]);
  f = frame(cn, [0, pr.time], [Math.min(0, yr[0])*1.08, yr[1]*1.08], 's', null, 'time (s)', 'voltage (V)  /  current per motor (A)');
  const lim = [{ pts:[[0, v.volt], [pr.time, v.volt]], col:COL.red, w:1.2, dash:1 }];
  if (v.ilim > 0) lim.push({ pts:[[0, v.ilim], [pr.time, v.ilim]], col:COL.red, w:1.2, dash:1 });
  drawSeries(f, [{ pts:vol, col:COL.purple, w:2.5 }, { pts:cur, col:COL.orange, w:2 }, ...lim]);
}
