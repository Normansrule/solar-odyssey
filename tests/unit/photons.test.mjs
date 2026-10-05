import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ph from '../../site/assets/js/physics/photons.js';
import * as pv from '../../site/assets/js/physics/pv.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, want ${b} ± ${tol}`);
const json = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

// ---------- materials.json ----------
const materials = json('../../site/data/materials.json');
const sources = json('../../site/data/sources.json');

test('materials.json: every material has a plausible gap, a kind and known sources', () => {
  assert.ok(Array.isArray(materials.data) && materials.data.length >= 6);
  const ids = new Set();
  for (const m of materials.data) {
    assert.match(m.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(m.id), `duplicate id ${m.id}`); ids.add(m.id);
    assert.ok(typeof m.name === 'string' && typeof m.short === 'string');
    assert.ok(m.gap >= 0.3 && m.gap <= 3.5, `${m.id} gap ${m.gap} outside 0.3–3.5 eV`);
    assert.ok(['direct', 'indirect', 'amorphous'].includes(m.kind), `${m.id} kind`);
    assert.ok(['silicon', 'thinfilm', 'perovskite', 'multijunction', 'emerging', 'tandem'].includes(m.family), `${m.id} family`);
    assert.ok(Array.isArray(m.sources) && m.sources.length > 0, `${m.id} needs sources`);
    for (const s of m.sources) assert.ok(sources[s], `${m.id} cites unknown source ${s}`);
    if (m.range) {
      assert.ok(m.range[0] <= m.gap && m.gap <= m.range[1], `${m.id} gap outside its own range`);
      assert.ok(m.range[0] >= 0.3 && m.range[1] <= 3.5);
    }
  }
});

test('materials.json: textbook anchors (Si 1.12, GaAs 1.42, Ge 0.66 eV)', () => {
  const by = Object.fromEntries(materials.data.map((m) => [m.id, m]));
  close(by.si.gap, 1.12, 0.01, 'silicon');
  close(by.gaas.gap, 1.42, 0.01, 'GaAs');
  close(by.ge.gap, 0.66, 0.01, 'germanium');
  assert.equal(by.si.kind, 'indirect');
  assert.equal(by.gaas.kind, 'direct');
  assert.ok(by.cigs.representative, 'CIGS value is flagged as representative');
});

test('glossary terms used by the lessons exist', () => {
  const g = json('../../site/data/glossary.json');
  for (const t of ['photon', 'band-gap', 'valence-band', 'conduction-band', 'electron-hole-pair', 'thermalisation', 'electronvolt', 'detailed-balance', 'direct-band-gap', 'indirect-band-gap', 'blackbody']) assert.ok(g[t], t);
});

// ---------- photons.js ----------
test('blackbody sun integrates to dilution·σT⁴ ≈ 1361 W/m²', () => {
  let s = 0; const dE = 0.002;
  for (let E = dE / 2; E < 20; E += dE) s += ph.spectralPower(E) * dE;
  close(s, ph.incidentPower(), 0.5);
  close(ph.incidentPower(), 1361, 3, 'about the solar constant');
  assert.equal(ph.spectralPower(0), 0);
  assert.equal(ph.spectralPower(-1), 0);
});

test('spectrumSplit integrates to the same budget as pv.spectrumBudget', () => {
  for (const g of [0.7, 1.12, 1.34, 2.0]) {
    const sp = ph.spectrumSplit(g, { from: 0.0005, to: 12, n: 24000 });
    const d = sp[1].E - sp[0].E; let b = 0; let u = 0; let h = 0;
    for (const x of sp) { b += x.below * d; u += x.usable * d; h += x.heat * d; }
    const T = b + u + h; const ref = pv.spectrumBudget(g);
    close(b / T, ref.belowGap, 0.002, `below ${g}`);
    close(u / T, ref.ultimate, 0.002, `usable ${g}`);
    close(h / T, ref.thermalisation, 0.002, `heat ${g}`);
    for (const x of sp) close(x.below + x.usable + x.heat, x.total, 1e-9 * (x.total + 1));
  }
});

test('per-photon fractions', () => {
  close(ph.usableFraction(500, 1.12), 1.12 / 2.4797, 1e-4);
  close(ph.usableFraction(500, 1.12) + ph.heatFraction(500, 1.12), 1, 1e-12);
  assert.equal(ph.usableFraction(1300, 1.12), 0);
  assert.equal(ph.heatFraction(1300, 1.12), 0);
  close(ph.gapFromCutoffNm(pv.cutoffWavelengthNm(1.42)), 1.42, 1e-12);
});

test('blackbody detailed-balance peak is near 1.26 eV and 30.5 %', () => {
  const p = ph.sqPeak();
  close(p.gap, 1.26, 0.03);
  close(p.efficiency, 0.305, 0.003);
  const curve = pv.sqCurve(0.9, 1.7, 0.01);
  for (const c of curve) assert.ok(c.efficiency <= p.efficiency + 1e-6);
});

test('wavelength colours and bands', () => {
  assert.equal(ph.wavelengthRGB(300), null);
  assert.equal(ph.wavelengthRGB(900), null);
  const green = ph.wavelengthRGB(530); assert.ok(green[1] > green[0] && green[1] > green[2]);
  const red = ph.wavelengthRGB(680); assert.ok(red[0] > red[1] && red[0] > red[2]);
  const blue = ph.wavelengthRGB(460); assert.ok(blue[2] > blue[0]);
  assert.equal(ph.spectralBand(300), 'uv');
  assert.equal(ph.spectralBand(550), 'visible');
  assert.equal(ph.spectralBand(1000), 'ir');
});

test('photonSampler stays in range and follows the solar photon flux', () => {
  const f = ph.photonSampler({ minNm: 280, maxNm: 1600 });
  let prev = Infinity;
  for (let u = 0; u <= 1; u += 0.05) { const nm = f(u); assert.ok(nm >= 279.9 && nm <= 1600.1); assert.ok(nm <= prev + 1e-9); prev = nm; }
  // median photon of a 5772 K blackbody between 280 and 1600 nm lies in the red / near infrared
  const med = f(0.5); assert.ok(med > 650 && med < 1000, `median ${med}`);
});
