import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pv from '../../site/assets/js/physics/pv.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, want ${b} ± ${tol}`);

test('photon energy E = hc/λ', () => {
  close(pv.photonEnergyEV(500), 2.4797, 1e-4, 'green 500 nm');
  close(pv.photonEnergyEV(1239.842), 1.0, 1e-5);
  close(pv.photonEnergyJ(500), 3.9728e-19, 1e-22);
  close(pv.frequencyHz(500), 5.9958e14, 1e10);
});

test('band-gap cutoff and absorption', () => {
  close(pv.cutoffWavelengthNm(1.12), 1107.0, 0.5, 'silicon cutoff');
  assert.equal(pv.isAbsorbed(1000, 1.12), true);
  assert.equal(pv.isAbsorbed(1200, 1.12), false);
  close(pv.excessEnergyEV(400, 1.12), 3.0996 - 1.12, 1e-3);
  assert.equal(pv.excessEnergyEV(1500, 1.12), 0);
});

test('thermal voltage at 25 °C', () => close(pv.thermalVoltage(298.15), 0.025693, 1e-6));

test('ideal diode: Voc matches the closed form, current is zero there', () => {
  const p = { Iph: 9.7, I0: 1e-10, n: 1, T: 298.15 };
  const voc = pv.openCircuitVoltage(p);
  close(voc, pv.idealVoc(p), 1e-9);
  close(pv.diodeCurrent(voc, p), 0, 1e-9);
  close(pv.shortCircuitCurrent(p), 9.7, 1e-12);
});

test('series resistance: Newton solution satisfies the implicit equation', () => {
  const p = { Iph: 9.7, I0: 1e-11, n: 1.2, T: 300, Rs: 0.005, Rsh: 50 };
  for (const V of [0, 0.3, 0.55, 0.62]) {
    const I = pv.diodeCurrent(V, p);
    const nVt = p.n * pv.thermalVoltage(p.T);
    const resid = p.Iph - p.I0 * Math.expm1((V + I * p.Rs) / nVt) - (V + I * p.Rs) / p.Rsh - I;
    close(resid, 0, 1e-9, `V=${V}`);
  }
});

test('maximum power point is a maximum and fill factor is sensible', () => {
  const p = pv.siliconCell();
  const mpp = pv.maxPowerPoint(p);
  for (const dV of [-0.01, 0.01]) assert.ok(mpp.P >= (mpp.V + dV) * pv.diodeCurrent(mpp.V + dV, p));
  const ff = pv.fillFactor(p);
  assert.ok(ff > 0.75 && ff < 0.86, `FF ${ff}`);
  close(pv.efficiency(mpp.P, 1000, 0.0243), 0.2306, 0.002, 'illustrative cell ≈ 23 %');
});

test('I-V curve starts at Isc and ends at Voc', () => {
  const p = pv.siliconCell();
  const c = pv.ivCurve(p, 50);
  close(c[0].I, pv.shortCircuitCurrent(p), 1e-9);
  close(c.at(-1).I, 0, 1e-6);
});

test('load line operating point', () => {
  const p = pv.siliconCell();
  const op = pv.operatingPointWithLoad(p, 0.1);
  close(op.I, pv.diodeCurrent(op.V, p), 1e-6);
});

test('Shockley–Queisser (blackbody sun): ultimate 44 % at 1.1 eV, limit ≈ 30 % near 1.1–1.4 eV', () => {
  close(pv.spectrumBudget(1.1).ultimate, 0.44, 0.01, 'SQ 1961 ultimate efficiency');
  const b = pv.spectrumBudget(1.34);
  close(b.belowGap + b.thermalisation + b.ultimate, 1, 1e-6);
  const curve = pv.sqCurve(0.8, 2.0, 0.02);
  const best = curve.reduce((a, c) => (c.efficiency > a.efficiency ? c : a));
  assert.ok(best.efficiency > 0.29 && best.efficiency < 0.32, `peak ${best.efficiency}`);
  assert.ok(best.gap > 1.1 && best.gap < 1.45, `peak gap ${best.gap}`);
  close(pv.shockleyQueisser(1.1).incident, 1361, 3, 'blackbody sun reproduces the solar constant');
});
