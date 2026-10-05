// The sun-arc shared by the home page and the timeline: history drawn as one day.
// Dawn (discovery) rises from the left horizon, midday (industry) crosses the top,
// afternoon (the research frontier) is still above the horizon: the day is not over.
// Pure helpers (validateTimeline, placeEvents, arcPoint, yearAt) are unit-tested;
// SunArc builds the SVG with h.svg and styles it only through classes (theme-aware).

import { h, clear } from './assets/js/dom.js';

export const ERAS = [
  { id: 'dawn', label: 'Dawn', span: '1839–1900', from: 0.03, to: 0.25, y0: 1839, y1: 1900 },
  { id: 'morning', label: 'Morning', span: '1900–1970', from: 0.25, to: 0.49, y0: 1900, y1: 1970 },
  { id: 'midday', label: 'Midday', span: '1970–today', from: 0.49, to: 0.75, y0: 1970, y1: 2026 },
  { id: 'afternoon', label: 'Afternoon', span: 'the frontier', from: 0.75, to: 0.93, y0: 2026, y1: 2040 },
];
export const TODAY_T = 0.75;
export const ERA_IDS = ERAS.map((e) => e.id);
const STATUS = ['settled', 'consensus', 'research'];
const TRACKS = ['solar', 'renewables'];
export const TECHS = ['hydro', 'wind', 'geothermal', 'ocean', 'storage', 'biomass', 'csp'];

/** Throws if the timeline dataset does not have the expected shape. Returns true otherwise. */
export function validateTimeline(d) {
  const fail = (m) => { throw new Error(`timeline.json: ${m}`); };
  if (!d || typeof d !== 'object' || !d.meta || !Array.isArray(d.data)) fail('needs meta and a data array');
  if (!d.meta.title || !d.meta.license || !/^\d{4}-\d{2}-\d{2}$/.test(d.meta.last_verified || '')) fail('meta incomplete');
  const ids = new Set();
  let lastEra = 0;
  for (const e of d.data) {
    if (typeof e.id !== 'string' || !/^[a-z0-9-]+$/.test(e.id) || ids.has(e.id)) fail(`bad or duplicate id ${e.id}`);
    ids.add(e.id);
    if (!Number.isInteger(e.year) || e.year < 1800 || e.year > 2100) fail(`${e.id}: bad year`);
    const era = ERA_IDS.indexOf(e.era);
    if (era < 0) fail(`${e.id}: unknown era ${e.era}`);
    if (era < lastEra) fail(`${e.id}: eras out of order`);
    lastEra = era;
    if (!TRACKS.includes(e.track)) fail(`${e.id}: track must be solar or renewables`);
    if (e.track === 'renewables' && !TECHS.includes(e.tech)) fail(`${e.id}: renewables events need a tech`);
    if (typeof e.title !== 'string' || !e.title || typeof e.text !== 'string' || e.text.length < 40) fail(`${e.id}: title/text`);
    if (e.expert != null && typeof e.expert !== 'string') fail(`${e.id}: expert must be text`);
    if (!STATUS.includes(e.status)) fail(`${e.id}: bad status`);
    if (!Array.isArray(e.sources) || !e.sources.length || !e.sources.every((s) => typeof s === 'string')) fail(`${e.id}: sources`);
    if (e.lesson != null && !/^[a-z0-9/-]+\.html$/.test(e.lesson)) fail(`${e.id}: bad lesson path`);
  }
  return true;
}

/**
 * Position (0..1 along the arc) of each event. Within dawn, morning and midday the
 * position follows the year; the afternoon is not a span of years but a set of open
 * questions, so its events are spaced evenly.
 */
export function placeEvents(events) {
  const out = new Map();
  for (const era of ERAS) {
    const list = events.filter((e) => e.era === era.id);
    list.forEach((e, i) => {
      let f;
      if (era.id === 'afternoon') f = (i + 1) / (list.length + 1);
      else f = Math.min(1, Math.max(0, (e.year - era.y0) / (era.y1 - era.y0)));
      out.set(e.id, era.from + f * (era.to - era.from));
    });
  }
  return out;
}

/** The year shown when the sun is at t (for the animated readout). */
export function yearAt(t) {
  if (t <= ERAS[0].from) return ERAS[0].y0;
  for (const e of ERAS.slice(0, 3)) {
    if (t <= e.to) return Math.round(e.y0 + ((t - e.from) / (e.to - e.from)) * (e.y1 - e.y0));
  }
  return ERAS[2].y1;
}
export const eraAt = (t) => (ERAS.find((e) => t < e.to) || ERAS[ERAS.length - 1]).id;

/** Point on the arc. box = { x0, x1, horizon, rise }: a half-sine from the left horizon to the right. */
export function arcPoint(t, box) {
  return { x: box.x0 + t * (box.x1 - box.x0), y: box.horizon - Math.sin(Math.PI * t) * box.rise };
}
function arcPath(t0, t1, box, steps = 64) {
  const n = Math.max(2, Math.round(steps * (t1 - t0)) + 1);
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = arcPoint(t0 + ((t1 - t0) * i) / (n - 1), box);
    d += `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Draws the arc into an <svg> and lets callers move the sun.
 * opts: { events, pos (Map id->t), geometry(w,h) -> box, labels: [{id, text}], compact }
 */
export class SunArc {
  constructor(svg, opts) {
    this.svg = svg; this.opts = opts; this.t = opts.start ?? 0; this.hidden = new Set();
    this.showSun = opts.showSun !== false;
    this.ro = new ResizeObserver(() => this.build());
    this.ro.observe(svg);
    this.build();
  }
  build() {
    const r = this.svg.getBoundingClientRect();
    const w = Math.max(280, Math.round(r.width)); const hgt = Math.max(80, Math.round(r.height));
    if (w === this.w && hgt === this.hgt && this.built) return;
    this.w = w; this.hgt = hgt; this.built = true;
    const box = this.box = this.opts.geometry(w, hgt);
    this.svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
    const s = h.svg;
    const g = clear(this.svg);
    // horizon and era marks below it
    g.append(s('line', { class: 'arc-horizon', x1: 0, x2: w, y1: box.horizon, y2: box.horizon }));
    this.eraLabels = new Map();
    for (const era of ERAS) {
      const a = arcPoint(era.from, box).x; const b = arcPoint(era.to, box).x;
      g.append(s('line', { class: 'arc-era-tick', x1: a, x2: a, y1: box.horizon - 4, y2: box.horizon + 6 }));
      if (this.opts.eraLabels === false) continue;
      const label = s('text', { class: 'arc-era-label', x: (a + b) / 2, y: box.horizon + (this.opts.compact ? 16 : 22), 'text-anchor': 'middle' }, era.label);
      this.eraLabels.set(era.id, label); g.append(label);
    }
    // hour marks: the years at the era boundaries, written along the horizon
    const marks = typeof this.opts.hourMarks === 'function' ? this.opts.hourMarks(w) : this.opts.hourMarks;
    if (marks) {
      for (const [t, text, anchor] of marks) {
        const x = arcPoint(t, box).x;
        g.append(s('text', { class: 'arc-hour', x: x + (anchor === 'start' ? 24 : anchor === 'end' ? -24 : 0), y: box.horizon - 7, 'text-anchor': anchor || 'middle' }, text));
      }
    }
    // full track (future dashed) and the travelled trail
    g.append(s('path', { class: 'arc-track', d: arcPath(0, 1, box, 96) }));
    g.append(s('path', { class: 'arc-frontier', d: arcPath(TODAY_T, ERAS[3].to, box, 40) }));
    this.eraBand = s('path', { class: 'arc-era-band', d: '' });
    this.trail = s('path', { class: 'arc-trail', d: '' });
    g.append(this.eraBand, this.trail);
    // today marker
    const tp = arcPoint(TODAY_T, box);
    g.append(s('line', { class: 'arc-today', x1: tp.x, x2: tp.x, y1: tp.y + 8, y2: box.horizon }));
    // event ticks
    this.ticks = new Map();
    for (const e of this.opts.events) {
      const p = arcPoint(this.opts.pos.get(e.id), box);
      const c = s('circle', { class: `arc-tick arc-tick--${e.track === 'solar' ? 'solar' : e.tech}`, cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: this.opts.compact ? 3 : 3.6 });
      this.ticks.set(e.id, c); g.append(c);
    }
    // labelled milestones (home hero). place: 'out' (away from the dome), 'in-right' or 'in-left' (inside it)
    const labs = typeof this.opts.labels === 'function' ? this.opts.labels(w) : (this.opts.labels || []);
    for (const lab of labs) {
      const t = this.opts.pos.get(lab.id); if (t == null) continue;
      const p = arcPoint(t, box);
      const place = lab.place || 'out';
      let nx; let ny; let anchor; let cx; let cy;
      if (place === 'in-right') { nx = p.x + 20; ny = p.y + 8; anchor = 'start'; cx = nx - 4; cy = p.y + 1; }
      else if (place === 'in-left') { nx = p.x - 22; ny = p.y + 44; anchor = 'end'; cx = p.x - 8; cy = p.y + 22; }
      else {
        const out = t < 0.5 ? -1 : 1; // push the label away from the centre of the dome
        nx = p.x + out * 14; ny = p.y - 12; anchor = out < 0 ? 'end' : 'start'; cx = nx - out * 2; cy = ny + 3;
      }
      g.append(s('line', { class: 'arc-callout', x1: p.x, y1: p.y + (place === 'out' ? -5 : 0), x2: cx, y2: cy, 'data-id': lab.id }));
      g.append(s('text', { class: 'arc-label', x: nx, y: ny - 12, 'text-anchor': anchor, 'data-id': lab.id },
        s('tspan', { class: 'arc-label-year', x: nx, dy: 0 }, lab.year),
        s('tspan', { x: nx, dy: '1.25em' }, lab.text)));
    }
    // the sun
    this.sun = s('g', { class: 'arc-sun' },
      s('circle', { class: 'arc-sun-halo2', r: 30 }),
      s('circle', { class: 'arc-sun-halo', r: 19 }),
      s('circle', { class: 'arc-sun-disc', r: this.opts.compact ? 9 : 12 }));
    this.sunYear = s('text', { class: 'arc-sun-year', 'text-anchor': 'middle', y: -24 });
    if (this.opts.sunYear) this.sun.append(this.sunYear);
    if (!this.showSun) this.sun.setAttribute('visibility', 'hidden');
    g.append(this.sun);
    this.applyHidden();
    this.set(this.t, this.current, true);
    this.opts.onBuild?.(this);
  }
  setHidden(ids) { this.hidden = new Set(ids); this.applyHidden(); }
  applyHidden() {
    for (const [id, c] of this.ticks || []) c.setAttribute('visibility', this.hidden.has(id) ? 'hidden' : 'visible');
  }
  /** Move the sun to t; mark ticks up to t as passed and highlight `currentId` and its era. */
  set(t, currentId, force) {
    if (!this.box) return;
    if (!force && Math.abs(t - this.t) < 1e-4 && currentId === this.current) return;
    this.t = t; this.current = currentId;
    const p = arcPoint(t, this.box);
    this.sun.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    const trailTo = this.still ? TODAY_T : Math.min(t, 1);
    this.trail.setAttribute('d', trailTo > 0.002 ? arcPath(0, trailTo, this.box) : '');
    this.sun.setAttribute('visibility', this.still || !this.showSun ? 'hidden' : 'visible');
    const era = ERAS.find((e) => e.id === (this.eraOverride || eraAt(t)));
    this.eraBand.setAttribute('d', arcPath(era.from, era.to, this.box, 40));
    for (const [id, l] of this.eraLabels) l.classList.toggle('is-current', id === era.id);
    for (const [id, c] of this.ticks) {
      c.classList.toggle('is-passed', this.still || this.opts.pos.get(id) <= t + 1e-6);
      c.classList.toggle('is-current', id === currentId);
    }
    if (this.opts.sunYear) this.sunYear.textContent = this.opts.sunYear(t);
  }
}
