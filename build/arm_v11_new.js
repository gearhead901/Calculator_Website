// Holding current per motor for a total ratio G (worst angle). k_T is per motor amp, with efficiency.
const armHoldI = (v, hold, G) => hold/((v.ts*v.eff/100/(v.is - v.if))*G)/Math.max(1, Math.round(v.n)) + v.if;
// Step 1 model: one ideal stage of ratio G and no shaft inertias yet (only the motor rotors).
const armPlain = (v, G) => ({ ...v, s1a:1, s1b:G, s1J:0, s2a:0, s2b:0, s3a:0, s3b:0, s4a:0, s4b:0 });
const ARM = {
  id:'arm', group:'Power Transmission', title:'Arm',
  lede:'Size an arm in two steps. Step 1: enter the motor and the arm, and search ratios for the fastest one that holds the arm within your current target. Step 2: enter your real gear stages and their inertias, and refine.',
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
        {key:'s'+k+'a', label:`Stage ${k} driver`, kind:'teeth', def:[12,18,15,0][k-1], help:k === 1 ? 'Tooth counts, or 1 → 5 for a 5:1 planetary stage. Aim for the ratio Step 1 recommends.' : undefined},
        {key:'s'+k+'b', label:`Stage ${k} driven`, kind:'teeth', def:[60,54,105,0][k-1]},
        {key:'s'+k+'J', label:`Stage ${k} output shaft inertia`, kind:'moi', def:0, showIf:used,
          help:k === 1 ? 'Everything spinning on the shaft after this stage: driven gear, the next pinion, shaft, hubs, sprockets, even a flywheel. Get it from CAD. The last stage’s shaft is the arm shaft.' : undefined},
      ];
    }),
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
    return { hold, holdAt, rows, rec, fastest, ref, warnings };
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
      const s = f.sim, m = f.m, diff = rec ? (m.G/rec.G - 1)*100 : NaN;
      html += `
      <div class="tiles">
        ${tile('Your stages', fmtNum(m.G,2)+' : 1', 'primary')}
        ${tile('vs recommended', rec ? (diff >= 0 ? '+' : '−')+fmtNum(Math.abs(diff),1)+' %' : '—')}
        ${tile('Time to end angle', s.reached ? fmtNum(s.time,3)+' s' : (s.stuck ? 'stalls' : `> ${v.tmax} s`), 'primary')}
        ${tile('Holding current / motor', fmtK(f.holdI,'amp'), 'primary')}
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
    el.innerHTML = html;
    armPlots(v, r);
  },
