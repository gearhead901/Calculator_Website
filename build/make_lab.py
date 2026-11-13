import os
sp = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(sp).replace('\\', '/') + '/'      # the repo folder (build/ is inside it)
s = open(root + 'prototype/calc_prototype_v14.html', encoding='utf-8').read()
themes = open(os.path.join(sp, 'lab_themes.css'), encoding='utf-8').read() + open(os.path.join(sp, 'lab_layout.css'), encoding='utf-8').read()

def sub(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: raise SystemExit(f'{c} matches (want {n}): {a[:90]!r}')
    s = s.replace(a, b)

# ---- labels ----
sub('<title>Calc Workshop — prototype v14</title>', '<title>Calc Workshop — Style Lab</title>\n'
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link href="https://fonts.googleapis.com/css2?family=Architects+Daughter&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">')
sub('  Calc Workshop — prototype v14  (', '  Calc Workshop — STYLE LAB, a design exploration built from prototype v14. Same calculators; five looks to compare.\n'
    '  Only the CSS (the variables and the "STYLE LAB" block) and the plot colours change between styles.\n  Prototype history: (')
sub('<small>PROTOTYPE v14</small>', '<small>STYLE LAB</small>')
sub('<footer>Prototype v14 ·', '<footer>Style Lab (built from prototype v14) ·')

# ---- CSS: hard-coded colours become variables ----
sub('background:rgba(246,245,240,.92);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}',
    'background:var(--top-bg);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}')
sub('.navitem:hover{background:#ecebe4}', '.navitem:hover{background:var(--hover)}')
sub('.navitem.on{background:var(--accent-soft);color:#17695f;font-weight:600}', '.navitem.on{background:var(--accent-soft);color:var(--accent-ink);font-weight:600}')
sub('border-radius:7px;background:#fbfbf9;overflow:hidden}', 'border-radius:7px;background:var(--input-bg);overflow:hidden}')
sub('.tile.primary{background:var(--ink);border-color:var(--ink);color:#fff}', '.tile.primary{background:var(--primary-bg);border-color:var(--primary-bg);color:var(--primary-ink)}')
sub('.tile.primary .k{color:#b8bcc4}', '.tile.primary .k{color:var(--primary-k)}')
sub('figure.panel{margin:0;background:var(--panel);border-radius:12px;padding:10px 12px 12px;color:var(--panel-ink);min-width:0}',
    'figure.panel{margin:0;background:var(--p-bg);border-radius:12px;padding:10px 12px 12px;color:var(--p-tcell);min-width:0}')
sub('figure.panel figcaption{font-size:12px;letter-spacing:.06em;color:#9aa6b8;margin-bottom:6px}', 'figure.panel figcaption{font-size:12px;letter-spacing:.06em;color:var(--p-cap);margin-bottom:6px}')
sub('.readout{background:#151b26;', '.readout{background:var(--p-readout);')
sub('.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#9aa6b8;margin-top:8px}', '.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--p-cap);margin-top:8px}')
sub('overflow-x:auto;padding:4px 2px;color:#e6eaf0}', 'overflow-x:auto;padding:4px 2px;color:var(--p-code)}')
sub('.docs .eq{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:#f3f2ec;', '.docs .eq{font-family:var(--mono);font-size:13px;background:var(--eq-bg);')
sub('table.dark th{color:#9aa6b8;border-color:#344055} table.dark td{border-color:#344055;color:#c9d1de}',
    'table.dark th{color:var(--p-cap);border-color:var(--p-tline)} table.dark td{border-color:var(--p-tline);color:var(--p-tcell)}')
sub('table.dark tr.now td{color:#fff;font-weight:700;background:rgba(79,141,245,.18)}', 'table.dark tr.now td{color:var(--p-nowink);font-weight:700;background:var(--p-now)}')
sub('background:var(--ink);color:#fff;padding:8px 14px;border-radius:8px;font-size:14px;pointer-events:none}',
    'background:#111418;color:#fff;padding:8px 14px;border-radius:8px;font-size:14px;pointer-events:none}')
sub('.seg button.on{background:var(--ink);color:#fff}', '.seg button.on{background:var(--ink);color:var(--bg)}')
sub('</style>\n</head>', themes + '</style>\n</head>')

# ---- the switcher ----
sub('<div id="toast"></div>', '''<div id="toast"></div>
<div class="labbar">
  <b>Style lab</b>
  <span class="lablab">Style</span>
  <div class="lseg" id="themeSeg"><button data-t="current">Current</button><button data-t="notebook">Notebook</button><button data-t="panel">Instrument</button><button data-t="m13">match13 light</button><button data-t="m13dark">match13 dark</button><button data-t="dense">Dense</button></div>
  <span class="lablab">Layout</span>
  <div class="lseg" id="layoutSeg"><button data-l="scroll">v14 long page</button><button data-l="bands">Step bands</button><button data-l="tabs">Step tabs</button><button data-l="dash">Dashboard</button></div>
</div>''')

# ---- plot colours come from the style ----
c0 = s.index('const COL = {'); c1 = s.index('};', c0) + 2
s = s[:c0] + '''// Plot colours come from the style's CSS variables (Style Lab), so switching style restyles the plots too.
const COL = {};
function readCOL(){
  const st = getComputedStyle(document.body), g = k => st.getPropertyValue(k).trim();
  Object.assign(COL, { panel:g('--p-bg'), grid:g('--p-grid'), axis:g('--p-axis'), text:g('--p-text'), white:g('--p-ink'),
    green:g('--p-green'), red:g('--p-red'), blue:g('--p-blue'), purple:g('--p-purple'), orange:g('--p-orange'), font:g('--p-font'), style:g('--p-style') });
}
readCOL();''' + s[c1:]
sub("c.font = '11px -apple-system,Segoe UI,sans-serif';", "c.font = '11px ' + (COL.font || '-apple-system,Segoe UI,sans-serif');")

# ---- match13 plot style: three y labels (min, middle, max), one faint middle line, no vertical grid, dots on lines ----
sub("""    const px = X(t*fx); c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(px, m.t); c.lineTo(px, H-m.b); c.stroke();""",
    """    const px = X(t*fx); if (COL.style !== 'dots'){ c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(px, m.t); c.lineTo(px, H-m.b); c.stroke(); }""")
sub("""  niceTicks(yr[0]/fy, yr[1]/fy, 5).forEach(t => {
    const py = Y(t*fy); c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(m.l, py); c.lineTo(W-m.r, py); c.stroke();""",
    """  const dots = COL.style === 'dots';
  (dots ? [yr[0], (yr[0] + yr[1])/2, yr[1]].map(y => +(y/fy).toPrecision(3)) : niceTicks(yr[0]/fy, yr[1]/fy, 5)).forEach((t, i) => {
    const py = Y(t*fy);
    if (!dots || i === 1){ c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(m.l, py); c.lineTo(W-m.r, py); c.stroke(); }""")
sub("""    const flush = () => { if (run.length > 1) polyline(f.c, run, f.X, f.Y); run = []; };""",
    """    const flush = () => {
      if (run.length > 1){
        if (COL.style === 'dots' && !s.dash){
          // match13 look: a soft, faded line with a dot about every 10 pixels along it
          f.c.save(); f.c.globalAlpha = 0.35; f.c.lineWidth = (s.w || 2) + 2; f.c.lineCap = f.c.lineJoin = 'round'; polyline(f.c, run, f.X, f.Y); f.c.restore();
          f.c.fillStyle = s.col; let lx = -1e9, ly = -1e9;
          run.forEach((p, i) => { const x = f.X(p[0]), y = f.Y(p[1]);
            if (Math.hypot(x - lx, y - ly) >= 10 || i === run.length - 1){ f.c.beginPath(); f.c.arc(x, y, 3.2, 0, 7); f.c.fill(); lx = x; ly = y; } });
        } else polyline(f.c, run, f.X, f.Y);
      }
      run = [];
    };""")

# ---- style + layout state, kept in the link ----
sub("const state = { calc:'bend', units:'imperial', values:{} };", "const state = { calc:'arm', units:'imperial', values:{}, theme:'current', layout:'bands' };")
sub("  const q = new URLSearchParams({ c: state.calc, u: state.units });", "  const q = new URLSearchParams({ c: state.calc, u: state.units, st: state.theme, sl: state.layout });")
sub("  if (q.get('u') === 'metric' || q.get('u') === 'imperial') state.units = q.get('u');",
    "  if (q.get('u') === 'metric' || q.get('u') === 'imperial') state.units = q.get('u');\n"
    "  if (['current','notebook','panel','m13','m13dark','dense'].includes(q.get('st'))) state.theme = q.get('st');\n"
    "  if (['scroll','bands','tabs','dash'].includes(q.get('sl'))) state.layout = q.get('sl');")

# layouts (step bands, step tabs, dashboard) and the compact-input / summary changes: lab_layout.js
layout_js = open(os.path.join(sp, 'lab_layout.js'), encoding='utf-8').read()
sub("function renderPage(){", layout_js + "function renderPage(){")
# applyTabs after the form is drawn and after the results are drawn
fi = s.index('function renderForm(){'); fe = s.index("  }).join('');\n}", fi)
s = s[:fe] + "  }).join('');\n  applyTabs();\n}" + s[fe + len("  }).join('');\n}"):]
sub("    calc.renderOut(document.getElementById('out'), v, calc.compute(v));", "    calc.renderOut(document.getElementById('out'), v, calc.compute(v));\n    applyTabs();")

# start on Arm, in the style from the link; redraw the plots once the web fonts arrive
sub("state.calc = CALCS[0].id;", "state.calc = 'arm';")
sub("readHash();\nrenderPage();", "readHash();\napplyStyle();\nrenderPage();\nif (document.fonts) document.fonts.ready.then(() => update());")

os.makedirs(root + 'design', exist_ok=True)
open(root + 'design/style_lab.html', 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(s))
