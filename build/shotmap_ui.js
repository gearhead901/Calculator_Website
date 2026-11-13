// Colours for the robot-speed lines on the shot map plots (toward the goal → away)
const MAP_COLS = [COL.blue, COL.purple, COL.white, COL.orange, COL.red, COL.green, '#5fd3e0', '#d97adf'];
function shotMapHtml(v, r){
  const head = `<h3 style="margin:22px 0 10px;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)">Shot map · lookup for robot code</h3>`;
  const m = r.map, n = gridVals(v.dmin, v.dmax, v.dstep).length * gridVals(v.vrmin, v.vrmax, v.vrstep).length;
  const btn = label => `<button class="btn" data-mapbuild="1">${label}</button> <span class="help">${n} grid points, about ${Math.max(1, Math.round(n*0.015))} s</span>`;
  if (!m) return head + `<p class="help">Solves the most robust shot at every distance and robot speed in the “Shot map” inputs, fits polynomials, and gives you code for the robot.</p>` + btn('Build shot map');
  if (m === 'stale') return head + `<div class="warn">⚠ The inputs changed since the map was built.</div>` + btn('Rebuild shot map');
  if (!m.fit.a) return head + warnBox(m.warnings) + btn('Rebuild shot map');
  const ex = shotMapExport(v, m), sp = U('speed')[0];
  const lab = vr => Math.abs(vr) < 1e-9 ? 'standing still' : `${fmtSign(vr,'speed')} ${sp} ${vr < 0 ? '(toward)' : '(away)'}`;
  shotMapHtml.last = ex;   // the Copy / Download buttons read this
  return head + `
    <div class="tiles">
      ${tile('Grid points with a shot', `${m.good.length} / ${m.pts.length}`, 'primary')}
      ${tile('Fit', `${['constant','1st','2nd','3rd'][m.order]} order, ${m.terms.length} terms`)}
      ${tile('Worst fit error', `${fmtNum(m.errA,2)}° · ${fmtK(m.errS,'speed')}`)}
      ${tile('Fitted shots that score', `${m.scores} / ${m.good.length}`, m.scores < m.good.length ? 'fail' : '')}
    </div>
    ${warnBox(m.warnings)}
    <div class="panels two">
      <figure class="panel"><figcaption>LAUNCH ANGLE · dots solved, lines fitted</figcaption><canvas id="cvMapA"></canvas></figure>
      <figure class="panel"><figcaption>EXIT SPEED · dots solved, lines fitted</figcaption><canvas id="cvMapS"></canvas></figure>
    </div>
    ${legend(m.vs.map((vr, i) => [lab(vr), MAP_COLS[i % MAP_COLS.length]]))}
    <figure class="panel" style="margin-top:14px"><figcaption>FOR SOFTWARE · Java (WPILib), SI units</figcaption>
      <div style="display:flex;gap:8px;margin:4px 0 8px">
        <button class="btn" data-mapcopy="java">Copy code</button>
        <button class="btn" data-mapcopy="csv">Copy table (CSV)</button>
        <button class="btn" data-mapdl="csv">Download CSV</button></div>
      <div class="code">${ex.java.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div></figure>
    <details class="adv card"><summary>Every grid point</summary>
      <table class="dark"><tr><th>Distance</th><th>Robot speed</th><th>Angle</th><th>Exit speed</th><th>Flight time</th><th>Speed ±</th><th>Angle − / +</th><th>Fitted shot</th></tr>
      ${m.pts.map(p => p.ok ? `<tr><td class="mono">${fmtK(p.d,'len')}</td><td class="mono">${fmtSign(p.vr,'speed')}</td><td class="mono">${fmtNum(p.a,1)}°</td>
        <td class="mono">${fmtK(p.s,'speed')}</td><td class="mono">${fmtNum(p.tof,3)} s</td><td class="mono">${fmtK(p.sTol,'speed')}</td>
        <td class="mono">${fmtNum(p.aLo,1)}° / ${fmtNum(p.aHi,1)}°</td><td>${p.fitOk ? 'scores' : '<b style="color:var(--bad,#e5534b)">misses</b>'}</td></tr>`
        : `<tr><td class="mono">${fmtK(p.d,'len')}</td><td class="mono">${fmtSign(p.vr,'speed')}</td><td colspan="6" class="help">no shot scores</td></tr>`).join('')}
      </table></details>`;
}
function drawShotMap(v, r){
  const m = r.map; if (!m || m === 'stale' || !m.fit.a) return;
  const dl = m.ds[0], dh = m.ds[m.ds.length-1], span = Math.max(dh - dl, 1e-3);
  [['cvMapA', 'a', 'fa', m.fit.a, null, 'Launch angle (°)'], ['cvMapS', 's', 'fs', m.fit.s, 'speed', `Exit speed (${U('speed')[0]})`]].forEach(([id, k, fk, c, kind, yl]) => {
    const cv = document.getElementById(id); if (!cv) return;
    const lines = m.vs.map(vr => Array.from({ length:61 }, (_, i) => { const d = dl + span*i/60; return [d, polyEval(c, m.terms, d, vr)]; }));
    const yr = range([...m.good.map(p => p[k]), ...lines.flat().map(p => p[1])]), pad = (yr[1] - yr[0])*0.08 + 0.1;
    const f = frame(cv, [dl - span*0.03, dh + span*0.03], [yr[0] - pad, yr[1] + pad], 'len', kind, `Distance to goal (${U('len')[0]})`, yl);
    m.vs.forEach((vr, i) => {
      const col = MAP_COLS[i % MAP_COLS.length];
      drawSeries(f, [{ pts:lines[i], col, w:2 }]);
      f.c.fillStyle = col;
      m.good.filter(p => p.vr === vr).forEach(p => { f.c.beginPath(); f.c.arc(f.X(p.d), f.Y(p[k]), 3, 0, 7); f.c.fill(); });
    });
  });
}
// Build button, and copy / download buttons for the shot map export
document.getElementById('main').addEventListener('click', async e => {
  const go = e.target.closest('[data-mapbuild]');
  if (go){
    go.disabled = true; go.textContent = 'Building…';
    setTimeout(() => { shotMap(state.values.shot, true); update(); }, 30);   // let "Building…" show first
    return;
  }
  const cp = e.target.closest('[data-mapcopy]'), dl = e.target.closest('[data-mapdl]'), ex = shotMapHtml.last;
  if (!ex || !(cp || dl)) return;
  if (cp){
    const text = ex[cp.dataset.mapcopy];
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    toast(cp.dataset.mapcopy === 'csv' ? 'Table copied (CSV)' : 'Code copied');
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ex.csv], { type:'text/csv' })); a.download = 'shot_map.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
});
