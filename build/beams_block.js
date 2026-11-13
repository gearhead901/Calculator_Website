/* ---------- 4n. Beams & columns (shared material + cross-section parts) ---------- */
// E, G in GPa; density g/cm³ — same values as ambcalc.com (ref/materials.json).
// Sy = yield strength in MPa, only used by Column Buckling. Typical handbook values
// (6061-T6, 7075-T6, A36 mild steel, 304 annealed) — check your supplier's sheet.
const BEAM_MATS = {
  al7075:{ label:'7075-T6 Aluminum', E:71.7, G:26.9, d:2.81, Sy:503 },
  al6061:{ label:'6061-T6 Aluminum', E:68.9, G:26,   d:2.7,  Sy:276 },
  steel: { label:'Carbon Steel',     E:206,  G:70,   d:7.84, Sy:250 },
  ss:    { label:'Stainless Steel',  E:193,  G:77,   d:8.03, Sy:215 },
  custom:{ label:'Custom' },
};
// Section properties in mm: A (mm²), I (mm⁴, for bending with the load along "height"), J (mm⁴, torsion), c (mm, farthest fiber)
function section(v){
  const t = v.thick;
  switch (v.sect){
    case 'hex':  { const s = v.hex; return { A:Math.sqrt(3)/2*s*s, I:5*Math.sqrt(3)/144*s**4, J:0.1154*s**4, c:s/2 }; }
    case 'round':{ const d = v.od; return { A:Math.PI/4*d*d, I:Math.PI/64*d**4, J:Math.PI/32*d**4, c:d/2 }; }
    case 'rtube':{ const D = v.od, d = Math.max(0, D - 2*t); return { A:Math.PI/4*(D*D - d*d), I:Math.PI/64*(D**4 - d**4), J:Math.PI/32*(D**4 - d**4), c:D/2 }; }
    case 'rect': { const b = v.width, h = v.height, L = Math.max(b,h), S = Math.min(b,h);
      return { A:b*h, I:b*h**3/12, J:L*S**3*(1/3 - 0.21*S/L*(1 - S**4/(12*L**4))), c:h/2 }; }   // J: Roark's formula
    case 'box':  { const b = v.width, h = v.height, bi = Math.max(0, b - 2*t), hi = Math.max(0, h - 2*t);
      return { A:b*h - bi*hi, I:(b*h**3 - bi*hi**3)/12, J:2*t*(b-t)**2*(h-t)**2/(b + h - 2*t), c:h/2 }; }  // J: thin-wall (Bredt)
    default:     return { A:v.cA, I:v.cI, J:v.cJ, c:NaN };
  }
}
// The Material + Cross section part of the form, shared by all four Beams & Columns calculators.
// o.G = ask for shear modulus, o.Sy = ask for yield strength, o.hLabel / o.iLabel = field labels.
function matSecInputs(o = {}){
  return [
    {section:'Material'},
    {key:'mat', label:'Material', type:'select', def:'al6061', options:Object.entries(BEAM_MATS).map(([value,m]) => ({ value, label:m.label }))},
    {key:'E', label:"Young's modulus", kind:'gpa', def:68.9, showIf:v => v.mat === 'custom'},
    ...(o.G ? [{key:'G', label:'Shear modulus', kind:'gpa', def:26, showIf:v => v.mat === 'custom'}] : []),
    ...(o.Sy ? [{key:'Sy', label:'Yield strength', kind:'mpa', def:276, showIf:v => v.mat === 'custom'}] : []),
    {key:'dens', label:'Density', kind:'dens', def:2.7, showIf:v => v.mat === 'custom'},
    {section:'Cross section'},
    {key:'sect', label:'Shape', type:'select', def:'box', options:[{value:'hex', label:'Hex shaft'}, {value:'round', label:'Round bar'}, {value:'rtube', label:'Round tube'},
      {value:'rect', label:'Rectangle bar'}, {value:'box', label:'Rectangular tube'}, {value:'custom', label:'Custom (type A, I, J)'}]},
    {key:'hex', label:'Hex size (across flats)', kind:'lenS', def:12.7, showIf:v => v.sect === 'hex'},
    {key:'od', label:'Outside diameter', kind:'lenS', def:25.4, showIf:v => v.sect === 'round' || v.sect === 'rtube'},
    {key:'width', label:'Width', kind:'lenS', def:25.4, showIf:v => v.sect === 'rect' || v.sect === 'box'},
    {key:'height', label:o.hLabel || 'Height', kind:'lenS', def:50.8, showIf:v => v.sect === 'rect' || v.sect === 'box'},
    {key:'thick', label:'Wall thickness', kind:'lenS', def:1.5875, showIf:v => v.sect === 'rtube' || v.sect === 'box'},
    {key:'cA', label:'Area A', kind:'area', def:300, showIf:v => v.sect === 'custom'},
    {key:'cI', label:o.iLabel || 'Area moment I', kind:'inertia', def:100000, showIf:v => v.sect === 'custom'},
    {key:'cJ', label:'Torsion constant J', kind:'inertia', def:150000, showIf:v => v.sect === 'custom'},
  ];
}
// When a material is picked from the list, copy its numbers into the (hidden) custom fields.
function matOnChange(key, v){
  if (key !== 'mat' || v.mat === 'custom') return false;
  const m = BEAM_MATS[v.mat]; v.E = m.E; v.G = m.G; v.dens = m.d; v.Sy = m.Sy; return true;
}
const beamMat = v => v.mat === 'custom' ? { E:v.E, G:v.G, d:v.dens, Sy:v.Sy } : BEAM_MATS[v.mat];
const badSection = ['Check the dimensions — area, I and length must all be bigger than zero (is the wall thicker than half the tube?).'];
const mpaFmt = x => Number.isFinite(x) ? (state.units === 'imperial' ? fmtNum(x*145.0377,0)+' psi' : fmtNum(x,1)+' MPa') : '—';
const sectionTiles = (s, weight) => tile('Weight', fmtK(weight,'mass')) + tile('Area A', fmtK(s.A,'area')) + tile('Area moment I', fmtK(s.I,'inertia')) + tile('Torsion constant J', fmtK(s.J,'inertia'));

// Results + deflected-shape plot shared by 3-Point Bending and Cantilever.
// ends: 'simple' (supports both ends), 'fixed' (clamped both ends) or 'cant' (clamped left end only)
function bendingOut(el, v, r, ends){
  if (r.bad){ el.innerHTML = warnBox(r.warnings); return; }
  el.innerHTML = `
    <div class="tiles">
      ${tile('Max deflection', fmtK(r.defl,'lenS',1), 'primary')}
      ${tile('Max bending stress', mpaFmt(r.stress), 'primary')}
      ${sectionTiles(r.s, r.weight)}
    </div>
    ${warnBox(r.warnings)}
    <figure class="panel"><figcaption>DEFLECTED SHAPE · exaggerated</figcaption><canvas id="beamPlot" style="height:220px"></canvas>
      ${legend([['beam',COL.blue],['load',COL.orange]])}</figure>`;
  const cv = document.getElementById('beamPlot');
  const dm = Math.max(...r.shape.map(p => p[1])) || 1;
  const f = frame(cv, [0, v.l], [-dm*1.6, dm*0.6], 'lenS', null, `position along beam (${U('lenS')[0]})`, 'deflection (scaled)');
  drawSeries(f, [{ pts:[[0,0],[v.l,0]], col:COL.grid, w:1 }, { pts:r.shape.map(p => [p[0], -p[1]]), col:COL.blue, w:3 }]);
  f.c.fillStyle = COL.white;
  const wall = x => f.c.fillRect(x, f.Y(dm*0.5), 6, f.Y(-dm*1.5) - f.Y(dm*0.5));
  const pin  = x => { f.c.beginPath(); f.c.moveTo(f.X(x), f.Y(0)); f.c.lineTo(f.X(x) - 8, f.Y(0) + 14); f.c.lineTo(f.X(x) + 8, f.Y(0) + 14); f.c.fill(); };
  if (ends === 'simple'){ pin(0); pin(v.l); }
  else { wall(f.X(0) - 4); if (ends === 'fixed') wall(f.X(v.l) - 2); }
  const ya = -r.shape[Math.round(v.a/v.l*100)][1];
  f.c.strokeStyle = COL.orange; f.c.lineWidth = 2.5; f.c.beginPath(); f.c.moveTo(f.X(v.a), f.Y(ya + dm*0.55)); f.c.lineTo(f.X(v.a), f.Y(ya + 0.05*dm)); f.c.stroke();
  f.c.fillStyle = COL.orange; f.c.beginPath(); f.c.moveTo(f.X(v.a), f.Y(ya)); f.c.lineTo(f.X(v.a) - 5, f.Y(ya) - 9); f.c.lineTo(f.X(v.a) + 5, f.Y(ya) - 9); f.c.fill();
}
const bigBendWarn = (defl, l) => defl > l/100 ? ['That is a lot of bending (over 1% of the length) — the simple beam formulas start to lose accuracy, and it may yield.'] : [];
const sectionNote = `<p><b>Differences from ambcalc:</b> these pages use exact section formulas. ambcalc's hex area is 25% low (it uses the corner-to-corner formula), its round-tube I uses a thin-wall shortcut, and its rectangular-tube I is roughly half the true value for a square tube (so its deflections there are about 2× too big). Its rectangular-tube J also has a typo (b − 2 instead of b − t). Deflections for hex, round bar and rectangle bar match.</p>`;

/* ---------- 4n-1. 3-point bending ---------- */
const BEAM = {
  id:'beam', group:'Beams & Columns', title:'3-Point Bending',
  lede:'A tube, shaft or bar held at both ends with a load pushing on it in between. How far does it sag, how hard is the metal working, and what does it weigh?',
  inputs:[
    {key:'ends', label:'Ends', type:'select', def:'simple', options:[{value:'simple', label:'Resting on supports (true 3-point)'}, {value:'fixed', label:'Clamped both ends'}],
      help:'Resting = the ends can tilt, like a tube sitting on two blocks. Clamped = bolted or welded so the ends can\'t tilt, which makes it about 4× stiffer.'},
    ...matSecInputs({ G:true, hLabel:'Height (load direction)' }),
    {section:'Load'},
    {key:'l', label:'Span ℓ (between supports)', kind:'lenS', def:762},
    {key:'a', label:'Load position a', kind:'lenS', def:381, help:'Distance from the left support to the load. Half the span = load in the middle.'},
    {key:'F', label:'Force F', kind:'force', def:222.41108},
  ],
  onChange:matOnChange,
  compute(v){
    const s = section(v), m = beamMat(v);
    if (!(s.A > 0 && s.I > 0 && v.l > 0)) return { bad:true, warnings:badSection };
    if (!(v.a >= 0 && v.a <= v.l)) return { bad:true, warnings:['Load position must be between 0 and the span.'] };
    const E = m.E*1e3, EI = E*s.I, l = v.l, F = v.F, a = v.a, b = l - a, shape = [];   // N/mm² (MPa), mm
    const weight = l*s.A*m.d/1e6;                                                        // mm³ · g/cm³ → kg
    let defl, M;
    if (v.ends === 'fixed'){
      const A = Math.max(a, b), B = l - A;                                               // A = longer side
      defl = 2*F*A**3*B**2/(3*EI*(3*A + B)**2);
      M = Math.max(F*A*B*B/(l*l), F*A*A*B/(l*l), 2*F*A*A*B*B/l**3);                      // end moments and moment under the load
      for (let i = 0; i <= 100; i++){ const x = l*i/100;
        shape.push([x, x <= a ? F*b*b*x*x*(3*a*l - (3*a + b)*x)/(6*EI*l**3) : F*a*a*(l-x)**2*(3*b*l - (3*b + a)*(l-x))/(6*EI*l**3)]); }
    } else {
      const bs = Math.min(a, b);                                                         // load's distance to the nearer support
      defl = F*bs*(l*l - bs*bs)**1.5/(9*Math.sqrt(3)*l*EI);
      M = F*a*b/l;
      for (let i = 0; i <= 100; i++){ const x = l*i/100;
        shape.push([x, x <= a ? F*b*x*(l*l - b*b - x*x)/(6*EI*l) : F*a*(l-x)*(l*l - a*a - (l-x)**2)/(6*EI*l)]); }
    }
    return { s, m, weight, defl, M, stress:M*s.c/s.I, shape, warnings:bigBendWarn(defl, l) };
  },
  renderOut(el, v, r){ bendingOut(el, v, r, v.ends); },
  validation(){
    const base = { mat:'steel', sect:'round', od:20, l:1000, F:1000 }, E = 206e3, I = Math.PI/64*20**4;
    const simple = this.compute({ ...base, ends:'simple', a:500 }), fixed = this.compute({ ...base, ends:'fixed', a:500 });
    const off = this.compute({ ...base, ends:'simple', a:250 });
    const sq = section({ sect:'box', width:50, height:50, thick:3 });
    return [
      { name:'Resting, center load: F·ℓ³/(48·E·I)', expected:1000*1e9/(48*E*I), got:simple.defl, unit:'mm', tol:1e-9 },
      { name:'Clamped, center load: F·ℓ³/(192·E·I)', expected:1000*1e9/(192*E*I), got:fixed.defl, unit:'mm', tol:1e-9 },
      { name:'Resting, center load: moment F·ℓ/4', expected:1000*1000/4, got:simple.M, unit:'N·mm', tol:1e-6 },
      { name:'Drawn shape peak = formula (resting, center)', expected:simple.defl, got:Math.max(...simple.shape.map(p => p[1])), unit:'mm', tol:1e-9 },
      { name:'Resting, load at ¼ span: drawn shape peak ≈ formula (within 0.1 %)', expected:off.defl, got:Math.max(...off.shape.map(p => p[1])), unit:'mm', tol:off.defl*1e-3 },
      { name:'50×50×3 tube: I = (50⁴ − 44⁴)/12', expected:(50**4 - 44**4)/12, got:sq.I, unit:'mm⁴', tol:1e-6 },
      ...AMB_CHECKS.beam(this),
    ];
  },
  docs(){ return `
    <div><h3>How it works</h3>
      <div class="eq">resting on supports, load at a (b = distance to the nearer support):
  δ = F·b·(ℓ² − b²)^1.5 / (9·√3·ℓ·E·I)      center load: δ = F·ℓ³ / (48·E·I)
  M = F·a·(ℓ − a) / ℓ
clamped both ends (A = longer side, B = shorter):
  δ = 2·F·A³·B² / (3·E·I·(3A + B)²)          center load: δ = F·ℓ³ / (192·E·I)
bending stress:  σ = M·c / I        (c = distance from the middle to the outside edge)</div>
      <p>"3-point" is the classic test setup: two supports and one load. Real robot frames are somewhere between resting and clamped, so the two options bracket the answer.</p>
      ${sectionNote}
    </div>
    <div><h3>Validation</h3>${validationTable(this)}</div>`; }
};

/* ---------- 4n-2. Cantilever ---------- */
const CANT = {
  id:'cant', group:'Beams & Columns', title:'Cantilever',
  lede:'A tube, shaft or bar clamped at one end and sticking out, with a load on it — like an arm, a bumper bracket or a shaft overhanging its bearing.',
  inputs:[
    ...matSecInputs({ G:true, hLabel:'Height (load direction)' }),
    {section:'Load'},
    {key:'l', label:'Length ℓ', kind:'lenS', def:762},
    {key:'a', label:'Load position a', kind:'lenS', def:762, help:'Distance from the clamped end to the load. Equal to the length = load at the tip.'},
    {key:'F', label:'Force F', kind:'force', def:222.41108},
  ],
  onChange:matOnChange,
  compute(v){
    const s = section(v), m = beamMat(v);
    if (!(s.A > 0 && s.I > 0 && v.l > 0)) return { bad:true, warnings:badSection };
    if (!(v.a >= 0 && v.a <= v.l)) return { bad:true, warnings:['Load position must be between 0 and the length.'] };
    const EI = m.E*1e3*s.I, l = v.l, F = v.F, a = v.a, shape = [];
    const defl = F*a*a*(3*l - a)/(6*EI), M = F*a;
    for (let i = 0; i <= 100; i++){ const x = l*i/100;
      shape.push([x, x <= a ? F*x*x*(3*a - x)/(6*EI) : F*a*a*(3*x - a)/(6*EI)]); }
    return { s, m, weight:l*s.A*m.d/1e6, defl, M, stress:M*s.c/s.I, shape, warnings:bigBendWarn(defl, l) };
  },
  renderOut(el, v, r){ bendingOut(el, v, r, 'cant'); },
  validation(){
    const base = { mat:'steel', sect:'round', od:20, l:1000, F:1000 }, E = 206e3, I = Math.PI/64*20**4;
    const tip = this.compute({ ...base, a:1000 }), mid = this.compute({ ...base, a:500 });
    return [
      { name:'Tip load: F·ℓ³/(3·E·I)', expected:1000*1e9/(3*E*I), got:tip.defl, unit:'mm', tol:1e-9 },
      { name:'Load at half length: 5·F·ℓ³/(48·E·I)', expected:5*1000*1e9/(48*E*I), got:mid.defl, unit:'mm', tol:1e-9 },
      { name:'Tip load: moment at the clamp F·ℓ', expected:1000*1000, got:tip.M, unit:'N·mm', tol:1e-6 },
      { name:'Drawn shape peak = formula (tip load)', expected:tip.defl, got:Math.max(...tip.shape.map(p => p[1])), unit:'mm', tol:1e-9 },
    ];
  },
  docs(){ return `
    <div><h3>How it works</h3>
      <div class="eq">load at a from the clamped end:   δ_tip = F·a²·(3ℓ − a) / (6·E·I)
tip load (a = ℓ):                 δ = F·ℓ³ / (3·E·I)
biggest moment is at the clamp:   M = F·a        σ = M·c / I</div>
      <p>A cantilever is 16× floppier than the same beam resting on two supports with a center load, which is why overhangs are where frames flex first.</p>
      ${sectionNote}
    </div>
    <div><h3>Validation</h3>${validationTable(this)}</div>`; }
};

/* ---------- 4n-3. Torsion twist ---------- */
const TWIST = {
  id:'twist', group:'Beams & Columns', title:'Torsion Twist',
  lede:'How far does a shaft or tube twist when you put a torque through it? Handy for long hex shafts, intakes driven from one end, and drivetrain axles.',
  inputs:[
    ...matSecInputs({ G:true }),
    {section:'Load'},
    {key:'l', label:'Length ℓ', kind:'lenS', def:762, help:'Length between where the torque goes in and where it comes out.'},
    {key:'T', label:'Torque T', kind:'torque', def:11.298483},
  ],
  onChange:matOnChange,
  compute(v){
    const s = section(v), m = beamMat(v);
    if (!(s.A > 0 && s.J > 0 && v.l > 0)) return { bad:true, warnings:badSection };
    const GJ = m.G*1e3*s.J, T = v.T*1e3;                                   // N·mm²  ,  N·mm
    const angle = T*v.l/GJ*180/Math.PI;                                     // degrees
    const round = v.sect === 'round' || v.sect === 'rtube';
    const tau = round ? T*s.c/s.J : NaN;                                    // MPa, exact only for round sections
    const warnings = angle > 5 ? ['That is more than 5° of twist — check the shaft isn\'t close to yielding.'] : [];
    return { s, m, weight:v.l*s.A*m.d/1e6, angle, stiff:v.T/angle, tau, round, warnings };
  },
  renderOut(el, v, r){
    if (r.bad){ el.innerHTML = warnBox(r.warnings); return; }
    el.innerHTML = `
      <div class="tiles">
        ${tile('Twist angle', fmtNum(r.angle,3)+'°', 'primary')}
        ${tile('Twist stiffness', fmtK(r.stiff,'torque')+' per °', 'primary')}
        ${r.round ? tile('Max shear stress', mpaFmt(r.tau)) : ''}
        ${sectionTiles(r.s, r.weight)}
      </div>
      ${warnBox(r.warnings)}`;
  },
  validation(){
    const base = { mat:'steel', sect:'round', od:20, l:1000, T:100 }, G = 70e3, J = Math.PI/32*20**4;
    const r = this.compute(base);
    return [
      { name:'Twist: T·ℓ/(G·J)', expected:100e3*1000/(G*J)*180/Math.PI, got:r.angle, unit:'°', tol:1e-9 },
      { name:'Round bar shear stress: 16·T/(π·d³)', expected:16*100e3/(Math.PI*20**3), got:r.tau, unit:'MPa', tol:1e-9 },
      { name:'Round bar J = π·d⁴/32', expected:J, got:r.s.J, unit:'mm⁴', tol:1e-6 },
    ];
  },
  docs(){ return `
    <div><h3>How it works</h3>
      <div class="eq">twist angle:   θ = T·ℓ / (G·J)        (radians — × 180/π for degrees)
shear stress (round bar or tube only):   τ = T·r / J
J (round bar) = π·d⁴/32       J (hex, across flats s) ≈ 0.1154·s⁴</div>
      <p>J is the "torsion constant" — how hard the shape is to twist. Closed tubes have a big J for their weight; open shapes (C-channel, angle) have almost none, so they twist easily. Shear stress is only shown for round sections, where the simple formula is exact.</p>
    </div>
    <div><h3>Validation</h3>${validationTable(this)}</div>`; }
};

/* ---------- 4n-4. Column buckling ---------- */
const COLUMN_ENDS = { pp:1, fp:0.7, ff:0.5, fr:2 };     // effective-length factor K (theory)
// Critical load (N) of one column — Euler for long columns, Johnson's parabola for short ones.
function columnPcr(E, Sy, A, I, Le){
  const r = Math.sqrt(I/A), lam = Le/r, lamC = Math.PI*Math.sqrt(2*E/Sy);
  const euler = Math.PI**2*E*I/Le**2;
  const johnson = A*(Sy - (Sy*lam/(2*Math.PI))**2/E);
  return { r, lam, lamC, euler, johnson, Pcr:lam >= lamC ? euler : johnson, long:lam >= lamC };
}
const BUCKLE = {
  id:'buckle', group:'Beams & Columns', title:'Column Buckling',
  lede:'Push on the end of a long, thin tube or rod and it suddenly bows sideways and folds. How much load can it take before that happens?',
  inputs:[
    {key:'ends', label:'Ends', type:'select', def:'pp', options:[{value:'pp', label:'Pinned both ends (K = 1)'}, {value:'fp', label:'Fixed one end, pinned the other (K = 0.7)'},
      {value:'ff', label:'Fixed both ends (K = 0.5)'}, {value:'fr', label:'Fixed one end, other end free (K = 2)'}],
      help:'Pinned = free to tilt (a bolt through a hole). Fixed = can\'t tilt (welded, or clamped in a long bearing). Free = nothing holds the top end sideways.'},
    ...matSecInputs({ Sy:true, iLabel:'Smallest area moment I' }),
    {section:'Load'},
    {key:'l', label:'Length ℓ', kind:'lenS', def:762},
    {key:'P', label:'Applied load P (pushing)', kind:'force', def:2224.1108},
  ],
  onChange:matOnChange,
  compute(v){
    const s = section(v), m = beamMat(v);
    if (!(s.A > 0 && s.I > 0 && v.l > 0)) return { bad:true, warnings:badSection };
    if (!(m.Sy > 0)) return { bad:true, warnings:['Yield strength must be bigger than zero.'] };
    // A column buckles the easy way, so use the smaller I (rectangles and boxes are weaker about their width).
    const Iother = (v.sect === 'rect' || v.sect === 'box') ? section({ ...v, width:v.height, height:v.width }).I : s.I;
    const I = Math.min(s.I, Iother), E = m.E*1e3, K = COLUMN_ENDS[v.ends], Le = K*v.l;
    const c = columnPcr(E, m.Sy, s.A, I, Le), sf = c.Pcr / v.P, Py = m.Sy*s.A;
    const curve = [];
    for (let i = 1; i <= 120; i++){ const L = v.l*2*i/120; curve.push([L, columnPcr(E, m.Sy, s.A, I, K*L).Pcr]); }
    const warnings = [];
    if (v.P > 0 && sf < 1) warnings.push('The applied load is more than the critical load — this column will buckle (or yield).');
    else if (v.P > 0 && sf < 2) warnings.push('Less than 2× margin. Real columns are a bit bent and loaded a bit off-center, so they fail below the textbook number — aim for 2× or more.');
    return { s, m, I, K, Le, sf, Py, curve, weight:v.l*s.A*m.d/1e6, stress:v.P/s.A, ...c, warnings };
  },
  renderOut(el, v, r){
    if (r.bad){ el.innerHTML = warnBox(r.warnings); return; }
    el.innerHTML = `
      <div class="tiles">
        ${tile('Critical load', fmtK(r.Pcr,'force'), 'primary')}
        ${tile('Safety factor', v.P > 0 ? fmtNum(r.sf,2)+'×' : '—', 'primary')}
        ${tile('Slenderness Kℓ/r', fmtNum(r.lam,0))}
        ${tile('Type', r.long ? 'Long column (Euler)' : 'Short column (Johnson)')}
        ${tile('Compressive stress', mpaFmt(r.stress))}
        ${tile('Weight', fmtK(r.weight,'mass'))}
        ${tile('Area A', fmtK(r.s.A,'area'))}
        ${tile('Smallest I', fmtK(r.I,'inertia'))}
      </div>
      ${warnBox(r.warnings)}
      <figure class="panel"><figcaption>CRITICAL LOAD VS LENGTH · same shape, material and ends</figcaption><canvas id="buckPlot" style="height:240px"></canvas>
        ${legend([['critical load',COL.blue],['applied load',COL.orange,true],['your length',COL.white,true]])}</figure>`;
    const cv = document.getElementById('buckPlot');
    const ymax = Math.max(r.Py, v.P)*1.1;
    const f = frame(cv, [0, v.l*2], [0, ymax], 'lenS', 'force', `column length (${U('lenS')[0]})`, `load (${U('force')[0]})`);
    drawSeries(f, [{ pts:[[0, r.Py], ...r.curve], col:COL.blue, w:3 }]);
    if (v.P > 0) drawSeries(f, [{ pts:[[0, v.P], [v.l*2, v.P]], col:COL.orange, w:2, dash:true }]);
    vline(f, v.l, COL.white, 0, ymax);
    f.c.fillStyle = r.sf >= 1 ? COL.green : COL.red; f.c.strokeStyle = COL.panel;
    f.c.beginPath(); f.c.arc(f.X(v.l), f.Y(Math.min(r.Pcr, ymax)), 5, 0, 2*Math.PI); f.c.fill(); f.c.stroke();
  },
  validation(){
    const base = { mat:'steel', sect:'round', od:20, l:1000, P:1000 }, E = 206e3, I = Math.PI/64*20**4, A = Math.PI/4*20**2, Sy = 250;
    const pp = this.compute({ ...base, ends:'pp' }), fr = this.compute({ ...base, ends:'fr' });
    const lamC = Math.PI*Math.sqrt(2*E/Sy), Lc = lamC*Math.sqrt(I/A);
    const at = columnPcr(E, Sy, A, I, Lc);
    const bar = this.compute({ ...base, ends:'pp', sect:'rect', width:40, height:10 });
    const shortCol = this.compute({ ...base, ends:'pp', l:100 });
    return [
      { name:'Pinned both ends: π²·E·I/ℓ²', expected:Math.PI**2*E*I/1000**2, got:pp.Pcr, unit:'N', tol:1e-6 },
      { name:'Fixed–free: π²·E·I/(2ℓ)²', expected:Math.PI**2*E*I/2000**2, got:fr.Pcr, unit:'N', tol:1e-6 },
      { name:'Euler and Johnson meet at the transition slenderness', expected:at.euler, got:at.johnson, unit:'N', tol:1e-6 },
      { name:'Short column (100 mm): Johnson A·(Sy − (Sy·λ/2π)²/E)', expected:A*(Sy - (Sy*(100/Math.sqrt(I/A))/(2*Math.PI))**2/E), got:shortCol.Pcr, unit:'N', tol:1e-6 },
      { name:'40×10 bar buckles about its thin side: I = 40·10³/12', expected:40*10**3/12, got:bar.I, unit:'mm⁴', tol:1e-9 },
    ];
  },
  docs(){ return `
    <div><h3>How it works</h3>
      <div class="eq">effective length:  Lₑ = K·ℓ        radius of gyration:  r = √(I / A)
slenderness:  λ = Lₑ / r          transition:  λc = π·√(2·E / Sy)
long column  (λ ≥ λc), Euler:    P_cr = π²·E·I / Lₑ²
short column (λ &lt; λc), Johnson:  P_cr = A·(Sy − (Sy·λ / 2π)² / E)
safety factor = P_cr / P</div>
      <p>Long, thin columns fail by bowing sideways at a load that depends only on stiffness (E and I), not strength. Short, stubby ones crush before they can bow, so the yield strength Sy takes over — Johnson's formula blends the two. The plot shows how fast the critical load drops as the column gets longer.</p>
      <p>K values are the textbook ones. Real "fixed" ends are never perfectly rigid, so engineering codes use slightly bigger K (about 0.65 fixed–fixed, 0.8 fixed–pinned, 2.1 fixed–free). Yield strengths are typical handbook values — use your supplier's number for anything important.</p>
    </div>
    <div><h3>Validation</h3>${validationTable(this)}</div>`; }
};

