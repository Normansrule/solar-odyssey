// Reference section: the equation atlas, glossary, sources and about pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as pv from '../../site/assets/js/physics/pv.js';
import * as solar from '../../site/assets/js/physics/solar.js';
import * as econ from '../../site/assets/js/physics/econ.js';
import * as renewables from '../../site/assets/js/physics/renewables.js';
import { calc, parse, variablesOf } from '../../site/assets/js/safe-expr.js';
import { FORMULAS } from '../../site/equations-formulas.js';
import { repoUrl } from '../../site/repo.js';
import { siteKeys, clearSiteKeys } from '../../site/about.js';

const read = (p) => readFileSync(new URL(`../../site/${p}`, import.meta.url), 'utf8');
const atlas = read('equations.html');
const glossary = JSON.parse(read('data/glossary.json'));
const sources = JSON.parse(read('data/sources.json'));
const MODS = { pv, solar, econ, renewables };
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`)); return m ? unescape(m[1] ?? m[2]) : undefined; };

test('every data-check on the equation atlas names an exported physics function with valid arguments', async () => {
  const tags = [...atlas.matchAll(/<[a-z0-9-]+\s[^>]*data-check=[^>]*>/gi)].map((m) => m[0]);
  assert.ok(tags.length >= 30, `expected many worked examples, found ${tags.length}`);
  for (const tag of tags) {
    const check = attr(tag, 'data-check');
    const [mod, fn] = check.split(':');
    assert.ok(MODS[mod], `unknown physics module "${mod}" in ${check}`);
    assert.equal(typeof MODS[mod][fn], 'function', `${check} is not an exported function`);
    assert.doesNotThrow(() => JSON.parse(attr(tag, 'data-args') ?? '[]'), `${check}: data-args is not JSON`);
    assert.ok(Number.isFinite(Number(attr(tag, 'data-expect'))), `${check}: data-expect is not a number`);
    assert.ok(Number.isFinite(Number(attr(tag, 'data-tol') ?? 1e-6)), `${check}: data-tol is not a number`);
  }
});

test('the atlas covers the required equations, each with an eq- id, a .tex, symbols and a worked example', () => {
  const required = ['eq-photon-energy', 'eq-band-gap', 'eq-diode', 'eq-voc', 'eq-fill-factor', 'eq-efficiency', 'eq-shockley-queisser',
    'eq-energy-yield', 'eq-air-mass', 'eq-incidence', 'eq-capacity-factor', 'eq-lcoe', 'eq-wrights-law', 'eq-wind-power', 'eq-betz',
    'eq-hydropower', 'eq-tidal-basin', 'eq-wave-flux', 'eq-carnot', 'eq-round-trip'];
  const blocks = new Map([...atlas.matchAll(/<article class="eq[^"]*" id="(eq-[a-z0-9-]+)"[\s\S]*?<\/article>/g)].map((m) => [m[1], m[0]]));
  for (const id of required) {
    const b = blocks.get(id);
    assert.ok(b, `missing equation block #${id}`);
    const order = ['class="intuition"', 'class="tex"', 'class="symbols"', 'class="worked"'].map((s) => b.indexOf(s));
    assert.ok(order.every((i) => i >= 0), `#${id} lacks one of intuition / tex / symbols / worked`);
    assert.deepEqual([...order].sort((a, c) => a - c), order, `#${id} is not in the order intuition, equation, symbols, worked example`);
    assert.match(b, /class="eq-visual"|href="[^"#]+\.html/, `#${id} has neither a visual nor a link to one`);
  }
  // Every jump-list link and playground link resolves to a block on the page.
  for (const m of atlas.matchAll(/href="#(eq-[a-z0-9-]+)"/g)) assert.ok(blocks.has(m[1]), `jump link #${m[1]} has no target`);
  for (const m of atlas.matchAll(/data-formula="(eq-[a-z0-9-]+)"/g)) assert.ok(FORMULAS.some((f) => f.id === m[1]), `no playground formula ${m[1]}`);
});

test('the Shockley–Queisser numbers on the page match the cited sources', () => {
  assert.match(atlas, /33\.16 %<\/strong> at a gap of <strong>1\.34 eV/);
  assert.ok(sources['ruhle-2016']?.doi === '10.1016/j.solener.2016.02.015');
  assert.ok(sources['shockley-queisser-1961']?.doi === '10.1063/1.1736034');
  // The 1961 paper's blackbody result (30 % at 1.1 eV, 6000 K sun) is reproduced by the physics module.
  assert.ok(Math.abs(pv.shockleyQueisser(1.1, { Tsun: 6000 }).efficiency - 0.30) < 0.003);
});

test('every playground formula parses safely and agrees with the physics modules at its defaults', () => {
  for (const f of FORMULAS) {
    const vars = Object.fromEntries(Object.entries(f.vars).map(([k, v]) => [k, v.value]));
    const names = [...variablesOf(parse(f.formula))].sort();
    assert.deepEqual(names, Object.keys(f.vars).sort(), `${f.id}: formula variables and inputs differ`);
    for (const [k, v] of Object.entries(f.vars)) assert.ok(v.label && typeof v.unit === 'string', `${f.id}.${k} needs a label and unit`);
    const got = calc(f.formula, vars);
    const ref = f.check(MODS, vars);
    assert.ok(Math.abs(got - ref) <= 1e-4 * Math.max(1, Math.abs(ref)), `${f.id}: formula gives ${got}, physics gives ${ref}`);
    assert.match(atlas, new RegExp(`id="${f.block ?? f.id}"`), `${f.id} has no block on the page`);
  }
});

test('glossary: every "see" link resolves, and every entry has a term and a short definition', () => {
  for (const [id, g] of Object.entries(glossary)) {
    assert.match(id, /^[a-z0-9][a-z0-9-]*$/);
    assert.ok(g.term && g.short, `${id} needs term and short`);
    for (const s of g.see ?? []) assert.ok(glossary[s], `glossary ${id} → see "${s}" is not defined`);
  }
});

test('glossary terms used on the reference pages exist', () => {
  for (const page of ['equations.html', 'glossary.html', 'sources.html', 'about.html']) {
    for (const m of read(page).matchAll(/data-term="([^"]+)"/g)) assert.ok(glossary[m[1]], `${page}: term ${m[1]}`);
    for (const m of read(page).matchAll(/data-src="([^"]+)"/g)) for (const id of m[1].split(',')) assert.ok(sources[id.trim()], `${page}: source ${id}`);
  }
});

test('repository URL is derived only from <user>.github.io addresses', () => {
  assert.equal(repoUrl(new URL('https://ada.github.io/solar-odyssey/')), 'https://github.com/ada/solar-odyssey');
  assert.equal(repoUrl(new URL('https://ada.github.io/solar-odyssey/learn/x.html')), 'https://github.com/ada/solar-odyssey');
  assert.equal(repoUrl(new URL('https://ada.github.io/')), 'https://github.com/ada/ada.github.io');
  assert.equal(repoUrl(new URL('http://localhost:8000/')), null);
  assert.equal(repoUrl(new URL('https://evil.example/ada.github.io/')), null);
  assert.equal(repoUrl(new URL('https://ada.github.io.evil.example/x/')), null);
});

test('"Clear my progress and settings" removes exactly the so. keys', () => {
  const m = new Map([['so.depth', '"expert"'], ['so.progress', '{}'], ['so.theme', '"dark"'], ['other', '1'], ['solar', '2'], ['xso.depth', '3']]);
  const storage = {
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null, removeItem: (k) => { m.delete(k); },
  };
  assert.deepEqual(siteKeys(storage), ['so.depth', 'so.progress', 'so.theme']);
  assert.equal(clearSiteKeys(storage), 3);
  assert.deepEqual([...m.keys()].sort(), ['other', 'solar', 'xso.depth']);
});
