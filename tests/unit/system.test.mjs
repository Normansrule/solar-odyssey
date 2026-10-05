import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../../site/assets/js/physics/system.js';
import * as pv from '../../site/assets/js/physics/pv.js';
import { dailyInsolation } from '../../site/assets/js/physics/solar.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, want ${b} ± ${tol}`);

test('series adds voltage, parallel adds current', () => {
  close(s.seriesVoltage(72, 0.7), 50.4, 1e-12);
  close(s.parallelCurrent(3, 13.2), 39.6, 1e-12);
  const m = { Voc: 50, Vmp: 42, Isc: 13, Imp: 12.4, Pmax: 520 };
  const str = s.stringOf(m, 10);
  assert.deepEqual([str.Voc, str.Isc, str.Pmax], [500, 13, 5200]);
  const arr = s.arrayOf(str, 3);
  assert.deepEqual([arr.Voc, arr.Isc, arr.Pmax], [500, 39, 15600]);
});

test('cell at STC matches pv.siliconCell', () => {
  const a = s.cellSummary({ areaCm2: 243 });
  const p = pv.siliconCell({ areaCm2: 243 });
  close(a.Voc, pv.openCircuitVoltage(p), 1e-9);
  close(a.Pmax, pv.maxPowerPoint(p).P, 1e-9);
});

test('module = cells in series (full) or two half-cell chains in parallel (half-cut)', () => {
  const cell = s.cellSummary({ areaCm2: s.FULL_CELL_CM2 });
  const half = s.cellSummary({ areaCm2: s.FULL_CELL_CM2 / 2 });
  const full72 = s.moduleStc({ cells: 72, halfCut: false });
  close(full72.Voc, 72 * cell.Voc, 1e-9);
  close(full72.Isc, cell.Isc, 1e-9);
  const half144 = s.moduleStc({ cells: 144, halfCut: true });
  close(half144.Voc, 72 * half.Voc, 1e-9, 'same voltage as 72 full cells');
  close(half144.Isc, 2 * half.Isc, 1e-9);
  close(half144.Pmax, full72.Pmax, 1e-6, 'identical cells: same power');
  close(half144.Voc, 50.7, 0.1);
  assert.ok(half144.Pmax > 500 && half144.Pmax < 600, `module power ${half144.Pmax}`);
});

test('temperature: Voc falls about 2 mV/K per cell, power about 0.3 %/K', () => {
  const c25 = s.cellSummary({ tempC: 25 }); const c35 = s.cellSummary({ tempC: 35 });
  const dVdT = (c35.Voc - c25.Voc) / 10;
  assert.ok(dVdT < -0.0017 && dVdT > -0.0025, `dVoc/dT = ${dVdT}`);
  const k = s.moduleCoefficients({ cells: 144, halfCut: true });
  assert.ok(k.voc < -0.2 && k.voc > -0.35, `beta Voc ${k.voc}`);
  assert.ok(k.pmax < -0.25 && k.pmax > -0.45, `gamma P ${k.pmax}`);
  assert.ok(s.cellSummary({ tempC: 25, irradiance: 500 }).Isc < c25.Isc * 0.51);
});

test('linear temperature correction and cold-morning string voltage', () => {
  close(s.atTemperature(550, -0.3, 56.25), 498.4375, 1e-9);
  close(s.atTemperature(50, -0.25, 25), 50, 1e-12);
  // colder than 25 °C raises Voc
  close(s.coldStringVoc(50.7, 18, -0.27, -10), 18 * 50.7 * (1 + 0.0027 * 35), 1e-9);
  assert.ok(s.coldStringVoc(50.7, 18, -0.27, -10) < 1000);
  assert.ok(s.coldStringVoc(50.7, 19, -0.27, -10) > 1000);
  assert.equal(s.maxModulesInSeries(1000, 50.7, -0.27, -10), 18);
  assert.equal(s.maxModulesInSeries(600, 50.7, -0.27, -10), 10);
});

test('NOCT cell temperature', () => {
  close(s.cellTempC(20, 800, 45), 45, 1e-12);
  close(s.cellTempC(25, 1000, 45), 56.25, 1e-12);
});

test('design checks flag an over-voltage string and over-current array', () => {
  const module = s.moduleStc({ cells: 144, halfCut: true });
  const coeff = s.moduleCoefficients({ cells: 144, halfCut: true });
  const inv = { acKW: 10, vMax: 1000, mpptMin: 200, mpptMax: 850, iscMax: 40 };
  const ok = s.designChecks({ module, coeff, series: 16, parallel: 1, inverter: inv, tMinC: -10 });
  assert.ok(ok.checks.every((c) => c.level === 'ok' || c.id === 'dcac'), JSON.stringify(ok.checks));
  const hot = s.designChecks({ module, coeff, series: 20, parallel: 1, inverter: inv, tMinC: -10 });
  assert.equal(hot.checks.find((c) => c.id === 'vmax').level, 'error');
  const amps = s.designChecks({ module, coeff, series: 10, parallel: 3, inverter: inv });
  assert.equal(amps.checks.find((c) => c.id === 'current').level, 'error');
  const low = s.designChecks({ module, coeff, series: 3, parallel: 1, inverter: inv, tHotCellC: 70 });
  assert.equal(low.checks.find((c) => c.id === 'mppt-low').level, 'warn');
  close(ok.ratio, ok.kWp / 10, 1e-12);
});

test('clipping integral: no loss when inverter is big, matches the half-sine closed form', () => {
  const D = 12; const N = 24000; const step = D / N;
  const p = Array.from({ length: N }, (_, k) => 10 * Math.sin((Math.PI * (k + 0.5) * step) / D));
  const big = s.clippingIntegral(p, step, 20);
  close(big.clippedKWh, 0, 1e-12);
  close(big.acKWh, (2 * 10 * D) / Math.PI, 1e-3);
  const small = s.clippingIntegral(p, step, 8);
  const exact = s.sineDayClipping(10, 8, D);
  close(small.clippedKWh, exact.clippedKWh, 1e-3);
  close(small.acKWh + small.clippedKWh, small.dcKWh, 1e-9, 'energy is conserved');
  close(exact.clippedFraction, 0.0852, 1e-4);
  assert.equal(s.sineDayClipping(10, 12, D).clippedKWh, 0);
  // inverter efficiency scales AC output
  close(s.clippingIntegral([10, 10], 1, 100, 0.97).acKWh, 19.4, 1e-12);
});

test('clear-sky day through an undersized inverter clips at noon only', () => {
  const day = dailyInsolation(new Date(Date.UTC(2025, 5, 21)), { lat: 34.05, lon: -118.25, tilt: 30, stepMin: 15 });
  const dc = s.dcPowerTrace(day.trace, { kWp: 6.6, ambientC: 25 });
  const r = s.clippingIntegral(dc, 0.25, 5);
  assert.ok(Math.max(...r.acKW) <= 5 + 1e-12);
  assert.ok(r.clippedKWh > 0 && r.clippedFraction < 0.15, `clipped ${r.clippedFraction}`);
  close(r.dcKWh, dc.reduce((a, b) => a + b, 0) * 0.25, 1e-9);
});

test('bypass diode: a shaded cell drags its group negative, the diode clamps it', () => {
  const free = s.groupAt(6, { cells: 24 });
  assert.equal(free.bypassed, false);
  assert.ok(free.V > 24 * 0.6);
  const dark = s.groupAt(10, { cells: 24, shaded: 1, shade: 1 });
  assert.equal(dark.bypassed, true);
  close(dark.V, -0.5, 1e-12);
  close(dark.Icells + dark.Idiode, 10, 1e-9, 'Kirchhoff: currents add up');
  assert.ok(dark.Vshaded < 0, 'shaded cell is in reverse bias');
});

test('table look-up agrees with exact cell voltage', () => {
  const p = s.cellAt({ areaCm2: s.FULL_CELL_CM2 });
  const f = s.cellVoltageTable(p, 14);
  for (const I of [0.5, 5, 12, 13]) close(f(I), s.cellVoltageAt(I, p), 2e-3, `I=${I}`);
});

test('partial shading makes two power peaks; P&O can stick on the lower one, a global scan finds the top', () => {
  const even = s.stringCurve([{}, {}, {}]);
  assert.equal(s.powerPeaks(even).length, 1);
  const curve = s.stringCurve([{}, {}, { shaded: 1, shade: 0.75 }]);
  const peaks = s.powerPeaks(curve);
  assert.ok(peaks.length >= 2, JSON.stringify(peaks));
  const [glob, local] = peaks;
  assert.ok(glob.V < local.V, 'global peak at the lower voltage (shaded group bypassed)');
  const pAt = (V) => s.powerAtV(curve, V);
  const vmax = curve[curve.length - 1].V;
  const run = s.runPerturbObserve(pAt, 0.97 * vmax, 0.5, 200);
  const end = run[run.length - 1];
  close(end.V, local.V, 1.5, 'P&O from Voc settles on the local peak');
  const g = s.globalScan(pAt, vmax, 60);
  close(g.P, glob.P, 0.03 * glob.P);
});

test('perturb and observe climbs and then dithers around a single peak', () => {
  const pAt = (V) => 100 - (V - 30) ** 2;
  const run = s.runPerturbObserve(pAt, 40, 1, 30);
  const tail = run.slice(-6).map((r) => r.V);
  assert.ok(tail.every((v) => Math.abs(v - 30) <= 1.0001), tail.join(','));
});

test('helpers: ohmic loss, anti-reflection coating, yearly sum', () => {
  close(s.ohmicLossW(13.2, 0.01), 1.7424, 1e-12);
  close(s.ohmicLossW(6.6, 0.01) / s.ohmicLossW(13.2, 0.01), 0.25, 1e-12);
  close(s.idealArcIndex(1, 3.5), 1.8708, 1e-4);
  close(s.quarterWaveThicknessNm(600, 1.87), 80.21, 0.01);
  close(s.yearlyFromMonthly([{ kwh: 2, days: 31 }, { kwh: 3, days: 30 }]), 152, 1e-12);
  close(s.dcAcRatio(6.6, 5), 1.32, 1e-12);
});
