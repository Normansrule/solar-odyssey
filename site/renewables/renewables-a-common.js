// Shared, page-local helpers for the wind, hydro, geothermal and ocean pages:
// the "share of world electricity" figure (from the signed electricity-mix dataset),
// canvas stage scaffolding (resize, theme, off-screen pause, reduced motion), and
// small control bindings. Nothing here touches innerHTML; everything is built with h().

import { h, clear, fitCanvas, animate, onTheme, reducedMotion, cssVar, fmt } from '../assets/js/dom.js';
import { loadData, setBadge, is } from '../assets/js/data.js';

export { h, clear, fmt, cssVar, reducedMotion };

const REGIONS = new Set(['World', 'Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']);

export const validMix = (d) => is.obj(d) && is.obj(d.data) && is.obj(d.data.World)
  && is.arr(d.data.World.years) && is.arr(d.data.World.electricity_generation)
  && Object.values(d.data).every((e) => is.arr(e.years) && e.years.every(is.year));

/** Latest year with a value for a source in an entity: { year, twh, pct } (pct computed when the share field is absent). */
export function latestShare(entity, source) {
  const twh = entity[`${source}_electricity`] || [];
  const share = entity[`${source}_share_elec`];
  for (let i = entity.years.length - 1; i >= 0; i--) {
    const gen = entity.electricity_generation[i];
    const v = twh[i];
    if (v == null || gen == null || gen <= 0) continue;
    const pct = share && share[i] != null ? share[i] : (100 * v) / gen;
    return { year: entity.years[i], twh: v, pct, gen };
  }
  return null;
}

/** Share of generation (%) for every year, computed from TWh when needed. */
export function shareSeries(entity, source) {
  const twh = entity[`${source}_electricity`] || [];
  const share = entity[`${source}_share_elec`];
  return entity.years.map((y, i) => {
    const gen = entity.electricity_generation[i];
    const pct = share && share[i] != null ? share[i] : (twh[i] != null && gen ? (100 * twh[i]) / gen : null);
    return [y, pct];
  }).filter(([, p]) => p != null);
}

const pctText = (p) => (p >= 10 ? p.toFixed(1) : p >= 1 ? p.toFixed(1) : p.toFixed(2));

/**
 * Fill a `.today-figure[data-source]` block from electricity-mix.json.
 * Slots: [data-slot=pct|twh|year|spark|leaders], plus a .data-badge inside the block.
 * Returns the loaded dataset (or null if it failed its integrity check).
 */
export async function mountShare(root, { source, noun, leaders = 3 }) {
  const badge = root.querySelector('.data-badge');
  const slot = (n) => root.querySelector(`[data-slot="${n}"]`);
  try {
    const { data, state } = await loadData('electricity-mix.json', validMix);
    setBadge(badge, state, 'Our World in Data / Ember');
    const world = latestShare(data.data.World, source);
    if (!world) return data;
    slot('pct') && (slot('pct').textContent = `${pctText(world.pct)} %`);
    slot('twh') && (slot('twh').textContent = `${Math.round(world.twh).toLocaleString('en-US')} TWh`);
    slot('year') && (slot('year').textContent = String(world.year));
    const sp = slot('spark');
    if (sp) drawSpark(sp, shareSeries(data.data.World, source), noun);
    const lead = slot('leaders');
    if (lead) {
      const rows = Object.entries(data.data)
        .filter(([name]) => !REGIONS.has(name))
        .map(([name, e]) => ({ name, ...latestShare(e, source) }))
        .filter((r) => r.pct != null && Number.isFinite(r.pct))
        .sort((a, b) => b.pct - a.pct).slice(0, leaders);
      clear(lead).append(...rows.map((r) => h('li', {},
        h('span', { class: 'lead-name' }, r.name), ' ',
        h('span', { class: 'lead-val' }, `${pctText(r.pct)} %`), ' ',
        h('span', { class: 'lead-year' }, `(${r.year})`))));
    }
    return data;
  } catch (e) {
    console.warn(e);
    setBadge(badge, 'failed');
    return null;
  }
}

/** A quiet sparkline of world share over time (inline SVG), with first and last values labelled in text. */
function drawSpark(host, series, noun) {
  if (series.length < 2) return;
  const W = 240; const H = 56; const pad = 4;
  const ys = series.map((d) => d[1]);
  const max = Math.max(...ys) * 1.08; const min = 0;
  const x0 = series[0][0]; const x1 = series[series.length - 1][0];
  const X = (x) => pad + ((x - x0) / (x1 - x0)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - min) / (max - min)) * (H - 2 * pad);
  const d = series.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('');
  const area = `${d}L${X(x1).toFixed(1)},${H - pad}L${X(x0).toFixed(1)},${H - pad}Z`;
  const last = series[series.length - 1];
  const first = series[0];
  clear(host).append(
    h.svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', role: 'img',
      'aria-label': `World share of electricity from ${noun}, ${first[0]} to ${last[0]}: from ${pctText(first[1])} % to ${pctText(last[1])} %.` },
    h.svg('path', { d: area, class: 'spark-area' }),
    h.svg('path', { d, class: 'spark-line' }),
    h.svg('circle', { cx: X(last[0]), cy: Y(last[1]), r: 3.5, class: 'spark-dot' })),
    h('span', { class: 'spark-cap' }, `${first[0]}: ${pctText(first[1])} %`, h('span', { class: 'spark-sep', 'aria-hidden': 'true' }, ''), `${last[0]}: ${pctText(last[1])} %`));
}

// ---------- canvas stage ----------

/**
 * Drive a canvas: sizes it to its CSS box (crisp on high-DPI screens), redraws on resize and theme change,
 * runs draw(ctx, w, h, dt) every frame through animate() (paused off-screen) unless the reader prefers reduced motion,
 * and wires an optional play/pause button. Returns { redraw, setPlaying, isPlaying }.
 */
export function stage(canvas, draw, { playButton = null, autoplay = true } = {}) {
  let ctx = null; let w = 0; let hgt = 0; let playing = autoplay && !reducedMotion(); let loop = null;
  const size = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    w = r.width; hgt = r.height; ctx = fitCanvas(canvas, w, hgt);
  };
  const redraw = (dt = 0) => { if (!ctx) size(); if (ctx) draw(ctx, w, hgt, dt); };
  new ResizeObserver(() => { size(); redraw(0); }).observe(canvas);
  onTheme(() => redraw(0));
  const label = () => {
    if (!playButton) return;
    playButton.textContent = playing ? 'Pause' : 'Play';
  };
  const start = () => { loop ??= animate(canvas, (dt) => { if (playing) redraw(dt); }); loop.kick(); };
  if (playButton) playButton.addEventListener('click', () => { playing = !playing; label(); if (playing) start(); });
  label();
  if (playing) start();
  return {
    redraw,
    setPlaying(p) { playing = p && true; label(); if (playing) start(); else redraw(0); },
    isPlaying: () => playing,
  };
}

/** Theme colours for canvas drawing, read fresh each call. */
export function ink() {
  const v = cssVar;
  return {
    paper: v('--paper'), paper2: v('--paper-2'), panel: v('--panel'), ink: v('--ink'), ink2: v('--ink-2'), rule: v('--rule'),
    silicon: v('--silicon'), sun: v('--sun'), sunInk: v('--sun-ink'), electron: v('--electron'), hole: v('--hole'), good: v('--good'), warn: v('--warn'),
    wind: v('--r-wind'), hydro: v('--r-hydro'), geo: v('--r-geothermal'), ocean: v('--r-ocean'), storage: v('--r-storage'),
    font: '"Atkinson Next", system-ui, sans-serif', display: 'Fraunces, Georgia, serif',
  };
}

/** Draw an arrow from (x1,y1) to (x2,y2). */
export function arrow(ctx, x1, y1, x2, y2, { color, width = 2, head = 8, dash = null } = {}) {
  const ang = Math.atan2(y2 - y1, x2 - x1); const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  const hd = Math.min(head, len * 0.5);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - hd * 0.8 * Math.cos(ang), y2 - hd * 0.8 * Math.sin(ang)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hd * Math.cos(ang - 0.42), y2 - hd * Math.sin(ang - 0.42));
  ctx.lineTo(x2 - hd * Math.cos(ang + 0.42), y2 - hd * Math.sin(ang + 0.42));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** Text label with a paper halo so it stays legible over drawings. */
export function label(ctx, text, x, y, { color, size = 13, align = 'left', base = 'middle', weight = 600, font, halo } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font || '"Atkinson Next", system-ui, sans-serif'}`;
  ctx.textAlign = align; ctx.textBaseline = base;
  ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = halo || cssVar('--panel');
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color || cssVar('--ink'); ctx.fillText(text, x, y);
  ctx.restore();
}

// ---------- controls ----------

/** Bind a range input to an <output> and a callback. format(value) → text. Calls fn once at start. */
export function bindRange(input, output, format, fn) {
  const upd = () => { const v = Number(input.value); if (output) output.textContent = format(v); fn?.(v); };
  input.addEventListener('input', upd);
  upd();
  return upd;
}

/** A group of toggle buttons (aria-pressed). onPick(value) is called on click and once for the initial value. */
export function segmented(group, onPick) {
  const buttons = [...group.querySelectorAll('button[value]')];
  const pick = (val, fire = true) => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.value === val)));
    if (fire) onPick(val);
  };
  group.addEventListener('click', (e) => { const b = e.target.closest('button[value]'); if (b && !b.disabled) pick(b.value); });
  const initial = buttons.find((b) => b.getAttribute('aria-pressed') === 'true') || buttons[0];
  pick(initial.value);
  return { pick, buttons };
}

/** Set text of the element with this id (if present). */
export const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

/** Log-scale mapping for sliders: position 0…1000 → value between lo and hi. */
export const logScale = (lo, hi) => ({
  toValue: (p) => lo * (hi / lo) ** (p / 1000),
  toPos: (v) => (1000 * Math.log(v / lo)) / Math.log(hi / lo),
});

/** Point at fraction f (0…1) of the way along a polyline [[x,y], …]. */
export function along(pts, f) {
  const segs = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); tot += l; }
  let d = Math.min(Math.max(f, 0), 1) * tot;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] && segs[i] > 0) { const t = d / segs[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; }
    d -= segs[i];
  }
  return pts[pts.length - 1];
}

/** Stroke a polyline as a pipe: dark casing with a lighter bore. */
export function pipe(ctx, pts, { outer, inner, width = 10 }) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [col, wd] of [[outer, width], [inner, width - 4]]) {
    ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  }
  ctx.restore();
}
