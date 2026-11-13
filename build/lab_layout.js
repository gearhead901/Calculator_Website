// ---- Style Lab: layouts ----
// Layouts:  scroll = the v14 long page (form on the left, every result on the right)
//           bands  = one full-width band per step, its inputs beside its results
//           tabs   = the same bands, one step at a time, with Next buttons
//           dash   = a summary line pinned at the top, inputs in their own scrolling column
// The new layouts (bands, tabs, dash) only change Arm, the calculator with steps. They don't touch the maths:
// the page draws the form and the results as usual, then this code moves the pieces into place.
let labStep = 1, labShowAll = false, labSpecsOpen = false, labDetails = false, labR = null;
const STEP_NAMES = { 1:'Ratio search', 2:'Gear stages', 3:'Motion profile' };
const LAYOUTS = ['scroll', 'bands', 'tabs', 'dash'];
const labNew = () => state.calc === 'arm' && state.layout !== 'scroll';
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

// Tag every form row and result block with the "Step N" heading above it (0 = before Step 1).
function tagSteps(el){
  let n = 0;
  [...el.children].forEach(c => {
    const m = (c.classList.contains('sec') || c.tagName === 'H3') && /^Step (\d)/.exec(c.textContent);
    if (m) n = +m[1];
    c.dataset.step = n;
  });
}

// The key answers of all three steps, in one line. On a phone this is all you see until "Show details".
function labSummary(v, r){
  if (!r || r.bad) return '';
  const f = r.ref, p3 = r.p3, pr = p3 && p3.pr, rec = r.rec;
  const motor = (MOTOR_DB[v.motor] || {}).label || 'custom motor';
  const item = (k, val, sub = '') => `<div class="sum-i"><div class="k">${k}</div><div class="v">${val}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  return `<div class="sum-row">
    ${item('Gear ratio', f ? fmtNum(f.m.G,2)+' : 1' : rec ? fmtNum(rec.G,1)+' : 1' : '—', f ? (rec ? `Step 1 picked ${fmtNum(rec.G,0)} : 1` : '') : 'from Step 1')}
    ${item('Holding current', f ? fmtK(f.holdI,'amp') : rec ? fmtK(rec.holdI,'amp') : '—', 'per motor, worst angle')}
    ${item('Move time', pr ? fmtNum(pr.time,2)+' s' : '—', pr ? `${fmtNum(v.a0,0)}° → ${fmtNum(v.a1,0)}°, ${v.pgoal}` : '')}
    ${item('Peak current', pr ? fmtK(pr.peakI,'amp') : '—', 'per motor')}
    ${item('Peak voltage', pr ? fmtNum(pr.peakV,1)+' V' : '—', `of ${fmtNum(v.volt,0)} V`)}
    ${item('Motors', `${v.n} × ${esc(motor)}`, `${fmtK(v.ilim,'amp')} limit`)}
  </div>
  <button class="btn sum-more" data-lab-details>${labDetails ? 'Hide details' : 'Show details'}</button>`;
}
// What each step decided, for the step tabs
function stepAnswer(n, r){
  if (!r || r.bad) return '';
  if (n === 1) return r.rec ? `picks ${fmtNum(r.rec.G,0)} : 1` : 'no ratio fits';
  if (n === 2) return r.ref ? `${fmtNum(r.ref.m.G,1)} : 1 · ${fmtK(r.ref.holdI,'amp')}` : 'enter stages';
  if (n === 3) return r.p3 && r.p3.pr ? `${fmtNum(r.p3.pr.time,2)} s move` : '—';
  return '';
}

// Compact inputs: motor specs fold away, help text becomes an ⓘ, the gear stages become one small table.
function compactForm(nodes){
  const byKey = k => nodes.find(n => n.querySelector && n.querySelector(`[data-key="${k}"]`));
  // in the step bands the band header already says "Step N", so the section labels drop it
  if (state.layout !== 'dash') nodes.forEach(n => { if (n.classList && n.classList.contains('sec')) n.textContent = n.textContent.replace(/^Step \d · /, '').replace(/ \(driver → driven, 0 = unused\)/, ''); });
  // ⓘ help
  nodes.forEach(n => {
    const h = n.querySelector && n.querySelector(':scope > .help'), lab = n.querySelector && n.querySelector(':scope > label');
    if (h && lab){ lab.insertAdjacentHTML('beforeend', ` <span class="info" title="${esc(h.textContent)}" data-lab-info>ⓘ</span>`); n.classList.add('has-help'); }
  });
  // motor specs behind "Edit specs" (open for a custom motor)
  const specs = ['fs', 'ts', 'if', 'is'].map(byKey).filter(Boolean);
  if (specs.length){
    const d = document.createElement('details'); d.className = 'specs'; d.open = labSpecsOpen || state.values.arm.motor === 'custom';
    d.innerHTML = `<summary>Motor specs <span>${fmtNum(state.values.arm.fs,0)} rpm · ${fmtK(state.values.arm.ts,'torque')} stall</span></summary>`;
    d.addEventListener('toggle', () => { labSpecsOpen = d.open; });
    specs[0].before(d); specs.forEach(n => d.append(n));
  }
  // gear stages → table
  const first = byKey('s1a');
  if (first){
    const t = document.createElement('div'); t.className = 'stagebox';
    let h = `<table class="stages"><tr><th>Stage</th><th>Driver</th><th>Driven</th><th>Shaft inertia <span>${U('moi')[0]}</span></th></tr>`;
    ARM_STAGES.forEach(k => { h += `<tr data-row="${k}"><td>${k}</td><td></td><td></td><td></td></tr>`; });
    t.innerHTML = h + `</table><p class="help">Driver → driven tooth counts, or 1 → 5 for a 5:1 planetary. 0 = unused. Shaft inertia = everything spinning on the shaft after the stage (from CAD); the last one is the arm shaft.</p>`;
    first.before(t);
    ARM_STAGES.forEach(k => ['a', 'b', 'J'].forEach((c, i) => {
      const n = byKey('s' + k + c), cell = t.querySelector(`tr[data-row="${k}"]`).children[i + 1];
      if (n){ cell.append(n.querySelector('.inbox')); n.remove(); } else cell.innerHTML = '<span class="dim">—</span>';
    }));
  }
}

// Shorter ratio table: the 3 rows either side of the pick, plus "Show all".
function shortTable(root){
  const now = root.querySelector('table.dark tr.now'); if (!now) return;
  const rows = [...now.parentElement.children].filter(r => r.querySelector('td')), i = rows.indexOf(now);
  rows.forEach((r, j) => { r.style.display = labShowAll || Math.abs(j - i) <= 3 ? '' : 'none'; });
  const fig = now.closest('figure');
  if (fig && !fig.querySelector('[data-lab-all]'))
    fig.insertAdjacentHTML('beforeend', `<button class="btn showall" data-lab-all>${labShowAll ? 'Show fewer' : `Show all ${rows.length} ratios`}</button>`);
}

// Hero sizes suit numbers; a tile holding a phrase ("Brisk (70% of the fastest)") stays normal size.
const markLong = root => root.querySelectorAll('.tile .v').forEach(v => v.classList.toggle('long', v.textContent.trim().length > 14));
// Build or refresh the new layout. Called after the form is drawn and after the results are drawn.
function labArrange(){
  const main = document.getElementById('main'), calcEl = main.querySelector('.calc'), form = document.getElementById('form'), out = document.getElementById('out');
  if (!calcEl) return;
  if (labNew()) document.body.dataset.nl = state.layout; else delete document.body.dataset.nl;
  document.body.classList.toggle('lab-details', labDetails);
  if (!labNew()){ main.querySelectorAll('#labSum,#labBands,#stepTabs,#docsBtn').forEach(e => e.remove()); return; }
  // summary line
  let sum = document.getElementById('labSum');
  if (!sum){ sum = document.createElement('div'); sum.id = 'labSum'; sum.className = 'labsum'; calcEl.before(sum); }
  sum.innerHTML = labSummary(state.values.arm, labR);
  // "How it works" folds away
  const docs = main.querySelector('.docs');
  if (docs && !document.getElementById('docsBtn')){
    docs.insertAdjacentHTML('beforebegin', `<button class="btn docsbtn" id="docsBtn" data-lab-docs>How it works &amp; checks ▾</button>`);
  }
  if (state.layout === 'dash'){ if (form.children.length && !form.querySelector('.specs,.stagebox,.info')) compactForm([...form.children]); if (out.children.length){ shortTable(out); markLong(out); } return; }
  // bands (and tabs): one band per step, inputs on the left, results on the right
  let bands = document.getElementById('labBands');
  if (!bands){
    bands = document.createElement('div'); bands.id = 'labBands';
    bands.innerHTML = [1, 2, 3].map(n => `<section class="band" data-band="${n}">
      <div class="band-h"><b>Step ${n}</b> ${STEP_NAMES[n]}<span class="band-a"></span></div>
      <div class="band-l card form"></div><div class="band-r"></div></section>`).join('');
    calcEl.after(bands);
  }
  if (form.children.length){
    tagSteps(form);
    const nodes = [...form.children];
    [1, 2, 3].forEach(n => {
      const l = bands.querySelector(`[data-band="${n}"] .band-l`); l.innerHTML = '';
      const mine = nodes.filter(c => +c.dataset.step === n || (n === 1 && +c.dataset.step === 0));
      mine.forEach(c => l.append(c));
      compactForm(mine);
    });
  }
  if (out.children.length){
    tagSteps(out);
    const nodes = [...out.children];
    [1, 2, 3].forEach(n => {
      const rr = bands.querySelector(`[data-band="${n}"] .band-r`); rr.innerHTML = '';
      nodes.filter(c => +c.dataset.step === n || (n === 1 && +c.dataset.step === 0)).forEach(c => { if (c.tagName !== 'H3') rr.append(c); });
      if (n === 1) shortTable(rr);
      markLong(rr);
      if (state.layout === 'tabs' && n < 3) rr.insertAdjacentHTML('beforeend', `<button class="btn accent next" data-step-tab="${n + 1}">Next: Step ${n + 1} · ${STEP_NAMES[n + 1]} →</button>`);
    });
    out.innerHTML = '';
  }
  [1, 2, 3].forEach(n => { bands.querySelector(`[data-band="${n}"] .band-a`).textContent = stepAnswer(n, labR) ? ' · ' + stepAnswer(n, labR) : ''; });
  // tabs
  let bar = document.getElementById('stepTabs');
  if (state.layout !== 'tabs'){ if (bar) bar.remove(); bands.querySelectorAll('.band').forEach(b => b.style.display = ''); return; }
  if (!bar){ bar = document.createElement('div'); bar.id = 'stepTabs'; bar.className = 'steptabs'; bands.before(bar); }
  bar.innerHTML = [1, 2, 3].map(n => `<button data-step-tab="${n}" class="${n === labStep ? 'on' : ''}"><b>Step ${n}</b><span>${STEP_NAMES[n]}</span><i>${stepAnswer(n, labR)}</i></button>`).join('');
  bands.querySelectorAll('.band').forEach(b => { b.style.display = +b.dataset.band === labStep ? '' : 'none'; });
}
const applyTabs = labArrange;   // the page calls this after drawing the form and the results

// Arm draws its plots after the pieces are in place, so each canvas is sized for where it ends up.
const armRenderV14 = ARM.renderOut;
ARM.renderOut = function(el, v, r){
  labR = r;
  if (!labNew()) return armRenderV14.call(this, el, v, r);
  const p1 = armPlots, p3 = armStep3Plots;
  armPlots = armStep3Plots = () => {};
  try { armRenderV14.call(this, el, v, r); } finally { armPlots = p1; armStep3Plots = p3; }
  labArrange();
  if (!r.bad){ armPlots(v, r); armStep3Plots(v, r); }
};

function applyStyle(){
  document.body.dataset.theme = state.theme; document.body.dataset.layout = state.layout;
  document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === state.theme));
  document.querySelectorAll('#layoutSeg button').forEach(b => b.classList.toggle('on', b.dataset.l === state.layout));
  readCOL();
}
document.querySelector('.labbar').addEventListener('click', e => {
  const t = e.target.closest('[data-t]'), l = e.target.closest('[data-l]');
  if (t) state.theme = t.dataset.t; else if (l) state.layout = l.dataset.l; else return;
  applyStyle(); renderPage();
});
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-step-tab]'), all = e.target.closest('[data-lab-all]'), det = e.target.closest('[data-lab-details]');
  const docs = e.target.closest('[data-lab-docs]'), info = e.target.closest('[data-lab-info]');
  if (tab){ labStep = +tab.dataset.stepTab; renderForm(); update(); window.scrollTo({ top:0, behavior:'smooth' }); }
  else if (all){ labShowAll = !labShowAll; update(); }
  else if (det){ labDetails = !labDetails; labArrange(); update(); }
  else if (docs){ const d = document.querySelector('.docs'); d.classList.toggle('open'); docs.textContent = d.classList.contains('open') ? 'Hide how it works & checks ▴' : 'How it works & checks ▾'; }
  else if (info){ e.preventDefault(); info.closest('.field').classList.toggle('show-help'); }
});
