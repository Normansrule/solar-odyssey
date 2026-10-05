// Photon and sunlight helpers for the "photovoltaic effect" and "band gap" lessons.
// Pure functions. Energies in electronvolts (eV) unless the name says otherwise.
// The sun is modelled as a blackbody at T_SUN (5772 K) diluted to Earth's distance,
// the same model pv.js uses for the Shockley–Queisser curve and spectrumBudget().

import { H, C, Q, KB, HC_EV_NM, T_SUN, SUN_DILUTION, SIGMA } from './constants.js';
import { photonEnergyEV, isAbsorbed, shockleyQueisser } from './pv.js';

const K_BB = (2 * Math.PI) / (H ** 3 * C ** 2);

/**
 * Spectral irradiance of the blackbody sun at the top of Earth's atmosphere,
 * per unit photon energy: W/(m²·eV). eV is the photon energy in electronvolts.
 */
export function spectralPower(eV, { Tsun = T_SUN, dilution = SUN_DILUTION } = {}) {
  if (!(eV > 0)) return 0;
  const E = eV * Q;
  return dilution * K_BB * (E ** 3) / Math.expm1(E / (KB * Tsun)) * Q;
}

/** Photon flux of the same blackbody sun per unit photon energy: photons/(m²·s·eV). */
export const spectralPhotonFlux = (eV, opts) => (eV > 0 ? spectralPower(eV, opts) / (eV * Q) : 0);

/** Total blackbody irradiance at Earth, W/m²: dilution · σ · T⁴ (≈ 1361 W/m² for 5772 K). */
export const incidentPower = ({ Tsun = T_SUN, dilution = SUN_DILUTION } = {}) => dilution * SIGMA * Tsun ** 4;

/**
 * Split the spectrum at a band gap for drawing. Returns n+1 samples from `from` to `to` eV:
 * { E, total, below, usable, heat } in W/(m²·eV).
 *   below  = power of photons under the gap (they pass through, not absorbed)
 *   usable = Eg × photon flux above the gap (each absorbed photon keeps Eg)
 *   heat   = the rest of the above-gap power, lost as the carriers relax (thermalisation)
 */
export function spectrumSplit(gapEV, { from = 0.05, to = 4.5, n = 300, Tsun = T_SUN } = {}) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const E = from + ((to - from) * i) / n;
    const total = spectralPower(E, { Tsun });
    const above = E >= gapEV;
    const usable = above ? gapEV * spectralPhotonFlux(E, { Tsun }) * Q : 0;
    out.push({ E, total, below: above ? 0 : total, usable, heat: above ? total - usable : 0 });
  }
  return out;
}

/** Fraction of one photon's energy that the cell can keep: Eg/E if absorbed, else 0. */
export const usableFraction = (nm, gapEV) => (isAbsorbed(nm, gapEV) ? gapEV / photonEnergyEV(nm) : 0);

/** Fraction of one photon's energy lost as heat (thermalisation): (E − Eg)/E if absorbed, else 0. */
export const heatFraction = (nm, gapEV) => (isAbsorbed(nm, gapEV) ? 1 - gapEV / photonEnergyEV(nm) : 0);

/** Photon energy (eV) at a given band gap wavelength-equivalent: the inverse of cutoffWavelengthNm. */
export const gapFromCutoffNm = (nm) => HC_EV_NM / nm;

/**
 * Band gap (eV) where the blackbody detailed-balance efficiency peaks, and that peak.
 * Golden-section search on shockleyQueisser() between lo and hi. Returns { gap, efficiency }.
 */
export function sqPeak({ lo = 0.9, hi = 1.7, ...opts } = {}) {
  const f = (g) => shockleyQueisser(g, opts).efficiency;
  const r = (Math.sqrt(5) - 1) / 2;
  let a = lo; let b = hi; let c = b - r * (b - a); let d = a + r * (b - a);
  let fc = f(c); let fd = f(d);
  for (let k = 0; k < 40; k++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = f(d); }
  }
  const gap = (a + b) / 2;
  return { gap, efficiency: f(gap) };
}

/** Which part of the spectrum a wavelength falls in: 'uv' (< 380 nm), 'visible', or 'ir' (> 750 nm). */
export const spectralBand = (nm) => (nm < 380 ? 'uv' : nm > 750 ? 'ir' : 'visible');

/**
 * Approximate sRGB colour of monochromatic visible light (after Bruton's piecewise-linear
 * fit), as [r, g, b] in 0–255. Outside 380–750 nm the eye sees nothing, so this returns
 * null and the caller chooses a stand-in (the lessons draw UV and IR with a pattern and a label).
 */
export function wavelengthRGB(nm) {
  if (nm < 380 || nm > 750) return null;
  let r = 0; let g = 0; let b = 0;
  if (nm < 440) { r = (440 - nm) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
  else { r = 1; }
  // intensity falls off near the limits of vision
  const k = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (750 - nm)) / 50 : 1;
  const gamma = 0.8;
  return [r, g, b].map((v) => Math.round(255 * (v * k) ** gamma));
}

/**
 * Wavelength table for drawing photons "as the sun sends them": returns a function u ∈ [0,1) → nm
 * that samples photon wavelengths between minNm and maxNm in proportion to the blackbody photon flux.
 */
export function photonSampler({ minNm = 280, maxNm = 1600, n = 400, Tsun = T_SUN } = {}) {
  const Es = []; const cdf = [0];
  const eMin = HC_EV_NM / maxNm; const eMax = HC_EV_NM / minNm;
  for (let i = 0; i <= n; i++) Es.push(eMin + ((eMax - eMin) * i) / n);
  for (let i = 1; i <= n; i++) {
    const w = 0.5 * (spectralPhotonFlux(Es[i - 1], { Tsun }) + spectralPhotonFlux(Es[i], { Tsun })) * (Es[i] - Es[i - 1]);
    cdf.push(cdf[i - 1] + w);
  }
  const total = cdf[n];
  return (u) => {
    const t = Math.min(Math.max(u, 0), 1 - 1e-12) * total;
    let lo = 0; let hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cdf[mid] <= t) lo = mid; else hi = mid; }
    const f = (t - cdf[lo]) / (cdf[hi] - cdf[lo] || 1);
    return HC_EV_NM / (Es[lo] + f * (Es[hi] - Es[lo]));
  };
}
