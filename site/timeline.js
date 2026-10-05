// The timeline page: events from data/timeline.json along a spine, with a sticky
// sun-arc whose sun follows the reader's scroll position through the day.

import { h, clear, safeHref, reducedMotion } from './assets/js/dom.js';
import { loadData, setBadge } from './assets/js/data.js';
import { PAGES } from './assets/js/sitemap.js';
import { SunArc, ERAS, placeEvents, validateTimeline, arcPoint } from './sun-arc.js';

const $ = (sel) => document.querySelector(sel);
const band = $('#tl-band');
const svg = $('#tl-arc');
const badge = $('#tl-badge');
const yearEl = $('#tl-year');
const titleEl = $('#tl-title');
const prevBtn = $('#tl-prev');
const nextBtn = $('#tl-next');
const store = {
  get(k, d) { try { const v = localStorage.getItem(`so.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`so.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** '1873-02-20' -> '20 February 1873', '1954-04' -> 'April 1954'; anything else is shown as written. */
export function formatDate(s) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s || '');
  if (!m) return s || '';
  const month = MONTHS[Number(m[2]) - 1];
  return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`;
}
const TECH_LABEL = { hydro: 'Hydropower', wind: 'Wind', geothermal: 'Geothermal', ocean: 'Tidal', storage: 'Storage', biomass: 'Biomass', csp: 'Concentrated solar' };
const lessonTitle = (path) => PAGES.find((p) => p.path === path)?.title;

let events = []; let pos = new Map(); let arc = null; let nodes = [];
let filter = store.get('tl.filter', 'all') === 'solar' ? 'solar' : 'all';
let sources = {};
const citeOrder = [];

function cite(ids) {
  const sup = h('sup', { class: 'cite' });
  ids.forEach((id, k) => {
    if (!citeOrder.includes(id)) citeOrder.push(id);
    const s = sources[id];
    if (k) sup.append(h('span', { class: 'visually-hidden' }, ', '));
    sup.append(h('a', { href: `#ref-${id}`, title: s ? `${s.authors ? `${s.authors}: ` : ''}${s.title} (${s.year ?? 'n.d.'})` : id }, String(citeOrder.indexOf(id) + 1)));
  });
  return sup;
}

function renderEvent(e) {
  const statusTag = e.status === 'consensus' ? h('span', { class: 'claim claim--consensus' }, 'Current consensus')
    : e.status === 'research' ? h('span', { class: 'claim claim--research' }, 'Active research') : null;
  const lt = e.lesson && lessonTitle(e.lesson);
  const body = h('div', { class: 'tl-ev-body' },
    e.track === 'renewables' ? h('span', { class: 'tl-ev-tech' }, TECH_LABEL[e.tech] || 'Renewables') : null,
    h('h3', { id: `ev-${e.id}-h` }, e.title),
    h('p', {}, e.text, cite(e.sources)),
    e.expert ? h('div', { class: 'expert expert-note' }, h('p', {}, e.expert)) : null,
    h('p', { class: 'tl-ev-meta' },
      lt ? h('a', { class: 'tl-lesson', href: safeHref(e.lesson) }, `Lesson: ${lt}`) : null,
      statusTag,
      e.fast ? h('span', {}, h('span', { class: 'verified' }, '2026-09-30'), ' ', h('a', { href: 'state-of-the-field.html' }, 'State of the field')) : null));
  const li = h('li', {
    class: 'tl-ev', id: `ev-${e.id}`, tabindex: '-1', 'aria-labelledby': `ev-${e.id}-h`,
    dataset: { id: e.id, track: e.track, ...(e.tech ? { tech: e.tech } : {}) },
  },
  h('p', { class: 'tl-ev-year' }, String(e.year), e.date && !/^\d{4}$/.test(e.date) ? h('span', { class: 'tl-ev-date' }, formatDate(e.date)) : null),
  h('span', { class: 'tl-ev-dot', 'aria-hidden': 'true' }),
  body);
  return li;
}

function renderReferences() {
  const host = $('#tl-refs');
  const list = h('ol', { class: 'references' }, citeOrder.map((id) => {
    const s = sources[id];
    if (!s) return h('li', { id: `ref-${id}` }, `Missing source: ${id}`);
    const link = s.doi ? `https://doi.org/${s.doi}` : s.url;
    return h('li', { id: `ref-${id}` },
      s.authors ? `${s.authors} ` : '', s.year ? `(${s.year}). ` : '',
      h('a', { href: safeHref(link), rel: 'noopener noreferrer' }, s.title), '. ',
      s.container ? `${s.container}. ` : '', s.doi ? `doi:${s.doi}. ` : '',
      h('a', { href: `sources.html#src-${id}` }, 'Source record'));
  }));
  clear(host).append(h('h2', { id: 'tl-refs-h' }, 'References'), list);
}

const visible = () => nodes.filter((n) => !n.el.hidden);

function applyFilter() {
  for (const n of nodes) n.el.hidden = filter === 'solar' && n.e.track !== 'solar';
  document.querySelectorAll('.tl-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
  arc?.setHidden(nodes.filter((n) => n.el.hidden).map((n) => n.e.id));
  update(true);
}

// ---- scroll tracking ----
let current = null; let raf = 0;
// The reading line sits a little below the band as it is when stuck (not where it is
// at the top of the page), so measuring and stepping agree wherever the page is scrolled.
function anchorY() {
  const stuck = (parseFloat(getComputedStyle(band).top) || 0) + band.offsetHeight;
  return stuck + Math.max(60, (window.innerHeight - stuck) * 0.3);
}
function measure() {
  const vis = visible();
  if (!vis.length) return { t: 0, idx: -1, vis };
  const y = anchorY();
  const tops = vis.map((n) => n.el.getBoundingClientRect().top);
  let i = -1;
  for (let k = 0; k < vis.length; k++) if (tops[k] <= y) i = k;
  // once a new era's heading reaches the reading line, the reader is in that era
  const nxt = vis[i + 1];
  if (nxt && (i < 0 || nxt.e.era !== vis[i].e.era) && nxt.el.closest('.tl-era').getBoundingClientRect().top <= y) {
    return { t: pos.get(nxt.e.id), idx: i + 1, vis };
  }
  const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
  const lastBody = vis[vis.length - 1].el.getBoundingClientRect();
  if (atBottom && lastBody.top < window.innerHeight) i = vis.length - 1;
  if (i < 0) {
    // before the first event: the sun waits at dawn, on the 1839 mark
    return { t: pos.get(vis[0].e.id), idx: 0, vis, before: true };
  }
  const t0 = pos.get(vis[i].e.id);
  if (i === vis.length - 1) return { t: t0, idx: i, vis };
  const f = Math.max(0, Math.min(1, (y - tops[i]) / Math.max(1, tops[i + 1] - tops[i])));
  return { t: t0 + f * (pos.get(vis[i + 1].e.id) - t0), idx: i, vis };
}
function update(force) {
  if (!arc) return;
  const { t, idx, vis, before } = measure();
  if (idx < 0) return;
  const cur = vis[idx];
  const curT = pos.get(cur.e.id);
  const still = reducedMotion();
  // with reduced motion the sun does not travel: the arc only highlights the era and the current event
  arc.eraOverride = cur.e.era;
  arc.still = still;
  arc.set(still ? curT : t, before ? null : cur.e.id, force);
  const era = cur.e.era;
  band.dataset.era = era;
  document.querySelectorAll('#tl-eras li').forEach((li) => li.querySelector('a').setAttribute('aria-current', String(li.dataset.era === era)));
  if (current !== cur.e.id || force) {
    current = cur.e.id;
    yearEl.textContent = String(cur.e.year);
    titleEl.textContent = cur.e.title;
    for (const n of nodes) {
      const tt = pos.get(n.e.id);
      n.el.classList.toggle('is-passed', !before && tt <= curT + 1e-9);
      n.el.classList.toggle('is-current', !before && n === cur);
    }
    prevBtn.disabled = idx === 0 && Boolean(before);
    nextBtn.disabled = idx === vis.length - 1;
  }
}
const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };

let pending = null; // { node, at }: the event a step is scrolling to, so quick repeated steps keep advancing
function go(dir) {
  const { idx, vis, before } = measure();
  let from = idx; let isBefore = before;
  if (pending && performance.now() - pending.at < 1200 && vis.includes(pending.node)) { from = vis.indexOf(pending.node); isBefore = false; }
  const target = isBefore && dir > 0 ? vis[0] : vis[Math.max(0, Math.min(vis.length - 1, from + dir))];
  if (!target) return;
  pending = { node: target, at: performance.now() };
  const y = target.el.getBoundingClientRect().top + window.scrollY - (anchorY() - 8);
  window.scrollTo({ top: Math.max(0, y), behavior: reducedMotion() ? 'auto' : 'smooth' });
  target.el.focus({ preventScroll: true });
  history.replaceState(null, '', `#ev-${target.e.id}`);
}

function placeEraLinks(a) {
  for (const li of document.querySelectorAll('#tl-eras li')) {
    const era = ERAS.find((e) => e.id === li.dataset.era);
    const x = (arcPoint(era.from, a.box).x + arcPoint(era.to, a.box).x) / 2;
    li.style.left = `${(100 * x) / a.w}%`;
  }
}

async function main() {
  try {
    const [tl, src] = await Promise.all([loadData('timeline.json', validateTimeline), loadData('sources.json')]);
    events = tl.data.data; sources = src.data;
    setBadge(badge, tl.state, 'timeline.json');
  } catch (err) {
    console.error(err);
    setBadge(badge, 'failed');
    return;
  }
  pos = placeEvents(events);
  for (const e of events) {
    const li = renderEvent(e);
    document.querySelector(`.tl-events[data-era="${e.era}"]`).append(li);
    nodes.push({ e, el: li });
  }
  renderReferences();
  arc = new SunArc(svg, {
    events, pos, eraLabels: false,
    hourMarks: (w) => (w < 640 ? null : [[ERAS[0].from, '1839', 'start'], [ERAS[1].from, '1900'], [ERAS[2].from, '1970'], [ERAS[3].from, 'today']]),
    geometry: (w, hh) => {
      const ground = parseFloat(getComputedStyle(band).getPropertyValue('--arc-ground')) * 16 || 34;
      const pad = w < 640 ? 14 : 28;
      return { x0: pad, x1: w - pad, horizon: hh - ground, rise: hh - ground - 22 };
    },
    onBuild: placeEraLinks,
  });
  document.querySelectorAll('.tl-chip').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter; store.set('tl.filter', filter); applyFilter();
  }));
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  document.addEventListener('keydown', (ev) => {
    if (ev.target.closest('input, select, textarea, [contenteditable]') || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key === 'j' || ev.key === 'J') { ev.preventDefault(); go(1); }
    if (ev.key === 'k' || ev.key === 'K') { ev.preventDefault(); go(-1); }
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  document.addEventListener('so:depth', onScroll);
  applyFilter();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (/^ev-[a-z0-9-]+$/.test(hash) && document.getElementById(hash)) {
    const n = nodes.find((x) => `ev-${x.e.id}` === hash);
    if (n?.el.hidden) { filter = 'all'; applyFilter(); }
    requestAnimationFrame(() => { document.getElementById(hash).scrollIntoView(); update(true); });
  }
}
main();
