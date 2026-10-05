// State of the field: one table per group, generated from data/state-of-the-field.json.
// Rows with a `from` pointer read the latest value from another signed dataset.
import { h, clear } from './assets/js/dom.js';
import { loadData, setBadge, is } from './assets/js/data.js';

const $ = (id) => document.getElementById(id);
const validSof = (d) => is.obj(d) && is.arr(d.data) && d.data.every((r) => is.str(r.id) && is.str(r.label) && is.str(r.source) && is.str(r.as_of));
const pairs = (a) => is.arr(a) && a.every((p) => is.arr(p) && is.year(p[0]) && is.num(p[1]));
const VALID = {
  'module-prices.json': (d) => is.obj(d) && pairs(d.data),
  'solar-deployment.json': (d) => is.obj(d) && is.obj(d.data) && pairs(d.data.capacity_gw) && pairs(d.data.lcoe_pv),
  'electricity-mix.json': (d) => is.obj(d) && is.obj(d.data) && is.obj(d.data.World),
  'efficiency-records.json': (d) => is.obj(d) && is.obj(d.data) && is.arr(d.data.points),
};
const RECORD_TECH = { 'record-silicon': 'si-mono', 'record-perovskite': 'perovskite', 'record-tandem': 'perovskite-si', 'record-multijunction': 'iii-v-conc' };

init();

async function init() {
  const host = $('sf-groups'); const badge = $('sf-badge');
  let sof; let state;
  try { ({ data: sof, state } = await loadData('state-of-the-field.json', validSof)); } catch (e) {
    console.error(e); setBadge(badge, 'failed'); clear(host).append(h('p', {}, 'The numbers could not be loaded.')); return;
  }
  const names = [...new Set(sof.data.map((r) => r.from?.dataset).filter(Boolean)), 'efficiency-records.json'];
  const sets = {};
  let worst = state;
  await Promise.all(names.map(async (n) => {
    try { const r = await loadData(n, VALID[n]); sets[n] = r.data; if (r.state !== 'verified') worst = r.state; } catch (e) { console.error(e); worst = 'failed'; }
  }));
  setBadge(badge, worst, 'state-of-the-field.json and the datasets it reads');
  const sources = await loadData('sources.json').then((r) => r.data).catch(() => ({}));

  const groups = [...new Set(sof.data.map((r) => r.group))];
  clear(host);
  for (const g of groups) {
    const rows = sof.data.filter((r) => r.group === g).map((r) => resolve(r, sets));
    host.append(h('h3', { class: 'sf-group' }, g), h('div', { class: 'table-wrap' }, h('table', { class: 'sf-table' },
      h('colgroup', {}, h('col', { class: 'sf-c1' }), h('col', { class: 'sf-c2' }), h('col', { class: 'sf-c3' }), h('col', { class: 'sf-c4' }), h('col', { class: 'sf-c5' })),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Figure'), h('th', { scope: 'col', class: 'num' }, 'Value'), h('th', { scope: 'col' }, 'As of'),
        h('th', { scope: 'col' }, 'Source'), h('th', { scope: 'col' }, 'Last verified'))),
      h('tbody', {}, rows.map((r) => row(r, sources))))));
  }
}

function resolve(r, sets) {
  const out = { ...r };
  if (r.from) {
    const d = sets[r.from.dataset];
    if (!d) return { ...out, value: null, missing: true };
    const lastOf = (a) => a[a.length - 1];
    switch (`${r.from.dataset}:${r.from.pick}`) {
      case 'module-prices.json:last': { const [y, v] = lastOf(d.data); Object.assign(out, { value: v, digits: 2, as_of: String(y) }); break; }
      case 'solar-deployment.json:capacity_gw.last': { const [y, v] = lastOf(d.data.capacity_gw); Object.assign(out, { value: v, digits: 0, as_of: `end of ${y}` }); break; }
      case 'solar-deployment.json:capacity_gw.diff': { const a = d.data.capacity_gw; const [y, v] = lastOf(a); Object.assign(out, { value: v - a[a.length - 2][1], digits: 0, as_of: String(y) }); break; }
      case 'solar-deployment.json:lcoe_pv.last': { const [y, v] = lastOf(d.data.lcoe_pv); Object.assign(out, { value: v, digits: 3, as_of: String(y) }); break; }
      case 'electricity-mix.json:World.solar_share_elec.last': {
        const w = d.data.World; let i = w.years.length - 1;
        while (i > 0 && w.solar_share_elec[i] == null) i--;
        Object.assign(out, { value: w.solar_share_elec[i], digits: 1, as_of: String(w.years[i]) }); break;
      }
      default: out.value = null; out.missing = true;
    }
  }
  const tech = RECORD_TECH[r.id];
  const recs = sets['efficiency-records.json'];
  if (tech && recs) {
    const best = recs.data.points.filter((p) => p.tech === tech).reduce((a, b) => (!a || b.efficiency > a.efficiency ? b : a), null);
    if (best && best.efficiency > r.value + 1e-9) out.stale = `The records dataset holds a higher value (${best.efficiency} %, ${best.year}); this row needs updating.`;
  }
  return out;
}

function fmtValue(r) {
  if (r.value == null) return '—';
  const n = r.digits == null ? String(r.value)
    : r.value.toLocaleString('en-US', { minimumFractionDigits: r.digits, maximumFractionDigits: r.digits });
  return r.unit === '%' ? `${n} %` : r.unit.startsWith('US$') ? `$${n}` : n;
}

function row(r, sources) {
  const s = sources[r.source];
  const link = s ? (s.doi ? `https://doi.org/${s.doi}` : s.url) : null;
  const unit = r.unit === '%' ? '' : r.unit.replace(/^US\$ /, '');
  return h('tr', {},
    h('th', { scope: 'row' }, h('span', { class: 'sf-label' }, r.label), h('span', { class: 'sf-detail' }, r.detail || ''),
      r.stale ? h('span', { class: 'sf-stale' }, r.stale) : null),
    h('td', { class: 'num sf-value' }, h('span', { class: 'sf-num' }, fmtValue(r)), unit ? h('span', { class: 'sf-unit' }, unit) : null),
    h('td', { class: 'sf-asof' }, r.as_of),
    h('td', {}, link ? h('a', { href: link, rel: 'noopener noreferrer' }, s.authors || s.title) : r.source,
      h('br'), h('a', { href: `sources.html#src-${r.source}`, class: 'sf-rec' }, 'Source record')),
    h('td', {}, h('span', { class: 'verified' }, r.last_verified)));
}
