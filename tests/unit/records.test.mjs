// Tests for the tandem detailed-balance module and the records / deployment / state-of-the-field datasets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as t from '../../site/assets/js/physics/tandem.js';
import * as pv from '../../site/assets/js/physics/pv.js';
import { wrightsLaw, impliedLearningRate } from '../../site/assets/js/physics/econ.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, want ${b} ± ${tol}`);
const load = (name) => JSON.parse(readFileSync(new URL(`../../site/data/${name}`, import.meta.url), 'utf8'));

test('single junction in tandem.js reproduces pv.shockleyQueisser', () => {
  for (const g of [0.9, 1.12, 1.34, 1.7]) close(t.singleJunction(g).efficiency, pv.shockleyQueisser(g).efficiency, 1e-6, `gap ${g}`);
});

test('incident blackbody irradiance is about 1361 W/m²', () => close(t.incidentIrradiance(), 1361, 2));

test('photon shares add up to one and grow the top share as its gap falls', () => {
  const s = t.photonShares(1.7, 1.12);
  close(s.top + s.bottom + s.lost, 1, 1e-9);
  assert.ok(t.photonShares(1.5, 1.12).top > s.top);
});

test('best top cell on silicon (1.12 eV) lands near 1.7 eV and beats any single junction', () => {
  const o = t.optimumTopGap(1.12);
  assert.ok(o.gap > 1.65 && o.gap < 1.85, `optimum top gap ${o.gap}`);
  const sq = Math.max(...pv.sqCurve(0.8, 2.0, 0.02).map((p) => p.efficiency));
  assert.ok(o.efficiency > sq + 0.08, `tandem ${o.efficiency} vs single ${sq}`);
  close(o.efficiency, 0.412, 0.005);
});

test('two-junction blackbody optimum is about 42 % (De Vos 1980) with gaps near 1.6 and 0.95 eV', () => {
  const p = t.optimumPair();
  close(p.efficiency, 0.42, 0.01);
  assert.ok(p.top > 1.5 && p.top < 1.8 && p.bottom > 0.85 && p.bottom < 1.05, JSON.stringify(p));
});

test('series tandem is current-limited: never above the four-terminal stack; mismatched stacks lose', () => {
  for (const g of [1.4, 1.6, 1.77, 2.0, 2.3]) {
    const r = t.tandemLimit(g, 1.12);
    assert.ok(r.efficiency <= r.fourTerminal + 1e-9, `gap ${g}`);
    close(r.V, r.top.V + r.bottom.V, 1e-12);
    assert.ok(r.J <= Math.min(r.top.Jsc, r.bottom.Jsc));
  }
  assert.equal(t.tandemLimit(1.4, 1.12).limitedBy, 'bottom');
  assert.equal(t.tandemLimit(2.2, 1.12).limitedBy, 'top');
  assert.ok(t.tandemEfficiency(1.4, 1.12) < t.tandemEfficiency(1.77, 1.12));
  assert.ok(Number.isNaN(t.tandemEfficiency(1.0, 1.12)), 'top gap below bottom gap is invalid');
});

test('efficiency-records dataset is well formed and conservative', () => {
  const d = load('efficiency-records.json');
  const ids = new Set(d.data.series.map((s) => s.id));
  assert.ok(ids.size === d.data.series.length);
  for (const s of d.data.series) assert.match(s.colour, /^--t-[a-z]+$/);
  for (const p of d.data.points) {
    assert.ok(ids.has(p.tech), p.tech);
    assert.ok(Number.isInteger(p.year) && p.year >= 1950 && p.year <= 2026);
    assert.ok(p.efficiency > 0 && p.efficiency < 50);
    // a one-sun point may never exceed the single-junction SQ limit unless it is a multijunction/tandem
    if (!['iii-v-conc', 'iii-v-1sun', 'perovskite-si'].includes(p.tech)) assert.ok(p.efficiency < 33.7, `${p.tech} ${p.efficiency}`);
  }
  // records within a series never go down with time
  for (const id of ids) {
    const pts = d.data.points.filter((p) => p.tech === id).sort((a, b) => a.year - b.year);
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i].efficiency >= pts[i - 1].efficiency, `${id} ${pts[i].year}`);
  }
});

test('solar-deployment dataset: capacity rises every year; module-price learning rate is 20-35 %', () => {
  const d = load('solar-deployment.json');
  const cap = d.data.capacity_gw;
  for (let i = 1; i < cap.length; i++) assert.ok(cap[i][1] > cap[i - 1][1]);
  const prices = new Map(load('module-prices.json').data);
  const q = new Map(cap);
  const lr = impliedLearningRate(q.get(2010), prices.get(2010), q.get(2024), prices.get(2024));
  assert.ok(lr > 0.2 && lr < 0.35, `learning rate ${lr}`);
  close(wrightsLaw(1, lr, Math.log2(q.get(2024) / q.get(2010))), prices.get(2024) / prices.get(2010), 1e-9);
});

test('state-of-the-field entries are dated and sourced', () => {
  const d = load('state-of-the-field.json');
  assert.ok(d.data.length >= 10);
  for (const r of d.data) {
    assert.match(r.as_of, /^\d{4}(-\d{2}){0,2}$|^\d{4}-Q[1-4]$/, r.id);
    assert.match(r.last_verified, /^\d{4}-\d{2}-\d{2}$/, r.id);
    assert.ok(r.source && r.label && r.unit, r.id);
    assert.ok(r.value != null || r.from, r.id);
  }
});

test('learning-curve fit recovers a known learning rate and matches the real data', async () => {
  const l = await import('../../site/assets/js/physics/learning.js');
  const synth = [1, 2, 4, 8, 16, 32].map((q) => [q, 10 * 0.8 ** Math.log2(q)]);
  const f = l.fitLearningCurve(synth);
  close(f.learningRate, 0.2, 1e-12); close(f.r2, 1, 1e-12); close(l.learningCurveCost(f, 64), 10 * 0.8 ** 6, 1e-9);
  const real = l.fitLearningCurve(l.SAMPLE_2000_2024);
  assert.ok(real.learningRate > 0.24 && real.learningRate < 0.32, `fitted ${real.learningRate}`);
  // the fixed sample must agree with the shipped datasets
  const cap = new Map(load('solar-deployment.json').data.capacity_gw);
  const price = new Map(load('module-prices.json').data);
  const joined = l.joinByYear([...cap].filter(([y]) => y <= 2024), [...price]);
  assert.equal(joined.length, l.SAMPLE_2000_2024.length);
  joined.forEach(([q, c], i) => { close(q, l.SAMPLE_2000_2024[i][0], 0.06); close(c, l.SAMPLE_2000_2024[i][1], 1e-4); });
});
