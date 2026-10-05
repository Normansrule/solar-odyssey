// The clean-energy system: an interactive system map (SVG) and a stacked-area chart of
// electricity generation by source from the signed electricity-mix dataset.
import { h, clear, loadMix, latestShare, pctText, mountShares, segmented, setBadge, MIX_SOURCE } from './renewables-b-common.js';
import { makeChart, baseOption } from '../assets/js/charts.js';

mountShares();

// ------------------------------------------------------------------ system map
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('sys-svg');
const stage = document.getElementById('sys-stage');
const items = [...document.querySelectorAll('#sys-list li[data-node]')].map((li) => ({
  id: li.dataset.node,
  kind: li.dataset.kind,
  sources: (li.dataset.sources || '').split(',').map((s) => s.trim()).filter(Boolean),
  href: li.dataset.href,
  linkText: li.dataset.link,
  name: li.querySelector('strong').textContent.replace(/\.$/, ''),
  what: li.querySelector('span').textContent,
}));
const byId = Object.fromEntries(items.map((n) => [n.id, n]));

const SHORT = {
  pv: ['Solar PV'], csp: ['Concentrated solar'], wind: ['Wind'], hydro: ['Hydropower'], geo: ['Geothermal'],
  ocean: ['Tidal and wave'], bio: ['Biomass'], fossil: ['Fossil and', 'nuclear today'],
  battery: ['Batteries'], pumped: ['Pumped', 'hydro'], h2: ['Hydrogen'], dr: ['Demand', 'response'], ic: ['Inter-', 'connectors'],
  homes: ['Homes and', 'buildings'], industry: ['Industry'], transport: ['Transport'], heat: ['Heat'],
};
const COLOR = { pv: '--r-solar', csp: '--r-csp', wind: '--r-wind', hydro: '--r-hydro', geo: '--r-geothermal', ocean: '--r-ocean', bio: '--r-biomass', fossil: '--ink-2' };
const KIND_LABEL = { source: 'Source', today: 'Today’s other sources', network: 'Network', storage: 'Storage', flex: 'Flexibility', demand: 'Demand' };
const SOURCES = ['pv', 'csp', 'wind', 'hydro', 'geo', 'ocean', 'bio', 'fossil'];
const STORAGE = ['battery', 'pumped', 'h2'];
const FLEX = ['dr', 'ic'];
const DEMAND = ['homes', 'industry', 'transport', 'heat'];

let shares = {}; // id -> { pct, twh, year }
let current = 'grid';

function layout(narrow) {
  const box = {}; const L = {};
  if (!narrow) {
    L.w = 980; L.h = 600;
    let y = 70;
    for (const id of SOURCES) { const hh = id === 'fossil' ? 58 : 46; box[id] = { x: 8, y, w: 196, h: hh }; y += hh + 12; }
    box.grid = { x: 392, y: 150, w: 196, h: 300 };
    STORAGE.forEach((id, i) => { box[id] = { x: 268 + i * 152, y: 24, w: 140, h: 50 }; });
    FLEX.forEach((id, i) => { box[id] = { x: 330 + i * 168, y: 526, w: 152, h: 50 }; });
    DEMAND.forEach((id, i) => { box[id] = { x: 776, y: 150 + i * 78, w: 196, h: 54 }; });
  } else {
    L.w = 360; L.h = 760;
    SOURCES.forEach((id, i) => { box[id] = { x: 6 + (i % 2) * 178, y: 6 + Math.floor(i / 2) * 58, w: 170, h: 48 }; });
    box.grid = { x: 96, y: 330, w: 168, h: 92 };
    STORAGE.forEach((id, i) => { box[id] = { x: 4, y: 300 + i * 52, w: 84, h: 44 }; });
    FLEX.forEach((id, i) => { box[id] = { x: 272, y: 322 + i * 56, w: 84, h: 48 }; });
    DEMAND.forEach((id, i) => { box[id] = { x: 6 + (i % 2) * 178, y: 520 + Math.floor(i / 2) * 64, w: 170, h: 52 }; });
    L.h = 520 + 2 * 64 + 4;
  }
  return { box, L };
}

const widthFor = (id) => {
  const s = shares[id];
  if (!s || !Number.isFinite(s.pct)) return 1.5;
  return Math.max(1.5, s.pct * 0.7);
};

function el(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k != null) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}

function draw() {
  const narrow = stage.clientWidth < 620;
  const { box, L } = layout(narrow);
  while (svg.firstChild) svg.firstChild.remove();
  svg.setAttribute('viewBox', `0 0 ${L.w} ${L.h}`);
  svg.dataset.layout = narrow ? 'narrow' : 'wide';
  const links = el('g', { class: 'sys-links' });
  const nodes = el('g', { class: 'sys-nodes' });
  svg.append(links, nodes);
  const g = box.grid;
  const linkPath = (d, ids, cls, width, color) => {
    const base = el('path', { d, class: `sys-link ${cls}`, 'data-ends': ids.join(' '), 'stroke-width': width });
    if (color) base.style.stroke = `var(${color})`;
    const flow = el('path', { d, class: `sys-flow ${cls}`, 'data-ends': ids.join(' ') });
    links.append(base, flow);
  };
  // sources -> grid
  const totalW = SOURCES.reduce((s, id) => s + widthFor(id), 0);
  if (!narrow) {
    let gy = g.y + (g.h - totalW - 6 * (SOURCES.length - 1)) / 2;
    for (const id of SOURCES) {
      const b = box[id]; const w = widthFor(id);
      const y1 = b.y + b.h / 2; const y2 = gy + w / 2; gy += w + 6;
      const x1 = b.x + b.w; const x2 = g.x;
      linkPath(`M${x1},${y1} C${x1 + 110},${y1} ${x2 - 110},${y2} ${x2},${y2}`, [id, 'grid'], id === 'fossil' ? 'muted' : 'src', w, COLOR[id]);
    }
    for (const id of DEMAND) {
      const b = box[id]; const y1 = g.y + 40 + DEMAND.indexOf(id) * 73; const y2 = b.y + b.h / 2;
      linkPath(`M${g.x + g.w},${y1} C${g.x + g.w + 100},${y1} ${b.x - 100},${y2} ${b.x},${y2}`, ['grid', id], 'out', 6);
    }
    for (const id of STORAGE) {
      const b = box[id]; const x1 = b.x + b.w / 2; const x2 = Math.min(g.x + g.w - 20, Math.max(g.x + 20, x1));
      linkPath(`M${x1},${b.y + b.h} C${x1},${b.y + b.h + 50} ${x2},${g.y - 50} ${x2},${g.y}`, [id, 'grid'], 'two', 3);
    }
    for (const id of FLEX) {
      const b = box[id]; const x1 = b.x + b.w / 2; const x2 = Math.min(g.x + g.w - 20, Math.max(g.x + 20, x1));
      linkPath(`M${x2},${g.y + g.h} C${x2},${g.y + g.h + 40} ${x1},${b.y - 40} ${x1},${b.y}`, ['grid', id], 'two', 3);
    }
  } else {
    let gx = g.x + (g.w - totalW - 3 * (SOURCES.length - 1)) / 2;
    for (const id of SOURCES) {
      const b = box[id]; const w = widthFor(id);
      const x1 = b.x + b.w / 2; const y1 = b.y + b.h; const x2 = gx + w / 2; gx += w + 3;
      linkPath(`M${x1},${y1} C${x1},${y1 + 60} ${x2},${g.y - 70} ${x2},${g.y}`, [id, 'grid'], id === 'fossil' ? 'muted' : 'src', w, COLOR[id]);
    }
    for (const id of DEMAND) {
      const b = box[id]; const x1 = g.x + 30 + DEMAND.indexOf(id) * 36; const x2 = b.x + b.w / 2;
      linkPath(`M${x1},${g.y + g.h} C${x1},${g.y + g.h + 50} ${x2},${b.y - 50} ${x2},${b.y}`, ['grid', id], 'out', 5);
    }
    for (const id of STORAGE) {
      const b = box[id]; const y = b.y + b.h / 2; const y2 = Math.min(g.y + g.h - 12, Math.max(g.y + 12, y));
      linkPath(`M${b.x + b.w},${y} C${b.x + b.w + 6},${y} ${g.x - 6},${y2} ${g.x},${y2}`, [id, 'grid'], 'two', 3);
    }
    for (const id of FLEX) {
      const b = box[id]; const y = b.y + b.h / 2; const y2 = Math.min(g.y + g.h - 12, Math.max(g.y + 12, y));
      linkPath(`M${g.x + g.w},${y2} C${g.x + g.w + 6},${y2} ${b.x - 6},${y} ${b.x},${y}`, ['grid', id], 'two', 3);
    }
  }
  // nodes
  const addNode = (id) => {
    const n = byId[id]; const b = box[id];
    const lines = SHORT[id] || [n.name];
    const sub = shareLine(id);
    const grp = el('g', { class: `sys-node kind-${n.kind}`, 'data-id': id, tabindex: 0, role: 'button', 'aria-pressed': String(current === id), 'aria-label': `${n.name}${sub ? `, ${sub}` : ''}` });
    const rect = el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 8, class: 'sys-box' });
    grp.append(rect);
    if (COLOR[id]) { const bar = el('rect', { x: b.x, y: b.y, width: 5, height: b.h, rx: 2, class: 'sys-bar' }); bar.style.fill = `var(${COLOR[id]})`; grp.append(bar); }
    const fs = narrow ? 12.5 : 14;
    if (id === 'grid') {
      const cx = b.x + b.w / 2;
      grp.append(el('text', { x: cx, y: b.y + (narrow ? 24 : 36), class: 'sys-name', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, 'The grid'));
      grp.append(el('text', { x: cx, y: b.y + (narrow ? 46 : 64), class: 'sys-sub', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, narrow ? 'transmission + distribution' : 'transmission and distribution'));
      const gl = el('g', { class: 'sys-wires', 'aria-hidden': 'true' });
      const n2 = narrow ? 2 : 5; const y0 = b.y + (narrow ? 62 : 100); const step = narrow ? 10 : 42;
      for (let i = 0; i < n2; i += 1) {
        const yy = y0 + i * step;
        gl.append(el('path', { d: `M${b.x + 14},${yy} Q${cx},${yy + (narrow ? 8 : 16)} ${b.x + b.w - 14},${yy}` }));
      }
      grp.append(gl);
      nodes.append(grp);
      return;
    }
    const textLines = sub ? [...lines, sub] : lines;
    const lh = fs * 1.2; const top = b.y + b.h / 2 - ((textLines.length - 1) * lh) / 2;
    const tx = COLOR[id] ? b.x + 14 : b.x + b.w / 2;
    textLines.forEach((t, i) => grp.append(el('text', {
      x: tx, y: top + i * lh, class: i === textLines.length - 1 && sub ? 'sys-sub' : 'sys-name',
      'text-anchor': COLOR[id] ? 'start' : 'middle', 'dominant-baseline': 'middle',
    }, t)));
    nodes.append(grp);
  };
  for (const id of [...SOURCES, 'grid', ...STORAGE, ...FLEX, ...DEMAND]) addNode(id);
  // row labels (wide layout only)
  if (!narrow) {
    const lab = (x, y, t, anchor = 'start') => nodes.append(el('text', { x, y, class: 'sys-col', 'text-anchor': anchor }, t));
    lab(8, 52, 'Sources');
    lab(776, 132, 'Demand');
    lab(268, 14, 'Storage');
    lab(330, 516, 'Flexibility');
  }
  highlight(current);
}

function shareLine(id) {
  const s = shares[id];
  if (id === 'csp') return 'inside solar';
  if (id === 'ocean') return 'with geothermal';
  if (!s) return '';
  return `${pctText(s.pct)} %`;
}

function highlight(id) {
  svg.querySelectorAll('.sys-node').forEach((n) => {
    n.setAttribute('aria-pressed', String(n.dataset.id === id));
    n.classList.toggle('on', n.dataset.id === id);
  });
  svg.querySelectorAll('.sys-link, .sys-flow').forEach((p) => {
    const ends = p.dataset.ends.split(' ');
    const on = id === 'grid' ? true : ends.includes(id);
    p.classList.toggle('on', on && id !== 'grid' ? true : false);
    p.classList.toggle('dim', id !== 'grid' && !on);
  });
}

function select(id) {
  current = id;
  const n = byId[id];
  highlight(id);
  document.getElementById('sys-kind').textContent = KIND_LABEL[n.kind] || '';
  document.getElementById('sys-name').textContent = n.name;
  document.getElementById('sys-what').textContent = n.what;
  const share = document.getElementById('sys-share');
  const s = shares[id];
  if (s && n.kind !== 'network') {
    share.textContent = id === 'fossil'
      ? `${pctText(s.pct)} % of world electricity in ${s.year} (${Math.round(s.twh).toLocaleString('en-US')} TWh).`
      : `${pctText(s.pct)} % of world electricity in ${s.year} (${Math.round(s.twh).toLocaleString('en-US')} TWh)${id === 'geo' ? ', together with tidal and wave' : ''}${id === 'pv' ? ', including a small amount of concentrated solar' : ''}.`;
  } else if (id === 'csp' && shares.pv) {
    share.textContent = `Counted inside solar's ${pctText(shares.pv.pct)} % of world electricity (${shares.pv.year}).`;
  } else if (id === 'ocean' && shares.geo) {
    share.textContent = `Counted with geothermal in ${pctText(shares.geo.pct)} % of world electricity (${shares.geo.year}).`;
  } else share.textContent = '';
  const link = document.getElementById('sys-link');
  link.setAttribute('href', n.href);
  link.textContent = `Read: ${n.linkText}`;
}

svg.addEventListener('pointerover', (e) => { const g = e.target.closest('.sys-node'); if (g && e.pointerType === 'mouse') select(g.dataset.id); });
svg.addEventListener('click', (e) => { const g = e.target.closest('.sys-node'); if (g) select(g.dataset.id); });
svg.addEventListener('focusin', (e) => { const g = e.target.closest('.sys-node'); if (g) select(g.dataset.id); });
svg.addEventListener('keydown', (e) => {
  const g = e.target.closest('.sys-node');
  if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(g.dataset.id); document.getElementById('sys-link').focus(); }
});
// SVG text inside role=button groups must not be announced separately
svg.setAttribute('focusable', 'false');

new ResizeObserver(() => draw()).observe(stage);
draw();
select('grid');

// ------------------------------------------------------------------ chart
const SERIES = [
  { key: 'fossil', name: 'Fossil fuels', fields: ['coal', 'gas', 'oil'], color: (c) => c.ink2, op: 0.32 },
  { key: 'nuclear', name: 'Nuclear', fields: ['nuclear'], color: (c) => c.tech.perovskite, op: 0.85 },
  { key: 'bio', name: 'Bioenergy', fields: ['biofuel'], color: (c) => c.source.biomass, op: 0.9 },
  { key: 'hydro', name: 'Hydropower', fields: ['hydro'], color: (c) => c.source.hydro, op: 0.9 },
  { key: 'other', name: 'Other renewables', fields: ['other_renewable_exc_biofuel'], color: (c) => c.source.geothermal, op: 0.9 },
  { key: 'wind', name: 'Wind', fields: ['wind'], color: (c) => c.source.wind, op: 0.9 },
  { key: 'solar', name: 'Solar', fields: ['solar'], color: (c) => c.source.solar, op: 0.95 },
];
const REGIONS = ['World', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
const entitySel = document.getElementById('mix-entity');
let mix = null; let unit = 'twh'; let chart = null;

function seriesFor(entity) {
  const gen = entity.electricity_generation;
  return SERIES.map((s) => ({
    ...s,
    values: entity.years.map((_, i) => {
      let v = 0; let any = false;
      for (const f of s.fields) { const x = entity[`${f}_electricity`]?.[i]; if (x != null) { v += x; any = true; } }
      if (!any) return null;
      return unit === 'share' ? (gen[i] ? (100 * v) / gen[i] : null) : v;
    }),
  }));
}

const fmtV = (v) => (v == null ? '–' : unit === 'share' ? `${v.toFixed(1)} %` : `${Math.round(v).toLocaleString('en-US')}`);

function renderTable(entityName, entity, ser) {
  const t = document.getElementById('mix-table');
  const years = entity.years;
  const pick = [...new Set([1985, 1995, 2005, 2015, years[years.length - 2], years[years.length - 1]].filter((y) => years.includes(y)))];
  const cap = t.querySelector('caption');
  clear(t);
  t.append(cap || h('caption', { class: 'visually-hidden' }, ''));
  t.querySelector('caption').textContent = `Electricity generation by source, ${entityName}, ${unit === 'share' ? 'percent of total' : 'TWh'}`;
  t.append(h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Year'), ser.map((s) => h('th', { scope: 'col', class: 'num' }, s.name)),
    h('th', { scope: 'col', class: 'num' }, unit === 'share' ? 'Renewables' : 'Total'))));
  t.append(h('tbody', {}, pick.map((y) => {
    const i = years.indexOf(y);
    const ren = ['bio', 'hydro', 'other', 'wind', 'solar'].reduce((a, k) => a + (ser.find((s) => s.key === k).values[i] ?? 0), 0);
    return h('tr', {}, h('th', { scope: 'row' }, String(y)), ser.map((s) => h('td', { class: 'num' }, fmtV(s.values[i]))),
      h('td', { class: 'num' }, unit === 'share' ? `${ren.toFixed(1)} %` : Math.round(entity.electricity_generation[i]).toLocaleString('en-US')));
  })));
}

function renderLegend(c) {
  const lg = document.getElementById('mix-legend');
  clear(lg).append(...[...SERIES].reverse().map((s) => {
    const sw = h('span', { class: 'swatch', 'aria-hidden': 'true' });
    sw.style.background = s.color(c); sw.style.opacity = String(Math.max(0.55, s.op));
    return h('li', {}, sw, s.name);
  }));
}

async function renderChart() {
  if (!mix) return;
  const name = entitySel.value;
  const raw = mix.data[name];
  // trim leading years where the dataset has no breakdown of fossil generation, so the stack is not misleading
  const i0 = Math.max(0, raw.years.findIndex((_, i) => raw.electricity_generation[i] > 0 && ['coal', 'gas', 'oil'].some((f) => raw[`${f}_electricity`]?.[i] != null)));
  const entity = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.slice(i0) : v]));
  document.getElementById('mix-title').textContent = `Electricity generation, ${name}, ${entity.years[0]}–${entity.years[entity.years.length - 1]} (${unit === 'share' ? 'percent of total' : 'TWh'})`;
  const ser = seriesFor(entity);
  renderTable(name, entity, ser);
  const build = (c) => {
    renderLegend(c);
    const base = baseOption();
    return {
      ...base,
      legend: { show: false },
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        ...base.tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: c.ink2, width: 1 } },
        formatter: (ps) => {
          const y = ps[0]?.axisValue;
          // No inline styles (strict CSP): series keys map to classes in index.css.
          const rows = [...ps].reverse().map((p) => {
            const k = SERIES[p.seriesIndex].key;
            return `<div class="tt-row"><span class="tt-name"><span class="tt-k k-${k}"></span>${SERIES[p.seriesIndex].name}</span><strong>${fmtV(ser[p.seriesIndex].values[p.dataIndex])}${unit === 'share' ? '' : ' TWh'}</strong></div>`;
          });
          return `<div class="tt-head">${y}</div>${rows.join('')}`;
        },
      },
      xAxis: { ...base._axis, type: 'category', boundaryGap: false, data: entity.years.map(String), axisLabel: { ...base._axis.axisLabel, interval: (i, v) => Number(v) % 5 === 0 } , splitLine: { show: false } },
      yAxis: { ...base._axis, type: 'value', max: unit === 'share' ? 100 : null, axisLabel: { ...base._axis.axisLabel, formatter: (v) => (unit === 'share' ? `${v} %` : v.toLocaleString('en-US')) } },
      series: ser.map((s) => ({
        name: s.name, type: 'line', stack: 'all', symbol: 'none', smooth: false, connectNulls: false,
        lineStyle: { width: 1, color: c.panel }, itemStyle: { color: s.color(c) },
        areaStyle: { color: s.color(c), opacity: s.op }, emphasis: { disabled: true },
        data: s.values.map((v) => (v == null ? 0 : v)),
      })),
    };
  };
  currentBuild = build;
  if (!chart) chart = await makeChart(document.getElementById('mix-chart'), (c) => currentBuild(c));
  else chart.refresh();
}
let currentBuild = null;

(async () => {
  const badge = document.getElementById('mix-badge');
  try {
    const { data, state } = await loadMix();
    mix = data;
    setBadge(badge, state, MIX_SOURCE);
    const W = data.data.World;
    shares = {
      pv: latestShare(W, ['solar']), wind: latestShare(W, ['wind']), hydro: latestShare(W, ['hydro']),
      geo: latestShare(W, ['other_renewable_exc_biofuel']), bio: latestShare(W, ['biofuel']),
      fossil: latestShare(W, ['coal', 'gas', 'oil', 'nuclear']),
    };
    draw();
    select(current);
    const names = Object.keys(data.data);
    clear(entitySel).append(
      h('optgroup', { label: 'World and regions' }, REGIONS.filter((r) => names.includes(r)).map((r) => h('option', { value: r, selected: r === 'World' }, r))),
      h('optgroup', { label: 'Countries' }, names.filter((n) => !REGIONS.includes(n)).sort().map((n) => h('option', { value: n }, n))),
    );
    entitySel.addEventListener('change', renderChart);
    segmented(document.getElementById('mix-unit'), (v) => { unit = v; renderChart(); }, { fire: false });
    await renderChart();
  } catch (e) {
    console.warn(e);
    setBadge(badge, 'failed');
  }
})();
