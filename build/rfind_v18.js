/* ---------- Ratio Finder ----------
   Finds 1–3 stage reductions that hit a target ratio using only parts WCP sells in the bores you need.
   Each stage is a gear pair, a belt (two pulleys), a chain (two sprockets) or, on the motor only, a PlanetaryX
   stack of 1–3 stages. Stage 1's driver sits on the motor (motor bore); every other gear, pulley or sprocket
   sits on a shaft (shaft bore). A planetary's output is a shaft, so the next stage starts on the shaft bore. */
// What sets each stage's ratio: the tooth counts of its gears, its belt pulleys or its chain sprockets
const RF_KINDS = { gear:'gears', belt:'pulleys', chain:'sprockets', planetary:'PlanetaryX' };
// Every tooth count WCP sells for one type, pitch and bore (bore 'any' = all), inside a tooth range
function rfTeeth(type, pitch, bore, lo, hi){
  return [...new Set(WCP_PARTS.filter(p => p.type === type && p.pitch === pitch && (bore === 'any' || p.bore === bore) && p.teeth >= lo && p.teeth <= hi).map(p => p.teeth))].sort((a, b) => a - b);
}
// The stage options for one stage position: [{ kind, ratio, a, b, label, pitch }]
function rfStageOptions(v, k){
  const allow = v['st' + k], out = [], drvBore = k === 1 ? v.mbore : v.sbore, rmin = v.target >= 1 ? 1 : 0.2;
  const pair = (kind, type, pitch, lo, hi) => {
    const A = rfTeeth(type, pitch, drvBore, lo, hi), B = rfTeeth(type, pitch, v.sbore, lo, hi), seen = new Map();
    A.forEach(a => B.forEach(b => {
      const r = b/a; if (r < rmin || r > 8 || r === 1) return;      // reductions only (unless the target speeds up); 1:1 does nothing
      const key = r.toFixed(9), prev = seen.get(key);
      if (!prev || a + b < prev.a + prev.b) seen.set(key, { kind, ratio:r, a, b, pitch, label:`${a}:${b} ${kind === 'gear' ? pitch : pitch}` });
    }));
    out.push(...seen.values());
  };
  if (allow === 'any' || allow === 'gear') pair('gear', 'gear', v.gdp, v.gmin, v.gmax);
  // 'both' searches each belt profile / chain size separately (a belt stage uses one profile on both pulleys)
  if (allow === 'any' || allow === 'belt') (v.btype === 'both' ? ['HTD 5mm', 'GT2 3mm'] : [v.btype]).forEach(t => pair('belt', 'pulley', t, v.pmin, v.pmax));
  if (allow === 'any' || allow === 'chain') (v.ctype === 'both' ? ['#25', '#35'] : [v.ctype]).forEach(t => pair('chain', 'sprocket', t, v.cmin, v.cmax));
  if (k === 1 && (allow === 'any' || allow === 'planetary')){
    const sets = WCP_PARTS.filter(p => p.type === 'planetary').map(p => p.ratio).sort((a, b) => a - b), seen = new Map();
    const add = stack => { const r = stack.reduce((x, y) => x*y, 1), key = String(r); if (!seen.has(key)) seen.set(key, { kind:'planetary', ratio:r, stack, label:stack.join('×') + ' PlanetaryX' }); };
    sets.forEach(a => { add([a]); sets.forEach(b => { if (b >= a){ add([a, b]); sets.forEach(c => { if (c >= b) add([a, b, c]); }); } }); });
    out.push(...seen.values());
  }
  return out.sort((x, y) => x.ratio - y.ratio);
}
// Options in a sorted list whose ratio is between lo and hi (binary search)
function rfWindow(list, lo, hi){
  let a = 0, b = list.length;
  while (a < b){ const m = (a + b) >> 1; if (list[m].ratio < lo) a = m + 1; else b = m; }
  const out = []; for (let i = a; i < list.length && list[i].ratio <= hi; i++) out.push(list[i]);
  return out;
}
const rfKey = x => x.kind === 'planetary' ? 'p' + x.stack.join('') : x.kind[0] + x.pitch.replace(/\W/g, '') + '.' + String(x.a).padStart(3, '0') + '-' + String(x.b).padStart(3, '0');
function rfSearch(v){
  const T = v.target, tol = v.tol/100, lo = T*(1 - tol), hi = T*(1 + tol), maxN = +v.stages;
  const L = [1, 2, 3].map(k => k <= maxN && (k === 1 || v['st' + k] !== 'none') ? rfStageOptions(v, k) : []);
  const sols = [], CAP = 20000;
  const push = st => { if (sols.length < CAP){ const R = st.reduce((x, s) => x*s.ratio, 1); sols.push({ st, R, err:R/T - 1 }); } };
  rfWindow(L[0], lo, hi).forEach(a => push([a]));
  if (maxN >= 2) L[0].forEach(a => rfWindow(L[1], lo/a.ratio, hi/a.ratio).forEach(b => push([a, b])));
  // a third stage only when one or two stages can't give at least 10 answers (fewer stages is the better build)
  // Stages 2 and 3 both sit on the shaft bore, so when they may be the same kinds, b → c and c → b are the same
  // answer: keep one order only.
  const same = v.st2 === v.st3;
  if (maxN >= 3 && sols.length < 10) L[0].forEach(a => L[1].forEach(b => rfWindow(L[2], lo/(a.ratio*b.ratio), hi/(a.ratio*b.ratio))
    .forEach(c => { if (!same || rfKey(b) <= rfKey(c)) push([a, b, c]); })));
  const size = s => s.st.reduce((n, x) => n + (x.kind === 'planetary' ? 40*x.stack.length : x.a + x.b), 0);   // a rough "how big" score
  sols.sort((x, y) => x.st.length - y.st.length || Math.abs(x.err) - Math.abs(y.err) || size(x) - size(y));
  sols.forEach(s => { s.key = s.st.map(rfKey).join('_'); });
  return { sols, counts:L.map(l => l.length), capped:sols.length >= CAP };
}
const RFIND = {
  id:'rfind', group:'Power Transmission', title:'Ratio Finder',
  lede:'Type the ratio you want; get 1–3 stage reductions built only from parts WCP sells in your bores: gears, belt pulleys, chain sprockets and PlanetaryX, in any mix you allow. Pick one for its parts, center distances and order list.',
  inputs:[
    {section:'Target'},
    {key:'target', label:'Target ratio', kind:'ratio', def:50},
    {key:'tol', label:'Within', kind:'pct', def:2},
    {key:'stages', label:'Most stages', type:'select', def:'3', options:[{value:'1', label:'1'}, {value:'2', label:'2'}, {value:'3', label:'3'}]},
    {section:'Bores'},
    {key:'mbore', label:'Motor bore (stage 1 driver)', type:'select', def:'any', options:boreOptions('gear', 'pulley', 'sprocket'), help:'What the first gear, pulley or sprocket must fit on. A PlanetaryX mounts on the motor instead.'},
    {key:'sbore', label:'Shaft bore (everything else)', type:'select', def:'1/2in Hex', options:boreOptions('gear', 'pulley', 'sprocket')},
    {section:'What each stage can be'},
    ...[1, 2, 3].map(k => ({key:'st'+k, label:`Stage ${k}`, type:'select', def:'any', showIf:v => +v.stages >= k,
      options:[{value:'any', label:k === 1 ? 'Anything' : 'Gears, pulleys or sprockets'}, {value:'gear', label:'Gears'}, {value:'belt', label:'Belt pulleys'}, {value:'chain', label:'Chain sprockets'},
        ...(k === 1 ? [{value:'planetary', label:'PlanetaryX'}] : [])]})),
    {section:'Parts and tooth ranges'},
    {key:'gdp', label:'Gear pitch', type:'select', def:'20 DP', options:[{value:'20 DP', label:'20 DP'}, {value:'32 DP', label:'32 DP'}]},
    {key:'gmin', label:'Gears, fewest teeth', kind:'teeth', def:10}, {key:'gmax', label:'Gears, most teeth', kind:'teeth', def:84},
    {key:'btype', label:'Belt pulleys', type:'select', def:'HTD 5mm', options:[{value:'HTD 5mm', label:'HTD 5 mm'}, {value:'GT2 3mm', label:'GT2 3 mm'}, {value:'both', label:'HTD and GT2'}]},
    {key:'pmin', label:'Pulleys, fewest teeth', kind:'teeth', def:12}, {key:'pmax', label:'Pulleys, most teeth', kind:'teeth', def:60},
    {key:'ctype', label:'Chain sprockets', type:'select', def:'both', options:[{value:'both', label:'#25 and #35'}, {value:'#25', label:'#25 only'}, {value:'#35', label:'#35 only'}]},
    {key:'cmin', label:'Sprockets, fewest teeth', kind:'teeth', def:10}, {key:'cmax', label:'Sprockets, most teeth', kind:'teeth', def:72},
    {key:'p_sol', type:'pick', def:''},
    ...[1, 2, 3].flatMap(k => [{key:`p_r${k}a`, type:'pick', def:''}, {key:`p_r${k}b`, type:'pick', def:''}]),
  ],
  compute(v){
    const warnings = [];
    if (!(v.target > 0)) return { bad:true, warnings:['The target ratio must be bigger than zero.'] };
    const s = rfSearch(v), sol = s.sols.find(x => x.key === v.p_sol) || s.sols[0] || null;
    if (!s.sols.length) warnings.push(`Nothing within ${fmtNum(v.tol,1)}% of ${fmtNum(v.target,2)} : 1 with these bores and stage types. Widen the tolerance, allow more stages or stage types, or try “Any” bore.`);
    if ([v.st1, v.st2, v.st3].includes('chain') && v.sbore === '1/2in Hex')
      warnings.push('WCP’s ½″ hex sprockets are small (#25 up to 36 teeth, #35 up to 18). Their bigger sprockets are SplineXL plate sprockets, so set the shaft bore to “Any” or SplineXL for big chain reductions.');
    if (s.capped) warnings.push('Lots of answers: showing the best of the first 20,000. Tighten the tolerance to see fewer.');
    // parts for the chosen answer
    const rows = [], extra = [];
    if (sol) sol.st.forEach((x, i) => {
      const k = i + 1;
      if (x.kind === 'planetary'){
        x.stack.forEach(r => { const p = WCP_PARTS.find(q => q.type === 'planetary' && q.ratio === r); if (p) extra.push(p); });
        return;
      }
      const type = x.kind === 'gear' ? 'gear' : x.kind === 'belt' ? 'pulley' : 'sprocket';
      const prevPlanet = i > 0 && sol.st[i-1].kind === 'planetary';
      const row = (key, label, teeth, bore) => ({ key, label, teeth, type, pitch:x.pitch, bore, ...wcpMatch({ type, pitch:x.pitch, teeth, bore, pick:v[key] }) });
      rows.push(row(`p_r${k}a`, `Stage ${k} driver`, x.a, k === 1 && !prevPlanet ? v.mbore : v.sbore), row(`p_r${k}b`, `Stage ${k} driven`, x.b, v.sbore));
      if (x.kind === 'gear'){
        const ra = rows[rows.length-2].part, rb = rows[rows.length-1].part, ea = (ra && ra.cdTeeth) || x.a, eb = (rb && rb.cdTeeth) || x.b;
        x.cd = (ea + eb)/(2*parseFloat(x.pitch))*25.4;      // mm
      }
    });
    return { ...s, sol, rows, extra, warnings };
  },
  renderOut(el, v, r){
    if (r.bad){ el.innerHTML = warnBox(r.warnings); return; }
    const chip = x => `<span class="chip ${x.kind}">${x.kind === 'planetary' ? x.label : `${x.a}:${x.b} ${x.kind === 'gear' ? '' : x.pitch.replace('mm', ' mm') + ' '}${RF_KINDS[x.kind]}`}</span>`;
    const top = r.sols.slice(0, 40), sol = r.sol;
    const ansRow = s => `<tr class="${s === sol ? 'now' : ''}"><td class="mono" style="white-space:nowrap">${fmtNum(s.R,3)} : 1</td><td class="mono">${s.err >= 0 ? '+' : '−'}${fmtNum(Math.abs(s.err)*100,2)}%</td>
      <td>${s.st.map(chip).join(' → ')}</td><td><button class="btn" data-set='${JSON.stringify({ p_sol:s.key })}'>${s === sol ? 'Chosen' : 'Choose'}</button></td></tr>`;
    const stageInfo = sol ? sol.st.map((x, i) => {
      if (x.kind === 'gear') return `<li>Stage ${i+1}: ${x.a}:${x.b} ${x.pitch} gears, center distance <b>${fmtK(x.cd,'lenS')}</b></li>`;
      if (x.kind === 'planetary') return `<li>Stage ${i+1}: PlanetaryX ${x.stack.map(s => s + ':1').join(' + ')} on the motor. Add the base kit and hardware for your motor from <a href="https://wcproducts.com/products/wcp-planetaryx" target="_blank" rel="noopener">WCP’s PlanetaryX page ↗</a>.</li>`;
      const drive = x.kind === 'belt' ? (x.pitch === 'HTD 5mm' ? { drive:'htd5', pitch:5 } : { drive:'gt2', pitch:3 }) : (x.pitch === '#25' ? { drive:'c25', pitch:6.35 } : { drive:'c35', pitch:9.525 });
      return `<li>Stage ${i+1}: ${x.a}:${x.b} ${x.pitch} ${x.kind === 'belt' ? 'pulleys' : 'sprockets'}. ${gotoBtn('belt', { ...drive, n1:x.a, n2:x.b, step:x.kind === 'chain' ? 2 : 1 }, 'Size the ' + x.kind + ' →')}</li>`;
    }).join('') : '';
    el.innerHTML = `
      <div class="tiles">
        ${tile('Answers found', String(r.sols.length), 'primary')}
        ${sol ? tile('Chosen ratio', fmtNum(sol.R,3)+' : 1', 'primary') : ''}
        ${sol ? tile('Off target by', `${sol.err >= 0 ? '+' : '−'}${fmtNum(Math.abs(sol.err)*100,2)}%`) : ''}
        ${sol ? tile('Stages', String(sol.st.length)) : ''}
      </div>
      ${warnBox(r.warnings)}
      ${sol ? `<figure class="panel"><figcaption>THE CHOSEN REDUCTION · ${sol.st.map(chip).join(' → ')}</figcaption>
        <ul class="stagelist">${stageInfo}</ul>
        ${r.rows.length ? `<table class="dark"><tr><th>Where</th><th>Teeth</th><th>WCP part</th><th></th></tr>${partRows(r.rows)}</table>` : ''}</figure>
      ${orderHtml([...r.rows.map(x => x.part), ...r.extra])}` : ''}
      ${top.length ? `<figure class="panel" style="margin-top:12px"><figcaption>ANSWERS · fewest stages first, then closest · choose one to see its parts above</figcaption>
        <table class="dark"><tr><th>Ratio</th><th>Off by</th><th>Stages</th><th></th></tr>${top.slice(0, 15).map(ansRow).join('')}</table>
        ${top.length > 15 ? `<details><summary class="dim" style="cursor:pointer;margin-top:8px">More answers (${Math.min(r.sols.length, 40) - 15} more${r.sols.length > 40 ? ` of ${r.sols.length}` : ''})</summary>
          <table class="dark">${top.slice(15).map(ansRow).join('')}</table>
          ${r.sols.length > 40 ? `<p class="note">Showing 40 of ${r.sols.length}. Tighten the tolerance or limit the stage types to narrow it down.</p>` : ''}</details>` : ''}</figure>` : ''}`;
  },
  validation(){
    const d = defaultsFor(this), r = this.compute(d);
    const prodOK = r.sols.every(s => Math.abs(s.st.reduce((x, y) => x*y.ratio, 1) - s.R) < 1e-9);
    const inTol = r.sols.every(s => Math.abs(s.R/d.target - 1) <= d.tol/100 + 1e-12);
    // every gear / pulley / sprocket in the top answers exists at WCP in the bore it needs
    const missing = r.sols.slice(0, 40).reduce((n, s) => n + s.st.reduce((m, x, i) => {
      if (x.kind === 'planetary') return m;
      const type = x.kind === 'gear' ? 'gear' : x.kind === 'belt' ? 'pulley' : 'sprocket', b1 = i === 0 ? d.mbore : d.sbore;
      const has = (t, b) => WCP_PARTS.some(p => p.type === type && p.pitch === x.pitch && p.teeth === t && (b === 'any' || p.bore === b));
      return m + (has(x.a, b1) ? 0 : 1) + (has(x.b, d.sbore) ? 0 : 1);
    }, 0), 0);
    // a single exact stage: 12:60 gears (5:1) must be found when the target is 5
    const five = this.compute({ ...d, target:5, tol:0.01, stages:'1', st1:'gear', mbore:'any', sbore:'any' });
    const plan = this.compute({ ...d, target:60, tol:0.01, stages:'1', st1:'planetary' });
    return [
      { name:'Every answer’s ratio = the product of its stages', expected:1, got:prodOK ? 1 : 0, unit:'', tol:0 },
      { name:`Every answer is within ${d.tol}% of ${d.target} : 1 (1 = yes)`, expected:1, got:inTol ? 1 : 0, unit:'', tol:0 },
      { name:'Top 40 answers: every gear, pulley and sprocket is a WCP part in the bore it needs (count missing)', expected:0, got:missing, unit:'', tol:0 },
      { name:'Target 5 : 1, one gear stage → finds an exact answer', expected:5, got:five.sol ? five.sol.R : NaN, unit:':1', tol:1e-12 },
      { name:'Target 60 : 1, PlanetaryX only → 3 × 4 × 5', expected:60, got:plan.sol ? plan.sol.R : NaN, unit:':1', tol:1e-12 },
      { name:'… using one 3:1, one 4:1 and one 5:1 gear set (1 = yes)', expected:1, got:plan.extra.map(p => p.sku).sort().join(',') === 'WCP-1473,WCP-1474,WCP-1475' ? 1 : 0, unit:'', tol:0 },
    ];
  },
  docs(){ return `
    <div><h3>How it works</h3>
      <div class="eq">stage ratio = driven teeth / driver teeth     (gears, belt pulleys or chain sprockets; the belt or chain itself doesn't change it)
              PlanetaryX: 3, 4 or 5 per stage, up to 3 stages
total ratio = stage 1 × stage 2 × stage 3
kept if     |total / target − 1| ≤ tolerance</div>
      <p>For each stage position the finder lists every tooth pair WCP sells in the bores that stage needs: the first driver on the <b>motor bore</b>, everything else on the <b>shaft bore</b>. It then searches 1 and 2 stage combinations, and 3 stages only when that gives fewer than 10 answers (for the last stage it looks up only the ratios that can still land inside your tolerance, so it stays fast). Every stage is a reduction, unless your target itself is below 1. Answers are sorted by fewest stages, then by how close they are, then by size. When two pairs give the same ratio it keeps the smaller one.</p>
      <p>A PlanetaryX can only be stage 1: it mounts on the motor and its output is a shaft. Center distances for gear stages use WCP’s special spacing where a gear has one; belt and chain stages link to Chain &amp; Belt C-C to pick the belt or chain length. Parts come from WCP’s product list (${WCP_PARTS.length} parts, read on ${WCP_DATE}); check price and stock before ordering.</p>
    </div>
    <div><h3>Validation</h3>${validationTable(this)}</div>`; }
};
