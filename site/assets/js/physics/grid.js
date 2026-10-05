// A toy model of balancing a day on an electricity grid.
// Pure functions, no DOM. Used by renewables/storage.html ("a day on a solar grid")
// and renewables/grid.html (the balancing game). Tested in tests/unit/renewables-b.test.mjs.
//
// Honesty note: real grid operators run security-constrained unit commitment and
// economic dispatch with network limits, reserves and forecasts. This model keeps
// only the energy bookkeeping: hour by hour, renewables serve demand first, flexible
// demand moves within the day, a store charges from surplus and discharges into deficit,
// and whatever is left is curtailment (surplus) or "other supply needed" (deficit).

import { clearSky } from './solar.js';

const TAU = 2 * Math.PI;

/** Hour-of-day sample points: n steps covering 0..24 h, sampled at the middle of each step. */
export const hoursOfDay = (steps = 24) => Array.from({ length: steps }, (_, i) => (i + 0.5) * (24 / steps));

/**
 * Clear-sky solar output shape (0..1, peak = 1) for a site and date, from this site's
 * sun-position model. Local solar time is used (longitude 0, so UTC ≈ solar time).
 * `month` 1–12, `day` 1–31.
 */
export function solarShape(hours, { lat = 35, month = 4, day = 15, year = 2025 } = {}) {
  const ghi = hours.map((h) => {
    const t = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + h * 3600e3);
    return clearSky(t, lat, 0).ghi;
  });
  const peak = Math.max(...ghi);
  return ghi.map((g) => (peak > 0 ? g / peak : 0));
}

/**
 * Illustrative demand shape (0..1, peak = 1): a night-time trough, a morning rise and a
 * larger evening peak around 19:00, the pattern many grids see on a spring day.
 * Not measured data.
 */
export function demandShape(hours) {
  const raw = hours.map((h) => 0.62
    + 0.12 * Math.exp(-(((h - 8.5) / 2.2) ** 2))
    + 0.08 * Math.exp(-(((h - 13) / 3.5) ** 2))
    + 0.30 * Math.exp(-(((h - 19.2) / 2.1) ** 2))
    - 0.06 * Math.exp(-(((h - 3.5) / 2.5) ** 2)));
  const peak = Math.max(...raw);
  return raw.map((d) => d / peak);
}

/**
 * Illustrative wind shape (average 1, so multiply by average output): a little stronger at
 * night than in the afternoon, as at many inland sites. Not measured data.
 */
export function windShape(hours) {
  return hours.map((h) => 1 + 0.25 * Math.cos(TAU * (h - 2) / 24));
}

/**
 * Flexible demand: up to flexMW of demand can move from hours short of supply into hours
 * with surplus, within the same day, so total demand is unchanged. Returns the adjusted
 * demand array and the energy moved (MWh).
 */
export function shiftDemand(demand, supply, flexMW, dt = 1) {
  const n = demand.length;
  const out = demand.slice();
  if (!(flexMW > 0)) return { demand: out, shiftedMWh: 0 };
  let canDrop = 0; let canAdd = 0;
  const drop = new Array(n).fill(0); const add = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const net = supply[i] - demand[i];
    if (net < 0) { drop[i] = Math.min(flexMW, -net, demand[i]); canDrop += drop[i] * dt; }
    else if (net > 0) { add[i] = Math.min(flexMW, net); canAdd += add[i] * dt; }
  }
  const moved = Math.min(canDrop, canAdd);
  if (moved <= 0) return { demand: out, shiftedMWh: 0 };
  for (let i = 0; i < n; i += 1) {
    if (drop[i]) out[i] -= drop[i] * (moved / canDrop);
    if (add[i]) out[i] += add[i] * (moved / canAdd);
  }
  return { demand: out, shiftedMWh: moved };
}

/**
 * Run one day of dispatch.
 *   demand, renewable: arrays in MW (same length), step length dt hours.
 *   powerMW, energyMWh: storage power and energy limits; rte: round-trip efficiency (0–1),
 *   split evenly between charging and discharging (√rte each way).
 *   flexMW: flexible demand that can move within the day.
 * The day is repeated until the store starts and ends it at the same charge (a steady daily cycle).
 * Returns hourly series and daily totals (MWh), including the renewable share of demand.
 */
export function dispatchDay({ demand, renewable, powerMW = 0, energyMWh = 0, rte = 0.85, flexMW = 0, dt = 1 }) {
  const n = demand.length;
  if (renewable.length !== n) throw new Error('demand and renewable must have the same length');
  const { demand: load, shiftedMWh } = shiftDemand(demand, renewable, flexMW, dt);
  const eta = Math.sqrt(Math.max(0, Math.min(1, rte)));
  const P = Math.max(0, powerMW); const E = Math.max(0, energyMWh);
  let soc0 = 0; let res;
  for (let iter = 0; iter < 20; iter += 1) {
    res = runOnce(load, renewable, P, E, eta, soc0, dt);
    if (Math.abs(res.socEnd - soc0) < 1e-6 * Math.max(1, E)) break;
    soc0 = res.socEnd;
  }
  const sum = (a) => a.reduce((s, x) => s + x * dt, 0);
  const demandMWh = sum(demand);
  const renewableMWh = sum(renewable);
  const unmetMWh = sum(res.unmet);
  const curtailedMWh = sum(res.curtailed);
  return {
    ...res,
    load,
    totals: {
      demandMWh, renewableMWh, unmetMWh, curtailedMWh, shiftedMWh,
      chargedMWh: sum(res.charge), dischargedMWh: sum(res.discharge),
      lossesMWh: sum(res.charge) - sum(res.discharge),
      renewableShare: demandMWh > 0 ? (demandMWh - unmetMWh) / demandMWh : 0,
      curtailedShare: renewableMWh > 0 ? curtailedMWh / renewableMWh : 0,
      peakUnmetMW: Math.max(0, ...res.unmet),
    },
  };
}

function runOnce(load, renewable, P, E, eta, soc0, dt) {
  const n = load.length;
  const direct = []; const charge = []; const discharge = []; const soc = [];
  const curtailed = []; const unmet = [];
  let s = soc0;
  for (let i = 0; i < n; i += 1) {
    const net = renewable[i] - load[i];
    direct.push(Math.min(renewable[i], load[i]));
    if (net >= 0) {
      const pIn = eta > 0 ? Math.min(net, P, Math.max(0, E - s) / (eta * dt)) : 0;
      s += pIn * eta * dt;
      charge.push(pIn); discharge.push(0); curtailed.push(net - pIn); unmet.push(0);
    } else {
      const need = -net;
      const pOut = Math.min(need, P, (s * eta) / dt);
      s -= eta > 0 ? (pOut / eta) * dt : 0;
      if (s < 1e-12) s = 0;
      charge.push(0); discharge.push(pOut); curtailed.push(0); unmet.push(need - pOut);
    }
    soc.push(s);
  }
  return { direct, charge, discharge, soc, curtailed, unmet, socStart: soc0, socEnd: s };
}

/**
 * Frequency after the sudden loss of a generator (a simplified single-area model).
 *   deltaPMW: power lost; H: system inertia constant (s) on base S (MVA); f0: nominal frequency.
 *   Reserves ramp linearly to replace the lost power over rampS seconds; load damping D
 *   (per unit power per per unit frequency) slows the fall a little.
 * Swing equation: (2 H S / f0) df/dt = P_reserve(t) + D·S·(f0 − f)/f0 − ΔP.
 * Returns { t[], f[], rocof0 (Hz/s), nadir (Hz), tNadir (s) }.
 */
export function frequencyAfterTrip({ deltaPMW, H, S, f0 = 50, rampS = 10, D = 1, tEnd = 30, dt = 0.01 }) {
  const t = []; const f = [];
  let freq = f0; let nadir = f0; let tNadir = 0;
  for (let k = 0; k * dt <= tEnd + 1e-9; k += 1) {
    const time = k * dt;
    t.push(time); f.push(freq);
    if (freq < nadir) { nadir = freq; tNadir = time; }
    const reserve = deltaPMW * Math.min(1, time / rampS);
    const damping = D * S * (f0 - freq) / f0;
    const dfdt = ((reserve + damping - deltaPMW) * f0) / (2 * H * S);
    freq += dfdt * dt;
  }
  return { t, f, rocof0: -(deltaPMW * f0) / (2 * H * S), nadir, tNadir };
}

/** Evening ramp of net load (MW): the largest rise in demand − variable renewables over `windowH` hours. */
export function maxRamp(netLoad, windowH = 3, dt = 1) {
  const k = Math.max(1, Math.round(windowH / dt));
  let best = 0;
  for (let i = 0; i + k < netLoad.length; i += 1) best = Math.max(best, netLoad[i + k] - netLoad[i]);
  return best;
}

/** Four-step worked example used on the grid page (returns the renewable share). */
export const toyShare = (args) => dispatchDay(args).totals.renewableShare;
