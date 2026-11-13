/* ---------- 4b½. WCP parts (shared by Gear Ratio and Chain & Belt C-C) ----------
   WCP's gears, pulleys, sprockets and timing belts, read from WCP's own product list by tools/wcp_parts.py
   (data/wcp_parts.json). Each part: sku, type (gear / pulley / sprocket / belt), teeth, pitch ('20 DP', 'HTD 5mm',
   '#25'...), bore, width, material, cdTeeth (a gear that meshes at a different tooth count's spacing), name, handle.
   Prices and stock change, so the page links to each part on wcproducts.com instead of copying them. */
const WCP_DATE = '__WCP_DATE__';
const WCP_PARTS = __WCP_PARTS__;
const wcpUrl = p => 'https://wcproducts.com/products/' + p.handle;
// How many parts use each bore: with "Any" bore, the common bores (½" hex...) come before motor-only ones (CIM, BAG...)
const BORE_RANK = WCP_PARTS.reduce((n, p) => { if (p.bore) n[p.bore] = (n[p.bore] || 0) + 1; return n; }, {});
const boreLabel = b => b ? b.replace(/(\d)in\b/g, '$1"') : '—';
// Bore choices for a select, most common first
const boreOptions = (...types) => {
  const n = {}; WCP_PARTS.forEach(p => { if (types.includes(p.type) && p.bore) n[p.bore] = (n[p.bore] || 0) + 1; });
  return [{ value:'any', label:'Any' }, ...Object.keys(n).sort((a, b) => n[b] - n[a]).map(b => ({ value:b, label:boreLabel(b) }))];
};
// Matching parts for one gear / pulley / sprocket / belt. Prefers the bore asked for; if WCP has none in that bore,
// shows the other bores (relaxed = true). The pick is the part number chosen in the results ('' = first in the list).
function wcpMatch(q){
  const all = WCP_PARTS.filter(p => p.type === q.type && p.pitch === q.pitch && p.teeth === q.teeth && (!q.width || q.width === 'any' || p.width === q.width))
    .sort((a, b) => (a.cdTeeth ? 1 : 0) - (b.cdTeeth ? 1 : 0) || (BORE_RANK[b.bore] || 0) - (BORE_RANK[a.bore] || 0) ||
      (a.material === 'Steel' ? 0 : 1) - (b.material === 'Steel' ? 0 : 1) || a.sku.localeCompare(b.sku));
  let list = all.filter(p => !q.bore || q.bore === 'any' || p.bore === q.bore), relaxed = false;
  if (!list.length && all.length){ list = all; relaxed = true; }
  return { list, relaxed, part:list.find(p => p.sku === q.pick) || list[0] || null };
}
// One row per gear / pulley: what it is, and a dropdown of the WCP parts that fit
function partRows(rows){
  return rows.map(x => {
    const kind = x.type === 'gear' ? `${x.pitch} gear` : x.type === 'belt' ? `${x.pitch} belt` : `${x.pitch} ${x.type}`;
    if (!x.part) return `<tr><td>${x.label}</td><td>${x.teeth}t</td><td colspan="2" class="dim">WCP doesn’t list a ${x.teeth}t ${kind}${x.width && x.width !== 'any' ? `, ${x.width} wide` : ''}.</td></tr>`;
    const opt = p => `${p.sku} · ${p.type === 'belt' ? p.width : boreLabel(p.bore)}${p.material ? ' · ' + p.material : ''}${p.width && p.type !== 'belt' ? ' · ' + p.width : ''}${p.cdTeeth ? ` · spaced as ${p.cdTeeth}t` : ''}`;
    return `<tr><td>${x.label}</td><td>${x.teeth}t</td>
      <td><select class="pick" data-key="${x.key}" title="${x.part.name.replace(/"/g, '&quot;')}">${x.list.map(p => `<option value="${p.sku}" ${p === x.part ? 'selected' : ''}>${opt(p)}</option>`).join('')}</select>
        ${x.relaxed ? `<div class="dim">none in ${boreLabel(x.bore)}; showing other bores</div>` : ''}${x.part.cdTeeth ? `<div class="dim">meshes like a ${x.part.cdTeeth}t gear: the center distance uses ${x.part.cdTeeth}t</div>` : ''}</td>
      <td><a href="${wcpUrl(x.part)}" target="_blank" rel="noopener">WCP ↗</a></td></tr>`;
  }).join('');
}
// The order list: the picked parts, counted
function orderRows(parts){
  const m = new Map();
  parts.filter(Boolean).forEach(p => { const e = m.get(p.sku) || { p, qty:0 }; e.qty++; m.set(p.sku, e); });
  return [...m.values()];
}
function orderHtml(parts, extra = ''){
  const rows = orderRows(parts);
  if (!rows.length && !extra) return '';
  orderHtml.last = rows;   // the Copy / Download buttons read this
  return `<figure class="panel" style="margin-top:12px"><figcaption>ORDER LIST · WCP</figcaption>
    <table class="dark"><tr><th>Qty</th><th>Part number</th><th>Part</th><th></th></tr>
    ${rows.map(e => `<tr><td>${e.qty}</td><td class="mono">${e.p.sku}</td><td>${e.p.name}</td><td><a href="${wcpUrl(e.p)}" target="_blank" rel="noopener">WCP ↗</a></td></tr>`).join('')}
    ${extra}</table>
    ${rows.length ? `<div style="display:flex;gap:8px;margin-top:10px"><button class="btn" data-order="copy">Copy list</button><button class="btn" data-order="csv">Download CSV</button></div>` : ''}
    <p class="note">Part numbers from WCP’s catalog on ${WCP_DATE}. Check price and stock on WCP before you order.</p></figure>`;
}
document.getElementById('main').addEventListener('click', async e => {
  const b = e.target.closest('[data-order]'), rows = orderHtml.last;
  if (!b || !rows) return;
  if (b.dataset.order === 'copy'){
    const text = 'WCP order (Calc Workshop)\n' + rows.map(r => `${r.qty} × ${r.p.sku}  ${r.p.name}\n    ${wcpUrl(r.p)}`).join('\n');
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    toast('Order list copied');
  } else {
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    const csv = 'vendor,part_number,qty,name,url\n' + rows.map(r => ['WCP', r.p.sku, r.qty, q(r.p.name), wcpUrl(r.p)].join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' })); a.download = 'wcp_order.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
});
// Checks shared by both calculators: the parts list itself
function partsChecks(){
  const bad = WCP_PARTS.filter(p => !p.name.startsWith(p.teeth + 't') || !p.name.replace(/\s+/g, '').includes(p.pitch.replace(/\s+/g, '')) || !/^[A-Z0-9][A-Z0-9-]+$/i.test(p.sku));
  const dup = WCP_PARTS.length - new Set(WCP_PARTS.map(p => p.sku)).size;
  const two = orderRows([WCP_PARTS[0], WCP_PARTS[1], WCP_PARTS[0]]);
  return [
    { name:`WCP parts list: every part’s tooth count and pitch are in its name (${WCP_PARTS.length} parts; count that fail)`, expected:0, got:bad.length, unit:'', tol:0 },
    { name:'… no part number listed twice', expected:0, got:dup, unit:'', tol:0 },
    { name:'Order list counts a part used twice as quantity 2', expected:2, got:(two.find(r => r.p === WCP_PARTS[0]) || {}).qty, unit:'', tol:0 },
  ];
}
