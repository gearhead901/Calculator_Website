import os, json
sp = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(sp).replace('\\', '/') + '/'      # the repo folder (build/ is inside it)
proto = root + 'prototype/'
s = open(proto + 'calc_prototype_v14.html', encoding='utf-8').read()
data = json.load(open(root + 'data/wcp_parts.json', encoding='utf-8'))
parts = [{k: p[k] for k in ['sku', 'type', 'teeth', 'pitch', 'bore', 'width', 'material', 'cdTeeth', 'name', 'handle'] if k in p} for p in data['parts']]
pjs = open(os.path.join(sp, 'parts_v15.js'), encoding='utf-8').read()
pjs = pjs.replace('__WCP_DATE__', data['date']).replace('__WCP_PARTS__', '[\n' + ',\n'.join(json.dumps(p, ensure_ascii=False, separators=(',', ':')) for p in parts) + '\n]')

def sub(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: raise SystemExit(f'{c} matches (want {n}): {a[:90]!r}')
    s = s.replace(a, b)

# ---- labels ----
sub('<title>Calc Workshop — prototype v14</title>', '<title>Calc Workshop — prototype v15</title>')
sub('  Calc Workshop — prototype v14  (', '  Calc Workshop — prototype v15  (')
sub("v14 Shot Trajectory keeps the whole ball clear of the goal lips (not just its center); Projectile launch solver rejects impossible entry angles)",
    "v14 Shot Trajectory keeps the whole ball clear of the goal lips (not just its center); Projectile launch solver rejects impossible entry angles;\n"
    "                                 v15 adds WCP part numbers and an order list to Gear Ratio and Chain & Belt C-C (data/wcp_parts.json, made by tools/wcp_parts.py))")
sub('<small>PROTOTYPE v14</small>', '<small>PROTOTYPE v15</small>')
sub('<footer>Prototype v14 ·', '<footer>Prototype v15 ·')

# ---- CSS for part pickers in the dark panels ----
sub('  #toast{', '''  select.pick{background:#151b26;color:#e6eaf0;border:1px solid #344055;border-radius:6px;padding:4px 6px;max-width:100%;font-size:13px}
  figure.panel .dim{color:#9aa6b8;font-size:12px}
  figure.panel .note{color:#9aa6b8;font-size:12px;margin:10px 0 0}
  figure.panel a{color:#8fb6ff}
  figure.panel .btn{color:var(--ink)}
  #toast{''')

# ---- inputs of type 'pick' (a part number chosen in the results): not drawn in the form, kept in the link ----
sub("    if (i.section) return `<div class=\"sec\">${i.section}</div>`;",
    "    if (i.section) return `<div class=\"sec\">${i.section}</div>`;\n    if (i.type === 'pick') return '';   // chosen in the results, not in the form")
sub("    else if (i.type === 'select') vals[i.key] = raw;", "    else if (i.type === 'select' || i.type === 'pick') vals[i.key] = raw;")
sub("  else if (def.type === 'select') v[key] = e.target.value;", "  else if (def.type === 'select' || def.type === 'pick') v[key] = e.target.value;")

# ---- shared parts code goes before Gear Ratio ----
sub("const GEAR = {", pjs + "const GEAR = {")

# ---- Gear Ratio ----
g0 = s.index("const GEAR = {"); g1 = s.index("\n};\n", g0) + 4
s = s[:g0] + open(os.path.join(sp, 'gear_v15.js'), encoding='utf-8').read() + s[g1:]

# ---- Chain & Belt C-C ----
sub("""    {key:'round', label:'Round', type:'select', def:'nearest', showIf:v => v.mode === 'cc',
      options:[{value:'nearest', label:'Nearest'}, {value:'up', label:'Up (longer)'}, {value:'down', label:'Down (shorter)'}]},""",
"""    {key:'round', label:'Round', type:'select', def:'nearest', showIf:v => v.mode === 'cc',
      options:[{value:'nearest', label:'Nearest'}, {value:'up', label:'Up (longer)'}, {value:'down', label:'Down (shorter)'}, {value:'wcp', label:'Nearest belt WCP sells'}],
      help:'“Nearest belt WCP sells” rounds to a belt length WCP actually stocks (belts only).'},""")
sub("""    {key:'adder', label:'C-C adder', kind:'lenS', def:0, help:'Extra spacing added to the answer, if your team adds some for tension. 0 = exact.'},
  ],""", """    {key:'adder', label:'C-C adder', kind:'lenS', def:0, help:'Extra spacing added to the answer, if your team adds some for tension. 0 = exact.'},
    {section:'WCP parts'},
    {key:'bw', label:'Belt / pulley width', type:'select', def:'9mm', showIf:v => DRIVES[v.drive].kind === 'belt',
      options:[{value:'any', label:'Any'}, {value:'9mm', label:'9 mm'}, {value:'15mm', label:'15 mm'}]},
    {key:'pb1', label:'Bore, sprocket / pulley 1', type:'select', def:'any', options:boreOptions('pulley', 'sprocket')},
    {key:'pb2', label:'Bore, sprocket / pulley 2', type:'select', def:'1/2in Hex', options:boreOptions('pulley', 'sprocket')},
    {key:'p_n1', type:'pick', def:''}, {key:'p_n2', type:'pick', def:''}, {key:'p_belt', type:'pick', def:''},
  ],""")
# rounding to a belt WCP sells; nearby sizes show which ones WCP stocks
sub("""    let count, targetCount = null;
    if (v.mode === 'cc'){
      targetCount = g.lenP(Math.max(v.target, 1e-6));
      const fn = { nearest:Math.round, up:Math.ceil, down:Math.floor }[v.round];
      count = fn(targetCount/step)*step;
    } else count = Math.round(v.count);""",
"""    let count, targetCount = null;
    const wp = WCP_PITCH[v.drive], sold = !g.chain && wp ? wcpBeltSizes(wp, v.bw) : [];
    if (v.mode === 'cc'){
      targetCount = g.lenP(Math.max(v.target, 1e-6));
      if (v.round === 'wcp' && sold.length){
        const fit = sold.filter(n => g.solveC(n) !== null);
        count = fit.length ? fit.reduce((a, n) => Math.abs(n - targetCount) < Math.abs(a - targetCount) ? n : a) : Math.round(targetCount);
        if (!fit.length) warnings.push('WCP doesn’t sell a belt long enough for these pulleys, so this rounds to the nearest tooth.');
      } else {
        if (v.round === 'wcp') warnings.push(g.chain ? 'Chain is bought by length, so “Nearest belt WCP sells” rounds like Nearest.' : 'WCP doesn’t list belts for this belt type, so this rounds like Nearest.');
        const fn = { nearest:Math.round, up:Math.ceil, down:Math.floor, wcp:Math.round }[v.round];
        count = fn(targetCount/step)*step;
      }
    } else count = Math.round(v.count);""")
sub("""    for (let i = -3; i <= 3; i++){ const n = count + i*step, c = g.solveC(n); if (n > 0 && c !== null) nearby.push({ n, C:c + v.adder, now:i === 0 }); }
    return { g, count, targetCount, C, Cf:C + v.adder, length:count*g.p, wrapSmall, inMesh, clearance, nearby, warnings };""",
"""    if (v.mode === 'cc' && v.round === 'wcp' && sold.length){
      // nearby = the stocked belt sizes either side
      const i0 = sold.indexOf(count);
      sold.slice(Math.max(0, i0 - 3), i0 + 4).forEach(n => { const c = g.solveC(n); if (c !== null) nearby.push({ n, C:c + v.adder, now:n === count, sold:true }); });
    } else for (let i = -3; i <= 3; i++){ const n = count + i*step, c = g.solveC(n); if (n > 0 && c !== null) nearby.push({ n, C:c + v.adder, now:i === 0, sold:sold.includes(n) }); }
    // WCP parts: the two sprockets / pulleys, and the belt
    const kind = g.chain ? 'sprocket' : 'pulley', w = g.chain ? null : v.bw;
    const prow = (key, label, type, teeth, bore, width) => ({ key, label, type, teeth, pitch:wp, bore, width, ...wcpMatch({ type, pitch:wp, teeth, bore, width, pick:v[key] }) });
    const parts = !wp ? [] : [prow('p_n1', g.chain ? 'Sprocket 1' : 'Pulley 1', kind, g.N1, v.pb1, w), prow('p_n2', g.chain ? 'Sprocket 2' : 'Pulley 2', kind, g.N2, v.pb2, w),
      ...(g.chain ? [] : [prow('p_belt', 'Belt', 'belt', count, null, w)])];
    return { g, count, targetCount, C, Cf:C + v.adder, length:count*g.p, wrapSmall, inMesh, clearance, nearby, warnings, parts, wp, sold };""")
sub("""          <table class="dark"><tr><th>${g.chain ? 'Links' : 'Belt teeth'}</th><th>C-C</th>${v.mode === 'cc' ? '<th>vs target</th>' : ''}</tr>
          ${r.nearby.map(n => `<tr class="${n.now ? 'now' : ''}"><td>${n.n}${g.chain && n.n % 2 ? ' <span title="needs offset link">*</span>' : ''}</td>
            <td class="mono">${fmtK(n.C,'lenS')}</td>${v.mode === 'cc' ? `<td class="mono">${fmtSign(n.C - v.target,'lenS')}</td>` : ''}</tr>`).join('')}
          </table></figure>""",
"""          <table class="dark"><tr><th>${g.chain ? 'Links' : 'Belt teeth'}</th><th>C-C</th>${v.mode === 'cc' ? '<th>vs target</th>' : ''}${r.sold.length ? '<th>WCP sells</th>' : ''}</tr>
          ${r.nearby.map(n => `<tr class="${n.now ? 'now' : ''}"><td>${n.n}${g.chain && n.n % 2 ? ' <span title="needs offset link">*</span>' : ''}</td>
            <td class="mono">${fmtK(n.C,'lenS')}</td>${v.mode === 'cc' ? `<td class="mono">${fmtSign(n.C - v.target,'lenS')}</td>` : ''}${r.sold.length ? `<td>${n.sold ? '✓' : ''}</td>` : ''}</tr>`).join('')}
          </table></figure>""")
sub("""        </table>
      </details>`;
  },
  validation(){
    const solve = (drive, p, n1, n2, count) => beltGeom({ drive, pitch:p, n1, n2 }).solveC(count);""",
"""        </table>
      </details>
      ${r.wp ? `<figure class="panel" style="margin-top:12px"><figcaption>WCP PARTS · pick one for each ${g.chain ? 'sprocket' : 'pulley and the belt'}</figcaption>
        <table class="dark"><tr><th>Where</th><th>Teeth</th><th>WCP part</th><th></th></tr>${partRows(r.parts)}</table></figure>
      ${orderHtml(r.parts.map(x => x.part), g.chain ? `<tr><td></td><td class="mono">—</td><td>${DRIVES[v.drive].label}: ${r.count} links, about ${fmtNum(r.length/304.8,2)} ft. WCP sells chain by length.</td><td></td></tr>` : '')}`
      : `<p class="help">WCP parts are listed for #25 and #35 chain, GT2 3 mm and HTD 5 mm belts.</p>`}`;
  },
  validation(){
    const solve = (drive, p, n1, n2, count) => beltGeom({ drive, pitch:p, n1, n2 }).solveC(count);""")
sub("""      { name:'GT2 18T/48T, 150T belt (approx. formula, ±0.1 mm)',   expected:approx(D48,D18,450), got:solve('gt2',3,18,48,150), unit:'mm', tol:0.1 },
    ];""", """      { name:'GT2 18T/48T, 150T belt (approx. formula, ±0.1 mm)',   expected:approx(D48,D18,450), got:solve('gt2',3,18,48,150), unit:'mm', tol:0.1 },
      ...this.wcpChecks(),
    ];
  },
  wcpChecks(){
    // "Nearest belt WCP sells": the chosen belt is one WCP lists, and no listed belt is closer to the exact length
    const v = { ...defaultsFor(this), drive:'htd5', pitch:5, n1:18, n2:36, mode:'cc', target:150, round:'wcp', bw:'9mm' };
    const r = this.compute(v), sold = wcpBeltSizes('HTD 5mm', '9mm');
    const best = Math.min(...sold.filter(n => beltGeom(v).solveC(n) !== null).map(n => Math.abs(n - r.targetCount)));
    return [
      { name:'“Nearest belt WCP sells” (HTD 18T/36T, 150 mm): picks a belt WCP lists (1 = yes)', expected:1, got:sold.includes(r.count) ? 1 : 0, unit:'', tol:0 },
      { name:'… and none of WCP’s belts is closer to the exact length', expected:best, got:Math.abs(r.count - r.targetCount), unit:'teeth', tol:1e-12 },
      { name:'… the belt picked in the parts list has that tooth count', expected:r.count, got:(r.parts.find(x => x.key === 'p_belt').part || {}).teeth, unit:'teeth', tol:0 },
    ];""")
sub("""      <p>The calculator finds the length at your target C-C, rounds it to a real link or tooth count, then searches (bisection) for the C-C that gives exactly that length.</p>""",
    """      <p>The calculator finds the length at your target C-C, rounds it to a real link or tooth count, then searches (bisection) for the C-C that gives exactly that length.</p>
      <p><b>WCP parts.</b> The sprockets, pulleys and belts that fit come from WCP’s product list (${WCP_PARTS.length} parts, read on ${WCP_DATE}). Pick a bore and, for belts, a width; “Nearest belt WCP sells” rounds to a belt length WCP stocks. The order list gives part numbers with links; check price and stock on WCP before ordering.</p>""")

# helpers used by Chain & Belt: which WCP pitch each drive is, and the belt sizes WCP sells
sub("const BELT = {", """const WCP_PITCH = { c25:'#25', c35:'#35', gt2:'GT2 3mm', htd5:'HTD 5mm' };
const wcpBeltSizes = (pitch, width) => [...new Set(WCP_PARTS.filter(p => p.type === 'belt' && p.pitch === pitch && (!width || width === 'any' || p.width === width)).map(p => p.teeth))].sort((a, b) => a - b);
const BELT = {""")

open(proto + 'calc_prototype_v15.html', 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(s))
