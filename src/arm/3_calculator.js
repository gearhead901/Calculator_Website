// Holding current per motor for a total ratio G (worst angle). k_T is per motor amp, with efficiency.
const armHoldI = (v, hold, G) => hold/((v.ts*v.eff/100/(v.is - v.if))*G)/Math.max(1, Math.round(v.n)) + v.if;
// Step 1 model: one ideal stage of ratio G and no shaft inertias yet (only the motor rotors).
const armPlain = (v, G) => ({ ...v, s1a:1, s1b:G, s1J:0, s2a:0, s2b:0, s3a:0, s3b:0, s4a:0, s4b:0 });
const ARM = {
  id:'arm', group:'Power Transmission', title:'Arm',
  lede:'Size an arm in three steps. Step 1: search ratios for the fastest one that holds the arm within your current target. Step 2: enter your real gear stages and their inertias. Step 3: pick a motion profile with software, and get the feedforward gains, profile limits and a simulation setup.',
  inputs:[
    {section:'Step 1 · Motor'},
    ...motorInputs(),
    {key:'n', label:'Number of motors', kind:'count', def:2},
    {key:'volt', label:'Voltage', kind:'volt', def:12},
    {key:'ilim', label:'Current limit / motor', kind:'amp', def:60, help:'Stator current limit. 0 = none.'},
    {key:'Jr', label:'Rotor inertia / motor', kind:'moi', def:0, help:'The motor rotor plus the pinion on its shaft, from the vendor or your CAD. It counts × ratio², so at high ratios it can rival the whole arm.'},
    {key:'eff', label:'Gearbox efficiency', kind:'pct', def:90},
    {section:'Step 1 · Arm and requirements'},
    {key:'len', label:'Pivot to load', kind:'lenS', def:609.6, help:'Distance from the pivot to the load’s center of mass. The arm tube is assumed to be this long too.'},
    {key:'mload', label:'Load at the end', kind:'mass', def:4.5359237, help:'Treated as a point mass (intake, game piece, wrist).'},
    {key:'mtube', label:'Arm tube mass', kind:'mass', def:0.90718474, help:'Treated as a uniform rod from the pivot to the load. 0 = none.'},
    {key:'a0', label:'Start angle', kind:'deg', def:-45, help:'0° = horizontal, 90° = straight up, −90° = hanging straight down.'},
    {key:'a1', label:'End angle', kind:'deg', def:90},
    {key:'hmax', label:'Max holding current / motor', kind:'amp', def:15, help:'The most current you’re happy to hold the arm with at its worst angle, all match long. Lower runs cooler but needs a bigger ratio (slower).'},
    {section:'Step 1 · Ratio search'},
    {key:'rmin', label:'Search from ratio', kind:'ratio', def:20},
    {key:'rmax', label:'Search to ratio', kind:'ratio', def:200},
    {key:'rstep', label:'Step', kind:'ratio', def:10},
    {key:'tmax', label:'Max time', kind:'s', def:3},
    {section:'Step 2 · Gear stages (driver → driven, 0 = unused)'},
    ...ARM_STAGES.flatMap(k => {
      const used = v => v['s'+k+'a'] > 0 && v['s'+k+'b'] > 0;
      return [
        {key:'s'+k+'a', label:`Stage ${k} driver`, kind:'teeth', def:[12,18,16,0][k-1], help:k === 1 ? 'Tooth counts, or 1 → 5 for a 5:1 planetary stage. Aim for the ratio Step 1 recommends.' : undefined},
        {key:'s'+k+'b', label:`Stage ${k} driven`, kind:'teeth', def:[60,42,96,0][k-1]},
        {key:'s'+k+'J', label:`Stage ${k} output shaft inertia`, kind:'moi', def:0, showIf:used,
          help:k === 1 ? 'Everything spinning on the shaft after this stage: driven gear, the next pinion, shaft, hubs, sprockets, even a flywheel. Get it from CAD. The last stage’s shaft is the arm shaft.' : undefined},
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
  ],
  onChange(key, v){ return fillMotor(key, v); },
  compute(v){
    if (!motorOk(v)) return { bad:true, warnings:[MOTOR_BAD] };
    if (!(v.len > 0 && v.mload >= 0 && v.mtube >= 0 && v.mload + v.mtube > 0)) return { bad:true, warnings:['Pivot-to-load distance must be above zero, and the arm needs some mass.'] };
    if (!(v.a1 > v.a0)) return { bad:true, warnings:['End angle must be bigger than the start angle (this calculator lifts the arm).'] };
    if (!(v.eff > 0 && v.tmax > 0)) return { bad:true, warnings:['Efficiency and max time must be above zero.'] };
    if (!(v.rmin > 0 && v.rmax > v.rmin && v.rstep > 0)) return { bad:true, warnings:['The ratio search needs 0 < "from" < "to" and a step above zero.'] };
    if ((v.rmax - v.rmin)/v.rstep > 200) return { bad:true, warnings:['That search has more than 200 ratios. Use a bigger step.'] };
    const n = Math.max(1, Math.round(v.n)), warnings = [];
    // Holding: the worst angle in the range is the one closest to horizontal
    const th0 = v.a0*Math.PI/180, th1 = v.a1*Math.PI/180, cross = th0 <= 0 && th1 >= 0;
    const cosMax = cross ? 1 : Math.max(Math.cos(th0), Math.cos(th1));
    const holdAt = cross ? 0 : (Math.cos(th0) >= Math.cos(th1) ? v.a0 : v.a1);
    const hold = armModel(armPlain(v, 1)).Cg*cosMax;
    const Rm = 12/(v.is - v.if);
    const kTn = v.ts*v.eff/100/(v.is - v.if);                          // torque per motor amp (with efficiency)
    const maxTat = G => kTn*(Math.min(v.is, v.ilim > 0 ? v.ilim : Infinity) - v.if)*n*G;
    // ---- Step 1: ratio search (one ideal stage, motor rotors only) ----
    const rows = [];
    for (let i = 0; v.rmin + i*v.rstep <= v.rmax + 1e-9; i++){
      const G = v.rmin + i*v.rstep, sim = armSim(v, armModel(armPlain(v, G))), hI = armHoldI(v, hold, G);
      rows.push({ G, holdI:hI, heat:hI*hI*Rm, time:sim.reached ? sim.time : NaN, stuck:sim.stuck, margin:maxTat(G)/hold,
        armRpm:v.fs/G, peakI:Math.max(...sim.I.map(Math.abs))/n });
    }
    const okRows = rows.filter(x => Number.isFinite(x.time));
    const meets = okRows.filter(x => x.holdI <= v.hmax);
    const rec = meets.length ? meets.reduce((a, b) => b.time < a.time ? b : a) : null;
    if (!rec){
      if (okRows.length) warnings.push(`No ratio from ${fmtNum(v.rmin,0)} to ${fmtNum(v.rmax,0)} : 1 holds the arm at or under ${fmtNum(v.hmax,1)} A per motor. Search higher ratios, add a motor or counterbalance the arm.`);
      else warnings.push('No ratio in the search lifts the arm to the end angle in time. Check the motor, the load and the search range.');
    }
    const fastest = okRows.length ? okRows.reduce((a, b) => b.time < a.time ? b : a) : null;
    // ---- Step 2: refine with the real stages ----
    let ref = null;
    const m = armModel(v);
    if (m.stages.length){
      const sim = armSim(v, m), holdI = armHoldI(v, hold, m.G), w2 = [];
      if (sim.stuck) w2.push('Gravity wins: the motors can’t lift the arm past the heaviest point with these stages and current limit.');
      else if (!sim.reached) w2.push(`It did not reach the end angle within ${v.tmax} s.`);
      if (v.ilim > 0 && holdI > v.ilim) w2.push(`Holding at ${fmtNum(holdAt,0)}° needs ${fmtNum(holdI,1)} A per motor, more than the ${fmtNum(v.ilim,0)} A current limit.`);
      else if (holdI > v.hmax) w2.push(`Holding at ${fmtNum(holdAt,0)}° needs ${fmtNum(holdI,1)} A per motor, over your ${fmtNum(v.hmax,1)} A target. Use a bigger ratio.`);
      ref = { m, sim, holdI, heat:holdI*holdI*Rm, margin:maxTat(m.G)/hold, peakI:Math.max(...sim.I.map(Math.abs))/n,
        limited:sim.lim.some(Boolean), warnings:w2 };
    }
    if (!(v.Jr > 0)) warnings.push('Rotor inertia is 0. At high ratios the motors can be a big share of the inertia; enter it if you know it.');
    const p3 = ref ? armStep3(v, ref.m, cosMax) : null;
    return { hold, holdAt, rows, rec, fastest, ref, p3, warnings };
  },
  renderOut(el, v, r){
    if (r.bad){ el.innerHTML = warnBox(r.warnings); return; }
    const rec = r.rec, f = r.ref;
    const step = t => `<h3 style="margin:22px 0 10px;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)">${t}</h3>`;
    const row = x => `<tr class="${rec && x === rec ? 'now' : ''}"><td>${fmtNum(x.G,1)} : 1</td><td>${fmtNum(x.holdI,1)}</td><td>${fmtNum(x.heat,1)}</td>
      <td>${x.stuck ? 'stalls' : Number.isFinite(x.time) ? fmtNum(x.time,3) : '&gt; '+v.tmax}</td><td>${fmtNum(x.peakI,0)}</td><td>${fmtNum(x.margin,2)} ×</td><td>${fmtNum(x.armRpm,1)}</td></tr>`;
    let html = `${step('Step 1 · Initial ratio search')}
      <div class="tiles">
        ${tile('Recommended ratio', rec ? fmtNum(rec.G,1)+' : 1' : '—', 'primary')}
        ${tile('Its holding current / motor', rec ? fmtK(rec.holdI,'amp') : '—', 'primary')}
        ${tile('Its time to end angle', rec ? fmtNum(rec.time,3)+' s' : '—')}
        ${tile('Fastest ratio (any current)', r.fastest ? fmtNum(r.fastest.G,1)+' : 1' : '—')}
        ${tile('Worst holding torque', fmtK(r.hold,'torque'))}
        ${tile('Worst holding angle', fmtNum(r.holdAt,0)+'°')}
      </div>
      ${warnBox(r.warnings)}
      <p class="help">Recommended = the fastest ratio in the search whose holding current is at or under ${fmtNum(v.hmax,1)} A per motor. The search uses one ideal stage and only the motor rotors’ inertia; Step 2 adds your real stages.</p>
      <div class="panels two">
        <figure class="panel"><figcaption>HOLDING CURRENT / MOTOR vs RATIO</figcaption><canvas id="armHold"></canvas>
          ${legend([['holding current (A)',COL.orange],['your target',COL.red,1],['recommended',COL.green]])}</figure>
        <figure class="panel"><figcaption>TIME TO END ANGLE vs RATIO</figcaption><canvas id="armSweep"></canvas>
          ${legend([['time to end angle (s)',COL.white],['recommended',COL.green]])}</figure>
      </div>
      <figure class="panel" style="margin-top:12px"><figcaption>RATIO SEARCH · highlighted row = recommended</figcaption>
        <table class="dark"><tr><th>Ratio</th><th>Holding A / motor</th><th>Holding heat W / motor</th><th>Time to end (s)</th><th>Peak A / motor</th><th>Torque margin</th><th>Arm free speed (rpm)</th></tr>
        ${r.rows.map(row).join('')}</table></figure>
      ${step('Step 2 · Refine with your gear stages')}`;
    if (!f) html += `<p class="help">Enter your gear stages (Step 2 inputs) to simulate the real gearbox.</p>`;
    else {
      const s = f.sim, m = f.m;
      html += `
      <div class="tiles">
        ${tile('Your stages', fmtNum(m.G,2)+' : 1', 'primary')}
        ${tile('Holding current / motor', fmtK(f.holdI,'amp')+`<div style="font-size:12px;font-weight:400;opacity:.75">target ${fmtK(v.hmax,'amp')}</div>`, 'primary')}
        ${tile('Time to end angle', s.reached ? fmtNum(s.time,3)+' s' : (s.stuck ? 'stalls' : `> ${v.tmax} s`), 'primary')}
        ${tile('Peak current / motor', fmtK(f.peakI,'amp'))}
        ${tile('Hit current limit?', f.limited ? 'Yes' : 'No')}
        ${tile('Inertia at the arm', fmtK(m.J,'moi'))}
        ${tile('Torque margin', fmtNum(f.margin,2)+' ×')}
        ${tile('Holding heat / motor', fmtNum(f.heat,1)+' W')}
      </div>
      ${warnBox(f.warnings)}
      <p class="help">Torque margin = most torque the motors can make at the current limit ÷ the worst holding torque. Holding heat assumes the arm is held still at the worst angle.</p>
      <figure class="panel"><figcaption>INERTIA AT THE ARM · where it comes from</figcaption>
        <table class="dark"><tr><th>Part</th><th>Inertia at the arm</th><th>Share</th></tr>
        ${m.parts.map(p => `<tr><td>${p.label}</td><td>${fmtK(p.J,'moi')}</td><td>${fmtNum(p.J/m.J*100,1)} %</td></tr>`).join('')}
        <tr><td><b>Total</b></td><td><b>${fmtK(m.J,'moi')}</b></td><td></td></tr></table></figure>
      <figure class="panel" style="margin-top:12px"><figcaption>MOTION AT ${fmtNum(m.G,2)} : 1</figcaption><canvas id="armSim"></canvas>
        ${legend([['arm angle (°)',COL.blue],['current / motor (A)',COL.orange],['current-limited',COL.red,1]])}</figure>`;
    }
    el.innerHTML = html + armStep3Html(v, r);
    armPlots(v, r); armStep3Plots(v, r);
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
      ...this.searchChecks(base),
      ...this.profileChecks(base),
    ];
  },
  profileChecks(base){
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
  },
  docs(){ return `
    <div><h3>How it works</h3>
      <div class="eq">gravity  T_g = g·(m_load·L + m_tube·L/2)·cos θ      θ = 0 horizontal, 90° up
inertia  J = n·J_rotor·G² + Σ J_shaft·(ratio after that shaft)² + m_load·L² + m_tube·L²/3
current  i = (V − ω·G·k_B)/R + I_f   (capped at the limit)
accel.   α = (k_T·(i − I_f)·G − T_g) / J
holding  I_hold = T_g,max / (k_T·G·n) + I_f      per motor, at the worst angle
Step 1   pick = the fastest ratio with I_hold ≤ your max holding current
k_T = T_s·eff·n/(I_s−I_f)·n   k_B = 12/ω_f   R = 12/(I_s−I_f)</div>
      <p>The motor model is the same one Mechanism Startup uses. Every 1 ms it works out the current from the back-EMF, caps it at the limit, subtracts gravity for the arm’s current angle and steps the angle and speed forward with RK4. The end time is interpolated to the moment the arm crosses the end angle.</p>
      <p><b>Why the inertia table matters:</b> a part spinning faster than the arm feels heavier to the motors by the square of its speed ratio. A motor rotor behind a 100:1 gearbox counts 10 000 times its own inertia. Each stage’s inertia box is for everything on that stage’s output shaft, so a flywheel or heavy sprocket shows up where it really is.</p>
      <div class="eq">Step 3 feedforward (WPILib ArmFeedforward form):
  V  = kS·sign(ω) + kG·cos θ + kV·ω + kA·α
  kG = R·T_g / (k_T·G)      kV = G·k_B      kA = R·J / (k_T·G)      (R, k_T for all motors together)
fastest profile:  cruise ω ≤ (V − kS − kG·cos θ_worst) / kV
                  accel  α ≤ the current limit, and the voltage left at cruise speed</div>
      <p><b>Step 3</b> builds the profile (trapezoid, or an S-curve with a jerk limit) every 1 ms and works out the voltage and current the feedforward needs at each instant, assuming the arm follows the profile exactly. It also finds the fastest profile the gearbox can follow even at the worst angle for gravity, and scales it for Gentle, Brisk and Race. The handoff values are in Phoenix 6 mechanism rotations (set SensorToMechanismRatio to the gear ratio, and zero the arm at horizontal for Arm_Cosine) and in WPILib radians.</p>
      <p><b>Step 1</b> searches ratios from “from” to “to” in fixed steps, like the team spreadsheet’s gear ratio planner. For each ratio it works out the holding current at the worst angle (the one closest to horizontal) and simulates the lift with one ideal stage and the motor rotors’ inertia. It recommends the <b>fastest ratio whose holding current is at or under your target</b>: a bigger ratio holds with less current but lifts slower. <b>Step 2</b> uses your real stages and shaft inertias. Neither step includes a counterbalance or braking to a stop at the end angle yet.</p>
    </div>
    <div><h3>Validation</h3>
      <p>Checks: the Step 1 holding current and pick; the inertia sum by hand; an energy balance for a swing where the current limit holds the whole time (constant motor torque, gravity changing with the angle); a tiny swing through horizontal against Mechanism Startup; and the gravity torque from the team spreadsheet this calculator was based on.</p>
      ${validationTable(this)}</div>`; }
};
