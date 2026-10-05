// Home: the sun-arc hero (one orchestrated rise from 1839 to today), the
// learning-path map with local progress, and "continue where you left off".

import { h, clear, animate, reducedMotion } from './assets/js/dom.js';
import { loadData } from './assets/js/data.js';
import { PAGES, LESSONS } from './assets/js/sitemap.js';
import { progress } from './assets/js/core.js';
import { SunArc, TODAY_T, placeEvents, validateTimeline, yearAt, eraAt } from './sun-arc.js';

// ---------- learning path: stops map to sitemap groups ----------
export const STOPS = [
  { id: 'story', pages: (p) => p.group === 'story' },
  { id: 'cell', pages: (p) => p.group === 'cell' },
  { id: 'today', pages: (p) => p.group === 'today' },
  { id: 'frontier', pages: (p) => p.group === 'frontier' },
  { id: 'renewables', pages: (p) => p.group === 'renewables' && !['storage', 'grid', 'compare'].includes(p.id) },
  { id: 'grid', pages: (p) => ['storage', 'grid', 'compare'].includes(p.id) },
];

function buildPath() {
  const prog = progress.all();
  for (const stop of STOPS) {
    const li = document.querySelector(`.station[data-stop="${stop.id}"]`);
    if (!li) continue;
    const pages = PAGES.filter(stop.pages);
    const list = li.querySelector('.stop-pages');
    clear(list).append(...pages.map((p) => {
      const done = Boolean(prog.complete[p.id]); const seen = Boolean(prog.visited[p.id]);
      return h('li', { class: seen ? 'is-visited' : false },
        h('span', { class: 'mark', 'aria-hidden': 'true' }, done ? '✓' : ''),
        h('a', { href: p.path }, p.title),
        done ? h('span', { class: 'visually-hidden' }, ' (completed)') : seen ? h('span', { class: 'visually-hidden' }, ' (visited)') : null);
    }));
    const lessons = pages.filter((p) => p.lesson);
    const nDone = lessons.filter((p) => prog.complete[p.id]).length;
    const started = pages.some((p) => prog.visited[p.id] || prog.complete[p.id]);
    li.classList.toggle('is-started', started);
    li.classList.toggle('is-done', lessons.length > 0 && nDone === lessons.length);
    li.querySelector('.stop-status')?.remove();
    if (started) li.append(h('span', { class: 'stop-status' }, `${nDone} of ${lessons.length} lesson${lessons.length === 1 ? '' : 's'} complete`));
  }
  drawLine();
}

function drawLine() {
  const map = document.querySelector('.journey-map');
  const svg = document.getElementById('journey-line');
  if (!map || !svg) return;
  const box = map.getBoundingClientRect();
  const dots = [...document.querySelectorAll('.station')].map((li) => {
    const r = li.getBoundingClientRect(); const d = parseFloat(getComputedStyle(map).getPropertyValue('--dot')) * 16 || 40;
    return { x: r.left - box.left + d / 2, y: r.top - box.top + d / 2, li };
  });
  if (dots.length < 2) return;
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  const vertical = Math.abs(dots[1].x - dots[0].x) < 4;
  const seg = (a, b) => (vertical ? `L${b.x} ${b.y}` : `C${(a.x + b.x) / 2} ${a.y} ${(a.x + b.x) / 2} ${b.y} ${b.x} ${b.y}`);
  let d = `M${dots[0].x} ${dots[0].y}`;
  for (let i = 1; i < dots.length; i++) d += seg(dots[i - 1], dots[i]);
  let last = -1;
  dots.forEach((p, i) => { if (p.li.classList.contains('is-started')) last = i; });
  let dd = '';
  if (last > 0) { dd = `M${dots[0].x} ${dots[0].y}`; for (let i = 1; i <= last; i++) dd += seg(dots[i - 1], dots[i]); }
  clear(svg).append(h.svg('path', { class: 'jl-track', d }), dd ? h.svg('path', { class: 'jl-done', d: dd }) : '');
}

// ---------- continue where you left off ----------
function buildResume() {
  const host = document.getElementById('resume');
  const prog = progress.all();
  const touched = LESSONS.filter((p) => prog.visited[p.id] || prog.complete[p.id]);
  if (!touched.length) { host.hidden = true; return; }
  const doneCount = LESSONS.filter((p) => prog.complete[p.id]).length;
  // the most recent page the reader opened or finished, then the first unfinished lesson from there on
  const stamp = (p) => [prog.complete[p.id] || '', prog.visited[p.id] || ''].sort().pop();
  const recent = [...touched].sort((a, b) => stamp(b).localeCompare(stamp(a)) || LESSONS.indexOf(b) - LESSONS.indexOf(a))[0];
  const from = LESSONS.indexOf(recent);
  const next = [...LESSONS.slice(from), ...LESSONS.slice(0, from)].find((p) => !prog.complete[p.id]);
  host.hidden = false;
  clear(host).append(h('div', { class: 'resume-inner' },
    h('div', {},
      h('h2', {}, 'Continue where you left off'),
      h('p', {}, `${doneCount} of ${LESSONS.length} lessons complete. Your progress is stored only in this browser.`)),
    next ? h('a', { class: 'btn', href: next.path }, `Continue with ${next.title}`) : h('p', {}, 'You have completed every lesson.')));
}

// ---------- hero ----------
const HERO_LABELS = [
  { id: 'becquerel-1839', year: '1839', text: 'Becquerel sees light make a current', place: 'in-right' },
  { id: 'bell-labs-1954', year: '1954', text: 'First practical silicon cell', wide: true },
  { id: 'solar-share-2025', year: 'Today', text: 'Solar makes {share} of world electricity', short: '{share} of world electricity' },
  { id: 'tandem-record-2026', year: 'Frontier', text: 'Stacked cells reach {tandem}', wide: true },
];

async function buildHero() {
  const hero = document.getElementById('hero');
  const svg = document.getElementById('hero-arc');
  let events; const values = {};
  try {
    const [tl, mix, rec] = await Promise.all([
      loadData('timeline.json', validateTimeline),
      loadData('electricity-mix.json', (d) => d && d.data && d.data.World && Array.isArray(d.data.World.years)),
      loadData('efficiency-records.json', (d) => d && d.data && Array.isArray(d.data.points)).catch(() => null),
    ]);
    events = tl.data.data;
    const w = mix.data.data.World; const i = w.years.length - 1;
    values.share = `${w.solar_share_elec[i].toFixed(1)} %`;
    if (rec) {
      const pts = rec.data.data.points.filter((p) => p.tech === 'perovskite-si').sort((a, b) => a.year - b.year || a.efficiency - b.efficiency);
      if (pts.length) values.tandem = `${pts[pts.length - 1].efficiency} %`;
    }
  } catch (err) {
    console.error(err);
    return; // the hero copy and buttons still work without the arc
  }
  const pos = placeEvents(events);
  const fill = (txt) => txt.replace('{share}', values.share).replace('{tandem}', values.tandem);
  const usable = HERO_LABELS.filter((l) => !/\{tandem\}/.test(l.text) || values.tandem);
  // on a narrow screen the dome is small: keep the two ends of the story, placed inside the dome
  const labels = (w) => (w < 640
    ? usable.filter((l) => !l.wide).map((l) => ({ ...l, text: fill(l.short || l.text), place: l.id === 'solar-share-2025' ? 'in-left' : l.place }))
    : usable.map((l) => ({ ...l, text: fill(l.text) })));
  const still = reducedMotion();
  const end = TODAY_T - 0.004;
  const shownUpTo = (_arc, t) => {
    svg.querySelectorAll('.arc-label, .arc-callout').forEach((el) => el.classList.toggle('is-shown', Number(el.dataset.t) <= t + 0.02));
  };
  const arc = new SunArc(svg, {
    events, pos, labels, start: still ? end : 0, sunYear: (t) => String(yearAt(t)),
    geometry: (w, hh) => {
      const ground = parseFloat(getComputedStyle(hero).getPropertyValue('--hero-ground')) * 16 || 72;
      const pad = w < 640 ? 18 : Math.max(40, w * 0.05);
      return { x0: pad, x1: w - pad, horizon: hh - ground, rise: Math.min(hh - ground - 70, (w - 2 * pad) * 0.42) };
    },
    onBuild: (a) => {
      // tag labels with their position so the rise can reveal them, and keep them inside the frame
      for (const el of svg.querySelectorAll('.arc-label, .arc-callout')) el.dataset.t = pos.get(el.dataset.id);
      for (const g of svg.querySelectorAll('.arc-label')) {
        const bb = g.getBBox(); let dx = 0;
        if (bb.x < 8) dx = 8 - bb.x; else if (bb.x + bb.width > a.w - 8) dx = a.w - 8 - bb.x - bb.width;
        if (dx) g.querySelectorAll('tspan').forEach((ts) => ts.setAttribute('x', Number(ts.getAttribute('x')) + dx));
      }
      shownUpTo(a, hero.hasAttribute('data-done') ? 1 : a.t);
    },
  });
  hero.dataset.era = eraAt(arc.t);
  if (still) { hero.dataset.done = ''; shownUpTo(arc, 1); return; }
  // Clock-based (not frame-counted), so a slow renderer finishes on time instead of crawling.
  const DURATION = 3.6; const DELAY = 0.5; let t0 = null;
  const ease = (x) => 1 - (1 - x) ** 3;
  const loop = animate(svg, (_dt, now) => {
    t0 ??= now;
    const x = Math.max(0, Math.min(1, (now - t0 - DELAY) / DURATION));
    const t = ease(x) * end;
    arc.set(t, null);
    shownUpTo(arc, t);
    hero.dataset.era = eraAt(t);
    if (x >= 1) { hero.dataset.done = ''; shownUpTo(arc, 1); loop.stop(); }
  });
}

buildPath();
buildResume();
buildHero();
let rt = 0;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawLine, 120); });
document.fonts?.ready.then(drawLine);
