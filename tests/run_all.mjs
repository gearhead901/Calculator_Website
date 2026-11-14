#!/usr/bin/env node
/* Run every test in one go, without a browser. Use it before each commit.

     node tests/run_all.mjs                 # tests src/ (what you're editing), built in memory
     node tests/run_all.mjs path/to.html    # tests one page, e.g. prototype/calc_prototype_v21.html
     node tests/run_all.mjs --verbose       # also list every passing check

   What it checks:
     1. Every calculator's Validation table (the same rows the page shows under "Validation").
     2. The bolted joint and thread stripping cases in tests/*.json (same as tests/run_bolted_joint_tests.py),
        and that the thread data embedded in the page still matches data/*.json.
     3. Whether the newest prototype/calc_prototype_vNN.html is up to date with src/. This one is only a note:
        if src/ has changes, run  python build/build.py NN  with a new number before committing.
   Exit code 0 = everything passed, 1 = something failed. Needs only Node.js (no npm install). */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const pageArg = args.find(a => !a.startsWith('-'));

// ---- the page under test ----
// Same steps as build/build.py: each line  /*@include NAME@*/  becomes the files in src/NAME/ (name order),
// and {{VERSION}} becomes the version number. Check 3 compares this with a page build.py made, so the two can't drift apart.
function buildFromSrc(version){
  const src = path.join(ROOT, 'src');
  const page = fs.readFileSync(path.join(src, 'page.html'), 'utf8');
  return page.replace(/^\/\*@include (\w+)@\*\/$/gm, (_, name) => {
    const dir = path.join(src, name);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
    if (!files.length) throw new Error(`nothing to include for ${name}`);
    const text = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
    return text.endsWith('\n') ? text.slice(0, -1) : text;
  }).replaceAll('{{VERSION}}', String(version));
}
const prototypes = fs.readdirSync(path.join(ROOT, 'prototype'))
  .map(f => f.match(/^calc_prototype_v(\d+)\.html$/)).filter(Boolean)
  .map(m => ({ n:+m[1], file:path.join(ROOT, 'prototype', m[0]) })).sort((a, b) => a.n - b.n);
const newest = prototypes.at(-1);

const html = pageArg ? fs.readFileSync(path.resolve(pageArg), 'utf8') : buildFromSrc('dev');
const label = pageArg ? rel(path.resolve(pageArg)) : 'src/ (built in memory)';
console.log(`Testing ${label}\n`);
let failed = 0, passed = 0;

// ---- 1. Validation tables ----
// Run the page's script in Node up to the "5. PAGE" section (the part that draws the page), with a do-nothing
// stand-in for the browser's document and window. Then ask each calculator for its validation rows.
function fakeBrowser(){
  const el = new Proxy(function(){}, { get:(t, k) => k === Symbol.toPrimitive ? () => '' : el, apply:() => el, set:() => true });
  return { document:el, window:el, navigator:el, location:{ hash:'', href:'' }, URLSearchParams, URL,
    setTimeout:() => 0, clearTimeout:() => {}, requestAnimationFrame:() => 0, console };
}
function loadCalcs(page){
  const script = page.slice(page.indexOf('<script>') + 8, page.lastIndexOf('</script>'));
  const cut = script.search(/^\s+5\. PAGE\s*$/m);
  if (cut < 0) throw new Error('could not find the "5. PAGE" section in the page script');
  const code = script.slice(0, script.lastIndexOf('/*', cut)) + '\n;({ CALCS });';
  return vm.runInContext(code, vm.createContext(fakeBrowser()), { filename:'page-script.js' }).CALCS;
}
console.log('=== Validation tables ===');
let calcs;
try { calcs = loadCalcs(html); }
catch (e){ failed++; console.log(`  FAIL  the page script didn't load: ${e.stack || e}\n`); calcs = []; }
for (const calc of calcs){
  if (typeof calc.validation !== 'function'){ console.log(`  ${calc.title.padEnd(28)} (no validation table)`); continue; }
  let rows;
  try { rows = calc.validation(); }
  catch (e){ failed++; console.log(`  ${calc.title.padEnd(28)} FAIL  validation() threw: ${e.message}`); continue; }
  const bad = rows.filter(x => !(Math.abs(x.got - x.expected) <= x.tol));   // the page's own pass rule (NaN fails)
  passed += rows.length - bad.length; failed += bad.length;
  console.log(`  ${calc.title.padEnd(28)} ${bad.length ? `${bad.length} FAILED of ${rows.length}` : `${rows.length} pass`}`);
  for (const x of rows){
    const ok = !bad.includes(x);
    if (!ok || verbose) console.log(`      ${ok ? 'pass' : 'FAIL'}  ${x.name.replace(/<[^>]+>/g, '')}: expected ${x.expected} ${x.unit}, got ${x.got} (tolerance ${x.tol})`);
  }
}

// ---- 2. Bolted joint and thread stripping cases ----
// Same as tests/run_bolted_joint_tests.py: cut the BOLTED JOINT CORE block out of the page, add the case files and
// tests/bolted_joint_harness.js, and run them.
console.log('\n=== Bolted joint and thread stripping cases ===');
const START = '/* === BOLTED JOINT CORE START ===', END = '/* === BOLTED JOINT CORE END === */';
const CASE_FILES = ['bolted_joint_cases.json', 'thread_stripping_cases.json', 'thread_stripping_metric_cases.json'];
const EMBEDS = [['const UNIFIED_THREAD_LIMITS = ', 'data/unified_thread_limits.json'],
                ['const METRIC_THREAD_LIMITS = ', 'data/metric_thread_limits.json']];
const T = f => fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8');
if (!html.includes(START) || !html.includes(END)){ failed++; console.log('  FAIL  the page has no BOLTED JOINT CORE block'); }
else {
  const core = html.slice(html.indexOf(START), html.indexOf(END) + END.length);
  const suites = CASE_FILES.map(f => `{"file":${JSON.stringify(f)},"data":${T(f)}}`).join(',');
  let results;
  try {
    const harness = T('bolted_joint_harness.js').replace(/const __out[\s\S]*$/, 'runAll();');   // return the results instead of printing them
    results = vm.runInContext(`${core}\nconst SUITES = [${suites}];\n${harness}`, vm.createContext({ console }), { filename:'bolt-tests.js' });
    results = JSON.parse(JSON.stringify(results));
  } catch (e){ failed++; console.log(`  FAIL  the bolted joint tests didn't run: ${e.stack || e}`); results = []; }
  for (const [embed, dataFile] of EMBEDS){
    if (!core.includes(embed)) continue;
    const start = core.indexOf(embed) + embed.length;
    const same = sameJson(readJsonPrefix(core.slice(start)), JSON.parse(fs.readFileSync(path.join(ROOT, dataFile), 'utf8')));
    results.push({ file:dataFile, id:'embedded_thread_data', title:`thread data in the page matches ${dataFile}`,
      checks:[{ path:'identical', expected:true, actual:same, ok:same }] });
  }
  let lastFile;
  for (const c of results){
    if (c.file !== lastFile){ lastFile = c.file; console.log(`  ${c.file}`); }
    const bad = c.checks.filter(k => !k.ok);
    if (c.error){ failed++; console.log(`    FAIL  ${c.id}: ${c.error}`); }
    passed += c.checks.length - bad.length; failed += bad.length;
    console.log(`    ${c.id.padEnd(34)} ${bad.length ? `${bad.length} FAILED of ${c.checks.length}` : `${c.checks.length} pass`}`);
    for (const k of c.checks) if (!k.ok || verbose)
      console.log(`        ${k.ok ? 'pass' : 'FAIL'}  ${k.path}: expected ${k.expected}, got ${k.actual}`);
  }
}

// ---- 3. Is the newest prototype up to date with src/? (a note, not a failure) ----
console.log('\n=== Newest prototype vs src/ ===');
if (pageArg) console.log('  (skipped: testing a single page)');
else if (!newest || newest.n < 19) console.log('  (no prototype built from src/ yet)');
else {
  const same = fs.readFileSync(newest.file, 'utf8') === buildFromSrc(newest.n);
  console.log(same ? `  ${rel(newest.file)} is up to date with src/`
    : `  NOTE  src/ has changes that aren't in ${rel(newest.file)} yet. Build a new version: python build/build.py ${newest.n + 1}`);
}

console.log(`\n${failed ? `${failed} FAILED, ${passed} passed.` : `All ${passed} checks passed.`}`);
process.exit(failed ? 1 : 0);

// ---- helpers ----
function readJsonPrefix(text){   // parse the JSON value at the start of text, ignoring whatever follows it
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (inStr){ if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']'){ if (--depth === 0) return JSON.parse(text.slice(0, i + 1)); }
  }
  throw new Error('embedded JSON never closes');
}
function sameJson(a, b){
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a && b && typeof a === 'object'){
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
  }
  return a === b;
}
