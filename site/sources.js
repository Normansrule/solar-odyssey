// Sources: renders data/sources.json (signed, hash-checked) as a searchable
// bibliography. Each entry has id="src-<id>" so pages link to sources.html#src-<id>.
// Also lists bundled third-party code from vendor/VENDOR.json (not in the signed
// manifest: fetched same-origin, shape-checked, rendered as text only).

import { h, clear, safeHref } from './assets/js/dom.js';
import { loadData, setBadge, is, ROOT } from './assets/js/data.js';
import { repoUrl } from './repo.js';

const $ = (id) => document.getElementById(id);
const TYPES = {
  article: 'Journal article', book: 'Book', report: 'Report', dataset: 'Dataset', web: 'Web page',
  standard: 'Standard', patent: 'Patent', chart: 'Chart', thesis: 'Thesis',
};
const DOI = /^10\.\d{4,9}\/\S+$/;

export function validSources(s) {
  if (!is.obj(s)) return false;
  return Object.values(s).every((v) => is.obj(v) && is.str(v.title) && is.str(v.type)
    && (v.doi === undefined || (is.str(v.doi) && DOI.test(v.doi)))
    && (v.url === undefined || (is.str(v.url) && /^https?:\/\//.test(v.url))));
}

function citation(id, s) {
  const link = s.doi ? `https://doi.org/${s.doi}` : s.url;
  // Built with h() (not Element.append) so a missing optional part is skipped, not printed as "null".
  return h('li', { id: `src-${id}`, class: 'src', 'data-type': s.type },
    h('p', { class: 'src-cite' },
      s.authors ? h('span', { class: 'src-authors' }, `${s.authors} `) : null,
      s.year ? h('span', { class: 'src-year' }, `(${s.year}). `) : null,
      link ? h('a', { href: safeHref(link), rel: 'noopener noreferrer', class: 'src-title' }, s.title) : h('span', { class: 'src-title' }, s.title),
      '. ',
      s.container ? h('span', { class: 'src-container' }, `${s.container}.`) : null),
    h('dl', { class: 'src-facts' },
      h('div', {}, h('dt', {}, 'Type'), h('dd', {}, TYPES[s.type] ?? s.type)),
      s.doi ? h('div', {}, h('dt', {}, 'DOI'), h('dd', {}, h('a', { href: safeHref(`https://doi.org/${s.doi}`), rel: 'noopener noreferrer' }, s.doi))) : null,
      s.url ? h('div', { class: 'src-url' }, h('dt', {}, 'Link'), h('dd', {}, h('a', { href: safeHref(s.url), rel: 'noopener noreferrer' }, s.url.replace(/^https?:\/\/(www\.)?/, '')))) : null,
      h('div', {}, h('dt', {}, 'Verified'), h('dd', {}, h('time', { datetime: s.verified }, s.verified))),
      s.license ? h('div', {}, h('dt', {}, 'Licence'), h('dd', {}, s.license)) : null,
      h('div', { class: 'src-id' }, h('dt', {}, 'Id'), h('dd', {}, h('a', { href: `#src-${id}`, class: 'src-anchor' }, id)))),
    s.note ? h('p', { class: 'src-note' }, s.note) : null);
}

function render(sources) {
  const entries = Object.entries(sources).sort(([, a], [, b]) =>
    (a.authors ?? a.title).localeCompare(b.authors ?? b.title, 'en', { sensitivity: 'base' }) || (a.year ?? 0) - (b.year ?? 0));
  const list = clear($('src-list'));
  const rows = entries.map(([id, s]) => {
    const li = citation(id, s);
    list.append(li);
    return { li, type: s.type, text: [id, s.authors, s.title, s.container, s.year, s.doi, s.url, s.note].filter(Boolean).join(' ').toLowerCase() };
  });
  const empty = h('li', { class: 'src-none muted' }, 'No source matches. Clear the search or pick another type.');
  list.append(empty);

  const sel = $('src-type');
  const counts = rows.reduce((m, r) => m.set(r.type, (m.get(r.type) ?? 0) + 1), new Map());
  for (const t of Object.keys(TYPES).filter((k) => counts.has(k))) sel.append(h('option', { value: t }, `${TYPES[t]} (${counts.get(t)})`));

  const q = $('src-q');
  const apply = () => {
    const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const type = sel.value; let n = 0;
    for (const r of rows) {
      const ok = (!type || r.type === type) && words.every((w) => r.text.includes(w));
      r.li.hidden = !ok; if (ok) n++;
    }
    empty.hidden = n > 0;
    const filtered = words.length || type;
    $('src-count').textContent = filtered ? `Showing ${n} of ${rows.length} sources` : `${rows.length} sources`;
  };
  q.addEventListener('input', apply); sel.addEventListener('change', apply);
  apply();

  const jump = () => {
    let id = ''; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; } // malformed %-escape in a link
    const el = id && document.getElementById(id);
    if (!el) return;
    if (el.hidden) { q.value = ''; sel.value = ''; apply(); }
    el.scrollIntoView({ block: 'start' });
  };
  window.addEventListener('hashchange', jump);
  jump();
}

const USE = {
  echarts: 'Interactive charts', katex: 'Typesetting equations', three: '3D scenes',
  '@fontsource-variable/fraunces': 'Headings font (Fraunces)', '@fontsource-variable/atkinson-hyperlegible-next': 'Body font (Atkinson Hyperlegible Next)',
};
async function renderVendor() {
  const tbody = $('vendor-table').querySelector('tbody');
  try {
    const res = await fetch(new URL('vendor/VENDOR.json', ROOT), { credentials: 'omit', redirect: 'error' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const v = await res.json();
    if (!is.obj(v) || !is.arr(v.packages) || !v.packages.every((p) => is.obj(p) && is.str(p.name) && is.str(p.version) && is.str(p.license))) throw new Error('unexpected VENDOR.json shape');
    clear(tbody).append(...v.packages.map((p) => h('tr', {},
      h('td', {}, is.str(p.homepage) && /^https:\/\//.test(p.homepage) ? h('a', { href: safeHref(p.homepage), rel: 'noopener noreferrer' }, p.name) : p.name),
      h('td', { class: 'num' }, p.version), h('td', {}, p.license), h('td', {}, USE[p.name] ?? ''))));
  } catch (e) {
    console.warn('vendor list', e);
    clear(tbody).append(h('tr', {}, h('td', { colspan: 4 }, 'The list of bundled packages could not be read. It is in site/vendor/VENDOR.json.')));
  }
}

function issuesLink() {
  const repo = repoUrl(ROOT);
  const host = $('issues-link');
  if (repo && host) clear(host).append(h('a', { href: `${repo}/issues` }, `${repo.replace('https://', '')}/issues`));
}

async function init() {
  issuesLink();
  renderVendor();
  const badge = $('src-badge');
  try {
    const { data, state } = await loadData('sources.json', validSources);
    setBadge(badge, state);
    render(data);
  } catch (e) {
    console.warn(e);
    setBadge(badge, 'failed');
    $('src-count').textContent = 'The bibliography could not be loaded.';
  }
}
init();
