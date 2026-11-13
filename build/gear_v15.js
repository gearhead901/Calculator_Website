const GEAR_POS = [1, 2, 3].flatMap(k => [['s'+k+'a', `Stage ${k} driver`, k], ['s'+k+'b', `Stage ${k} driven`, k]]);
const GEAR = {
  id:'gear', group:'Power Transmission', title:'Gear Ratio',
  lede:'Chain up to three gear stages behind a motor and see the output speed, wheel surface speed and the center distance of each stage. Pick WCP gears for each one and get an order list.',
  inputs:[
    {section:'Motor'},
    {key:'motor', label:'Motor', type:'select', def:'krakenx60',
      options:Object.entries(MOTORS).map(([v,m]) => ({value:v, label:m.label}))},
    {section:'Stages (driver → driven, 0 = unused)'},
    {key:'s1a', label:'Stage 1 driver', kind:'teeth', def:12}, {key:'s1b', label:'Stage 1 driven', kind:'teeth', def:60},
    {key:'s2a', label:'Stage 2 driver', kind:'teeth', def:18}, {key:'s2b', label:'Stage 2 driven', kind:'teeth', def:36},
    {key:'s3a', label:'Stage 3 driver', kind:'teeth', def:0},  {key:'s3b', label:'Stage 3 driven', kind:'teeth', def:0},
    {section:'Output'},
    {key:'wheel', label:'Wheel diameter', kind:'lenS', def:101.6},
    {key:'eff', label:'Realistic speed', kind:'pct', def:80, help:'Real mechanisms under load usually reach ~75–85% of free speed.'},
    {section:'WCP gears'},
    {key:'gdp', label:'Gear pitch', type:'select', def:'20 DP', options:[{value:'20 DP', label:'20 DP (most FRC gears)'}, {value:'32 DP', label:'32 DP'}, {value:'10 DP', label:'10 DP'}],
      help:'Sets the center distance too: C-C = (driver + driven teeth) / (2 × DP) inches.'},
    {key:'bore1', label:'Motor pinion bore', type:'select', def:'any', options:boreOptions('gear'), help:'The stage 1 driver sits on the motor shaft.'},
    {key:'bore2', label:'Bore of the other gears', type:'select', def:'1/2in Hex', options:boreOptions('gear')},
    ...GEAR_POS.map(([k]) => ({key:'p_'+k, type:'pick', def:''})),
  ],
  compute(v){
    const free = MOTORS[v.motor].rpm;
    const stages = [[v.s1a,v.s1b],[v.s2a,v.s2b],[v.s3a,v.s3b]].filter(s => s[0] > 0 && s[1] > 0);
    const ratio = stages.reduce((r,s) => r * s[1]/s[0], 1);
    const steps = [{ label:'Motor', rpm:free }];
    let rpm = free; stages.forEach((s,i) => { rpm = rpm * s[0]/s[1]; steps.push({ label:`After stage ${i+1}`, rpm }); });
    const surface = rpm/60 * Math.PI * v.wheel/1000;   // m/s
    // WCP gears for each used stage, and each stage's center distance. A gear with cdTeeth meshes at that tooth count's spacing.
    const dp = parseFloat(v.gdp), parts = [], cds = [];
    [1, 2, 3].forEach(k => {
      const a = v['s'+k+'a'], b = v['s'+k+'b'];
      if (!(a > 0 && b > 0)) return;
      const row = (key, label, teeth, bore) => ({ key:'p_'+key, label, teeth, type:'gear', pitch:v.gdp, bore, ...wcpMatch({ type:'gear', pitch:v.gdp, teeth, bore, pick:v['p_'+key] }) });
      const ra = row('s'+k+'a', `Stage ${k} driver`, a, k === 1 ? v.bore1 : v.bore2), rb = row('s'+k+'b', `Stage ${k} driven`, b, v.bore2);
      parts.push(ra, rb);
      const ea = (ra.part && ra.part.cdTeeth) || a, eb = (rb.part && rb.part.cdTeeth) || b;
      cds.push({ k, cd:(ea + eb)/(2*dp)*25.4, shifted:ea !== a || eb !== b, ea, eb });   // mm
    });
    return { free, ratio, rpm, surface, real: surface * v.eff/100, steps, parts, cds, warnings: stages.length ? [] : ['No stages entered — output is the motor shaft.'] };
  },
  renderOut(el, v, r){
    const max = Math.max(...r.steps.map(s => s.rpm)), rowH = 34, H = r.steps.length*rowH + 10;
    const bars = r.steps.map((s,i) => {
      const w = Math.max(2, s.rpm/max*300);
      return `<text x="0" y="${i*rowH+20}" fill="${COL.text}" font-size="12">${s.label}</text>
        <rect x="110" y="${i*rowH+6}" width="${w}" height="20" rx="4" fill="${i ? COL.blue : COL.purple}"/>
        <text x="${116+w}" y="${i*rowH+20}" fill="${COL.white}" font-size="12">${Math.round(s.rpm)} rpm</text>`; }).join('');
    el.innerHTML = `
      <div class="tiles">
        ${tile('Total ratio', fmtNum(r.ratio,2)+' : 1', 'primary')}
        ${tile('Output free speed', Math.round(r.rpm)+' rpm')}
        ${tile('Free surface speed', fmtK(r.surface,'speed'))}
        ${tile(`Realistic (${v.eff}%)`, fmtK(r.real,'speed'))}
        ${r.cds.map(c => tile(`Stage ${c.k} center distance`, fmtK(c.cd,'lenS') + (c.shifted ? `<div style="font-size:12px;font-weight:400;opacity:.75">spaced as ${c.ea}t + ${c.eb}t</div>` : ''))).join('')}
      </div>
      ${r.warnings.map(w => `<div class="warn">⚠ ${w}</div>`).join('')}
      <figure class="panel"><figcaption>SPEED THROUGH THE GEARBOX</figcaption>
        <svg viewBox="0 0 480 ${H}" preserveAspectRatio="xMinYMid meet" style="height:${H}px">${bars}</svg></figure>
      ${r.parts.length ? `<figure class="panel" style="margin-top:12px"><figcaption>WCP GEARS · pick one for each gear (bore, material)</figcaption>
        <table class="dark"><tr><th>Where</th><th>Teeth</th><th>WCP part</th><th></th></tr>${partRows(r.parts)}</table></figure>
      ${orderHtml(r.parts.map(x => x.part))}` : ''}`;
  },
  validation(){
    const r = this.compute({ ...defaultsFor(this), motor:'krakenx60', s1a:12, s1b:60, s2a:18, s2b:36, s3a:0, s3b:0, wheel:101.6, eff:100 });
    const rpm = MOTORS.krakenx60.rpm;
    // Center distance: a plain 20 DP pair, and WCP-1720 (a 16t gear that meshes at the 18t spacing)
    const plain = WCP_PARTS.find(p => p.type === 'gear' && p.pitch === '20 DP' && p.teeth === 16 && !p.cdTeeth);
    const cdOf = sku => this.compute({ ...defaultsFor(this), s1a:16, s1b:36, s2a:0, s2b:0, p_s1a:sku, bore1:'any' }).cds[0].cd;
    return [
      { name:'Ratio 12:60 × 18:36', expected:10, got:r.ratio, unit:':1', tol:1e-9 },
      { name:`Output at ${rpm} rpm`, expected:rpm/10, got:r.rpm, unit:'rpm', tol:1e-9 },
      { name:'4 in wheel surface speed', expected:rpm/10/60*Math.PI*0.1016, got:r.surface, unit:'m/s', tol:1e-9 },
      { name:'Center distance, 20 DP 16t + 36t: (16 + 36) / 40 in', expected:52/40*25.4, got:cdOf(plain && plain.sku), unit:'mm', tol:1e-9 },
      { name:'… with WCP-1720 (16t, spaced as 18t): (18 + 36) / 40 in', expected:54/40*25.4, got:cdOf('WCP-1720'), unit:'mm', tol:1e-9 },
      { name:'Each gear’s pick has the right tooth count and pitch (count wrong)', expected:0, got:r.parts.filter(x => x.part && (x.part.teeth !== x.teeth || x.part.pitch !== '20 DP')).length, unit:'', tol:0 },
      ...partsChecks(),
    ];
  },
  docs(){ return `
    <div><h3>How it works</h3>
      <div class="eq">stage ratio  = driven teeth / driver teeth
total ratio  = stage1 × stage2 × stage3
output rpm   = motor rpm / total ratio
surface speed = output rpm / 60 × π × wheel diameter
center distance = (driver + driven teeth) / (2 × DP)   inches</div>
      <p>Pulleys and sprockets give the same ratio from their tooth counts; use Chain &amp; Belt C-C for their spacing and parts.</p>
      <p><b>WCP gears.</b> For each gear the calculator lists WCP’s matching gears (${WCP_PARTS.length} parts, read from WCP’s product list on ${WCP_DATE}) in the bore you choose, steel first. Some small WCP gears are cut to mesh at a bigger gear’s spacing, e.g. WCP-1720 is a 16t gear spaced as an 18t; the center distance uses that. The order list counts the parts and links to them; check price and stock on WCP before ordering.</p>
    </div>
    <div><h3>Validation</h3>${validationTable(this)}</div>`; }
};
