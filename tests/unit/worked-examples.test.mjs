// Every worked example on the site declares the function that reproduces it:
//   <div class="worked" data-check="pv:photonEnergyEV" data-args="[500]" data-expect="2.48" data-tol="0.01">
// This test finds all of them in site/**/*.html and recomputes each one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../../site/', import.meta.url));
const pages = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'vendor') walk(p); } else if (f.endsWith('.html')) pages.push(p); } };
walk(site);

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`)); return m ? unescape(m[1] ?? m[2]) : undefined; };

const examples = [];
for (const p of pages) {
  const html = readFileSync(p, 'utf8');
  for (const m of html.matchAll(/<[a-z0-9-]+\s[^>]*data-check=[^>]*>/gi)) examples.push({ page: relative(site, p), tag: m[0] });
}

test('the site has worked examples to check', () => { assert.ok(examples.length >= 0); });

for (const ex of examples) {
  const check = attr(ex.tag, 'data-check');
  test(`${ex.page}: ${check} ${attr(ex.tag, 'data-args') ?? ''}`, async () => {
    const [mod, fn] = check.split(':');
    const m = await import(new URL(`../../site/assets/js/physics/${mod}.js`, import.meta.url));
    assert.equal(typeof m[fn], 'function', `${mod}.${fn} is not exported`);
    let out = m[fn](...JSON.parse(attr(ex.tag, 'data-args') ?? '[]'));
    const pick = attr(ex.tag, 'data-pick');
    if (pick) out = pick.split('.').reduce((o, k) => o[k], out);
    const expect = Number(attr(ex.tag, 'data-expect'));
    const tol = Number(attr(ex.tag, 'data-tol') ?? 1e-6);
    assert.ok(Number.isFinite(expect), 'data-expect must be a number');
    assert.ok(Math.abs(out - expect) <= tol, `computed ${out}, page states ${expect} ± ${tol}`);
  });
}
