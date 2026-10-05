// About page: shows what this browser has stored under the site's "so." keys,
// clears exactly those keys on request, and links to the repository when the
// site is served from <user>.github.io/<repo>/.

import { h, clear } from './assets/js/dom.js';
import { ROOT } from './assets/js/data.js';
import { repoUrl } from './repo.js';

const $ = (id) => document.getElementById(id);
const PREFIX = 'so.';
const NAMES = { 'so.depth': 'Depth setting', 'so.theme': 'Colour theme', 'so.progress': 'Visited pages and completed lessons' };

/** Keys in the given storage that belong to this site. */
export function siteKeys(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
  return keys.sort();
}

/** Remove only this site's keys; returns how many were removed. */
export function clearSiteKeys(storage) {
  const keys = siteKeys(storage);
  for (const k of keys) storage.removeItem(k);
  return keys.length;
}

function describe(k, raw) {
  try {
    const v = JSON.parse(raw);
    if (k === 'so.progress' && v && typeof v === 'object') {
      const n = (o) => (o && typeof o === 'object' ? Object.keys(o).length : 0);
      return `${n(v.visited)} pages visited, ${n(v.complete)} lessons complete`;
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  } catch { /* fall through */ }
  return `${raw.length} characters`;
}

function showStored() {
  const box = clear($('stored'));
  let keys = [];
  try { keys = siteKeys(localStorage); } catch {
    box.append(h('p', {}, 'This browser does not allow the site to store anything, so nothing is saved.'));
    $('clear-btn').disabled = true;
    return;
  }
  if (!keys.length) { box.append(h('p', { class: 'muted' }, 'Nothing is stored in this browser.')); $('clear-btn').disabled = true; return; }
  $('clear-btn').disabled = false;
  box.append(h('dl', { class: 'stored-list' }, keys.map((k) => h('div', {},
    h('dt', {}, NAMES[k] ?? 'Other setting', ' ', h('code', {}, k)),
    h('dd', {}, describe(k, localStorage.getItem(k) ?? ''))))));
}

// Show the defaults straight away without reloading (a reload would record this visit again).
function resetPage() {
  const root = document.documentElement;
  root.dataset.depth = 'intro';
  delete root.dataset.theme;
  document.querySelectorAll('.depth-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.value === 'intro')));
  document.querySelector('.theme-toggle')?.setAttribute('aria-label', 'Colour theme: system. Change');
  document.querySelectorAll('.nav-menu .done').forEach((el) => el.remove());
  document.dispatchEvent(new CustomEvent('so:depth', { detail: 'intro' }));
  document.dispatchEvent(new CustomEvent('so:theme', { detail: 'system' }));
}

function initClear() {
  const btn = $('clear-btn');
  btn.addEventListener('click', () => {
    let n = 0;
    try { n = clearSiteKeys(localStorage); } catch { /* storage blocked */ }
    resetPage();
    showStored();
    if (n) $('stored').prepend(h('p', { class: 'cleared', role: 'status' }, `Removed ${n} saved ${n === 1 ? 'item' : 'items'}. This page now uses the default settings.`));
    $('stored').focus();
  });
  showStored();
}

function initRepoLinks() {
  const repo = repoUrl(ROOT);
  if (!repo) return;
  const short = repo.replace('https://', '');
  clear($('releases-link')).append(h('a', { href: `${repo}/releases` }, 'Releases page'), ` of ${short}`);
  clear($('security-doc')).append(h('a', { href: `${repo}/blob/HEAD/docs/SECURITY_MODEL.md` }, 'docs/SECURITY_MODEL.md'), ' in the repository');
  $('issues-link').append(' (', h('a', { href: `${repo}/issues` }, short), ')');
}

if (typeof document !== 'undefined') { initClear(); initRepoLinks(); }
