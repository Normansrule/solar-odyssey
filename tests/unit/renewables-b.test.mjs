// Tests for the physics behind the clean-energy overview, biomass, CSP, storage and grid pages:
// physics/grid.js (dispatch toy model, frequency after a trip), physics/csp.js (heliostat geometry,
// tower day model) and physics/bio.js (carbon bookkeeping).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../../site/assets/js/physics/grid.js';
import * as c from '../../site/assets/js/physics/csp.js';
import * as b from '../../site/assets/js/physics/bio.js';
import * as rn from '../../site/assets/js/physics/renewables.js';
import { clearSky } from '../../site/assets/js/physics/solar.js';

const close = (a, e, tol, msg = '') => assert.ok(Math.abs(a - e) <= tol, `${msg} got ${a}, want ${e} ± ${tol}`);
const sum = (a) => a.reduce((s, x) => s + x, 0);

// ---------- grid.js ----------

test('dispatch: hand-checked four-hour example', () => {
  const r = g.dispatchDay({ demand: [100, 100, 100, 100], renewable: [200, 200, 0, 0], powerMW: 100, energyMWh: 200, rte: 0.81 });
  close(r.totals.chargedMWh, 200, 1e-9);
  close(r.totals.dischargedMWh, 162, 1e-9, 'only 81 % comes back');
  close(r.totals.lossesMWh, 38, 1e-9);
  close(r.totals.unmetMWh, 38, 1e-9);
  close(r.totals.renewableShare, 0.905, 1e-9);
  close(g.toyShare({ demand: [100, 100, 100, 100], renewable: [200, 200, 0, 0], powerMW: 100, energyMWh: 200, rte: 0.81 }), 0.905, 1e-12);
});

test('dispatch: energy is conserved hour by hour', () => {
  const hours = g.hoursOfDay(24);
  const demand = g.demandShape(hours).map((d) => 1000 * d);
  const sol = g.solarShape(hours, { lat: 35, month: 6 }).map((s) => 1500 * s);
  const wind = g.windShape(hours).map((w) => 300 * w);
  const renewable = sol.map((s, i) => s + wind[i]);
  const r = g.dispatchDay({ demand, renewable, powerMW: 400, energyMWh: 1600, rte: 0.85, flexMW: 100 });
  for (let i = 0; i < 24; i += 1) {
    // supply side: renewable = served directly + charged + curtailed
    close(r.direct[i] + r.charge[i] + r.curtailed[i], renewable[i], 1e-6, `renewable balance h${i}`);
    // demand side: (shifted) load = direct + discharge + unmet
    close(r.direct[i] + r.discharge[i] + r.unmet[i], r.load[i], 1e-6, `load balance h${i}`);
    assert.ok(r.charge[i] <= 400 + 1e-9 && r.discharge[i] <= 400 + 1e-9, 'power limit');
    assert.ok(r.soc[i] >= -1e-9 && r.soc[i] <= 1600 + 1e-6, 'energy limit');
    assert.ok(!(r.charge[i] > 0 && r.discharge[i] > 0), 'never charge and discharge in the same hour');
  }
  close(sum(r.load), sum(demand), 1e-6, 'flexible demand moves energy, it does not remove it');
  close(r.socEnd, r.socStart, 1e-3, 'steady daily cycle');
  close(r.totals.chargedMWh * 0.85, r.totals.dischargedMWh, 1e-3, 'round-trip losses');
  assert.ok(r.totals.renewableShare > 0 && r.totals.renewableShare <= 1);
});

test('dispatch: more storage never lowers the renewable share, and no storage means no shifting', () => {
  const hours = g.hoursOfDay(24);
  const demand = g.demandShape(hours).map((d) => 1000 * d);
  const renewable = g.solarShape(hours, { lat: 35, month: 4 }).map((s) => 2500 * s);
  const none = g.dispatchDay({ demand, renewable });
  assert.equal(none.totals.dischargedMWh, 0);
  let prev = none.totals.renewableShare;
  for (const e of [500, 1000, 2000, 4000]) {
    const r = g.dispatchDay({ demand, renewable, powerMW: 1000, energyMWh: e, rte: 0.85 });
    assert.ok(r.totals.renewableShare >= prev - 1e-12, `share at ${e} MWh`);
    assert.ok(r.totals.curtailedMWh <= none.totals.curtailedMWh + 1e-9);
    prev = r.totals.renewableShare;
  }
  const perfect = g.dispatchDay({ demand, renewable, powerMW: 1e6, energyMWh: 1e6, rte: 1 });
  close(perfect.totals.renewableShare, 1, 1e-9, 'lossless unlimited storage with surplus covers everything');
});

test('flexible demand shifts load into surplus hours only', () => {
  const r = g.shiftDemand([100, 100, 100], [200, 50, 100], 30);
  close(r.shiftedMWh, 30, 1e-12);
  assert.deepEqual(r.demand.map((x) => Math.round(x)), [130, 70, 100]);
  assert.deepEqual(g.shiftDemand([1, 2], [1, 2], 10).demand, [1, 2]);
});

test('shapes are normalised and solar is zero at night', () => {
  const hours = g.hoursOfDay(24);
  const s = g.solarShape(hours, { lat: 35, month: 6 });
  close(Math.max(...s), 1, 1e-12);
  assert.equal(s[0], 0); assert.equal(s[23], 0);
  close(Math.max(...g.demandShape(hours)), 1, 1e-12);
  const evening = g.demandShape(hours)[19];
  assert.ok(evening > g.demandShape(hours)[12], 'evening peak above midday');
  close(sum(g.windShape(hours)) / 24, 1, 1e-9);
});

test('frequency after a trip: initial RoCoF matches the swing equation, nadir is below nominal', () => {
  const r = g.frequencyAfterTrip({ deltaPMW: 1000, H: 4, S: 50000, f0: 50 });
  close(r.rocof0, -rn.rocof(1000, 4, 50000, 50), 1e-12);
  close((r.f[1] - r.f[0]) / 0.01, -0.125, 1e-9);
  assert.ok(r.nadir < 50 && r.nadir > 49);
  const low = g.frequencyAfterTrip({ deltaPMW: 1000, H: 2, S: 50000, f0: 50 });
  assert.ok(low.nadir < r.nadir, 'less inertia, deeper dip');
  close(g.maxRamp([0, 1, 5, 9, 9], 2), 8, 1e-12);
});

test('duck-curve figures quoted in the grid page caption match the model', () => {
  const hours = g.hoursOfDay(24);
  const demand = g.demandShape(hours).map((d) => d * 1000);
  const sun = g.solarShape(hours, { lat: 35, month: 4 });
  close(g.maxRamp(demand, 3), 230, 10, 'no-solar ramp');
  const net3 = demand.map((d, i) => d - 3000 * sun[i]);
  close(Math.min(...net3), -2200, 60, 'midday surplus');
  close(g.maxRamp(net3, 3), 2060, 10, 'three-hour ramp with 3 GW of solar');
});

// ---------- csp.js ----------

test('heliostat normal bisects the sun and receiver directions (law of reflection)', () => {
  for (const [el, az, m] of [[40, 120, [50, -120, 0]], [15, 250, [-300, 80, 0]], [70, 180, [0, 200, 0]]]) {
    const s = c.sunVector(el, az); const rcv = [0, 0, 140];
    const n = c.heliostatNormal(s, m, rcv);
    close(c.norm(n), 1, 1e-12);
    const reflected = c.reflect(s.map((x) => -x), n);
    const toRcv = c.unit(c.sub(rcv, m));
    for (let i = 0; i < 3; i += 1) close(reflected[i], toRcv[i], 1e-12, 'reflected ray hits the receiver');
    close(c.dot(s, n), c.dot(toRcv, n), 1e-12, 'equal angles');
  }
  close(c.norm(c.sunVector(30, 90)), 1, 1e-12);
  const up = c.sunVector(90, 0); close(up[2], 1, 1e-12);
});

test('cosine efficiency: a north-field mirror beats a south-field mirror at noon in the northern hemisphere', () => {
  const north = c.cosineEfficiencyAt(60, 180, 0, 200, 150);
  const south = c.cosineEfficiencyAt(60, 180, 0, -200, 150);
  close(north, 0.980, 0.001); close(south, 0.748, 0.001);
  assert.ok(north > south);
  const att = c.mirrorAttitude(c.sunVector(60, 180), [0, 200, 0], [0, 0, 150]);
  close(att.facingDeg, 180, 1e-9); assert.ok(att.tiltDeg > 0 && att.tiltDeg < 90);
});

test('tower day: storage stretches running hours, energy bookkeeping closes', () => {
  const dt = 0.25; const dni = [];
  for (let i = 0; i < 96; i += 1) dni.push(clearSky(new Date(Date.UTC(2025, 5, 21) + (i + 0.5) * dt * 3600e3), 37.56, 0).dni);
  const base = { dni, dt, fieldM2: 318000, ratedMWe: 20, etaCycle: 0.4 };
  const none = c.towerDay({ ...base, storageH: 0 });
  const big = c.towerDay({ ...base, storageH: 15 });
  assert.ok(big.fullLoadHours > none.fullLoadHours + 6);
  close(big.fullLoadHours, 24, 1e-9, 'a summer day with 15 h of storage runs round the clock');
  for (const r of [none, big]) {
    close(r.collectedMWhTh, r.spilledMWhTh + r.electricMWh / 0.4, 1e-3, 'heat in = heat spilled + heat used (steady cycle)');
    assert.ok(r.level.every((x) => x >= -1e-9 && x <= 1 + 1e-9));
  }
});

test('CSP worked examples on csp.html', () => {
  close(rn.concentrationRatio(120000, 150), 800, 1e-9);
  close(rn.carnotEfficiency(565 + 273.15, 30 + 273.15), 0.638, 0.001);
  close(rn.sensibleHeatJ(1e6, 1500, 275), 4.125e11, 1);
});

// ---------- bio.js ----------

test('biomass: stored energy and CO2 from carbon', () => {
  close(b.storedEnergyKWh(1800, 0.01, 1), 18, 1e-9);
  close(b.co2FromCarbonKg(1), 3.664, 0.001);
  close(rn.roundTrip(0.01, 0.3), 0.003, 1e-12);
});

test('biomass carbon loop: fossil adds everything, full regrowth adds nothing, BECCS removes, debt adds once', () => {
  close(b.carbonToAir({ burnt: 1, fossil: true, cycles: 10 }).air, 10, 1e-12);
  close(b.carbonToAir({ burnt: 1, regrowth: 1, cycles: 10 }).air, 0, 1e-12);
  close(b.carbonToAir({ burnt: 1, regrowth: 1, captured: 0.9, cycles: 10 }).air, -9, 1e-12);
  close(b.carbonToAir({ burnt: 1, regrowth: 0.5, cycles: 4 }).air, 2, 1e-12);
  const debt = b.carbonToAir({ burnt: 1, regrowth: 1, debt: 5, cycles: 3 });
  assert.deepEqual(debt.series, [0, 5, 5, 5]);
});
