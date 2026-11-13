// Find s in [lo, hi] where the increasing function f(s) = target. Regula falsi (Illinois version): it draws a straight
// line between the two ends instead of always halving, so it needs about 8–12 tries where bisection needs 32.
// f may return −∞ (the ball never got up to the goal); then it halves instead.
function solveInc(f, lo, hi, target, tol = 1e-7){
  let flo = f(lo) - target, fhi = f(hi) - target, side = 0, m = lo, fm;
  if (!(fhi >= 0)) return null;
  if (flo >= 0) return lo;
  for (let it = 0; it < 80; it++){
    m = Number.isFinite(flo) ? (lo*fhi - hi*flo)/(fhi - flo) : (lo + hi)/2;
    if (!(m > lo && m < hi)) m = (lo + hi)/2;
    fm = f(m) - target;
    if (fm < 0){ lo = m; flo = fm; if (side < 0) fhi /= 2; side = -1; }
    else { hi = m; fhi = fm; if (side > 0 && Number.isFinite(flo)) flo /= 2; side = 1; }
    if (Math.abs(fm) < tol || hi - lo < 1e-9) break;
  }
  return m;
}
// The robust-shot search at one distance. Shared by the single shot and the shot map.
// v: Shot Trajectory inputs (v.dist = distance to goal center). sim = makeSim(...).
// Returns { rows, best, near, far }: rows = scoring speed range at each whole-degree angle; best = most robust shot or null.
function shotSolve(v, sim){
  const near = v.dist - v.w/2, far = v.dist + v.w/2;
  // For each launch angle: the slowest shot that lands at the near lip (red) and the fastest at the far lip (green).
  const rows = [], step = 1;
  for (let a = Math.ceil(v.amin); a <= v.amax + 1e-9; a += step){
    const land = s => sim(a, s, false, far + 0.5).x;   // stop early once a shot is clearly long
    let lo = solveInc(land, 0.2, 60, near), hi = solveInc(land, 0.2, 60, far);
    if (lo !== null && hi !== null && v.ceiling > 0){
      const vc = bisect(s => sim(a, s).apex, 0.2, 60, v.ceiling);
      if (vc !== null) hi = Math.min(hi, vc);
    }
    rows.push((lo !== null && hi !== null && hi > lo) ? { a, lo, hi } : { a, lo:null, hi:null });
  }
  // Score each angle: how many "standard errors" of margin does the middle speed have?
  const margin = (row, s) => row.lo === null ? -Infinity : Math.min(s - row.lo, row.hi - s);
  let best = null;
  rows.forEach((row, i) => {
    if (row.lo === null) return;
    const s = (row.lo + row.hi)/2, sTol = (row.hi - row.lo)/2;
    // angle tolerance at this speed: walk to neighbours while still inside, then interpolate the edge
    const edge = dir => {
      let j = i;
      while (rows[j+dir] && margin(rows[j+dir], s) >= 0) j += dir;
      const n = rows[j+dir], mj = margin(rows[j], s);
      if (!n || !Number.isFinite(margin(n, s))) return rows[j].a;
      const mn = margin(n, s); return rows[j].a + dir*step*mj/(mj - mn);
    };
    const aLo = edge(-1), aHi = edge(1);
    const score = Math.min(sTol / v.sv, Math.min(row.a - aLo, aHi - row.a) / v.sa);
    if (!best || score > best.score) best = { a:row.a, s, sTol, aLo, aHi, score };
  });
  return { rows, best, near, far };
}

/* ---- Shot map: the most robust shot over a grid of distances and robot speeds, fitted with polynomials ---- */
// Values from lo in fixed steps, plus hi itself if the steps don't land on it exactly. At most 42.
function gridVals(lo, hi, step){
  if (!(hi > lo) || !(step > 0)) return [lo];
  const n = Math.min(40, Math.floor((hi - lo)/step + 1e-6)), out = Array.from({ length:n + 1 }, (_, i) => lo + i*step);
  if (hi - out[n] > step*1e-6) out.push(hi); else out[n] = hi;
  return out;
}
// Polynomial terms d^i · vr^j, lowest total power first: 1, d, vr, d², d·vr, vr², d³, d²·vr, ...
// noVr = true drops every term with vr (a map at one robot speed).
function polyTerms(order, noVr){
  const t = [];
  for (let k = 0; k <= order; k++) for (let j = 0; j <= k; j++) if (!(noVr && j)) t.push([k - j, j]);
  return t;
}
const polyEval = (c, terms, d, vr) => c.reduce((sum, ck, k) => sum + ck*d**terms[k][0]*vr**terms[k][1], 0);
// Least-squares fit y ≈ Σ c_k · d^i · vr^j. Scales d and vr to about ±1 first so the equations stay well conditioned,
// then turns the answer back into plain coefficients (metres, m/s). Returns null if there are too few points.
function polyFit(pts, terms, key){
  const n = terms.length; if (pts.length < n) return null;
  const sd = Math.max(...pts.map(p => Math.abs(p.d)), 1e-9), sv = Math.max(...pts.map(p => Math.abs(p.vr)), 1);
  const A = Array.from({ length:n }, () => new Array(n + 1).fill(0));
  pts.forEach(p => {
    const row = terms.map(([i, j]) => (p.d/sd)**i * (p.vr/sv)**j);
    for (let r = 0; r < n; r++){ for (let c = 0; c < n; c++) A[r][c] += row[r]*row[c]; A[r][n] += row[r]*p[key]; }
  });
  // Gaussian elimination with partial pivoting
  for (let c = 0; c < n; c++){
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < n; r++) if (r !== c){ const f = A[r][c]/A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f*A[c][k]; }
  }
  return terms.map(([i, j], k) => A[k][n]/A[k][k] / (sd**i * sv**j));
}
// v: Shot Trajectory inputs. Solves every grid point, fits angle, exit speed and flight time, and checks the fit still scores.
// Solving takes about half a second, so it only runs when build = true (the "Build shot map" button). The solved grid
// is kept: without build, this returns the kept map if the inputs still match (the fit order and the single-shot
// distance may change), 'stale' if they don't, or null if no map was built yet.
// (rounded to 9 digits, so retyping a value in other units still matches)
const shotMapKey = v => JSON.stringify({ ...v, dist:0, order:0 }, (k, x) => typeof x === 'number' ? +x.toPrecision(9) : x);
function shotMap(v, build){
  const ds = gridVals(v.dmin, v.dmax, v.dstep), vs = gridVals(v.vrmin, v.vrmax, v.vrstep), warnings = [];
  const key = shotMapKey(v);
  if (shotMap.cache && shotMap.cache.key === key) shotMap.cache.pts.forEach(p => { delete p.fa; delete p.fs; delete p.fitOk; });
  else if (!build) return shotMap.cache ? 'stale' : null;
  else {
    const pts = [];
    vs.forEach(vr => {
      const sim = makeSim({ ...v, vr, dt:0.016 });   // 16 ms steps: lands within 0.5 mm of 4 ms steps, 4× faster
      ds.forEach(d => {
        const s = shotSolve({ ...v, dist:d }, sim), b = s.best;
        pts.push(b ? { d, vr, ok:true, a:b.a, s:b.s, tof:sim(b.a, b.s).t, sTol:b.sTol, aLo:b.a - b.aLo, aHi:b.aHi - b.a, near:s.near, far:s.far }
                   : { d, vr, ok:false, near:s.near, far:s.far });
      });
    });
    shotMap.cache = { key, pts };
  }
  const pts = shotMap.cache.pts;
  const good = pts.filter(p => p.ok);
  let order = +v.order;
  const noVr = vs.length < 2;
  while (order > 0 && good.length < polyTerms(order, noVr).length) order--;
  if (order < +v.order) warnings.push(`Not enough solved points for a ${['','1st','2nd','3rd'][+v.order]}-order fit, so the map uses ${order ? ['','1st','2nd'][order] + ' order' : 'a constant'}. Add more distances or robot speeds.`);
  const terms = polyTerms(order, noVr);
  const fit = { a:polyFit(good, terms, 'a'), s:polyFit(good, terms, 's'), tof:polyFit(good, terms, 'tof') };
  if (!good.length) warnings.push('No grid point has a shot that scores. Check the distance range and the goal heights.');
  else if (!fit.a) warnings.push('The fit failed (the grid points are too few or all in a line).');
  let errA = 0, errS = 0, scores = 0;
  if (fit.a) good.forEach(p => {
    p.fa = polyEval(fit.a, terms, p.d, p.vr); p.fs = polyEval(fit.s, terms, p.d, p.vr);
    errA = Math.max(errA, Math.abs(p.fa - p.a)); errS = Math.max(errS, Math.abs(p.fs - p.s));
    // does the polynomial's shot still land in the goal?
    const x = makeSim({ ...v, vr:p.vr })(p.fa, p.fs).x;
    p.fitOk = x >= p.near && x <= p.far; if (p.fitOk) scores++;
  });
  if (good.length < pts.length) warnings.push(`${pts.length - good.length} of ${pts.length} grid points have no shot that scores (shown as gaps). The robot should not shoot there.`);
  if (fit.a && scores < good.length) warnings.push(`At ${good.length - scores} grid point(s) the polynomial’s shot misses the goal. Try a higher order or a smaller range.`);
  return { ds, vs, pts, good, terms, order, fit, errA, errS, scores, warnings };
}
// Text for robot code. Always SI: metres, m/s, degrees, seconds.
function shotMapExport(v, m){
  const f = x => +x.toPrecision(8), lit = x => { const s = String(f(x)); return /[.e]/.test(s) ? s : s + '.0'; };
  const tn = ([i, j]) => [i ? 'd' + (i > 1 ? '^' + i : '') : '', j ? 'vr' + (j > 1 ? '^' + j : '') : ''].filter(Boolean).join('·') || '1';
  const arr = c => `{ ${c.map(lit).join(', ')} }`;
  const dR = `${f(m.ds[0])} to ${f(m.ds[m.ds.length-1])} m`, vR = `${f(m.vs[0])} to ${f(m.vs[m.vs.length-1])} m/s`;
  let java = `// Shot map from Calc Workshop (Shot Trajectory). Units: metres, m/s, degrees, seconds.
// d  = distance from the shooter to the goal center (m)
// vr = robot speed straight away from the goal (m/s); driving toward the goal is negative
// Fitted for d = ${dR} and vr = ${vR}. Clamp both to that range:
// polynomials grow fast outside the points they were fitted to.
// Terms: ${m.terms.map(tn).join(', ')}
public static final int[][] SHOT_TERMS = { ${m.terms.map(([i, j]) => `{${i},${j}}`).join(', ')} };
public static final double[] LAUNCH_ANGLE_DEG = ${arr(m.fit.a)};
public static final double[] EXIT_SPEED_MPS   = ${arr(m.fit.s)};
public static final double[] TIME_OF_FLIGHT_S = ${arr(m.fit.tof)};

public static double shotPoly(double[] c, double d, double vr) {
  double sum = 0;
  for (int k = 0; k < c.length; k++)
    sum += c[k] * Math.pow(d, SHOT_TERMS[k][0]) * Math.pow(vr, SHOT_TERMS[k][1]);
  return sum;
}
// Launch angle is above horizontal: turn it into a hood position with your hood geometry.
// Exit speed is the ball's speed leaving the shooter: turn it into flywheel speed with your measured ratio.
// Sideways robot speed is not in the map: lead the turret by (sideways speed × time of flight).`;
  const still = m.good.filter(p => Math.abs(p.vr) < 1e-9);
  if (still.length > 1){
    const put = (name, k) => still.map(p => `${name}.put(${lit(p.d)}, ${lit(p[k])});`).join('\n');
    java += `

// Robot standing still (vr = 0): the solved points as WPILib lookup tables, if you'd rather interpolate than fit.
// import edu.wpi.first.math.interpolation.InterpolatingDoubleTreeMap;
InterpolatingDoubleTreeMap angleDeg = new InterpolatingDoubleTreeMap();
InterpolatingDoubleTreeMap exitMps = new InterpolatingDoubleTreeMap();
InterpolatingDoubleTreeMap tofSec = new InterpolatingDoubleTreeMap();
${put('angleDeg', 'a')}
${put('exitMps', 's')}
${put('tofSec', 'tof')}`;
  }
  const csv = ['distance_m,radial_speed_mps,launch_angle_deg,exit_speed_mps,time_of_flight_s,speed_tolerance_mps,angle_tolerance_minus_deg,angle_tolerance_plus_deg,fit_angle_deg,fit_speed_mps,fit_shot_scores']
    .concat(m.pts.map(p => p.ok
      ? [p.d, p.vr, p.a, p.s, p.tof, p.sTol, p.aLo, p.aHi, p.fa, p.fs].map(x => x === undefined ? '' : f(x)).join(',') + ',' + (p.fitOk === undefined ? '' : p.fitOk ? 'yes' : 'no')
      : `${f(p.d)},${f(p.vr)},,,,,,,,,no shot`)).join('\n');
  return { java, csv };
}
