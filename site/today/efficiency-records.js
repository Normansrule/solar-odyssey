// Efficiency over time: record research-cell efficiencies by technology (data/efficiency-records.json),
// drawn as step lines that grow year by year. Play/slider/decade buttons drive the year;
// family toggles show or hide series (colours follow the series, never their rank).
import { h, clear, animate, reducedMotion } from '../assets/js/dom.js';
import { loadData, setBadge, is } from '../assets/js/data.js';
import { makeChart, baseOption } from '../assets/js/charts.js';

const $ = (id) => document.getElementById(id);
const FIRST = 1954; const LAST = 2026;
const SYMBOLS = { 'si-mono': 'circle', cigs: 'rect', perovskite: 'diamond', 'perovskite-si': 'triangle', 'iii-v-conc': 'roundRect', 'iii-v-1sun': 'circle', organic: 'rect', dye: 'triangle', qdot: 'diamond' };
const SQ = 33.16; // Rühle 2016, AM1.5G

const valid = (d) => is.obj(d) && is.obj(d.data) && is.arr(d.data.series) && is.arr(d.data.points)
  && d.data.points.every((p) => is.str(p.tech) && is.year(p.year) && is.num(p.efficiency));

const chartEl = $('er-chart');
if (chartEl) init();

async function init() {
  let ds;
  try {
    const r = await loadData('efficiency-records.json', valid);
    ds = r.data; setBadge($('er-badge'), r.state, 'efficiency-records.json');
  } catch (e) {
    console.error(e); setBadge($('er-badge'), 'failed'); return;
  }
  const series = ds.data.series;
  const pts = (id) => ds.data.points.filter((p) => p.tech === id).sort((a, b) => a.year - b.year);
  const on = new Set(series.map((s) => s.id));
  let year = LAST;

  // ---------- filters (also the legend: colour + shape + name) ----------
  const filters = $('er-filters');
  for (const s of series) {
    const b = h('button', { type: 'button', class: 'er-chip', 'aria-pressed': 'true', dataset: { id: s.id, family: s.family } },
      h('span', { class: `er-mark er-mark--${SYMBOLS[s.id]}`, 'aria-hidden': 'true' }), s.label);
    b.style.setProperty('--c', `var(${s.colour})`);
    b.addEventListener('click', () => {
      if (on.has(s.id)) on.delete(s.id); else on.add(s.id);
      b.setAttribute('aria-pressed', String(on.has(s.id)));
      chart.refresh();
    });
    filters.append(b);
  }

  // ---------- chart ----------
  const narrow = () => chartEl.clientWidth < 560;
  const chart = await makeChart(chartEl, (c) => {
    const base = baseOption();
    const colour = (s) => c.tech[s.family] || c.silicon;
    const list = series.filter((s) => on.has(s.id)).map((s) => {
      const p = pts(s.id).filter((q) => q.year <= year);
      const data = p.map((q) => ({ value: [q.year, q.efficiency], rec: q }));
      if (p.length && p[p.length - 1].year < year) data.push({ value: [year, p[p.length - 1].efficiency], symbolSize: 0, hold: true });
      return {
        id: s.id, name: s.label, type: 'line', step: 'end', data, symbol: SYMBOLS[s.id], symbolSize: 8,
        lineStyle: { width: 2, color: colour(s), type: s.id === 'iii-v-conc' ? [6, 4] : 'solid' },
        itemStyle: { color: colour(s), borderColor: c.panel, borderWidth: 2 },
        emphasis: { focus: 'series' },
        endLabel: { show: !narrow() && data.length > 0, formatter: (x) => `${s.short} ${x.value[1]} %`, color: c.ink, fontSize: 12, distance: 6 },
        labelLayout: { moveOverlap: 'shiftY' },
        animation: false,
      };
    });
    list.push({
      id: 'sq', type: 'line', data: [], silent: true,
      markLine: {
        silent: true, symbol: 'none', animation: false,
        lineStyle: { color: c.ink2, type: [2, 4], width: 1.5 },
        label: { formatter: 'Single-junction limit 33.2 %', position: 'insideStartTop', color: c.ink2, fontSize: 12 },
        data: [{ yAxis: SQ }],
      },
    });
    return {
      ...base,
      animation: false,
      legend: { show: false },
      grid: { left: 8, right: narrow() ? 16 : 150, top: 28, bottom: 8, containLabel: true },
      tooltip: {
        ...base.tooltip, trigger: 'item',
        formatter: (p) => {
          const r = p.data?.rec;
          if (!r) return `${esc(p.seriesName)}: ${p.value[1]} % (record still standing in ${p.value[0]})`;
          const bits = [`${r.year}: ${r.efficiency} %${r.suns ? ` at ${r.suns} suns` : ''}`, r.institution];
          if (r.certified_by) bits.push(`Certified by ${r.certified_by}`);
          return `<b>${esc(p.seriesName)}</b><br>${bits.map(esc).join('<br>')}`;
        },
      },
      xAxis: { ...base._axis, type: 'value', min: 1950, max: 2030, interval: narrow() ? 20 : 10, axisLabel: { ...base._axis.axisLabel, formatter: (v) => String(v) }, splitLine: { show: false } },
      yAxis: { ...base._axis, type: 'value', min: 0, max: 50, interval: 10, name: 'Efficiency (%)', nameLocation: 'end', nameGap: 12, nameTextStyle: { ...base._axis.nameTextStyle, align: 'left' } },
      series: list,
    };
  });

  // ---------- time controls ----------
  const slider = $('er-year'); const out = $('er-year-out'); const play = $('er-play');
  const summary = $('er-summary');
  function setYear(y, fromSlider = false) {
    year = Math.max(FIRST, Math.min(LAST, Math.round(y)));
    if (!fromSlider) slider.value = String(year);
    out.textContent = String(year);
    chart.refresh();
    writeSummary();
  }
  function writeSummary() {
    const best = (ids) => {
      let b = null;
      for (const id of ids) for (const p of pts(id)) if (p.year <= year && (!b || p.efficiency > b.efficiency)) b = p;
      return b;
    };
    const label = (p) => { const l = series.find((s) => s.id === p.tech).label; return /^[A-Z][a-z]/.test(l) ? l[0].toLowerCase() + l.slice(1) : l; };
    const one = best(['si-mono', 'cigs', 'perovskite', 'organic', 'dye', 'qdot']);
    const any = best(series.map((s) => s.id));
    const parts = [`By ${year}:`];
    if (one) parts.push(`the best single-junction cell in this chart is ${label(one)} at ${one.efficiency} % (${one.institution}, ${one.year}).`);
    if (any && any !== one) parts.push(`The best cell of any kind is ${label(any)} at ${any.efficiency} %${any.suns ? ` under ${any.suns} suns` : ''} (${any.institution}, ${any.year}).`);
    summary.textContent = parts.join(' ');
  }
  slider.addEventListener('input', () => { stop(); setYear(Number(slider.value), true); });
  $('er-back').addEventListener('click', () => { stop(); setYear(year - 10); });
  $('er-fwd').addEventListener('click', () => { stop(); setYear(year + 10); });

  let loop = null; let acc = 0; let fy = year;
  function stop() {
    if (loop) { loop.stop(); loop = null; }
    play.textContent = 'Play';
  }
  function start() {
    if (year >= LAST) setYear(FIRST);
    fy = year; acc = 0;
    play.textContent = 'Pause';
    const yearsPerSecond = 6;
    loop = animate(chartEl, (dt) => {
      fy += dt * yearsPerSecond; acc += dt;
      if (acc > 1 / 30 && Math.floor(fy) !== year) { acc = 0; setYear(Math.floor(fy)); }
      if (fy >= LAST) { setYear(LAST); stop(); }
    });
  }
  play.addEventListener('click', () => (loop ? stop() : start()));
  // Reduced motion: no playback; the slider and the decade buttons step through still frames.
  if (reducedMotion()) play.hidden = true;

  setYear(LAST);
  buildTable(ds, series);
  new ResizeObserver(() => chart.refresh()).observe(chartEl);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildTable(ds, series) {
  const rows = [...ds.data.points].sort((a, b) => a.year - b.year || b.efficiency - a.efficiency);
  const name = (id) => series.find((s) => s.id === id).label;
  const table = h('table', {},
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Year'), h('th', { scope: 'col' }, 'Technology'), h('th', { scope: 'col', class: 'num' }, 'Efficiency'), h('th', { scope: 'col' }, 'Who'), h('th', { scope: 'col' }, 'Notes'))),
    h('tbody', {}, rows.map((p) => h('tr', {},
      h('td', { class: 'num' }, String(p.year)), h('td', {}, name(p.tech)),
      h('td', { class: 'num' }, `${p.efficiency} %`),
      h('td', {}, p.institution, p.certified_by ? h('span', { class: 'muted' }, ` (certified by ${p.certified_by})`) : null),
      h('td', {}, [p.suns ? `${p.suns} suns. ` : '', p.area_cm2 ? `${p.area_cm2} cm². ` : '', p.notes || ''].join(''), ' ', h('a', { href: `../sources.html#src-${p.source}` }, 'Source'))))));
  clear($('er-table')).append(table);
}
