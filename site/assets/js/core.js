// Shared behaviour for every page: header and footer, depth toggle, theme,
// progress tracking, citations, glossary tooltips, equations (KaTeX), live
// checks of worked examples, and previous/next lesson links.
// Loaded as a module on every page: <script type="module" src="…/assets/js/core.js">.

import { PAGES, GROUPS, LESSONS } from './sitemap.js';
import { h, clear, safeHref } from './dom.js';
import { loadData } from './data.js';
import { loadScript } from './charts.js';
import { mountQuiz } from './quiz.js';

const ROOT = new URL('../../', import.meta.url);
const here = document.body.dataset.page;
const page = PAGES.find((p) => p.id === here);
const href = (path) => new URL(path, ROOT).href;
const docEl = document.documentElement;

// ---------- local-only preferences and progress ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(`so.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`so.${k}`, JSON.stringify(v)); } catch { /* private mode: keep going */ } },
};
export const progress = {
  all: () => {
    // Stored values are untrusted (other pages on a shared github.io origin can write them): fall back to empty.
    const p = store.get('progress', null); const ok = (o) => o != null && typeof o === 'object' && !Array.isArray(o);
    return ok(p) && ok(p.visited) && ok(p.complete) ? p : { visited: {}, complete: {} };
  },
  mark(kind, id) { const p = progress.all(); p[kind][id] = new Date().toISOString().slice(0, 10); store.set('progress', p); },
  unmark(kind, id) { const p = progress.all(); delete p[kind][id]; store.set('progress', p); },
  reset() { store.set('progress', { visited: {}, complete: {} }); },
};

function applyDepth(d) {
  docEl.dataset.depth = d;
  document.querySelectorAll('.depth-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.value === d)));
  document.dispatchEvent(new CustomEvent('so:depth', { detail: d }));
}
function applyTheme(t) {
  if (t === 'light' || t === 'dark') docEl.dataset.theme = t; else delete docEl.dataset.theme;
  const btn = document.querySelector('.theme-toggle');
  if (btn) btn.setAttribute('aria-label', `Colour theme: ${t || 'system'}. Change`);
  document.dispatchEvent(new CustomEvent('so:theme', { detail: t }));
}
applyDepth(store.get('depth', 'intro'));
applyTheme(store.get('theme', 'system'));

// ---------- header ----------
const SUN_MARK = () => h.svg('svg', { viewBox: '0 0 32 32', 'aria-hidden': 'true' },
  h.svg('circle', { cx: 16, cy: 14, r: 7, class: 'm-sun' }),
  h.svg('path', { d: 'M3 23 H29', class: 'm-line', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
  h.svg('path', { d: 'M7 27.5 H25', class: 'm-line', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0.55 }));

function buildHeader() {
  const host = document.getElementById('site-header');
  if (!host) return;
  host.classList.add('site-header');
  const done = progress.all().complete;
  const nav = h('nav', { class: 'nav', id: 'site-nav', 'aria-label': 'Main' });
  for (const g of GROUPS) {
    const pages = PAGES.filter((p) => p.group === g.id);
    const group = h('div', { class: 'nav-group' });
    if (pages.some((p) => p.id === here)) group.dataset.current = '';
    const menuId = `menu-${g.id}`;
    const btn = h('button', { type: 'button', 'aria-expanded': 'false', 'aria-controls': menuId }, g.label);
    const menu = h('div', { class: 'nav-menu', id: menuId },
      pages.map((p) => h('a', { href: href(p.path), 'aria-current': p.id === here ? 'page' : false },
        h('strong', {}, p.title, done[p.id] ? h('span', { class: 'done', 'aria-label': ' (completed)' }, ' ✓') : null),
        h('span', {}, p.blurb))));
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      closeMenus();
      if (!open) { btn.setAttribute('aria-expanded', 'true'); menu.dataset.open = ''; }
    });
    group.append(btn, menu); nav.append(group);
  }
  const depth = h('div', { class: 'depth-switch', role: 'group', 'aria-label': 'Level of detail' },
    h('button', { type: 'button', value: 'intro', 'aria-pressed': 'false', title: 'Plain-language explanations' }, 'Intro'),
    h('button', { type: 'button', value: 'expert', 'aria-pressed': 'false', title: 'Show derivations and expert detail' }, 'Expert'));
  depth.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { store.set('depth', b.value); applyDepth(b.value); } });
  const themeBtn = h('button', { type: 'button', class: 'icon-btn theme-toggle' },
    h.svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 },
      h.svg('circle', { cx: 12, cy: 12, r: 4.5 }), h.svg('path', { d: 'M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8' })));
  themeBtn.addEventListener('click', () => {
    const order = ['system', 'light', 'dark']; const next = order[(order.indexOf(store.get('theme', 'system')) + 1) % 3];
    store.set('theme', next); applyTheme(next);
  });
  const menuBtn = h('button', { type: 'button', class: 'icon-btn menu-toggle', 'aria-expanded': 'false', 'aria-controls': 'site-nav', 'aria-label': 'Menu' },
    h.svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, h.svg('path', { d: 'M4 7h16M4 12h16M4 17h16' })));
  menuBtn.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') === 'true';
    menuBtn.setAttribute('aria-expanded', String(!open));
    if (open) delete nav.dataset.open; else nav.dataset.open = '';
  });
  const searchBtn = h('button', { type: 'button', class: 'icon-btn search-toggle', 'aria-label': 'Search (press /)', title: 'Search (press /)' },
    h.svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round' },
      h.svg('circle', { cx: 10.5, cy: 10.5, r: 6 }), h.svg('path', { d: 'M15 15l5 5' })));
  const openSearch = () => import('./search.js').then((m) => m.openSearch());
  searchBtn.addEventListener('click', openSearch);
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault(); openSearch();
    }
  });
  clear(host).append(h('div', { class: 'bar' },
    h('a', { class: 'wordmark', href: href('index.html') }, SUN_MARK(), h('span', {}, 'Solar Odyssey')),
    menuBtn, nav, h('div', { class: 'header-tools' }, searchBtn, depth, themeBtn)));
  applyDepth(docEl.dataset.depth); applyTheme(store.get('theme', 'system'));
  document.addEventListener('click', (e) => { if (!e.target.closest('.nav-group')) closeMenus(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.nav-group > button[aria-expanded="true"]')) { closeMenus(true); return; }
    if (menuBtn.getAttribute('aria-expanded') === 'true' && getComputedStyle(menuBtn).display !== 'none') {
      menuBtn.setAttribute('aria-expanded', 'false'); delete nav.dataset.open; menuBtn.focus();
    }
  });
}
function closeMenus(focusBack) {
  document.querySelectorAll('.nav-group > button[aria-expanded="true"]').forEach((b) => {
    b.setAttribute('aria-expanded', 'false'); delete document.getElementById(b.getAttribute('aria-controls')).dataset.open;
    if (focusBack) b.focus();
  });
}

// ---------- footer ----------
function buildFooter() {
  const host = document.getElementById('site-footer');
  if (!host) return;
  host.classList.add('site-footer');
  const col = (title, items) => h('div', {}, h('h2', {}, title), h('ul', {}, items.map((p) => h('li', {}, h('a', { href: href(p.path) }, p.title)))));
  clear(host).append(h('div', { class: 'inner' },
    h('div', {}, h('h2', {}, 'Solar Odyssey'),
      h('p', {}, 'An open-source course on solar power and the clean-energy system. Code under the MIT licence, text and drawings under CC BY 4.0. Nothing you do here leaves your browser.'),
      h('p', {}, h('a', { href: href('about.html') }, 'Privacy, security and the offline app'))),
    col('How a cell works', PAGES.filter((p) => p.group === 'cell')),
    col('Renewables', PAGES.filter((p) => p.group === 'renewables').slice(0, 6)),
    col('Reference', PAGES.filter((p) => p.group === 'reference' || p.id === 'state-of-the-field'))));
}

// ---------- lesson navigation and completion ----------
function buildLessonNav() {
  if (!page || !page.lesson) return;
  const main = document.getElementById('main');
  const i = LESSONS.findIndex((p) => p.id === here);
  const prev = LESSONS[i - 1]; const next = LESSONS[i + 1];
  const isDone = () => Boolean(progress.all().complete[here]);
  const btn = h('button', { type: 'button', class: 'btn ghost complete-btn', 'aria-pressed': String(isDone()) });
  const label = () => { btn.textContent = isDone() ? 'Completed' : 'Mark this lesson complete'; btn.setAttribute('aria-pressed', String(isDone())); };
  label();
  btn.addEventListener('click', () => { if (isDone()) progress.unmark('complete', here); else progress.mark('complete', here); label(); });
  // Learning objectives under the page heading, questions before the references.
  const objectives = h('details', { class: 'objectives', hidden: true });
  const head = main.querySelector('.page-head');
  if (head) head.after(objectives);
  const quizSlot = h('section', { class: 'quiz', 'aria-labelledby': 'check-your-understanding', hidden: true });
  main.append(quizSlot);
  mountQuiz(here, quizSlot, head ? objectives : null);
  main.append(h('div', { class: 'btn-row lesson-complete' }, btn),
    h('nav', { class: 'lesson-nav', 'aria-label': 'Lessons' },
      prev ? h('a', { href: href(prev.path), rel: 'prev' }, h('span', { class: 'dir' }, 'Previous'), h('span', { class: 'ttl' }, prev.title)) : h('span'),
      next ? h('a', { href: href(next.path), rel: 'next', class: 'next' }, h('span', { class: 'dir' }, 'Next'), h('span', { class: 'ttl' }, next.title)) : h('span')));
}

// ---------- citations ----------
async function buildCitations() {
  const cites = [...document.querySelectorAll('sup.cite[data-src]')];
  const blocks = [...document.querySelectorAll('.references-block[data-auto]')];
  if (!cites.length) return;
  let sources = {};
  try { sources = (await loadData('sources.json')).data; } catch (e) { console.error(e); }
  const order = [];
  for (const c of cites) for (const id of c.dataset.src.split(',').map((s) => s.trim())) if (!order.includes(id)) order.push(id);
  for (const c of cites) {
    clear(c);
    c.dataset.src.split(',').map((s) => s.trim()).forEach((id, k) => {
      if (k) c.append(h('span', { class: 'visually-hidden' }, ', '));
      const s = sources[id];
      c.append(h('a', { href: `#ref-${id}`, title: s ? `${s.authors ? `${s.authors}: ` : ''}${s.title} (${s.year ?? 'n.d.'})` : id }, String(order.indexOf(id) + 1)));
    });
  }
  const list = h('ol', { class: 'references' }, order.map((id) => {
    const s = sources[id];
    if (!s) return h('li', { id: `ref-${id}` }, `Missing source: ${id}`);
    const link = s.doi ? `https://doi.org/${s.doi}` : s.url;
    return h('li', { id: `ref-${id}` },
      s.authors ? `${s.authors} ` : '', s.year ? `(${s.year}). ` : '',
      h('a', { href: safeHref(link), rel: 'noopener noreferrer' }, s.title), '. ',
      s.container ? `${s.container}. ` : '', s.doi ? `doi:${s.doi}. ` : '',
      h('a', { href: href(`sources.html#src-${id}`) }, 'Source record'));
  }));
  let block = blocks[0];
  if (!block) {
    block = h('section', { class: 'references-block', 'aria-labelledby': 'refs-h' });
    const nav = document.querySelector('.lesson-complete') || document.querySelector('.lesson-nav');
    const main = document.getElementById('main');
    if (nav) main.insertBefore(block, nav); else main.append(block);
  }
  clear(block).append(h('h2', { id: 'refs-h' }, 'References'), list);
}

// ---------- glossary tooltips ----------
async function buildGlossary() {
  const terms = [...document.querySelectorAll('dfn[data-term]')];
  if (!terms.length) return;
  let glossary = {};
  try { glossary = (await loadData('glossary.json')).data; } catch (e) { console.error(e); return; }
  let tip = null; let owner = null; let timer = 0;
  // The tooltip stays while the pointer is on the term or on the tooltip itself, and
  // Escape dismisses it (WCAG 1.4.13 content on hover or focus).
  const hide = () => {
    clearTimeout(timer); tip?.remove(); tip = null;
    owner?.removeAttribute('aria-describedby'); owner = null;
  };
  const hideSoon = () => { clearTimeout(timer); timer = setTimeout(() => { if (owner !== document.activeElement) hide(); }, 200); };
  const show = (el) => {
    hide();
    const g = glossary[el.dataset.term]; if (!g) return;
    tip = h('div', { class: 'term-tip', role: 'tooltip', id: 'term-tip' }, h('strong', {}, g.term), g.short);
    tip.addEventListener('mouseenter', () => clearTimeout(timer));
    tip.addEventListener('mouseleave', hideSoon);
    owner = el;
    document.body.append(tip);
    const r = el.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 24);
    tip.style.maxWidth = `${w}px`;
    tip.style.left = `${Math.max(12, Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - w - 12))}px`;
    tip.style.top = `${window.scrollY + r.bottom + 8}px`;
    el.setAttribute('aria-describedby', 'term-tip');
  };
  for (const el of terms) {
    if (!glossary[el.dataset.term]) { console.warn(`glossary term missing: ${el.dataset.term}`); continue; }
    el.tabIndex = 0;
    el.addEventListener('mouseenter', () => { if (owner === el) clearTimeout(timer); else show(el); });
    el.addEventListener('focus', () => { if (owner !== el) show(el); });
    el.addEventListener('mouseleave', hideSoon);
    el.addEventListener('blur', () => { if (owner === el) hide(); });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

// ---------- equations ----------
export async function renderMath(scope = document) {
  const els = [...scope.querySelectorAll('.tex:not([data-rendered])')];
  if (!els.length) return;
  if (!document.querySelector('link[data-katex]')) {
    document.head.append(h('link', { rel: 'stylesheet', href: href('vendor/katex/katex.min.css'), 'data-katex': '' }));
  }
  if (!window.katex) await loadScript('vendor/katex/katex.min.js');
  for (const el of els) {
    const src = el.dataset.tex ?? el.textContent;
    el.dataset.tex = src;
    try {
      window.katex.render(src, el, { displayMode: el.tagName !== 'SPAN', throwOnError: false, output: 'htmlAndMathml', trust: false, strict: 'warn' });
      el.dataset.rendered = '';
      if (el.tagName !== 'SPAN') watchOverflow(el);
    } catch (e) { console.error('KaTeX', e); }
  }
}
// A display equation wider than its box scrolls sideways; keyboard users must be able to
// reach and scroll it too (WCAG 2.1.1), so it becomes focusable only while it overflows.
let overflowObserver = null;
function watchOverflow(el) {
  overflowObserver ??= new ResizeObserver((entries) => {
    for (const { target: t } of entries) {
      const over = t.scrollWidth > t.clientWidth + 1;
      if (over && !t.hasAttribute('tabindex')) {
        t.tabIndex = 0; t.setAttribute('role', 'group'); t.setAttribute('aria-label', 'Equation (scrolls sideways)'); t.dataset.scrolls = '';
      } else if (!over && 'scrolls' in t.dataset) {
        t.removeAttribute('tabindex'); t.removeAttribute('role'); t.removeAttribute('aria-label'); delete t.dataset.scrolls;
      }
    }
  });
  overflowObserver.observe(el);
}

// ---------- worked examples checked live against the physics modules ----------
// <div class="worked" data-check="pv:photonEnergyEV" data-args="[500]" data-expect="2.48" data-tol="0.01" data-pick="P">
async function checkWorkedExamples() {
  for (const el of document.querySelectorAll('[data-check]')) {
    try {
      const [mod, fn] = el.dataset.check.split(':');
      if (!/^[a-z-]+$/.test(mod)) throw new Error('bad module');
      const m = await import(new URL(`assets/js/physics/${mod}.js`, ROOT).href);
      let out = m[fn](...JSON.parse(el.dataset.args || '[]'));
      if (el.dataset.pick) out = el.dataset.pick.split('.').reduce((o, k) => o[k], out);
      const expect = Number(el.dataset.expect); const tol = Number(el.dataset.tol || 1e-6);
      el.dataset.testState = Math.abs(out - expect) <= tol ? 'pass' : 'fail';
      if (el.dataset.testState === 'fail') console.error(`worked example mismatch on ${fn}: got ${out}, page says ${expect}`);
    } catch (e) { el.dataset.testState = 'error'; console.error(e); }
  }
}

// ---------- boot ----------
buildHeader();
buildFooter();
buildLessonNav();
if (page) progress.mark('visited', page.id);
buildCitations();
buildGlossary();
renderMath();
checkWorkedExamples();
