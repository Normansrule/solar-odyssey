import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as j from '../../site/assets/js/physics/junction.js';
import * as pv from '../../site/assets/js/physics/pv.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, want ${b} ± ${tol}`);

test('built-in potential matches the textbook value for a symmetric 1e16 junction', () => {
  // Sze & Ng style check with ni = 1e10 cm⁻³ at 300 K: Vbi = 0.0259 · ln(1e32/1e20) ≈ 0.714 V
  close(j.builtInPotential(1e16, 1e16, { ni: 1e10 }), 0.7143, 0.001);
  // with the Altermatt ni the barrier is ~2 mV higher
  close(j.builtInPotential(1e16, 1e16), 0.7162, 0.001);
  // more doping, taller barrier: each decade on one side adds kT/q·ln 10 ≈ 59.6 mV
  close(j.builtInPotential(1e16, 1e17) - j.builtInPotential(1e16, 1e16), pv.thermalVoltage(300) * Math.LN10, 1e-9);
});

test('depletion width: closed form, charge neutrality and bias dependence', () => {
  const W = j.depletionWidth(1e16, 1e16);
  close(W * 1e6, 0.430, 0.005, 'symmetric 1e16 junction (µm)');
  const { xn, xp } = j.depletionSplit(1e16, 1e19);
  close(1e16 * xp, 1e19 * xn, 1e-6 * 1e16 * xp, 'Na·xp = Nd·xn');
  assert.ok(xp > 999 * xn, 'a one-sided junction depletes into the lightly doped side');
  // W ∝ sqrt(Vbi − V): reverse bias widens it, forward bias narrows it
  const vbi = j.builtInPotential(1e16, 1e16);
  close(j.depletionWidth(1e16, 1e16, -vbi * 3) / W, 2, 1e-9, 'four times the voltage, twice the width');
  assert.ok(j.depletionWidth(1e16, 1e16, 0.4) < W);
  assert.equal(j.depletionWidth(1e16, 1e16, 2), 0);
});

test('peak field equals q·Nd·xn/ε and 2(Vbi − V)/W', () => {
  const Na = 1e16; const Nd = 1e18;
  const { xn } = j.depletionSplit(Na, Nd);
  const gauss = (1.602176634e-19 * Nd * 1e6 * xn) / (j.EPS_R_SI * j.EPS0);
  close(j.maxField(Na, Nd), gauss, gauss * 1e-9);
  const r = j.junction(Na, Nd);
  close(r.Emax_Vcm, r.Emax_Vm / 100, 1e-9);
  close(r.W_um, r.xn_um + r.xp_um, 1e-12);
});

test('I0(T) follows T³·exp(−Eg0/kT) and returns the reference at Tref', () => {
  close(j.saturationCurrentAt(1e-12, 298.15), 1e-12, 1e-24);
  const r = j.saturationCurrentAt(1, 308.15);
  const expect = (308.15 / 298.15) ** 3 * Math.exp(-(1.2 / 8.617333262e-5) * (1 / 308.15 - 1 / 298.15));
  close(r, expect, 1e-6 * expect);
  assert.ok(r > 4 && r < 6, `ideal-diode I0 rises ~5× per 10 K, got ${r}`);
});

test('cellAt reproduces pv.siliconCell at standard test conditions', () => {
  const a = j.cellAt(); const b = pv.siliconCell();
  close(a.Iph, b.Iph, 1e-12); close(a.I0, b.I0, 1e-20); close(a.Rs, b.Rs, 1e-12); close(a.Rsh, b.Rsh, 1e-9);
  const s = j.cellSummary();
  close(s.Pmax, 5.60, 0.01); close(s.eta, 0.2306, 0.001); close(s.FF, 0.819, 0.002);
  close(s.FF, s.Pmax / (s.Voc * s.Isc), 1e-12);
});

test('Voc falls with temperature by about 2 mV/K (about −0.27 %/K), matching the analytic slope', () => {
  const v24 = j.vocAt({ tempC: 24 }); const v26 = j.vocAt({ tempC: 26 });
  const slope = (v26 - v24) / 2; // V/K
  close(slope * 1000, -1.9, 0.25, 'dVoc/dT in mV/K');
  const pct = j.vocCoefficientPercent();
  assert.ok(pct < -0.24 && pct > -0.33, `Voc coefficient ${pct} %/K should be near −0.3 %/K`);
  // Green (2003): dVoc/dT = −(Eg0/q − Voc + γkT/q)/T; the model neglects only Iph(T), a ~0.02 mV/K correction
  close(slope, j.vocTemperatureCoefficient(j.vocAt()), 0.05e-3);
  // Over 25 → 50 °C the cell loses close to 48 mV
  close((j.vocAt({ tempC: 50 }) - j.vocAt()) * 1000, -47.9, 1.5);
});

test('Isc rises slightly with temperature and power falls about 0.3 %/K', () => {
  const a = j.cellSummary({ tempC: 25 }); const b = j.cellSummary({ tempC: 35 });
  close(j.percentPerKelvin(a.Isc, b.Isc, 10), 0.06, 0.005);
  const pc = j.powerCoefficientPercent();
  assert.ok(pc < -0.25 && pc > -0.45, `power coefficient ${pc} %/K`);
});

test('resistances and ideality factor lower the fill factor', () => {
  const base = j.cellSummary().FF;
  assert.ok(j.cellSummary({ RsOhmCm2: 3 }).FF < base - 0.05);
  assert.ok(j.cellSummary({ RshOhmCm2: 50 }).FF < base - 0.02);
  assert.ok(j.cellSummary({ n: 1.8 }).FF < base - 0.05);
  // the reference current is rescaled so Voc at STC hardly moves with n
  close(j.cellSummary({ n: 1.8 }).Voc, j.cellSummary().Voc, 0.002);
});

test('Isc scales with light, Voc grows logarithmically', () => {
  const one = j.cellSummary(); const half = j.cellSummary({ irradiance: 500 });
  close(half.Isc / one.Isc, 0.5, 0.001);
  close(one.Voc - half.Voc, pv.thermalVoltage(298.15) * Math.LN2, 0.002);
  const dark = j.cellSummary({ irradiance: 0 });
  assert.equal(dark.Pmax, 0);
});

test('loadPoint spans short circuit to open circuit and lies on the curve', () => {
  const p = j.cellAt();
  const sc = j.loadPoint(p, 0); close(sc.V, 0, 0); close(sc.I, pv.shortCircuitCurrent(p), 1e-9);
  const oc = j.loadPoint(p, Infinity); close(oc.V, pv.openCircuitVoltage(p), 1e-9);
  const mpp = pv.maxPowerPoint(p);
  const op = j.loadPoint(p, mpp.V / mpp.I);
  close(op.P, mpp.P, 1e-6);
  close(op.I, pv.diodeCurrent(op.V, p), 1e-6);
});
