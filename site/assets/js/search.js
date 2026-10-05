// Site search: a dialog opened from the header button, "/" or Ctrl/Cmd+K.
// The index (site/data/search.json) is built from the pages by scripts/build_data.py
// and verified against the signed manifest like every dataset. Nothing leaves the browser.

import { h, clear } from './dom.js';
import { loadData } from './data.js';

const ROOT = new URL('../../', import.meta.url);
let dialog; let input; let list; let status; let index;

const norm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const tokens = (q) => norm(q).split(/[^a-z0-9.%-]+/).filter((t) => t.length >= 2);
// Text fragment link (#:~:text=) so the browser scrolls to and highlights the heading.
const fragment = (text) => `#:~:text=${encodeURIComponent(text).replace(/-/g, '%2D')}`;

function score(q) {
  const ts = tokens(q);
  if (!ts.length) return [];
  const out = [];
  for (const p of index.pages) {
    const title = norm(p.title); const desc = norm(p.desc); const heads = p.heads.map(norm); const words = ` ${p.words} `;
    const hits = heads.map(() => 0);
    let total = 0; let all = true;
    for (const t of ts) {
      let s = 0;
      if (title.includes(t)) s += 8;
      if (desc.includes(t)) s += 3;
      heads.forEach((hd, i) => { if (hd.includes(t)) { hits[i] += 1; s += 4; } });
      if (words.includes(` ${t}`)) s += 1;
      if (!s) { all = false; break; }
      total += s;
    }
    const best = hits.indexOf(Math.max(0, ...hits));
    const head = hits.length && hits[best] > 0 && !title.includes(norm(q)) ? p.heads[best] : null;
    if (all) out.push({ kind: 'page', p, total, head });
  }
  for (const g of index.terms) {
    const term = norm(g.term); const short = norm(g.short);
    let total = 0; let all = true;
    for (const t of ts) { const s = (term.includes(t) ? 6 : 0) + (short.includes(t) ? 1 : 0); if (!s) { all = false; break; } total += s; }
    if (all) out.push({ kind: 'term', g, total });
  }
  return out.sort((a, b) => b.total - a.total).slice(0, 12);
}

function render() {
  const q = input.value.trim();
  clear(list);
  if (!q) { status.textContent = 'Type a word, a term or a topic, for example "band gap", "Betz" or "storage".'; return; }
  const res = score(q);
  status.textContent = res.length ? `${res.length} result${res.length === 1 ? '' : 's'}` : `Nothing matches "${q}". Try a shorter or different word.`;
  for (const r of res) {
    if (r.kind === 'page') {
      const url = new URL(r.p.path, ROOT).href + (r.head ? fragment(r.head) : '');
      list.append(h('li', {}, h('a', { href: url },
        h('strong', {}, r.p.title), r.head ? h('span', { class: 'sr-head' }, r.head) : null, h('span', {}, r.p.desc))));
    } else {
      list.append(h('li', {}, h('a', { href: new URL(`glossary.html#term-${r.g.id}`, ROOT).href },
        h('strong', {}, r.g.term), h('span', { class: 'sr-head' }, 'Glossary'), h('span', {}, r.g.short))));
    }
  }
}

function build() {
  input = h('input', { type: 'search', id: 'site-search-q', autocomplete: 'off', spellcheck: 'false', placeholder: 'Search lessons, terms and equations', 'aria-describedby': 'site-search-status' });
  status = h('p', { id: 'site-search-status', class: 'muted', 'aria-live': 'polite' });
  list = h('ul', { class: 'search-results', 'aria-label': 'Results' });
  const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close search' }, '×');
  dialog = h('dialog', { class: 'search-dialog', 'aria-label': 'Search Solar Odyssey' },
    h('div', { class: 'search-top' }, h('label', { for: 'site-search-q', class: 'visually-hidden' }, 'Search'), input, close),
    status, list);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  let timer = 0;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 80); });
  dialog.addEventListener('keydown', (e) => {
    const links = [...list.querySelectorAll('a')];
    const at = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (links[at + 1] || links[0])?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (at <= 0) input.focus(); else links[at - 1].focus(); }
    else if (e.key === 'Enter' && document.activeElement === input && links[0]) { e.preventDefault(); links[0].click(); }
  });
  document.body.append(dialog);
}

export async function openSearch() {
  if (!dialog) build();
  if (!dialog.open) dialog.showModal();
  input.focus(); input.select();
  if (!index) {
    status.textContent = 'Loading the index…';
    try { index = (await loadData('search.json', (d) => Array.isArray(d?.data?.pages))).data.data; } catch (e) {
      status.textContent = 'The search index failed its integrity check, so search is off.'; console.error(e); return;
    }
  }
  render();
}
