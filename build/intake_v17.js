/* ---------- Intake ----------
   The roller has to pull a game piece in faster than the robot drives onto it, or it just pushes the piece along
   the floor. A common rule is roller surface speed ≈ 2 × drivetrain speed: the piece then comes in at about the
   drivetrain's speed relative to the robot. From that target the calculator finds the ratio for any motor, the
   pulling force at the current limit, and the WCP wheels that fit the roller. */
// Swerve module presets: SDS MK4i ratios (L1 8.14, L2 6.75, L3 6.12 : 1) on 4 in wheels. Check your own module.
const SWERVE = { mk4i_l1:{ label:'SDS MK4i L1 (8.14 : 1)', G:8.14, wheel:101.6 }, mk4i_l2:{ label:'SDS MK4i L2 (6.75 : 1)', G:6.75, wheel:101.6 },
  mk4i_l3:{ label:'SDS MK4i L3 (6.12 : 1)', G:6.12, wheel:101.6 }, custom:{ label:'Custom ratio and wheel' } };
// Drivetrain top speed from a motor, a module ratio and a wheel (m/s)
const driveFree = (rpm, G, wheelMm) => rpm/G/60*Math.PI*wheelMm/1000;
// For one motor and roller ratio: pulling force at the roller surface (N, all motors) at a current, and the roller's surface speed
function rollerForce(m, n, G, effPct, ilim, rollerMm){
  const kT = m.ts/(m.is - m.if), i = ilim > 0 ? Math.min(ilim, m.is) : m.is;
  return n*kT*(i - m.if)*G*effPct/100/(rollerMm/2000);
}
const INTAKE = {
  id:'intake', group:'Mechanisms', title:'Intake',
  lede:'Roller speed from your drivetrain speed: the ratio every motor needs, how hard the roller pulls, how long a piece takes to come in, and WCP wheels that fit.',
  inputs:[
    {section:'Drivetrain'},
    {key:'dmode', label:'Drivetrain speed from', type:'select', def:'module', options:[{value:'module', label:'Swerve module and motor'}, {value:'speed', label:'Type the speed'}]},
    {key:'module', label:'Module', type:'select', def:'mk4i_l2', showIf:v => v.dmode === 'module', options:Object.entries(SWERVE).map(([value, m]) => ({value, label:m.label})),
      help:'SDS MK4i ratios on 4 in wheels. Check your own module’s ratio and pick Custom if it differs.'},
    {key:'dmotor', label:'Drive motor', type:'select', def:'krakenx60', showIf:v => v.dmode === 'module', options:motorOptions()},
    {key:'dG', label:'Drive ratio', kind:'ratio', def:6.75, showIf:v => v.dmode === 'module' && v.module === 'custom'},
    {key:'dwheel', label:'Drive wheel diameter', kind:'lenS', def:101.6, showIf:v => v.dmode === 'module' && v.module === 'custom'},
    {key:'dspeed', label:'Drivetrain speed', kind:'speed', def:4.8, showIf:v => v.dmode === 'speed'},
    {key:'dpct', label:'Speed you drive at', kind:'pct', def:100, help:'% of the drivetrain’s free speed. Lower it to your measured top speed if you know it.'},
    {key:'k', label:'Roller speed ÷ drive speed', kind:'none', def:2, help:'2 is the common rule: the piece comes in at about the robot’s own speed. 1.5 still works; below 1 the roller pushes the piece away.'},
    {section:'Roller'},
    {key:'roller', label:'Roller (wheel) diameter', kind:'lenS', def:50.8},
    {key:'travel', label:'Distance the piece travels in', kind:'lenS', def:304.8, help:'From first touch to where it’s held. Sets the intake time.'},
    {key:'wbore', label:'Wheel bore', type:'select', def:'1/2in Hex', options:[{value:'any', label:'Any'}, ...[...new Set(WCP_PARTS.filter(p => p.type === 'wheel').map(p => p.bore))].map(b => ({value:b, label:boreLabel(b)}))]},
    {key:'nwheels', label:'Wheels on the roller', kind:'count', def:4},
    {key:'p_wheel', type:'pick', def:''},
    {section:'Roller motor'},
    ...motorInputs('', 'krakenx44'),
    {key:'n', label:'Number of motors', kind:'count', def:1},
    {key:'ilim', label:'Current limit / motor', kind:'amp', def:40, help:'Stator current limit. 0 = none.'},
    {key:'run', label:'Runs at', kind:'pct', def:85, help:'% of the motor’s free speed when it is pulling a piece in. Loaded rollers usually run at 80–90%.'},
    {key:'G', label:'Your ratio (0 = use recommended)', kind:'ratio', def:0},
    {key:'eff', label:'Gearbox efficiency', kind:'pct', def:95},
  ],
  onChange(key, v){ return fillMotor(key, v); },
  compute(v){
    const warnings = [];
    if (!motorOk(v)) return { bad:true, warnings:[MOTOR_BAD] };
    if (!(v.roller > 0)) return { bad:true, warnings:['Roller diameter must be bigger than zero.'] };
    const mod = SWERVE[v.module] || SWERVE.custom, dm = MOTOR_DB[v.dmotor] || MOTOR_DB.krakenx60;
    const dFree = v.dmode === 'speed' ? v.dspeed : driveFree(dm.rpm, mod.G || v.dG, mod.wheel || v.dwheel);
    const drive = dFree*v.dpct/100, target = v.k*drive;                  // m/s
    const rollerRpm = target/(Math.PI*v.roller/1000)*60;
    const motorRun = v.fs*v.run/100, Grec = motorRun/rollerRpm, G = v.G > 0 ? v.G : Grec;
    const surf = motorRun/G/60*Math.PI*v.roller/1000;                     // roller surface speed at the run point
    const me = { ts:v.ts, is:v.is, if:v.if };
    const force = rollerForce(me, v.n, G, v.eff, v.ilim, v.roller), stallForce = rollerForce(me, v.n, G, v.eff, 0, v.roller);
    const tIn = v.travel/1000/Math.max(surf - drive, 1e-9);               // the piece comes in at roller speed − robot speed (relative to the robot)
    if (v.k < 1) warnings.push('Below 1× the roller is slower than the robot, so it pushes the piece away instead of pulling it in.');
    if (v.G > 0 && surf < 0.95*target) warnings.push(`Your ratio gives ${fmtNum(surf/drive,2)}× drive speed, below your ${fmtNum(v.k,2)}× target.`);
    if (G < 1) warnings.push('A ratio below 1 speeds the roller up, which costs pulling force. Check the roller is big enough.');
    // every motor: the ratio it needs and how hard it then pulls
    const table = Object.entries(MOTOR_DB).map(([key, m]) => {
      const g = m.rpm*v.run/100/rollerRpm;
      return { key, m, G:g, force:rollerForce(m, v.n, g, v.eff, v.ilim, v.roller) };
    }).sort((a, b) => b.force - a.force);
    // WCP wheels with this diameter
    const odIn = v.roller/25.4, all = WCP_PARTS.filter(p => p.type === 'wheel' && Math.abs(p.od - odIn) < 0.02);
    let wheels = all.filter(p => v.wbore === 'any' || p.bore === v.wbore), relaxed = false;
    if (!wheels.length && all.length){ wheels = all; relaxed = true; }
    wheels.sort((a, b) => (a.style === b.style ? 0 : a.style < b.style ? -1 : 1) || (a.durometer || 0) - (b.durometer || 0));
    const wheel = wheels.find(p => p.sku === v.p_wheel) || wheels[0] || null;
    const sizes = [...new Set(WCP_PARTS.filter(p => p.type === 'wheel').map(p => p.od))].sort((a, b) => a - b);
    return { dFree, drive, target, rollerRpm, Grec, G, surf, force, stallForce, tIn, table, wheels, wheel, relaxed, sizes, warnings, mod };
  },
  renderOut(el, v, r){
    if (r.bad){ el.innerHTML = warnBox(r.warnings); return; }
    const N = x => fmtK(x, 'force');
    const row = x => `<tr class="${x.key === v.motor ? 'now' : ''}"><td>${x.m.label}</td><td class="mono" style="white-space:nowrap">${fmtNum(x.G,2)} : 1</td><td class="mono" style="white-space:nowrap">${N(x.force)}</td>
      <td><button class="btn" data-set='${JSON.stringify({ motor:x.key, fs:x.m.rpm, ts:x.m.ts, if:x.m.if, is:x.m.is, G:+x.G.toFixed(3) })}'>Use</button></td></tr>`;
    el.innerHTML = `
      <div class="tiles">
        ${tile(v.G > 0 ? 'Your ratio' : 'Recommended ratio', fmtNum(r.G,2)+' : 1', 'primary')}
        ${tile('Roller surface speed', fmtK(r.surf,'speed') + `<div style="font-size:12px;font-weight:400;opacity:.75">${fmtNum(r.surf/r.drive,2)}× drive speed</div>`, 'primary')}
        ${tile('Pulling force', N(r.force) + `<div style="font-size:12px;font-weight:400;opacity:.75">at ${v.ilim > 0 ? fmtK(v.ilim,'amp') : 'stall'} per motor</div>`, 'primary')}
        ${tile('Drivetrain speed', fmtK(r.drive,'speed'))}
        ${tile('Roller target', fmtK(r.target,'speed'))}
        ${tile('Roller speed', Math.round(r.rollerRpm*(r.surf/r.target))+' rpm')}
        ${tile('Time to bring a piece in', fmtNum(r.tIn,2)+' s')}
        ${tile('Force at stall', N(r.stallForce))}
      </div>
      ${warnBox(r.warnings)}
      <p class="help">Pulling force = the motors’ torque at the current limit, through the ratio, at the roller’s surface. It is the most the roller can pull before the motors stall; grip and squish decide how much of it reaches the piece. The piece comes in at the roller speed minus the robot’s speed.</p>
      <div class="panels two">
        <figure class="panel"><figcaption>EVERY MOTOR · the ratio it needs for ${fmtNum(v.k,2)}× drive speed, strongest pull first</figcaption>
          <table class="dark"><tr><th>Motor</th><th>Ratio</th><th>Pull at the limit</th><th></th></tr>
          ${r.table.filter((x, i) => i < 8 || x.key === v.motor).map(row).join('')}</table>
          <details><summary class="dim" style="cursor:pointer;margin-top:8px">All ${r.table.length} motors</summary>
            <table class="dark">${r.table.filter((x, i) => i >= 8 && x.key !== v.motor).map(row).join('')}</table></details></figure>
        <figure class="panel"><figcaption>WCP WHEELS · ${fmtNum(v.roller/25.4,3)}" roller</figcaption>
          ${r.wheel ? `<div style="margin:6px 0">
            <select class="pick" data-key="p_wheel">${r.wheels.map(p => `<option value="${p.sku}" ${p === r.wheel ? 'selected' : ''}>${p.sku} · ${p.style} · ${p.width.replace('in','"')} wide · ${boreLabel(p.bore)}${p.durometer ? ' · ' + p.durometer + 'A' : ''}</option>`).join('')}</select>
              ${r.relaxed ? `<div class="dim">none in ${boreLabel(v.wbore)}; showing other bores</div>` : ''}
              <div style="margin-top:6px"><a href="${wcpUrl(r.wheel)}" target="_blank" rel="noopener">${r.wheel.name} ↗</a></div></div>
            <p class="note">Softer wheels (lower A) grip and squish more; harder ones last longer. ${r.wheels.length} WCP wheels at this size.</p>`
          : `<p class="note">WCP doesn’t list a ${fmtNum(v.roller/25.4,3)}" wheel. Their wheel sizes: ${r.sizes.map(s => `<button class="btn" data-set='${JSON.stringify({ roller:+(s*25.4).toFixed(3) })}'>${s}"</button>`).join(' ')}</p>`}
        </figure>
      </div>
      ${r.wheel ? orderHtml(Array(Math.max(1, Math.round(v.nwheels))).fill(r.wheel)) : ''}`;
  },
  validation(){
    const d = defaultsFor(this), r = this.compute(d), k60 = MOTOR_DB.krakenx60;
    const free = 6065/6.75/60*Math.PI*0.1016;
    const tgt = 2*free, need = d.fs*0.85/(tgt/(Math.PI*0.0508)*60);
    const fHand = 1*d.ts/(d.is - d.if)*(40 - d.if)*need*0.95/0.0254;
    const worst = Math.max(...r.table.map(x => Math.abs(x.m.rpm*0.85/x.G/60*Math.PI*0.0508 - tgt)));
    return [
      { name:'MK4i L2, Kraken X60: drive speed = 6065 rpm ÷ 6.75 × π × 4 in', expected:free, got:r.dFree, unit:'m/s', tol:1e-9 },
      { name:'Recommended ratio = motor speed at 85% ÷ roller rpm for 2× drive speed', expected:need, got:r.Grec, unit:':1', tol:1e-9 },
      { name:'… gives exactly 2× drive speed at the roller', expected:2, got:r.surf/r.drive, unit:'×', tol:1e-12 },
      { name:'Pulling force = k_T·(I − I_free)·G·eff ÷ roller radius (40 A)', expected:fHand, got:r.force, unit:'N', tol:1e-9 },
      { name:'Every motor’s ratio in the table hits the target speed (largest error)', expected:0, got:worst, unit:'m/s', tol:1e-12 },
      { name:'WCP wheels at 2 in: each listed wheel is 2 in (count wrong)', expected:0, got:r.wheels.filter(p => Math.abs(p.od - 2) > 1e-9).length, unit:'', tol:0 },
    ];
  },
  docs(){ return `
    <div><h3>How it works</h3>
      <div class="eq">drive speed      v_d = motor rpm ÷ module ratio ÷ 60 × π × wheel diameter × (speed you drive at)
roller target    v_r = k × v_d                  (k ≈ 2 is the common rule)
roller rpm       = v_r ÷ (π × roller diameter) × 60
ratio            = motor rpm × (runs at) ÷ roller rpm
pulling force    F = n · k_T·(I_limit − I_free) · ratio · efficiency ÷ roller radius,   k_T = stall torque ÷ (stall − free current)
time to come in  = travel ÷ (v_r − v_d)</div>
      <p><b>Why 2×?</b> The robot drives onto the piece at the drivetrain’s speed. If the roller’s surface only matched that, the piece would sit still against the robot while the roller rubbed over it. At 2× the piece comes in at about the robot’s own speed, which is quick but still controllable. Lower k for pieces that bounce out, raise it if pieces arrive faster than you drive.</p>
      <p><b>Wheels</b> come from WCP’s product list (${WCP_PARTS.filter(p => p.type === 'wheel').length} flex and aluminum wheels, read on ${WCP_DATE}), matched by diameter and bore. Swerve presets are SDS MK4i ratios; check your module.</p>
    </div>
    <div><h3>Validation</h3>${validationTable(this)}</div>`; }
};
