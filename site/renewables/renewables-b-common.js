// Shared, page-local helpers for the clean-energy overview, biomass, CSP, storage and grid pages:
// the "share of world electricity" figure from the signed electricity-mix dataset, small control
// bindings and SVG helpers. Everything is built with h(); nothing touches innerHTML.

import { h, clear, fmt, cssVar, onTheme, reducedMotion, animate, fitCanvas } from '../assets/js/dom.js';
import { loadData, setBadge, is } from '../assets/js/data.js';

export { h, clear, fmt, cssVar, onTheme, reducedMotion, animate, fitCanvas, loadData, setBadge };

export const MIX_SOURCE = 'Our World in Data / Ember';

export const validMix = (d) => is.obj(d) && is.obj(d.data) && is.obj(d.data.World)
  && is.arr(d.data.World.years) && is.arr(d.data.World.electricity_generation)
  && Object.values(d.data).every((e) => is.arr(e.years) && e.years.every(is.year)
    && is.arr(e.electricity_generation) && e.electricity_generation.length === e.years.length);

/** Load electricity-mix.json once per page. Resolves to { data, state } or throws DataIntegrityError. */
let mixPromise = null;
export const loadMix = () => (mixPromise ??= loadData('electricity-mix.json', validMix));

/** TWh of a source (or several summed) in an entity for each year; null where any part is missing. */
export function twhSeries(entity, sources) {
  const list = Array.isArray(sources) ? sources : [sources];
  return entity.years.map((_, i) => {
    let s = 0;
    for (const src of list) {
      const v = entity[`${src}_electricity`]?.[i];
      if (v == null) return null;
      s += v;
    }
    return s;
  });
}

/** Latest year with data for a source (or sum of sources): { year, twh, pct, gen }. */
export function latestShare(entity, sources) {
  const twh = twhSeries(entity, sources);
  for (let i = entity.years.length - 1; i >= 0; i -= 1) {
    const gen = entity.electricity_generation[i];
    if (twh[i] == null || gen == null || gen <= 0) continue;
    return { year: entity.years[i], twh: twh[i], pct: (100 * twh[i]) / gen, gen };
  }
  return null;
}

export const pctText = (p) => (p >= 1 ? p.toFixed(1) : p.toFixed(2));

/** Share of generation (%) for each year for a source or a sum of sources. */
export function shareSeries(entity, sources) {
  const twh = twhSeries(entity, sources);
  return entity.years.map((y, i) => {
    const gen = entity.electricity_generation[i];
    return [y, twh[i] != null && gen ? (100 * twh[i]) / gen : null];
  }).filter(([, p]) => p != null);
}

/**
 * Fill a share figure from electricity-mix.json: <section class="today-figure share-figure" data-sources="solar,wind" data-noun="…">
 * with [data-slot=pct|twh|year|spark] and a .data-badge inside. Returns latestShare for World.
 */
export async function mountShare(root) {
  const sources = root.dataset.sources.split(',').map((s) => s.trim());
  const badge = root.querySelector('.data-badge');
  const slot = (n) => root.querySelectorAll(`[data-slot="${n}"]`);
  try {
    const { data, state } = await loadMix();
    setBadge(badge, state, MIX_SOURCE);
    const w = latestShare(data.data.World, sources);
    if (!w) return null;
    slot('pct').forEach((el) => { el.textContent = `${pctText(w.pct)} %`; });
    slot('twh').forEach((el) => { el.textContent = `${Math.round(w.twh).toLocaleString('en-US')} TWh`; });
    slot('year').forEach((el) => { el.textContent = String(w.year); });
    slot('spark').forEach((el) => drawSpark(el, shareSeries(data.data.World, sources), root.dataset.noun || sources.join(' and ')));
    return w;
  } catch (e) {
    console.warn(e);
    setBadge(badge, 'failed');
    return null;
  }
}

/** Quiet sparkline of world share over time (inline SVG), first and last values in text. */
export function drawSpark(host, series, noun) {
  if (series.length < 2) return;
  const W = 240; const H = 56; const pad = 4;
  const ys = series.map((d) => d[1]);
  const max = Math.max(...ys) * 1.08 || 1;
  const x0 = series[0][0]; const x1 = series[series.length - 1][0];
  const X = (x) => pad + ((x - x0) / (x1 - x0)) * (W - 2 * pad);
  const Y = (y) => H - pad - (y / max) * (H - 2 * pad);
  const d = series.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('');
  const area = `${d}L${X(x1).toFixed(1)},${H - pad}L${X(x0).toFixed(1)},${H - pad}Z`;
  const first = series[0]; const last = series[series.length - 1];
  clear(host).append(
    h.svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', role: 'img',
      'aria-label': `World share of electricity from ${noun}, ${first[0]} to ${last[0]}: from ${pctText(first[1])} % to ${pctText(last[1])} %.` },
    h.svg('path', { d: area, class: 'spark-area' }),
    h.svg('path', { d, class: 'spark-line' }),
    h.svg('circle', { cx: X(last[0]), cy: Y(last[1]), r: 3.5, class: 'spark-dot' })),
    h('span', { class: 'spark-cap' }, h('span', {}, `${first[0]}: ${pctText(first[1])} %`), h('span', {}, `${last[0]}: ${pctText(last[1])} %`)));
}

/** Mount every .share-figure on the page. */
export const mountShares = () => Promise.all([...document.querySelectorAll('.share-figure[data-sources]')].map(mountShare));

/** Bind a range input to an <output> and a callback; returns an update function. */
export function bindRange(input, output, format, fn) {
  const upd = () => { const v = Number(input.value); if (output) output.textContent = format(v); fn?.(v); };
  input.addEventListener('input', upd);
  upd();
  return upd;
}

/** A group of toggle buttons with aria-pressed. */
export function segmented(group, onPick, { fire = true } = {}) {
  const buttons = [...group.querySelectorAll('button[value]')];
  const pick = (val, call = true) => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.value === val)));
    if (call) onPick(val);
  };
  group.addEventListener('click', (e) => { const b = e.target.closest('button[value]'); if (b) pick(b.value); });
  const initial = buttons.find((b) => b.getAttribute('aria-pressed') === 'true') || buttons[0];
  pick(initial.value, fire);
  return { pick, current: () => buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.value };
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

/** Theme colours for canvas drawing, read fresh on each call. */
export function ink() {
  const v = cssVar;
  return {
    paper: v('--paper'), paper2: v('--paper-2'), panel: v('--panel'), ink: v('--ink'), ink2: v('--ink-2'), rule: v('--rule'),
    silicon: v('--silicon'), sun: v('--sun'), sunInk: v('--sun-ink'), sunWash: v('--sun-wash'), hole: v('--hole'), good: v('--good'), warn: v('--warn'),
    solar: v('--r-solar'), wind: v('--r-wind'), hydro: v('--r-hydro'), geo: v('--r-geothermal'), ocean: v('--r-ocean'),
    biomass: v('--r-biomass'), csp: v('--r-csp'), storage: v('--r-storage'),
    font: '"Atkinson Next", system-ui, sans-serif',
  };
}

/** Canvas text with a halo in the panel colour so it stays legible over drawings. */
export function label(ctx, text, x, y, { color, size = 13, align = 'left', base = 'middle', weight = 600, halo } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px "Atkinson Next", system-ui, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = base; ctx.lineJoin = 'round';
  ctx.lineWidth = 4; ctx.strokeStyle = halo || cssVar('--panel'); ctx.strokeText(text, x, y);
  ctx.fillStyle = color || cssVar('--ink'); ctx.fillText(text, x, y);
  ctx.restore();
}

/** Mix a CSS colour with transparency for canvas use. */
export function alpha(color, a) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) return color;
  let x = m[1]; if (x.length === 3) x = [...x].map((c) => c + c).join('');
  const n = parseInt(x, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Format MW/MWh values compactly. */
export const mw = (x) => `${Math.round(x).toLocaleString('en-US')}`;
export const pct = (x, d = 0) => `${(100 * x).toFixed(d)} %`;
