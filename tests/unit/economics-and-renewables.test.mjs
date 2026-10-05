import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ec from '../../site/assets/js/physics/econ.js';
import * as rn from '../../site/assets/js/physics/renewables.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, want ${b} ± ${tol}`);

test('capacity factor', () => {
  close(ec.capacityFactor(2190, 1), 0.25, 1e-12);
  close(ec.annualEnergyMWh(100, 0.35), 306600, 1e-6);
});

test('LCOE annuity method equals discounted cash flow', () => {
  const inp = { capex: 1000, fixedOM: 20, cf: 0.25, r: 0.05, n: 25 };
  const a = ec.lcoe(inp);
  const costs = [inp.capex * 1000, ...Array(25).fill(inp.fixedOM * 1000)];
  const energy = [0, ...Array(25).fill(8.76 * inp.cf * 1000)];
  close(a, ec.lcoeDiscounted(costs, energy, inp.r), 1e-9);
  close(a, 41.53, 0.01);
  close(ec.capitalRecoveryFactor(0, 20), 0.05, 1e-12);
});

test("Wright's law", () => {
  close(ec.wrightsLaw(100, 0.2, 3), 51.2, 1e-9);
  close(ec.impliedLearningRate(1, 100, 8, 51.2), 0.2, 1e-9);
});

test('wind: Betz limit is the maximum of the actuator-disc Cp', () => {
  close(rn.BETZ, 0.592593, 1e-6);
  close(rn.actuatorDiscCp(1 / 3), rn.BETZ, 1e-12);
  for (const a of [0.2, 0.3, 0.36, 0.5]) assert.ok(rn.actuatorDiscCp(a) <= rn.BETZ + 1e-12);
  close(rn.kineticPower(1.225, 1, 10), 612.5, 1e-9);
  close(rn.airDensity(101325, 288.15), 1.225, 0.001);
  close(rn.rotorPower(1.225, 120, 10, rn.BETZ) / 1e6, 4.105, 0.001);
});

test('turbine power curve and Rayleigh capacity factor', () => {
  const c = { ratedW: 3e6 };
  assert.equal(rn.turbinePowerCurve(2, c), 0);
  assert.equal(rn.turbinePowerCurve(15, c), 3e6);
  assert.equal(rn.turbinePowerCurve(26, c), 0);
  let s = 0; for (let v = 0.005; v < 60; v += 0.01) s += rn.rayleighPdf(v, 7) * 0.01;
  close(s, 1, 1e-3, 'pdf integrates to 1');
  const cf = rn.turbineCapacityFactor(7.5, c);
  assert.ok(cf > 0.25 && cf < 0.45, `cf ${cf}`);
});

test('hydro, ocean, heat engines, storage', () => {
  close(rn.hydroPower(100, 50, 0.9) / 1e6, 44.13, 0.01);
  close(rn.liftedWaterEnergyJ(1, 100) / 3.6e6, 0.2724, 1e-4);
  close(rn.waveEnergyFlux(2, 8), 15689, 1);
  close(rn.tidalBasinEnergyJ(1e6, 5), 1.2566e11, 1e8);
  close(rn.carnotEfficiency(473.15, 303.15), 0.3593, 1e-4);
  close(rn.roundTrip(0.7, 0.55), 0.385, 1e-12);
  close(rn.storageDurationH(400, 100), 4, 1e-12);
  close(rn.hydrogenEnergyJ(1) / 3.6e6, 33.33, 0.01);
});
