// Glossary: renders data/glossary.json (signed, hash-checked) alphabetically with
// letter jump links, a live filter and "see also" cross-links. Each entry has
// id="term-<id>" so any page can link to glossary.html#term-<id>.

import { h, clear } from './assets/js/dom.js';
import { loadData, setBadge, is } from './assets/js/data.js';

const $ = (id) => document.getElementById(id);
const ID = /^[a-z0-9][a-z0-9-]*$/;

export function validGlossary(g) {
  if (!is.obj(g)) return false;
  return Object.entries(g).every(([k, v]) => ID.test(k) && is.obj(v) && is.str(v.term) && is.str(v.short)
    && (v.see === undefined || (is.arr(v.see) && v.see.every(is.str))));
}

// Sort key: ignore case, accents and leading punctuation so "Électron" sits with E.
const key = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^[^A-Za-z0-9]+/, '').toLowerCase();
const letterOf = (s) => { const c = key(s)[0] ?? '#'; return /[a-z]/.test(c) ? c.toUpperCase() : '#'; };

function render(glossary) {
  const entries = Object.entries(glossary).map(([id, v]) => ({ id, ...v, k: key(v.term) }))
    .sort((a, b) => a.k.localeCompare(b.k, 'en'));
  const groups = new Map();
  for (const e of entries) { const L = letterOf(e.term); if (!groups.has(L)) groups.set(L, []); groups.get(L).push(e); }

  const list = clear($('gl-list'));
  const rows = [];
  const sections = new Map();
  for (const [L, items] of groups) {
    const section = h('section', { class: 'gl-letter', id: `letter-${L === '#' ? 'num' : L.toLowerCase()}`, 'aria-labelledby': `h-${L}` },
      h('h2', { id: `h-${L}`, class: 'gl-letter-h' }, L));
    const dl = h('dl', { class: 'gl-entries' });
    for (const e of items) {
      const see = (e.see ?? []).filter((s) => s !== e.id);
      const dt = h('dt', { id: `term-${e.id}` }, h('a', { href: `#term-${e.id}`, class: 'gl-self' }, e.term));
      const dd = h('dd', {}, h('p', {}, e.short),
        see.length ? h('p', { class: 'gl-see' }, 'See also ', see.map((s, i) => [
          i ? (i === see.length - 1 ? ' and ' : ', ') : '',
          glossary[s] ? h('a', { href: `#term-${s}` }, glossary[s].term) : h('span', { class: 'gl-missing' }, s),
        ]), '.') : null);
      dl.append(dt, dd);
      rows.push({ dt, dd, section, text: `${e.term} ${e.short} ${e.id}`.toLowerCase() });
    }
    section.append(dl);
    sections.set(L, section);
    list.append(section);
  }

  const nav = clear($('gl-letters'));
  const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...(groups.has('#') ? ['#'] : [])];
  const links = new Map();
  for (const L of letters) {
    const el = groups.has(L)
      ? h('a', { href: `#letter-${L === '#' ? 'num' : L.toLowerCase()}`, 'aria-label': `Terms starting with ${L}` }, L)
      : h('span', { 'aria-hidden': 'true' }, L);
    links.set(L, el); nav.append(el);
  }

  const q = $('gl-q'); const count = $('gl-count');
  const apply = () => {
    const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let shown = 0; const live = new Set();
    for (const r of rows) {
      const ok = words.every((w) => r.text.includes(w));
      r.dt.hidden = !ok; r.dd.hidden = !ok;
      if (ok) { shown++; live.add(r.section); }
    }
    for (const [L, section] of sections) {
      section.hidden = !live.has(section);
      links.get(L)?.classList.toggle('dim', !live.has(section));
    }
    count.textContent = words.length
      ? `${shown} of ${rows.length} terms match “${q.value.trim()}”`
      : `${rows.length} terms`;
    list.classList.toggle('empty', shown === 0);
  };
  q.addEventListener('input', apply);
  apply();
  list.append(h('p', { class: 'gl-none muted' }, 'No term matches. Try a shorter word, or clear the filter.'));

  // Arriving at #term-x: make sure it is visible and scrolled to after rendering.
  const jump = () => {
    let id = ''; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; } // malformed %-escape in a link
    const el = id && document.getElementById(id);
    if (!el) return;
    if (el.hidden) { q.value = ''; apply(); }
    el.scrollIntoView({ block: 'start' });
    if (id.startsWith('term-')) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  };
  window.addEventListener('hashchange', jump);
  jump();
}

async function init() {
  const badge = $('gl-badge');
  try {
    const { data, state } = await loadData('glossary.json', validGlossary);
    setBadge(badge, state);
    render(data);
  } catch (e) {
    console.warn(e);
    setBadge(badge, 'failed');
    $('gl-count').textContent = 'The glossary could not be loaded.';
  }
}
init();
