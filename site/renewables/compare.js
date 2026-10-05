// Comparison dashboard: range chart across sources, growth panel, LCOE lab and a
// custom-metric box. All drawing uses CSS classes so the theme switch needs no redraw
// (except the ECharts growth chart, which charts.js re-renders on theme change).

import { h, clear, fmt } from '../assets/js/dom.js';
import { loadData, setBadge, is } from '../assets/js/data.js';
import { makeChart, baseOption } from '../assets/js/charts.js';
import { parse, evaluate, variablesOf, ExprError } from '../assets/js/safe-expr.js';
import { capitalRecoveryFactor } from '../assets/js/physics/econ.js';
import { lcoeBreakdown, impliedDiscountRate } from '../assets/js/physics/levelized.js';

const $ = (id) => document.getElementById(id);
const S = (tag, attrs, ...kids) => h.svg(tag, attrs, ...kids);
const FORMULA_MAX = 200;
const DEFAULT_R = 0.06;

// ---------- formatting ----------
const pct = (x) => `${Number((x * 100).toFixed(1))} %`;
const usd = (x) => `$${Math.round(x).toLocaleString('en-US')}`;
const kwh = (x) => `$${x.toFixed(3)}`;
const sig = (x) => fmt(x, 2);

const SOURCE_NAMES = {
  'irena-costs-2025': 'IRENA, Renewable Power Generation Costs in 2024',
  'lazard-lcoeplus-2025': 'Lazard LCOE+ v18.0, June 2025',
  'eia-epa-table-4-08-a': 'EIA Electric Power Annual, table 4.08.A',
  'eia-epa-table-4-08-b': 'EIA Electric Power Annual, table 4.08.B',
  'eia-aeo2026-emm': 'EIA AEO2026 assumptions',
  'eia-aeo2023-costs': 'EIA AEO2023 cost and performance',
  'lovering-2022': 'Lovering et al. 2022',
  'ipcc-ar5-wg3-annex3': 'IPCC AR5 WGIII Annex III',
  'owid-energy-data': 'Our World in Data',
};
const srcName = (id) => (id ? SOURCE_NAMES[id] ?? id : 'this page’s assumption');

// ---------- what each "compare on" view draws ----------
const METRICS = {
  cf: {
    label: 'Capacity factor', axis: 'Capacity factor (share of the year at full output)', axisShort: 'Capacity factor', scale: 'linear', min: 0, max: 1, f: pct, tick: (x) => `${Math.round(x * 100)} %`,
    marks: { central: 'Global average, new projects 2024 (IRENA)', range: 'Range for new US plants (Lazard 2025)', us: 'US fleet average 2024 (EIA)' },
    sources: ['irena-costs-2025', 'lazard-lcoeplus-2025', 'eia-epa-table-4-08-a', 'eia-epa-table-4-08-b'],
    take: 'Geothermal, bioenergy and nuclear run most of the year; solar the least. The US fleet marks sit below the new-plant figures for most sources: they include older plants, and fossil plants that were simply asked to run less.',
  },
  capex: {
    label: 'Installed cost', axis: 'Installed cost (US$ per kW of capacity)', axisShort: 'US$ per kW', scale: 'linear', min: 0, max: 15000, f: usd, tick: (x) => (x >= 1000 ? `$${x / 1000}k` : `$${x}`),
    marks: { central: 'Global average, new projects 2024 (IRENA)', range: 'Range for new US plants (Lazard 2025)', us: 'New US plant, overnight cost (EIA AEO2026)' },
    sources: ['irena-costs-2025', 'lazard-lcoeplus-2025', 'eia-aeo2026-emm'],
    take: 'Utility solar is the cheapest to build per kilowatt worldwide, and nuclear by far the most expensive in the US. US costs run well above IRENA’s global averages, which are pulled down by large, low-cost markets such as China.',
  },
  lcoe: {
    label: 'LCOE', axis: 'Levelized cost of energy (US$ per kWh, unsubsidized)', axisShort: 'US$ per kWh, unsubsidized', scale: 'linear', min: 0, max: 0.25, f: kwh, tick: (x) => `$${x.toFixed(2)}`,
    marks: { central: 'Global average 2024 (IRENA; coal and gas are IRENA’s comparison points)', range: 'Range for new US plants (Lazard 2025)' },
    sources: ['irena-costs-2025', 'lazard-lcoeplus-2025'],
    take: 'Among new plants in 2024, onshore wind (3.4 US cents per kWh) and solar PV (4.3 cents) had the lowest global average costs, below IRENA’s figures for coal (7.3) and gas (8.5). These are plant costs only: firming a variable supply costs extra.',
  },
  land: {
    label: 'Land use', axis: 'Land use (m² per MWh made each year, log scale)', axisShort: 'm² per MWh/yr (log scale)', scale: 'log', min: 0.05, max: 1000, f: sig, tick: (x) => fmt(x, 1),
    marks: { central: 'Median, whole site incl. mines (Lovering et al. 2022)', direct: 'Direct footprint only, where separated' },
    sources: ['lovering-2022'],
    take: 'Land needs span four orders of magnitude, so the axis is logarithmic: each gridline is ten times the last. Nuclear needs least and energy crops most. A wind farm’s site is large, but turbines and roads cover about 1 % of it.',
  },
  ghg: {
    label: 'Lifecycle emissions', axis: 'Lifecycle emissions (g CO2e per kWh, log scale)', axisShort: 'g CO2e per kWh (log scale)', scale: 'log', min: 1, max: 3000, f: sig, tick: (x) => fmt(x, 1),
    marks: { central: 'Median of published studies (IPCC AR5)', range: 'Lowest to highest study (IPCC AR5)' },
    sources: ['ipcc-ar5-wg3-annex3'],
    take: 'Wind, solar, geothermal, hydro and nuclear medians fall between 11 and 48 g per kWh, against 490 for gas and 820 for coal. Hydro’s range is the widest, because some reservoirs give off methane from flooded vegetation.',
  },
};
const MARK_ORDER = ['range', 'central', 'direct', 'us'];
const MARK_LABEL_SHORT = { central: 'dot', range: 'bar', us: 'diamond', direct: 'ring' };

// ---------- validation ----------
const isVal = (o) => is.obj(o) && is.str(o.unit) && (is.num(o.value) || (is.num(o.low) && is.num(o.high)));
function validateCompare(d) {
  if (!is.obj(d) || !is.obj(d.meta) || !is.obj(d.data) || !is.arr(d.data.techs) || d.data.techs.length < 5) return false;
  for (const t of d.data.techs) {
    if (!is.str(t.id) || !is.str(t.name) || !is.obj(t.lab) || !is.obj(t.growth)) return false;
    for (const k of ['cf', 'capex', 'lcoe', 'land']) for (const o of Object.values(t[k] ?? {})) if (!isVal(o)) return false;
    if (!isVal(t.ghg)) return false;
    for (const k of ['capex', 'cf', 'fixedOM', 'varOM', 'fuel', 'life']) if (!is.num(t.lab[k]?.value)) return false;
  }
  return true;
}
function validateMix(d) {
  return is.obj(d) && is.obj(d.data) && is.obj(d.data.World) && is.arr(d.data.World.years) && d.data.World.years.every(is.year);
}

// ---------- state ----------
let techs = [];
let meta = {};
const state = { metric: 'lcoe', shown: new Set(), sort: false };

/** The marks a technology has for a metric: { central, range, us, direct } (each a value object or undefined). */
function marksFor(t, metric) {
  if (metric === 'ghg') return { central: t.ghg, range: { low: t.ghg.low, high: t.ghg.high, unit: t.ghg.unit, year: t.ghg.year, source: t.ghg.source } };
  const m = t[metric] ?? {};
  return { central: m.central?.value != null ? m.central : undefined, range: m.range?.low != null ? m.range : m.central?.low != null ? m.central : undefined, us: m.us, direct: m.direct };
}
const sortKey = (t, metric) => {
  const m = marksFor(t, metric);
  return m.central?.value ?? (m.range ? (m.range.low + m.range.high) / 2 : m.us?.value ?? Infinity);
};

// ---------- range chart ----------
function scaleFor(cfg, x0, x1) {
  if (cfg.scale === 'log') {
    const a = Math.log10(cfg.min); const b = Math.log10(cfg.max);
    return (v) => x0 + ((Math.log10(Math.min(Math.max(v, cfg.min), cfg.max)) - a) / (b - a)) * (x1 - x0);
  }
  return (v) => x0 + ((Math.min(Math.max(v, cfg.min), cfg.max) - cfg.min) / (cfg.max - cfg.min)) * (x1 - x0);
}
function ticksFor(cfg, width) {
  if (cfg.scale === 'log') {
    const out = []; for (let p = Math.ceil(Math.log10(cfg.min)); p <= Math.floor(Math.log10(cfg.max)); p++) out.push(10 ** p);
    return out;
  }
  const n = width < 320 ? 3 : width < 520 ? 4 : 5;
  const raw = (cfg.max - cfg.min) / n; const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw);
  const out = []; for (let v = cfg.min; v <= cfg.max + 1e-9; v += step) out.push(Number(v.toPrecision(6)));
  return out;
}
function centralText(t, metric) {
  const cfg = METRICS[metric]; const m = marksFor(t, metric);
  if (m.central) return cfg.f(m.central.value);
  if (m.range) return `${cfg.f(m.range.low)}–${cfg.f(m.range.high)}`;
  if (m.us) return `${cfg.f(m.us.value)} (US)`;
  return 'no data';
}
function rowDescription(t, metric) {
  const cfg = METRICS[metric]; const m = marksFor(t, metric); const parts = [];
  if (m.central) parts.push(`${cfg.marks.central}: ${cfg.f(m.central.value)}`);
  if (m.range) parts.push(`${cfg.marks.range}: ${cfg.f(m.range.low)} to ${cfg.f(m.range.high)}`);
  if (m.direct) parts.push(`${cfg.marks.direct}: ${cfg.f(m.direct.value)}`);
  if (m.us) parts.push(`${cfg.marks.us}: ${cfg.f(m.us.value)}`);
  if (!parts.length) parts.push('the cited sources give no figure');
  return `${t.name}. ${parts.join('. ')}.`;
}

function drawRangeChart() {
  const svg = $('range-chart'); const wrap = $('chart-wrap');
  const cfg = METRICS[state.metric];
  const W = Math.max(280, Math.floor(wrap.clientWidth));
  const narrow = W < 600;
  const rows = techs.filter((t) => state.shown.has(t.id));
  if (state.sort) rows.sort((a, b) => sortKey(a, state.metric) - sortKey(b, state.metric));
  const labelW = narrow ? 0 : 168; const valueW = narrow ? 0 : 118;
  const rowH = narrow ? 52 : 38; const top = 8; const axisH = 44;
  const x0 = labelW + 8; const x1 = W - valueW - 14;
  const H = top + rows.length * rowH + axisH;
  const x = scaleFor(cfg, x0, x1);
  clear(svg);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.setAttribute('aria-label', `${cfg.label} by source, ${rows.length} shown. ${rows.map((t) => `${t.short}: ${centralText(t, state.metric)}`).join('; ')}. The same numbers are in the table further down the page.`);

  const grid = S('g', { class: 'cmp-grid', 'aria-hidden': 'true' });
  for (const v of ticksFor(cfg, x1 - x0)) {
    const gx = x(v);
    grid.append(S('line', { x1: gx, x2: gx, y1: top, y2: top + rows.length * rowH, class: 'cmp-gridline' }),
      S('text', { x: gx, y: top + rows.length * rowH + 16, class: 'cmp-tick', 'text-anchor': 'middle' }, cfg.tick(v)));
  }
  grid.append(S('text', { x: (x0 + x1) / 2, y: H - 6, class: 'cmp-axis-title', 'text-anchor': 'middle' }, narrow ? cfg.axisShort : cfg.axis));
  svg.append(grid);

  rows.forEach((t, i) => {
    const y = top + i * rowH; const cy = narrow ? y + rowH - 15 : y + rowH / 2;
    const m = marksFor(t, state.metric);
    const g = S('g', { class: `cmp-row k-${t.color}`, tabindex: '0', 'aria-label': rowDescription(t, state.metric), 'data-id': t.id });
    g.append(S('rect', { x: 0, y, width: W, height: rowH, class: 'cmp-row-bg' }));
    if (narrow) {
      g.append(S('text', { x: 2, y: y + 17, class: 'cmp-row-name' }, t.short),
        S('text', { x: W - 2, y: y + 17, class: 'cmp-row-val', 'text-anchor': 'end' }, centralText(t, state.metric)));
    } else {
      g.append(S('text', { x: labelW, y: cy + 5, class: 'cmp-row-name', 'text-anchor': 'end' }, t.short),
        S('text', { x: W - 4, y: cy + 5, class: 'cmp-row-val', 'text-anchor': 'end' }, centralText(t, state.metric)));
    }
    g.append(S('line', { x1: x0, x2: x1, y1: cy, y2: cy, class: 'cmp-row-rule' }));
    if (!m.central && !m.range && !m.us && !m.direct) {
      g.append(S('text', { x: x0 + 4, y: cy + 4, class: 'cmp-nodata' }, 'not reported by these sources'));
    }
    if (m.range) {
      const a = x(m.range.low); const b = x(m.range.high);
      g.append(S('rect', { x: a - 4, y: cy - 4, width: Math.max(8, b - a + 8), height: 8, rx: 4, class: 'mk-range' }));
    }
    if (m.direct && m.central) g.append(S('line', { x1: x(m.direct.value) + 5, x2: x(m.central.value) - 6, y1: cy, y2: cy, class: 'mk-link' }));
    if (m.direct) g.append(S('circle', { cx: x(m.direct.value), cy, r: 5, class: 'mk-direct' }));
    if (m.us) {
      const ux = x(m.us.value);
      g.append(S('path', { d: `M${ux} ${cy - 7} L${ux + 7} ${cy} L${ux} ${cy + 7} L${ux - 7} ${cy} Z`, class: 'mk-us' }));
    }
    if (m.central) g.append(S('circle', { cx: x(m.central.value), cy, r: 6, class: 'mk-central' }));
    const show = () => { svg.querySelectorAll('.cmp-row.hot').forEach((r) => r.classList.remove('hot')); g.classList.add('hot'); $('row-readout').textContent = rowDescription(t, state.metric); };
    g.addEventListener('pointerenter', show); g.addEventListener('focus', show);
    svg.append(g);
  });
}

function drawKey() {
  const cfg = METRICS[state.metric]; const key = clear($('mark-key'));
  const present = new Set();
  for (const t of techs) if (state.shown.has(t.id)) for (const [k, v] of Object.entries(marksFor(t, state.metric))) if (v) present.add(k);
  for (const k of MARK_ORDER) {
    if (!present.has(k)) continue;
    const icon = S('svg', { viewBox: '0 0 28 16', class: 'cmp-key-icon', 'aria-hidden': 'true' },
      k === 'range' ? S('rect', { x: 2, y: 4, width: 24, height: 8, rx: 4, class: 'mk-range' })
        : k === 'central' ? S('circle', { cx: 14, cy: 8, r: 6, class: 'mk-central' })
          : k === 'direct' ? S('circle', { cx: 14, cy: 8, r: 5, class: 'mk-direct' })
            : S('path', { d: 'M14 1 L21 8 L14 15 L7 8 Z', class: 'mk-us' }));
    key.append(h('li', { class: 'k-neutral' }, icon, h('span', {}, h('span', { class: 'visually-hidden' }, `${MARK_LABEL_SHORT[k]}: `), cfg.marks[k])));
  }
}

function drawSourceLine() {
  const cfg = METRICS[state.metric]; const line = clear($('source-line'));
  line.append('Sources: ');
  cfg.sources.forEach((id, i) => { if (i) line.append('; '); line.append(h('a', { href: `#ref-${id}` }, SOURCE_NAMES[id])); });
  line.append('. Methods, years and regions differ between sources; each mark’s note is in the table below.');
  $('takeaway').textContent = cfg.take;
}

function renderBoard() {
  // radio group: one Tab stop (the checked button); arrow keys move between options
  document.querySelectorAll('#metric-switch button').forEach((b) => { b.setAttribute('aria-checked', String(b.value === state.metric)); b.tabIndex = b.value === state.metric ? 0 : -1; });
  document.querySelectorAll('#source-chips input').forEach((c) => { c.checked = state.shown.has(c.value); });
  drawKey(); drawRangeChart(); drawSourceLine();
  $('row-readout').textContent = 'Point at or tab to a row to see every number behind it.';
}

function buildBoardControls() {
  const sw = $('metric-switch');
  for (const [k, cfg] of Object.entries(METRICS)) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', value: k }, cfg.label);
    b.addEventListener('click', () => { state.metric = k; renderBoard(); });
    sw.append(b);
  }
  sw.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const keys = Object.keys(METRICS); const i = keys.indexOf(state.metric);
    state.metric = keys[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : keys.length - 1)) % keys.length];
    renderBoard(); sw.querySelector(`button[value="${state.metric}"]`).focus();
  });
  const chips = $('source-chips');
  for (const t of techs) {
    const id = `chip-${t.id}`;
    const input = h('input', { type: 'checkbox', id, value: t.id, checked: true });
    input.addEventListener('change', () => { if (input.checked) state.shown.add(t.id); else state.shown.delete(t.id); renderBoard(); });
    chips.append(h('label', { class: `cmp-chip k-${t.color}`, for: id }, input, h('span', { class: 'cmp-chip-sw', 'aria-hidden': 'true' }), t.short));
  }
  $('show-all').addEventListener('click', () => { techs.forEach((t) => state.shown.add(t.id)); renderBoard(); });
  $('show-renew').addEventListener('click', () => { state.shown = new Set(techs.filter((t) => t.group === 'renewable').map((t) => t.id)); renderBoard(); });
  $('sort-toggle').addEventListener('change', (e) => { state.sort = e.target.checked; renderBoard(); });
  let raf = 0;
  new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawRangeChart); }).observe($('chart-wrap'));
}

// ---------- table view ----------
function buildTable() {
  const tb = $('all-table').querySelector('tbody');
  const dash = '–';
  for (const t of techs) {
    const land = t.land.central ? `${sig(t.land.central.value)}${t.land.direct ? ` (${sig(t.land.direct.value)})` : ''}` : dash;
    const lz = t.lcoe.range ? `${kwh(t.lcoe.range.low)}–${kwh(t.lcoe.range.high)}` : dash;
    tb.append(h('tr', {},
      h('th', { scope: 'row' }, h('span', { class: `cmp-sw k-${t.color}`, 'aria-hidden': 'true' }), t.name),
      h('td', { class: 'num' }, t.cf.central ? pct(t.cf.central.value) : dash),
      h('td', { class: 'num' }, t.cf.us ? pct(t.cf.us.value) : dash),
      h('td', { class: 'num' }, t.capex.central ? usd(t.capex.central.value) : t.capex.range ? `${usd(t.capex.range.low)}–${usd(t.capex.range.high)} (US)` : dash),
      h('td', { class: 'num' }, t.lcoe.central ? kwh(t.lcoe.central.value) : dash),
      h('td', { class: 'num' }, lz),
      h('td', { class: 'num' }, land),
      h('td', { class: 'num' }, `${sig(t.ghg.value)} (${sig(t.ghg.low)}–${sig(t.ghg.high)})`),
      h('td', { class: 'num' }, `${Math.round(t.growth.twh.value).toLocaleString('en-US')} (${t.growth.share.value.toFixed(1)} %)`),
      h('td', { class: 'num' }, t.growth.cagr.value.toFixed(1))));
  }
  const ul = $('caveat-list');
  for (const c of meta.caveats ?? []) ul.append(h('li', {}, c));
}

// ---------- growth panel ----------
const GROWTH_SERIES = [
  { f: 'solar_electricity', name: 'Solar', color: 'solar' },
  { f: 'wind_electricity', name: 'Wind', color: 'wind' },
  { f: 'hydro_electricity', name: 'Hydro', color: 'hydro' },
  { f: 'biofuel_electricity', name: 'Bioenergy', color: 'biomass' },
  { f: 'other_renewable_exc_biofuel_electricity', name: 'Geothermal and other', color: 'geothermal' },
  { f: 'nuclear_electricity', name: 'Nuclear', context: 'solid' },
  { f: 'gas_electricity', name: 'Gas', context: 'dashed' },
  { f: 'coal_electricity', name: 'Coal', context: 'dotted' },
];
function setupGrowth(mix) {
  const sel = $('growth-entity');
  const names = Object.keys(mix.data).sort((a, b) => (a === 'World' ? -1 : b === 'World' ? 1 : a.localeCompare(b)));
  for (const n of names) sel.append(h('option', { value: n, selected: n === 'World' }, n));
  const g = { entity: 'World', unit: 'twh', context: true };
  const valueOf = (e, f, i) => {
    const v = e[f][i]; if (v == null) return null;
    if (g.unit === 'twh') return v;
    const tot = e.electricity_generation[i]; return tot ? (100 * v) / tot : null;
  };
  const unitLabel = () => (g.unit === 'twh' ? 'TWh' : '% of generation');
  let chart = null;
  const build = (c) => {
    const e = mix.data[g.entity]; const base = baseOption();
    const narrow = $('growth-chart').clientWidth < 520;
    const shown = GROWTH_SERIES.filter((s) => g.context || !s.context).map((s) => ({ s, data: e.years.map((y, i) => [y, valueOf(e, s.f, i)]) }));
    const ymax = Math.max(1e-9, ...shown.flatMap((x) => x.data.map((d) => d[1] ?? 0)));
    const lastOf = (data) => [...data].reverse().find((d) => d[1] != null)?.[1] ?? 0;
    const series = shown.map(({ s, data }) => ({
      type: 'line', name: s.name, showSymbol: false, connectNulls: false, data,
      lineStyle: { width: s.context ? 1.5 : 2.25, type: s.context ?? 'solid', color: s.context ? c.ink2 : c.source[s.color] },
      itemStyle: { color: s.context ? c.ink2 : c.source[s.color] },
      emphasis: { focus: 'series' },
      endLabel: { show: !narrow && lastOf(data) >= 0.04 * ymax, formatter: '{a}', color: c.ink2, fontSize: 12, distance: 6 },
      labelLayout: { moveOverlap: 'shiftY' },
    }));
    return {
      ...base,
      grid: { left: 8, right: narrow ? 16 : 150, top: narrow ? 104 : 64, bottom: 8, containLabel: true },
      legend: { ...base.legend, top: 0, left: 0, itemGap: narrow ? 8 : 14, itemWidth: 18, textStyle: { ...base.legend.textStyle, fontSize: narrow ? 11 : 12 } },
      tooltip: { ...base.tooltip, trigger: 'axis', valueFormatter: (v) => (v == null ? '–' : `${fmt(v, 3)} ${g.unit === 'twh' ? 'TWh' : '%'}`) },
      xAxis: { ...base._axis, type: 'value', min: e.years[0], max: e.years[e.years.length - 1], minInterval: 1, splitNumber: narrow ? 4 : 8, splitLine: { show: false }, axisLabel: { ...base._axis.axisLabel, formatter: (v) => String(v) } },
      yAxis: { ...base._axis, type: 'value', name: unitLabel(), nameLocation: 'end', nameGap: 12, nameTextStyle: { ...base._axis.nameTextStyle, align: 'left' } },
      series,
    };
  };
  const summary = () => {
    const e = mix.data[g.entity]; const n = e.years.length - 1; const y1 = e.years[n];
    const i0 = e.years.indexOf(y1 - 10);
    const tw = (f, i) => e[f][i];
    const sh = (f, i) => (e.electricity_generation[i] ? (100 * e[f][i]) / e.electricity_generation[i] : null);
    const ok = (v) => v != null && Number.isFinite(v);
    const parts = [];
    for (const s of GROWTH_SERIES.slice(0, 2)) {
      if (ok(tw(s.f, n)) && ok(sh(s.f, n))) {
        const was = i0 >= 0 && ok(tw(s.f, i0)) ? `, up from ${fmt(tw(s.f, i0), 3)} TWh in ${y1 - 10}` : '';
        parts.push(`${s.name.toLowerCase()} made ${fmt(tw(s.f, n), 3)} TWh (${sh(s.f, n).toFixed(1)} % of all electricity)${was}`);
      }
    }
    const top = GROWTH_SERIES.filter((s) => ok(tw(s.f, n))).sort((a, b) => tw(b.f, n) - tw(a.f, n))[0];
    $('growth-summary').textContent = parts.length
      ? `In ${y1}, in ${g.entity === 'World' ? 'the world' : g.entity}, ${parts.join('; ')}. The largest source was ${top.name.toLowerCase()}.`
      : `No solar or wind data for ${g.entity}.`;
    $('growth-chart').setAttribute('aria-label', `Line chart of electricity ${g.unit === 'twh' ? 'generation in TWh' : 'share in percent'} by source in ${g.entity}, ${e.years[0]} to ${y1}. ${$('growth-summary').textContent}`);
  };
  const refresh = () => { summary(); chart?.refresh(); };
  sel.addEventListener('change', () => { g.entity = sel.value; refresh(); });
  $('growth-context').addEventListener('change', (ev) => { g.context = ev.target.checked; refresh(); });
  const seg = $('growth-unit');
  seg.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    g.unit = b.value; seg.querySelectorAll('button').forEach((x) => { x.setAttribute('aria-checked', String(x === b)); x.tabIndex = x === b ? 0 : -1; }); refresh();
  });
  // radio group keyboard pattern: arrow keys choose the other option
  seg.querySelectorAll('button').forEach((x) => { x.tabIndex = x.getAttribute('aria-checked') === 'true' ? 0 : -1; });
  seg.addEventListener('keydown', (ev) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
    ev.preventDefault();
    const bs = [...seg.querySelectorAll('button')]; const i = bs.findIndex((x) => x.getAttribute('aria-checked') === 'true');
    const nb = bs[(i + (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length];
    nb.click(); nb.focus();
  });
  summary();
  makeChart($('growth-chart'), build).then((c) => { chart = c; }).catch((e) => console.error(e));
}

// ---------- LCOE lab ----------
const LAB_PARTS = [
  { k: 'capital', label: 'Capital (loan repayment)', cls: 'pt-capital' },
  { k: 'fixedOM', label: 'Fixed O&M', cls: 'pt-fom' },
  { k: 'varOM', label: 'Variable O&M', cls: 'pt-vom' },
  { k: 'fuel', label: 'Fuel', cls: 'pt-fuel' },
];
const LAB_INPUTS = { capex: 'lab-capex', fixedOM: 'lab-fom', varOM: 'lab-vom', fuel: 'lab-fuel', life: 'lab-life' };
const SRC_SLOTS = { capex: 'src-capex', cf: 'src-cf', fixedOM: 'src-fom', varOM: 'src-vom', fuel: 'src-fuel', life: 'src-life' };

function labPreset(t) {
  const L = t.lab;
  return { capex: L.capex.value, fixedOM: L.fixedOM.value, varOM: L.varOM.value, fuel: L.fuel.value, cf: L.cf.value, n: L.life.value };
}
function niceCeil(v) { const m = 10 ** Math.floor(Math.log10(v)); return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((s) => s * m).find((s) => s >= v); }

function setupLab() {
  const sel = $('lab-preset');
  for (const t of techs) sel.append(h('option', { value: t.id }, t.name));
  const r = $('lab-r'); const cf = $('lab-cf');
  let current = techs[0];
  const read = () => ({
    capex: Number($('lab-capex').value), fixedOM: Number($('lab-fom').value), varOM: Number($('lab-vom').value),
    fuel: Number($('lab-fuel').value), cf: Number(cf.value), n: Math.round(Number($('lab-life').value)), r: Number(r.value) / 100,
  });
  const load = (t) => {
    current = t; const p = labPreset(t);
    $('lab-capex').value = p.capex; $('lab-fom').value = p.fixedOM; $('lab-vom').value = p.varOM; $('lab-fuel').value = p.fuel;
    $('lab-life').value = p.n; cf.value = p.cf; r.value = DEFAULT_R * 100;
    for (const [k, slot] of Object.entries(SRC_SLOTS)) {
      const o = t.lab[k];
      $(slot).textContent = o.assumption ? `This page’s assumption. ${o.note}` : `${o.note} ${srcName(o.source)}.`;
    }
    update();
  };
  const update = () => {
    const p = read();
    $('lab-r-out').textContent = `${(p.r * 100).toFixed(1)} %`;
    $('lab-cf-out').textContent = `${(p.cf * 100).toFixed(1)} %`;
    const bad = [p.capex, p.fixedOM, p.varOM, p.fuel].some((x) => !Number.isFinite(x) || x < 0) || !(p.n >= 1) || !(p.cf > 0);
    if (bad) {
      $('lab-total').textContent = '–'; $('lab-compare').textContent = 'Every input must be a number of zero or more, and the life at least one year.';
      return;
    }
    const b = lcoeBreakdown(p);
    $('lab-total').textContent = fmt(b.total, 3);
    $('lab-total-unit').textContent = `$/MWh  =  ${kwh(b.total / 1000)} per kWh`;
    const pub = current.lcoe.central; const lz = current.lcoe.range;
    const cmp = [];
    if (pub) cmp.push(`IRENA’s published 2024 global average: ${fmt(pub.value * 1000, 3)} $/MWh.`);
    if (lz) cmp.push(`Lazard’s range for new US plants: ${Math.round(lz.low * 1000)}–${Math.round(lz.high * 1000)} $/MWh.`);
    cmp.push(`Capital recovery factor ${capitalRecoveryFactor(p.r, p.n).toFixed(4)} per year; ${fmt(8.76 * p.cf, 3)} MWh per kW per year.`);
    $('lab-compare').textContent = cmp.join(' ');
    drawStack(b); drawSensitivity(p, pub ? pub.value * 1000 : null);
  };
  sel.addEventListener('change', () => load(techs.find((t) => t.id === sel.value)));
  for (const id of [...Object.values(LAB_INPUTS), 'lab-r', 'lab-cf']) $(id).addEventListener('input', update);
  $('lab-reset').addEventListener('click', () => load(current));
  load(current);

  // expert table: implied discount rates
  const tb = $('implied-table').querySelector('tbody');
  for (const t of techs) {
    if (!t.lcoe.central) continue;
    const p = labPreset(t); const target = t.lcoe.central.value * 1000;
    const ir = impliedDiscountRate(p, target);
    tb.append(h('tr', {}, h('th', { scope: 'row' }, t.name), h('td', { class: 'num' }, `${fmt(target, 3)} $/MWh`),
      h('td', { class: 'num' }, `${fmt(lcoeBreakdown({ ...p, r: DEFAULT_R }).total, 3)} $/MWh`),
      h('td', { class: 'num' }, Number.isFinite(ir) ? `${(ir * 100).toFixed(1)} %` : 'above 50 %')));
  }
}

function drawStack(b) {
  const svg = $('lab-stack'); const W = Math.max(240, svg.clientWidth || 360); const H = 64;
  clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('height', H);
  const max = niceCeil(Math.max(b.total * 1.05, 20)); const x = (v) => (v / max) * (W - 2) + 1;
  let at = 0;
  for (const part of LAB_PARTS) {
    const v = b[part.k]; if (v <= 0) continue;
    const x0 = x(at); const x1 = x(at + v); at += v;
    const w = Math.max(1, x1 - x0 - 2);
    svg.append(S('rect', { x: x0, y: 6, width: w, height: 26, class: `cmp-part ${part.cls}`, rx: 3 }));
  }
  for (const v of [0, max / 2, max]) {
    svg.append(S('text', { x: Math.min(W - 2, Math.max(2, x(v))), y: 52, class: 'cmp-tick', 'text-anchor': v === 0 ? 'start' : v === max ? 'end' : 'middle' }, `${fmt(v, 3)}`));
  }
  svg.setAttribute('aria-label', `LCOE ${fmt(b.total, 3)} dollars per MWh: ${LAB_PARTS.map((p) => `${p.label} ${fmt(b[p.k], 3)}`).join(', ')}.`);
  const key = clear($('lab-stack-key'));
  for (const part of LAB_PARTS) {
    key.append(h('li', {}, h('span', { class: `swatch ${part.cls}`, 'aria-hidden': 'true' }), `${part.label} `, h('strong', { class: 'num' }, `${fmt(b[part.k], 3)}`), h('span', { class: 'muted' }, ` (${b.total ? Math.round((100 * b[part.k]) / b.total) : 0} %)`)));
  }
}

function drawSensitivity(p, published) {
  const svg = $('lab-sens'); const W = Math.max(240, svg.clientWidth || 360); const H = 150;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const rs = Array.from({ length: 61 }, (_, i) => i * 0.0025);
  const ys = rs.map((r) => lcoeBreakdown({ ...p, r }).total);
  const ymax = niceCeil(Math.max(...ys, published ?? 0) * 1.05);
  const X = (r) => pad.l + (r / 0.15) * (W - pad.l - pad.r); const Y = (v) => H - pad.b - (v / ymax) * (H - pad.t - pad.b);
  clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('height', H);
  for (const v of [0, ymax / 2, ymax]) {
    svg.append(S('line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'cmp-gridline' }),
      S('text', { x: pad.l - 6, y: Y(v) + 4, class: 'cmp-tick', 'text-anchor': 'end' }, fmt(v, 3)));
  }
  for (const r of [0, 0.05, 0.1, 0.15]) svg.append(S('text', { x: X(r), y: H - 8, class: 'cmp-tick', 'text-anchor': 'middle' }, `${r * 100} %`));
  if (published != null) {
    svg.append(S('line', { x1: pad.l, x2: W - pad.r, y1: Y(published), y2: Y(published), class: 'cmp-ref' }),
      S('text', { x: W - pad.r, y: Y(published) - 5, class: 'cmp-ref-label', 'text-anchor': 'end' }, `IRENA ${fmt(published, 3)}`));
  }
  svg.append(S('path', { d: rs.map((r, i) => `${i ? 'L' : 'M'}${X(r).toFixed(1)} ${Y(ys[i]).toFixed(1)}`).join(' '), class: 'cmp-sens-line' }));
  const rr = Math.min(0.15, p.r); const cur = lcoeBreakdown({ ...p, r: rr }).total;
  svg.append(S('circle', { cx: X(rr), cy: Y(cur), r: 5, class: 'cmp-sens-dot' }));
  const lo = ys[0]; const hi = ys[40];
  $('lab-sens-cap').textContent = `With these inputs, LCOE goes from ${fmt(lo, 3)} $/MWh at 0 % to ${fmt(hi, 3)} at 10 %. Capital-heavy plants with long lives are the most sensitive.`;
  svg.setAttribute('aria-label', `LCOE against discount rate from 0 to 15 percent. ${$('lab-sens-cap').textContent}`);
}

// ---------- custom metric ----------
const VARS = [
  ['cf', 'Capacity factor used in the LCOE lab preset', 'fraction', (t) => t.lab.cf.value],
  ['capex', 'Installed cost used in the LCOE lab preset', 'US$/kW', (t) => t.lab.capex.value],
  ['fom', 'Fixed O&M, lab preset', 'US$/kW-yr', (t) => t.lab.fixedOM.value],
  ['vom', 'Variable O&M, lab preset', 'US$/MWh', (t) => t.lab.varOM.value],
  ['fuel', 'Fuel cost, lab preset', 'US$/MWh', (t) => t.lab.fuel.value],
  ['life', 'Economic life, lab preset', 'years', (t) => t.lab.life.value],
  ['lcoe', 'Published LCOE, IRENA 2024 global average', 'US$/kWh', (t) => t.lcoe.central?.value ?? null],
  ['lcoe_low', 'Low end of Lazard’s US LCOE range', 'US$/kWh', (t) => t.lcoe.range?.low ?? null],
  ['lcoe_high', 'High end of Lazard’s US LCOE range', 'US$/kWh', (t) => t.lcoe.range?.high ?? null],
  ['ghg', 'Lifecycle emissions, median (IPCC)', 'gCO2e/kWh', (t) => t.ghg.value],
  ['ghg_low', 'Lifecycle emissions, lowest study', 'gCO2e/kWh', (t) => t.ghg.low],
  ['ghg_high', 'Lifecycle emissions, highest study', 'gCO2e/kWh', (t) => t.ghg.high],
  ['land', 'Land use, whole site, median', 'm² per MWh/yr', (t) => t.land.central?.value ?? null],
  ['twh', 'World generation in 2025 (shared series)', 'TWh', (t) => t.growth.twh.value],
  ['share', 'Share of world electricity in 2025', '%', (t) => t.growth.share.value],
  ['growth', 'Average growth of world generation, 2015–2025', '%/yr', (t) => t.growth.cagr.value],
];
const EXAMPLES = [
  ['capex / (cf * 8.76)', 'Build cost per MWh made each year ($)'],
  ['cf * 8760', 'Full-load hours'],
  ['lcoe * 1000', 'LCOE in $/MWh'],
  ['land * twh', 'Land for 2025 output (km²)'],
  ['ghg * twh / 1000', 'Lifecycle emissions of 2025 output (Mt CO2e)'],
];

function setupCustom() {
  const vt = $('var-table').querySelector('tbody');
  for (const [n, d, u] of VARS) vt.append(h('tr', {}, h('td', {}, h('code', {}, n)), h('td', {}, d), h('td', {}, u)));
  const input = $('formula'); const msg = $('formula-msg'); const list = $('formula-rank'); const missing = $('formula-missing');
  const names = new Set(VARS.map((v) => v[0]));
  const ex = $('formula-examples');
  for (const [f, label] of EXAMPLES) {
    const b = h('button', { type: 'button', class: 'btn ghost cmp-ex', title: f }, label);
    b.addEventListener('click', () => { input.value = f; run(); input.focus(); });
    ex.append(b);
  }
  const fail = (text) => { msg.textContent = text; msg.dataset.state = 'error'; clear(list); missing.textContent = ''; };
  const run = () => {
    const src = input.value.slice(0, FORMULA_MAX);
    $('formula-count').textContent = `${src.length} / ${FORMULA_MAX}`;
    if (!src.trim()) { fail('Type a formula, or pick an example.'); return; }
    let tree;
    try { tree = parse(src); } catch (e) {
      if (e instanceof ExprError) { fail(`Can’t read that formula: ${e.message}.`); return; }
      throw e;
    }
    const used = [...variablesOf(tree)];
    const unknown = used.filter((n) => !names.has(n));
    if (unknown.length) { fail(`Unknown name${unknown.length > 1 ? 's' : ''} ${unknown.map((n) => `“${n}”`).join(', ')}. Use one of: ${[...names].join(', ')}.`); return; }
    const results = []; const skipped = [];
    for (const t of techs) {
      const vars = {}; let gap = null;
      for (const [n, , , get] of VARS) { const v = get(t); if (v == null) { if (used.includes(n)) gap = n; } else vars[n] = v; }
      if (gap) { skipped.push(`${t.short} (no ${gap})`); continue; }
      let v;
      try { v = evaluate(tree, vars); } catch (e) { if (e instanceof ExprError) { fail(`Can’t work that out: ${e.message}.`); return; } throw e; }
      if (!Number.isFinite(v)) { skipped.push(`${t.short} (result is not a finite number: division by zero?)`); continue; }
      results.push({ t, v });
    }
    results.sort((a, b) => b.v - a.v);
    clear(list);
    const max = Math.max(...results.map((r) => Math.abs(r.v)), 0) || 1;
    for (const { t, v } of results) {
      const bar = h('span', { class: `cmp-rank-bar k-${t.color}`, 'aria-hidden': 'true' });
      bar.style.width = `${Math.max(1, (Math.abs(v) / max) * 100)}%`;
      list.append(h('li', {}, h('span', { class: 'cmp-rank-name' }, t.name), h('span', { class: 'cmp-rank-track' }, bar), h('span', { class: 'cmp-rank-val' }, fmt(v, 3))));
    }
    msg.dataset.state = 'ok';
    msg.textContent = results.length ? `Ranked ${results.length} of ${techs.length}, highest first.`
      : skipped.some((x) => x.includes('finite')) ? 'The formula gives no finite result for any technology. Is something divided by zero?'
        : 'No technology has every number this formula needs.';
    missing.textContent = skipped.length ? `Left out: ${skipped.join('; ')}.` : '';
  };
  let tmr = 0;
  input.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(run, 150); });
  run();
}

// ---------- boot ----------
async function boot() {
  try {
    const { data, state: st } = await loadData('renewables-compare.json', validateCompare);
    techs = data.data.techs; meta = data.meta;
    techs.forEach((t) => state.shown.add(t.id));
    setBadge($('board-badge'), st, 'IRENA, Lazard, EIA, Lovering et al., IPCC');
    buildBoardControls(); renderBoard(); buildTable(); setupLab(); setupCustom();
  } catch (e) {
    console.error(e); setBadge($('board-badge'), 'failed');
    $('takeaway').textContent = 'The comparison data could not be loaded, so nothing is shown.';
  }
  try {
    const { data, state: st } = await loadData('electricity-mix.json', validateMix);
    setBadge($('growth-badge'), st, 'Our World in Data / Ember');
    setupGrowth(data);
  } catch (e) {
    console.error(e); setBadge($('growth-badge'), 'failed');
  }
}
boot();
