// From cell to grid: modules, strings, arrays, bypass diodes, MPPT, inverter
// sizing and clipping. Pure functions, SI units unless the name says otherwise.
//
// Building blocks are the single-diode cell from pv.js. Identical cells in series
// add voltage at a shared current; identical strings in parallel add current at a
// shared voltage. Mismatch (shading) is handled explicitly by solving each group's
// voltage at the string current, with a bypass diode clamping a group at −Vd.
//
// References
//   [Grn]  M. A. Green, Prog. Photovolt. 11, 333 (2003), doi:10.1002/pip.496:
//          I0 ∝ T³·exp(−Eg0/kT), which makes Voc fall about 2 mV/K per silicon cell.
//   [PVE]  PVEducation (Honsberg & Bowden): Isc rises about 0.06 %/K; bypass diodes;
//          NOCT test conditions (800 W/m², 20 °C air, 1 m/s wind).
//   [E&C]  Esram & Chapman, IEEE Trans. Energy Convers. 22, 439 (2007): perturb and observe.
//   [P&A]  Patel & Agarwal, IEEE Trans. Ind. Electron. 55, 1689 (2008): multiple peaks under
//          partial shading and global search.
//   [NEC]  NFPA 70 §690.7: string voltage must be corrected to the lowest expected temperature.
//   [PVE2] PVEducation, anti-reflection coatings: d = λ0/(4·n1), n1 = √(n0·n2), silicon n ≈ 3.5.

import { KB, Q } from './constants.js';
import { diodeCurrent, openCircuitVoltage, shortCircuitCurrent, maxPowerPoint, siliconCell } from './pv.js';

export const T_STC_C = 25;
const K0 = 273.15;
const EG0 = 1.2;       // silicon band gap extrapolated to 0 K, eV [Grn, PVE]
const GAMMA = 3;       // temperature exponent of I0 [Grn]
const ALPHA_ISC = 0.0006; // per K [PVE]

// ---------- series and parallel ----------

/** Voltages of identical elements in series add: n × V. */
export const seriesVoltage = (n, v) => n * v;
/** Currents of identical elements in parallel add: m × I. */
export const parallelCurrent = (m, i) => m * i;

// ---------- a cell at any temperature and irradiance ----------

/**
 * Diode parameters of the site's reference silicon cell (pv.siliconCell) at a cell
 * temperature (°C) and irradiance (W/m²). I0 follows T³·exp(−Eg0/kT) [Grn]; the
 * photocurrent scales with irradiance and rises 0.06 %/K [PVE].
 */
export function cellAt({ tempC = T_STC_C, irradiance = 1000, areaCm2 = 243 } = {}) {
  const ref = siliconCell({ areaCm2, suns: 1 });
  const T = tempC + K0; const Tr = T_STC_C + K0;
  const I0 = ref.I0 * (T / Tr) ** GAMMA * Math.exp(((EG0 * Q) / KB) * (1 / Tr - 1 / T));
  const Iph = ref.Iph * (irradiance / 1000) * (1 + ALPHA_ISC * (T - Tr));
  return { ...ref, Iph, I0, T };
}

/** Summary of a cell: { Voc, Isc, Vmp, Imp, Pmax } (V, A, W). */
export function cellSummary(opts = {}) {
  const p = cellAt(opts);
  const mpp = maxPowerPoint(p);
  return { Voc: openCircuitVoltage(p), Isc: shortCircuitCurrent(p), Vmp: mpp.V, Imp: mpp.I, Pmax: mpp.P };
}

// ---------- module ----------

/** Full-size cell area used for modules, cm² (an M10-class 182 mm pseudo-square wafer is about 330 cm²). */
export const FULL_CELL_CM2 = 330;

/**
 * How the cells in a module are wired. Full cells: all `cells` in one series chain.
 * Half-cut cells: the module is two halves in parallel, each a series chain of cells/2
 * half cells, so voltage matches the full-cell module and current per chain halves.
 */
export function moduleLayout(cells, halfCut = false) {
  return halfCut ? { series: cells / 2, parallel: 2, cellAreaCm2: FULL_CELL_CM2 / 2 } : { series: cells, parallel: 1, cellAreaCm2: FULL_CELL_CM2 };
}

/**
 * Module electrical summary at a cell temperature and irradiance:
 * { Voc, Isc, Vmp, Imp, Pmax, series, parallel } from identical cells (no mismatch).
 */
export function moduleAt({ cells = 144, halfCut = true, tempC = T_STC_C, irradiance = 1000 } = {}) {
  const lay = moduleLayout(cells, halfCut);
  const c = cellSummary({ tempC, irradiance, areaCm2: lay.cellAreaCm2 });
  return {
    Voc: seriesVoltage(lay.series, c.Voc), Vmp: seriesVoltage(lay.series, c.Vmp),
    Isc: parallelCurrent(lay.parallel, c.Isc), Imp: parallelCurrent(lay.parallel, c.Imp),
    Pmax: lay.series * lay.parallel * c.Pmax, series: lay.series, parallel: lay.parallel, cell: c,
  };
}

/** Module at standard test conditions (1000 W/m², 25 °C). */
export const moduleStc = (opts = {}) => moduleAt({ ...opts, tempC: T_STC_C, irradiance: 1000 });

/** Relative temperature coefficient of a quantity, %/K, by central difference on the diode model. */
export function temperatureCoefficient(field, opts = {}) {
  const a = moduleAt({ ...opts, tempC: 15 })[field]; const b = moduleAt({ ...opts, tempC: 35 })[field];
  return (100 * (b - a)) / (moduleAt({ ...opts, tempC: 25 })[field] * 20);
}

/** Linear temperature correction used on datasheets: X(T) = X_STC · (1 + coeff%/100 · (T − 25 °C)). */
export const atTemperature = (xStc, coeffPctPerC, tempC) => xStc * (1 + (coeffPctPerC / 100) * (tempC - T_STC_C));

/** Cell temperature from air temperature and plane-of-array irradiance with the NOCT model [PVE]. */
export const cellTempC = (ambientC, poa, noctC = 45) => ambientC + ((noctC - 20) / 800) * poa;

// ---------- strings and arrays ----------

/** A string of `n` identical modules in series. */
export const stringOf = (m, n) => ({ Voc: n * m.Voc, Vmp: n * m.Vmp, Isc: m.Isc, Imp: m.Imp, Pmax: n * m.Pmax });
/** An array of `p` identical strings in parallel. */
export const arrayOf = (s, p) => ({ Voc: s.Voc, Vmp: s.Vmp, Isc: p * s.Isc, Imp: p * s.Imp, Pmax: p * s.Pmax });

/**
 * Open-circuit voltage of a string on the coldest expected morning [NEC 690.7], using a
 * datasheet-style linear coefficient (%/°C, negative for silicon).
 */
export const coldStringVoc = (moduleVocStc, modulesInSeries, betaVocPctPerC, tMinC) =>
  modulesInSeries * atTemperature(moduleVocStc, betaVocPctPerC, tMinC);

/** DC/AC ratio (also called inverter loading ratio): array kWp ÷ inverter AC kW. */
export const dcAcRatio = (arrayKWp, inverterKW) => arrayKWp / inverterKW;

/** Module temperature coefficients from the diode model, %/K: { voc, vmp, pmax }. */
export const moduleCoefficients = (opts = {}) => ({
  voc: temperatureCoefficient('Voc', opts), vmp: temperatureCoefficient('Vmp', opts), pmax: temperatureCoefficient('Pmax', opts),
});

/**
 * Design checks for one string inverter.
 * module = { Voc, Vmp, Isc, Pmax } at STC; coeff = { voc, vmp } in %/K;
 * inverter = { acKW, vMax, mpptMin, mpptMax, iscMax }.
 * Returns { vocCold, vmpHot, vmpCold, iscDesign, kWp, ratio, checks: [{ id, level, value, limit }] }.
 * The design current adds 25 % to Isc for bright edge-of-cloud light, as many codes do.
 */
export function designChecks({ module, coeff, series, parallel, inverter, tMinC = -10, tHotCellC = 70 }) {
  const vocCold = coldStringVoc(module.Voc, series, coeff.voc, tMinC);
  const vmpHot = series * atTemperature(module.Vmp, coeff.vmp, tHotCellC);
  const vmpCold = series * atTemperature(module.Vmp, coeff.vmp, tMinC);
  const iscDesign = parallel * module.Isc * 1.25;
  const kWp = (series * parallel * module.Pmax) / 1000;
  const ratio = dcAcRatio(kWp, inverter.acKW);
  const checks = [
    { id: 'vmax', level: vocCold > inverter.vMax ? 'error' : vocCold > 0.97 * inverter.vMax ? 'warn' : 'ok', value: vocCold, limit: inverter.vMax },
    { id: 'mppt-low', level: vmpHot < inverter.mpptMin ? 'warn' : 'ok', value: vmpHot, limit: inverter.mpptMin },
    { id: 'mppt-high', level: vmpCold > inverter.mpptMax ? 'warn' : 'ok', value: vmpCold, limit: inverter.mpptMax },
    { id: 'current', level: iscDesign > inverter.iscMax ? 'error' : 'ok', value: iscDesign, limit: inverter.iscMax },
    { id: 'dcac', level: ratio > 1.5 || ratio < 0.8 ? 'warn' : 'ok', value: ratio, limit: ratio > 1.5 ? 1.5 : 0.8 },
  ];
  return { vocCold, vmpHot, vmpCold, iscDesign, kWp, ratio, checks };
}

// ---------- clipping ----------

/**
 * Integrate a DC power series through an inverter with an AC limit.
 * dcKW: array of DC powers (kW), stepH: hours per sample, eta: inverter efficiency.
 * Returns { dcKWh, acKWh, clippedKWh, clippedFraction, acKW[] }.
 */
export function clippingIntegral(dcKW, stepH, acLimitKW, eta = 1) {
  let dc = 0; let ac = 0; let clipped = 0; const acKW = [];
  for (const p of dcKW) {
    const avail = Math.max(0, p) * eta;
    const out = Math.min(avail, acLimitKW);
    dc += Math.max(0, p) * stepH; ac += out * stepH; clipped += (avail - out) * stepH; acKW.push(out);
  }
  return { dcKWh: dc, acKWh: ac, clippedKWh: clipped, clippedFraction: dc > 0 ? clipped / (dc * eta) : 0, acKW };
}

/**
 * Closed form for a half-sine day, P(t) = Ppk·sin(πt/D), clipped at Pac (eta = 1).
 * Total = 2·Ppk·D/π. Clipped = (2D/π)·(Ppk·cos θ − Pac·(π/2 − θ)), θ = asin(Pac/Ppk).
 */
export function sineDayClipping(peakKW, acKW, dayH) {
  const total = (2 * peakKW * dayH) / Math.PI;
  if (acKW >= peakKW) return { totalKWh: total, clippedKWh: 0, clippedFraction: 0 };
  const th = Math.asin(acKW / peakKW);
  const clipped = ((2 * dayH) / Math.PI) * (peakKW * Math.cos(th) - acKW * (Math.PI / 2 - th));
  return { totalKWh: total, clippedKWh: clipped, clippedFraction: clipped / total };
}

/**
 * DC power of an array over a day from a plane-of-array trace (solar.dailyInsolation().trace):
 * P = kWp × G/1000 × (1 + γ·(Tcell − 25)) × (1 − otherLosses). Returns kW per sample.
 */
export function dcPowerTrace(trace, { kWp, gammaPctPerC = -0.3, ambientC = 20, noctC = 45, otherLosses = 0.1 }) {
  return trace.map((s) => {
    const g = Math.max(0, s.poa);
    if (g === 0) return 0;
    const tc = cellTempC(ambientC, g, noctC);
    return kWp * (g / 1000) * atTemperature(1, gammaPctPerC, tc) * (1 - otherLosses);
  });
}

// ---------- mismatch: bypass diodes and multi-peak P-V curves ----------

/** Voltage of a cell (diode params p) carrying current I, including reverse bias through the shunt. Exact, by bisection. */
export function cellVoltageAt(I, p) {
  const voc = openCircuitVoltage({ ...p, Iph: Math.max(p.Iph, 1e-9) });
  let lo = -(Math.abs(I) + 1) * (Number.isFinite(p.Rsh) ? p.Rsh : 1e3) - 1; let hi = voc + 0.05;
  for (let k = 0; k < 100; k++) { // diodeCurrent falls as V rises
    const mid = (lo + hi) / 2;
    if (diodeCurrent(mid, p) > I) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Tabulate a cell's I-V curve from deep reverse bias to Voc so V(I) can be read by
 * interpolation (fast enough to redraw a string curve while a slider moves).
 * Returns a function I -> V.
 */
export function cellVoltageTable(p, iMax) {
  const voc = openCircuitVoltage({ ...p, Iph: Math.max(p.Iph, 1e-9) });
  const vLow = -((iMax + 1) * (Number.isFinite(p.Rsh) ? p.Rsh : 1e3) + 1);
  const Vs = [];
  for (let k = 0; k <= 40; k++) Vs.push(vLow + ((0 - vLow) * k) / 40);
  for (let k = 1; k <= 400; k++) Vs.push((voc * k) / 400);
  const Is = Vs.map((v) => diodeCurrent(v, p)); // decreasing in V
  return (I) => {
    if (I >= Is[0]) return Vs[0] + ((Vs[1] - Vs[0]) * (I - Is[0])) / (Is[1] - Is[0]);
    if (I <= Is[Is.length - 1]) return voc;
    let lo = 0; let hi = Is.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (Is[mid] > I) lo = mid; else hi = mid; }
    return Vs[lo] + ((Vs[hi] - Vs[lo]) * (I - Is[lo])) / (Is[hi] - Is[lo]);
  };
}

function groupSolver({ cells, shaded = 0, shade = 0, irradiance, tempC, areaCm2, vD }) {
  const lit = cellAt({ tempC, irradiance, areaCm2 });
  const dim = cellAt({ tempC, irradiance: irradiance * (1 - shade), areaCm2 });
  const iMax = shortCircuitCurrent(lit) * 1.05;
  const vLit = cellVoltageTable(lit, iMax); const vDim = shaded ? cellVoltageTable(dim, iMax) : vLit;
  const vGroup = (i) => (cells - shaded) * vLit(i) + shaded * vDim(i);
  return (I) => {
    const v = vGroup(I);
    if (v >= -vD) return { V: v, Icells: I, Idiode: 0, Vshaded: vDim(I), bypassed: false };
    let lo = 0; let hi = I; // diode conducts: group clamped at −vD
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (vGroup(mid) > -vD) lo = mid; else hi = mid; }
    const ic = (lo + hi) / 2;
    return { V: -vD, Icells: ic, Idiode: I - ic, Vshaded: vDim(ic), bypassed: true };
  };
}

/**
 * One bypass-diode group of `cells` cells in series, `shaded` of them receiving only
 * (1 − shade) of the light, protected by a bypass diode with forward drop vD [PVE].
 * At string current I it returns { V, Icells, Idiode, Vshaded, bypassed }.
 */
export function groupAt(I, { cells = 24, shaded = 0, shade = 0, irradiance = 1000, tempC = T_STC_C, areaCm2 = FULL_CELL_CM2, vD = 0.5 } = {}) {
  return groupSolver({ cells, shaded, shade, irradiance, tempC, areaCm2, vD })(I);
}

/**
 * P-V curve of a series string of bypass-diode groups. groups: [{ cells, shaded, shade }].
 * Sweeps the string current from 0 to the brightest cell's Isc. Returns [{ V, I, P }] sorted by V.
 * A classic 72-cell module is three groups of 24 cells, one bypass diode each.
 */
export function stringCurve(groups, { irradiance = 1000, tempC = T_STC_C, areaCm2 = FULL_CELL_CM2, vD = 0.5, N = 200 } = {}) {
  const iMax = shortCircuitCurrent(cellAt({ tempC, irradiance, areaCm2 }));
  const solvers = groups.map((g) => groupSolver({ irradiance, tempC, areaCm2, vD, cells: 24, ...g }));
  const pts = [];
  for (let k = 0; k <= N; k++) {
    const I = iMax * (1 - ((1 - k / N) ** 2)) ; // denser near Isc where the knees are
    const V = solvers.reduce((s, f) => s + f(I).V, 0);
    if (V >= 0) pts.push({ V, I, P: V * I });
  }
  pts.sort((a, b) => a.V - b.V);
  return pts;
}

/** Linear interpolation of P at voltage V on a curve from stringCurve. */
export function powerAtV(curve, V) {
  if (V <= curve[0].V) return curve[0].P;
  const last = curve[curve.length - 1];
  if (V >= last.V) return 0;
  let lo = 0; let hi = curve.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (curve[mid].V <= V) lo = mid; else hi = mid; }
  const a = curve[lo]; const b = curve[hi]; const t = b.V > a.V ? (V - a.V) / (b.V - a.V) : 0;
  return a.P + t * (b.P - a.P);
}

/** Local maxima of power on a curve (sorted by V): [{ V, P }], highest first. */
export function powerPeaks(curve) {
  const peaks = [];
  for (let i = 1; i < curve.length - 1; i++) {
    if (curve[i].P >= curve[i - 1].P && curve[i].P > curve[i + 1].P) peaks.push({ V: curve[i].V, P: curve[i].P });
  }
  return peaks.sort((a, b) => b.P - a.P);
}

/**
 * One step of perturb and observe [E&C]: move the operating voltage by ±dV; if power
 * fell, reverse direction. state = { V, P, dir }. Returns the next state.
 */
export function perturbObserve(state, pAt, dV) {
  const V = state.V + state.dir * dV;
  const P = pAt(V);
  return { V, P, dir: P < state.P ? -state.dir : state.dir };
}

/** Run perturb and observe for `steps` steps from V0. Returns the list of states. */
export function runPerturbObserve(pAt, V0, dV, steps) {
  let s = { V: V0, P: pAt(V0), dir: -1 };
  const out = [s];
  for (let k = 0; k < steps; k++) { s = perturbObserve(s, pAt, dV); out.push(s); }
  return out;
}

/** Global scan [P&A]: sample the whole voltage range and return the best { V, P }. */
export function globalScan(pAt, vMax, samples = 40) {
  let best = { V: 0, P: -Infinity };
  for (let k = 1; k < samples; k++) { const V = (vMax * k) / samples; const P = pAt(V); if (P > best.P) best = { V, P }; }
  return best;
}

// ---------- small helpers used by the lesson text ----------

/** Resistive (ohmic) loss in a conductor, watts: P = I²R. */
export const ohmicLossW = (I, R) => I * I * R;

/** Largest number of modules in series whose cold-morning Voc stays at or below vMax. */
export const maxModulesInSeries = (vMax, moduleVocStc, betaVocPctPerC, tMinC) =>
  Math.floor(vMax / atTemperature(moduleVocStc, betaVocPctPerC, tMinC) + 1e-9);

/** Ideal single-layer anti-reflection coating index between media n0 and n2: n1 = √(n0·n2) [PVE]. */
export const idealArcIndex = (n0, n2) => Math.sqrt(n0 * n2);

/** Quarter-wave anti-reflection coating thickness, nm: d = λ0 / (4·n1) [PVE]. */
export const quarterWaveThicknessNm = (lambdaNm, n1) => lambdaNm / (4 * n1);

/** Energy over a year from a list of { kwh (per day), days }: Σ kwh·days. */
export const yearlyFromMonthly = (months) => months.reduce((s, m) => s + m.kwh * m.days, 0);
