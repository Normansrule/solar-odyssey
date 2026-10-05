// Photovoltaic physics used by the lessons, widgets and the test suite.
// Pure functions, SI units unless the name says otherwise.

import { H, C, Q, KB, HC_EV_NM, SIGMA, T_SUN, SUN_DILUTION } from './constants.js';

// ---------- photons ----------

/** Photon energy in electronvolts for a wavelength in nanometres: E = hc/λ. */
export const photonEnergyEV = (nm) => HC_EV_NM / nm;
/** Photon energy in joules for a wavelength in nanometres: E = hf = hc/λ. */
export const photonEnergyJ = (nm) => (H * C) / (nm * 1e-9);
/** Photon frequency in hertz for a wavelength in nanometres. */
export const frequencyHz = (nm) => C / (nm * 1e-9);
/** Longest wavelength (nm) a material with band gap Eg (eV) can absorb: λ = hc/Eg. */
export const cutoffWavelengthNm = (gapEV) => HC_EV_NM / gapEV;
/** True when a photon of this wavelength has at least the band-gap energy. */
export const isAbsorbed = (nm, gapEV) => photonEnergyEV(nm) >= gapEV;
/** Energy above the gap that is lost as heat (thermalisation), eV. Zero for sub-gap photons (not absorbed). */
export const excessEnergyEV = (nm, gapEV) => (isAbsorbed(nm, gapEV) ? photonEnergyEV(nm) - gapEV : 0);
/** Photons per second in a monochromatic beam of the given power (W) and wavelength (nm). */
export const photonRate = (powerW, nm) => powerW / photonEnergyJ(nm);

// ---------- the diode ----------

/** Thermal voltage kT/q in volts (≈ 25.7 mV at 25 °C). */
export const thermalVoltage = (T = 298.15) => (KB * T) / Q;

/**
 * Single-diode model: I = Iph − I0·(exp((V + I·Rs)/(n·Vt)) − 1) − (V + I·Rs)/Rsh
 * p = { Iph (A), I0 (A), n = 1, T = 298.15 K, Rs = 0 Ω, Rsh = Infinity Ω }.
 * Solved for I by Newton's method (explicit when Rs = 0).
 */
export function diodeCurrent(V, p) {
  const { Iph, I0, n = 1, T = 298.15, Rs = 0, Rsh = Infinity } = p;
  const nVt = n * thermalVoltage(T);
  const g = Number.isFinite(Rsh) ? 1 / Rsh : 0;
  if (Rs === 0) return Iph - I0 * Math.expm1(V / nVt) - V * g;
  let I = Iph;
  for (let k = 0; k < 100; k++) {
    const x = Math.min((V + I * Rs) / nVt, 700);
    const e = Math.exp(x);
    const f = Iph - I0 * (e - 1) - (V + I * Rs) * g - I;
    const df = -I0 * e * Rs / nVt - Rs * g - 1;
    const step = f / df;
    I -= step;
    if (Math.abs(step) < 1e-13 * Math.max(1, Math.abs(I))) break;
  }
  return I;
}

/** Short-circuit current (A): the current at V = 0. */
export const shortCircuitCurrent = (p) => diodeCurrent(0, p);

/** Ideal open-circuit voltage (V) for Rs = 0, Rsh = ∞: Voc = n·Vt·ln(Iph/I0 + 1). */
export const idealVoc = (p) => (p.n ?? 1) * thermalVoltage(p.T ?? 298.15) * Math.log1p(p.Iph / p.I0);

/** Open-circuit voltage (V): where I(V) = 0, found by bisection (valid with Rs and Rsh). */
export function openCircuitVoltage(p) {
  if (p.Iph <= 0) return 0;
  let lo = 0; let hi = idealVoc(p) * 1.05 + 0.05;
  while (diodeCurrent(hi, p) > 0) hi *= 1.5;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (diodeCurrent(mid, p) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** N points of the I-V curve from 0 to Voc: [{ V, I, P }]. */
export function ivCurve(p, N = 120) {
  const voc = openCircuitVoltage(p);
  return Array.from({ length: N + 1 }, (_, i) => {
    const V = (voc * i) / N; const I = Math.max(0, diodeCurrent(V, p));
    return { V, I, P: V * I };
  });
}

/** Maximum power point { V, I, P } by golden-section search on P(V) over [0, Voc]. */
export function maxPowerPoint(p) {
  const voc = openCircuitVoltage(p);
  const P = (V) => V * diodeCurrent(V, p);
  const r = (Math.sqrt(5) - 1) / 2;
  let a = 0; let b = voc;
  let c = b - r * (b - a); let d = a + r * (b - a);
  for (let k = 0; k < 90; k++) {
    if (P(c) > P(d)) b = d; else a = c;
    c = b - r * (b - a); d = a + r * (b - a);
  }
  const V = (a + b) / 2; const I = diodeCurrent(V, p);
  return { V, I, P: V * I };
}

/** Fill factor FF = Pmp / (Voc · Isc), dimensionless. */
export function fillFactor(p) {
  const voc = openCircuitVoltage(p); const isc = shortCircuitCurrent(p);
  return voc > 0 && isc > 0 ? maxPowerPoint(p).P / (voc * isc) : 0;
}

/** Power-conversion efficiency η = P_out / P_in with P_in = irradiance (W/m²) × area (m²). */
export const efficiency = (pOutW, irradianceWm2, areaM2) => pOutW / (irradianceWm2 * areaM2);

/** Current at the operating point where a resistive load R (Ω) meets the I-V curve: V = I·R. */
export function operatingPointWithLoad(p, R) {
  const voc = openCircuitVoltage(p);
  let lo = 0; let hi = voc; // f(V) = I(V) − V/R decreases in V
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (diodeCurrent(mid, p) - mid / R > 0) lo = mid; else hi = mid;
  }
  const V = (lo + hi) / 2; const I = V / R;
  return { V, I, P: V * I };
}

/**
 * Convenience cell model for widgets: a silicon-like cell of `areaCm2` at `suns`
 * (1 sun = 1000 W/m²). Jsc ≈ 40 mA/cm² at one sun, J0 ≈ 5e-14 A/cm² (illustrative
 * modern-silicon values giving Voc ≈ 0.70 V, η ≈ 23 %). Returns diode parameters.
 */
export function siliconCell({ suns = 1, areaCm2 = 243, T = 298.15, n = 1, jscAcm2 = 0.040, j0Acm2 = 5e-14, RsOhmCm2 = 0.5, RshOhmCm2 = 5000 } = {}) {
  return { Iph: jscAcm2 * areaCm2 * suns, I0: j0Acm2 * areaCm2, n, T, Rs: RsOhmCm2 / areaCm2, Rsh: RshOhmCm2 / areaCm2 };
}

// ---------- Shockley–Queisser detailed balance ----------

// Photon flux per unit photon energy from a blackbody surface into a hemisphere,
// photons/(m²·s·J): (2π / (h³c²)) · E² / (exp(E/kT) − 1)
const bbFlux = (E, T) => ((2 * Math.PI) / (H ** 3 * C ** 2)) * (E * E) / Math.expm1(E / (KB * T));

function simpson(f, a, b, n = 400) {
  if (n % 2) n++;
  const hh = (b - a) / n; let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * hh) * (i % 2 ? 4 : 2);
  return (s * hh) / 3;
}

/**
 * Detailed-balance efficiency limit for a single junction with band gap Eg (eV)
 * under an unconcentrated blackbody sun (Tsun, default 5772 K) with a cell at Tcell.
 * Assumptions (Shockley & Queisser 1961): every photon above Eg makes one electron-hole
 * pair, the only loss besides thermalisation and transmission is radiative recombination.
 * Returns { efficiency, Jsc (A/m²), J0 (A/m²), Voc (V), incident (W/m²) }.
 * Note: with the AM1.5G reference spectrum the limit is 33.16 % at 1.34 eV (Rühle 2016); this blackbody version peaks near 30.5 %.
 */
export function shockleyQueisser(gapEV, { Tsun = T_SUN, Tcell = 300, dilution = SUN_DILUTION } = {}) {
  const Eg = gapEV * Q;
  const kTs = KB * Tsun; const kTc = KB * Tcell;
  const incident = dilution * SIGMA * Tsun ** 4;
  const Jsc = Q * dilution * simpson((E) => bbFlux(E, Tsun), Eg, Eg + 40 * kTs, 800);
  const J0 = Q * simpson((E) => bbFlux(E, Tcell), Eg, Eg + 40 * kTc, 800);
  const p = { Iph: Jsc, I0: J0, n: 1, T: Tcell };
  const mpp = maxPowerPoint(p);
  return { efficiency: mpp.P / incident, Jsc, J0, Voc: idealVoc(p), Pmax: mpp.P, incident };
}

/** Sample the detailed-balance curve over a range of band gaps: [{ gap, efficiency }]. */
export function sqCurve(from = 0.5, to = 3.0, step = 0.02, opts) {
  const out = [];
  for (let g = from; g <= to + 1e-9; g += step) out.push({ gap: Number(g.toFixed(4)), efficiency: shockleyQueisser(g, opts).efficiency });
  return out;
}

/**
 * The fate of the incident blackbody energy for a gap Eg (eV): fractions of incident power
 * lost below the gap (not absorbed) and as heat above it (thermalisation), and the
 * "ultimate efficiency" left (Eg × number of absorbed photons). Sums to 1.
 */
export function spectrumBudget(gapEV, { Tsun = T_SUN } = {}) {
  const Eg = gapEV * Q; const kT = KB * Tsun; const top = 40 * kT;
  const powerAll = simpson((E) => E * bbFlux(E, Tsun), 1e-6 * kT, top, 1200);
  const powerAbove = simpson((E) => E * bbFlux(E, Tsun), Eg, Eg + top, 1200);
  const photonsAbove = simpson((E) => bbFlux(E, Tsun), Eg, Eg + top, 1200);
  const ultimate = (Eg * photonsAbove) / powerAll;
  return { belowGap: 1 - powerAbove / powerAll, thermalisation: powerAbove / powerAll - ultimate, ultimate };
}
