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
