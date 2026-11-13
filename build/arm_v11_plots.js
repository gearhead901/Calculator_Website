function armPlots(v, r){
  const ch = document.getElementById('armHold'), cs = document.getElementById('armSweep'), cm = document.getElementById('armSim');
  const rows = r.rows, xr = [v.rmin, Math.max(v.rmax, v.rmin*1.01)];
  if (ch){
    const pts = rows.map(x => [x.G, x.holdI]), ym = Math.max(v.hmax, ...pts.map(p => p[1]))*1.1;
    const f = frame(ch, xr, [0, ym], 'ratio', 'amp', 'total gear ratio (: 1)', 'holding current / motor (A)');
    drawSeries(f, [{ pts, col:COL.orange, w:2.5 }, { pts:[[xr[0], v.hmax], [xr[1], v.hmax]], col:COL.red, w:1.5, dash:1 }]);
    if (r.rec){ f.c.fillStyle = '#fff'; f.c.strokeStyle = COL.green; f.c.lineWidth = 1.5; star(f.c, f.X(r.rec.G), f.Y(r.rec.holdI), 8); }
  }
  if (cs){
    const pts = rows.map(x => [x.G, x.time]), tm = Math.max(1e-3, ...pts.map(p => p[1]).filter(Number.isFinite))*1.08;
    const f = frame(cs, xr, [0, tm], 'ratio', 's', 'total gear ratio (: 1)', 'time to end angle (s)');
    drawSeries(f, [{ pts, col:COL.white, w:2.5 }]);
    if (r.rec){ f.c.fillStyle = '#fff'; f.c.strokeStyle = COL.green; f.c.lineWidth = 1.5; star(f.c, f.X(r.rec.G), f.Y(r.rec.time), 8); }
  }
  if (cm && r.ref){
    const s = r.ref.sim, n = r.ref.m.n;
    const ang = s.X.map((x, i) => [s.T[i], x*180/Math.PI]), amps = s.I.map((x, i) => [s.T[i], x/n]);
    const yr = range([...ang.map(p => p[1]), ...amps.map(p => p[1]), 0]);
    const f = frame(cm, [0, Math.max(s.T[s.T.length-1], 1e-3)], [Math.min(0, yr[0])*1.08, yr[1]*1.08], 's', null, 'time (s)', 'angle (°)  /  current per motor (A)');
    drawSeries(f, [{ pts:ang, col:COL.blue, w:2.5 }, { pts:amps, col:COL.orange, w:2 },
      { pts:amps.map((p, i) => [p[0], s.lim[i] ? p[1] : NaN]), col:COL.red, w:3, dash:1 }]);
  }
}
