// Tests for physics/fluids.js and the data the wind, hydro, geothermal and ocean pages rely on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as f from '../../site/assets/js/physics/fluids.js';
import * as rn from '../../site/assets/js/physics/renewables.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, want ${b} ± ${tol}`);

test('tip-speed ratio and swept area', () => {
  // 10 rpm, 100 m radius, 10 m/s wind: tip speed 104.7 m/s, λ ≈ 10.47
  close(f.tipSpeedRatio(10, 100, 10), 10.472, 1e-3);
  close(f.sweptArea(236), 43744, 5, 'Vestas quotes 43 742 m² for the V236');
  close(f.sweptArea(172), 23235, 5, 'Vestas quotes 23 235 m² for the V172');
});

test('rated wind speed inverts the power equation', () => {
  const v = f.ratedWindSpeed(15e6, 236, 0.45);
  close(rn.rotorPower(1.225, 236, v, 0.45), 15e6, 1);
  assert.ok(v > 9 && v < 13, `rated speed ${v} should be in the usual 10–12 m/s range`);
});

test('actuator disc optimum is a = 1/3 and Cp = 16/27', () => {
  const { a, cp } = f.actuatorDiscOptimum();
  close(a, 1 / 3, 1e-3);
  close(cp, rn.BETZ, 1e-6);
});

test('aerofoil: linear lift before stall, lift falls and drag climbs after', () => {
  const pre = f.aerofoilCoefficients(5);
  close(pre.cl, 2 * Math.PI * 5 * Math.PI / 180, 1e-12);
  assert.equal(pre.stalled, false);
  const at = f.aerofoilCoefficients(14); const post = f.aerofoilCoefficients(22);
  assert.ok(post.stalled && post.cl < at.cl && post.cd > 5 * at.cd);
  assert.ok(f.aerofoilCoefficients(-5).cl < 0);
});

test('blade section: geometry of the apparent wind', () => {
  const s = f.bladeSection({ windMs: 10, rpm: 12, radiusM: 50, pitchDeg: 0, twistDeg: 0, a: 1 / 3 });
  close(s.axial, 20 / 3, 1e-9);
  close(s.tangential, 12 * 2 * Math.PI / 60 * 50, 1e-9);
  close(s.W, Math.hypot(s.axial, s.tangential), 1e-9);
  close(s.alphaDeg, s.phiDeg, 1e-9);
  assert.ok(s.torqueForce > 0, 'lift tilted forward drives the rotor');
  // pitching the blade to feather (larger pitch) lowers the angle of attack and the driving force
  const fe = f.bladeSection({ windMs: 10, rpm: 12, radiusM: 50, pitchDeg: 5, twistDeg: 0 });
  assert.ok(fe.alphaDeg < s.alphaDeg && fe.torqueForce < s.torqueForce);
});

test('water versus air: equal power density', () => {
  close(f.equivalentWindSpeed(2.5), 23.56, 0.01);
  close(f.powerDensity(1025, 2.5), f.powerDensity(1.225, f.equivalentWindSpeed(2.5)), 1e-6);
  close(f.powerDensity(1025, 3), 13837.5, 1e-6);
});

test('hydro helpers', () => {
  close(f.jetSpeed(500), 99.03, 0.01);
  assert.equal(f.turbineForHead(10, 500), 'kaplan');
  assert.equal(f.turbineForHead(100, 200), 'francis');
  assert.equal(f.turbineForHead(800, 5), 'pelton');
  assert.equal(f.turbineForHead(400, 2), 'pelton');
  close(rn.hydroPower(200, 100, 0.9) / 1e6, 176.52, 0.01);
});

test('stream efficiency limit lies below Carnot and approaches it as the stream cools less', () => {
  const carnot = rn.carnotEfficiency(523.15, 298.15);
  const lim = f.streamEfficiencyLimit(523.15, 343.15, 298.15);
  assert.ok(lim < carnot);
  close(lim, 0.3015, 1e-3);
  close(f.streamEfficiencyLimit(523.15, 523.15 - 1e-4, 298.15), carnot, 1e-4);
  close(f.streamEfficiencyLimit(523.15, 523.15, 298.15), carnot, 1e-12);
});

test('deep-water waves: energy flux = energy density × group velocity', () => {
  for (const [hs, te] of [[1, 6], [2, 8], [4, 12]]) {
    close(f.waveEnergyDensity(hs) * f.deepWaterGroupVelocity(te), rn.waveEnergyFlux(hs, te), 1e-6);
  }
  close(f.deepWaterWavelength(10), 156.1, 0.1);
});

test('ebb barrage model: physically sensible tide', () => {
  const r = f.simulateEbbBarrage();
  const ideal = rn.tidalBasinEnergyJ(22e6, 8);
  assert.ok(r.energyJ > 0.3 * ideal && r.energyJ < ideal, `got ${r.energyJ / 3.6e12} GWh`);
  const phases = new Set(r.series.map((s) => s.phase));
  for (const p of ['sluice', 'hold', 'generate']) assert.ok(phases.has(p), `phase ${p}`);
  for (const s of r.series) {
    if (s.phase === 'generate') assert.ok(s.basin > s.sea, 'generates only while the basin is above the sea');
    else assert.equal(s.mw, 0);
  }
  close(r.periodH, 12.42, 0.01);
  // a larger tidal range gives more energy, roughly with its square
  const big = f.simulateEbbBarrage({ rangeM: 11 });
  assert.ok(big.energyJ > 1.5 * r.energyJ);
});

test('electricity-mix has the fields the renewables pages read', () => {
  const mix = JSON.parse(readFileSync(new URL('../../site/data/electricity-mix.json', import.meta.url), 'utf8'));
  const w = mix.data.World;
  for (const k of ['wind_electricity', 'hydro_electricity', 'other_renewable_exc_biofuel_electricity', 'wind_share_elec', 'hydro_share_elec']) {
    assert.ok(Array.isArray(w[k]) && w[k].length === w.years.length, k);
  }
  const i = w.years.length - 1;
  assert.ok(w.wind_share_elec[i] > 1 && w.wind_share_elec[i] < 30);
  assert.ok(w.hydro_share_elec[i] > 5 && w.hydro_share_elec[i] < 30);
  const other = 100 * w.other_renewable_exc_biofuel_electricity[i] / w.electricity_generation[i];
  assert.ok(other > 0.05 && other < 2);
});
