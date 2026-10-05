// Detailed-balance limits for two-junction (tandem) solar cells.
// Same model as pv.js shockleyQueisser(): the sun is a blackbody at T_SUN diluted to
// Earth's distance (≈ 1361 W/m², no atmosphere), every photon above a gap makes one
// electron-hole pair, and the only recombination is radiative (the cell emits like a
// blackbody above its gap). Pure functions; energies in eV, currents in A/m².
//
// Stack: the top cell (wide gap Et) sits on the bottom cell (narrow gap Eb < Et).
// The top cell absorbs every photon above Et; the bottom cell gets what passes
// through, the photons between Eb and Et. In a two-terminal (series) tandem the
// same current flows through both cells, so the weaker one limits it: that is
// "current matching". A four-terminal stack wires each cell to its own load.
// Simplifications: no luminescent coupling between the cells, ideal (lossless)
// interconnection, one-sided emission, no reflection.

import { H, C, Q, KB, SIGMA, T_SUN, SUN_DILUTION } from './constants.js';

const K_BB = (2 * Math.PI) / (H ** 3 * C ** 2);

/** Blackbody photon flux per unit photon energy, photons/(m²·s·J), into a hemisphere. */
const bbFlux = (E, T) => K_BB * (E * E) / Math.expm1(E / (KB * T));

function simpson(f, a, b, n = 600) {
  if (!(b > a)) return 0;
  if (n % 2) n++;
  const hh = (b - a) / n; let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * hh) * (i % 2 ? 4 : 2);
  return (s * hh) / 3;
}

/** Sun's photon flux at Earth between two photon energies (eV), photons/(m²·s). hiEV = Infinity is allowed. */
export function sunPhotonFlux(loEV, hiEV = Infinity, { Tsun = T_SUN, dilution = SUN_DILUTION } = {}) {
  const top = Math.min(hiEV, loEV + 40 * KB * Tsun / Q);
  return dilution * simpson((E) => bbFlux(E, Tsun), loEV * Q, top * Q, 800);
}

/** Incident blackbody irradiance at Earth, W/m² (≈ 1361 W/m² for 5772 K). */
export const incidentIrradiance = ({ Tsun = T_SUN, dilution = SUN_DILUTION } = {}) => dilution * SIGMA * Tsun ** 4;

/** Sun's spectral irradiance per unit photon energy, W/(m²·eV), for drawing the spectrum. */
export function sunSpectrumEV(eV, { Tsun = T_SUN, dilution = SUN_DILUTION } = {}) {
  if (!(eV > 0)) return 0;
  const E = eV * Q;
  return dilution * K_BB * E ** 3 / Math.expm1(E / (KB * Tsun)) * Q;
}

/** Radiative dark saturation current of a cell with gap Eg (eV) at Tcell, A/m². */
export function darkCurrent(gapEV, Tcell = 300) {
  const kT = KB * Tcell;
  return Q * simpson((E) => bbFlux(E, Tcell), gapEV * Q, gapEV * Q + 40 * kT, 800);
}

// ideal-diode voltage of a sub-cell carrying current J: V = (kT/q)·ln((Jsc − J)/J0 + 1)
const cellVoltage = (J, Jsc, J0, vt) => (J >= Jsc ? -Infinity : vt * Math.log1p((Jsc - J) / J0));

// golden-section maximiser of f on [a, b]
function argmax(f, a, b, iters = 100) {
  const r = (Math.sqrt(5) - 1) / 2;
  let c = b - r * (b - a); let d = a + r * (b - a); let fc = f(c); let fd = f(d);
  for (let k = 0; k < iters; k++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = f(d); }
  }
  const x = (a + b) / 2;
  return { x, f: f(x) };
}

/** A single sub-cell at its own maximum power point: { Jsc, J0, Voc, J, V, P } (A/m², V, W/m²). */
function subCell(Jsc, J0, vt) {
  const best = argmax((J) => J * cellVoltage(J, Jsc, J0, vt), 0, Jsc * (1 - 1e-12));
  return { Jsc, J0, Voc: vt * Math.log1p(Jsc / J0), J: best.x, V: cellVoltage(best.x, Jsc, J0, vt), P: best.f };
}

/**
 * Detailed-balance single-junction limit with this module's model (matches pv.shockleyQueisser).
 * Returns { efficiency, Jsc, J0, Voc, P, incident }.
 */
export function singleJunction(gapEV, { Tsun = T_SUN, Tcell = 300, dilution = SUN_DILUTION } = {}) {
  const vt = KB * Tcell / Q;
  const Jsc = Q * sunPhotonFlux(gapEV, Infinity, { Tsun, dilution });
  const c = subCell(Jsc, darkCurrent(gapEV, Tcell), vt);
  const incident = incidentIrradiance({ Tsun, dilution });
  return { efficiency: c.P / incident, Jsc, J0: c.J0, Voc: c.Voc, P: c.P, incident };
}

/**
 * Detailed-balance limit of a two-junction tandem with top gap topEV over bottom gap bottomEV (eV).
 * Returns {
 *   efficiency     series-connected (two-terminal) efficiency, current-matched by construction,
 *   fourTerminal   efficiency with each cell at its own maximum power point,
 *   J, V, P        operating current density (A/m²), stack voltage (V) and power (W/m²) of the series stack,
 *   top, bottom    { Jsc, J0, Voc, V } for each sub-cell (V at the series operating point),
 *   mismatch       (Jsc_top − Jsc_bottom) / max: positive means the top cell makes more current,
 *   limitedBy      'top' or 'bottom': the sub-cell with the smaller short-circuit current,
 *   incident       W/m² }
 * If topEV ≤ bottomEV the stack is invalid and efficiency is NaN.
 */
export function tandemLimit(topEV, bottomEV = 1.12, { Tsun = T_SUN, Tcell = 300, dilution = SUN_DILUTION } = {}) {
  const incident = incidentIrradiance({ Tsun, dilution });
  if (!(topEV > bottomEV)) return { efficiency: NaN, fourTerminal: NaN, incident };
  const vt = KB * Tcell / Q;
  const JscT = Q * sunPhotonFlux(topEV, Infinity, { Tsun, dilution });
  const JscB = Q * sunPhotonFlux(bottomEV, topEV, { Tsun, dilution });
  const J0T = darkCurrent(topEV, Tcell); const J0B = darkCurrent(bottomEV, Tcell);
  const jmax = Math.min(JscT, JscB) * (1 - 1e-12);
  const Vs = (J) => cellVoltage(J, JscT, J0T, vt) + cellVoltage(J, JscB, J0B, vt);
  const best = argmax((J) => J * Vs(J), 0, jmax);
  const J = best.x;
  const t = subCell(JscT, J0T, vt); const b = subCell(JscB, J0B, vt);
  return {
    efficiency: best.f / incident,
    fourTerminal: (t.P + b.P) / incident,
    J, V: Vs(J), P: best.f,
    top: { Jsc: JscT, J0: J0T, Voc: t.Voc, V: cellVoltage(J, JscT, J0T, vt) },
    bottom: { Jsc: JscB, J0: J0B, Voc: b.Voc, V: cellVoltage(J, JscB, J0B, vt) },
    mismatch: (JscT - JscB) / Math.max(JscT, JscB),
    limitedBy: JscT < JscB ? 'top' : 'bottom',
    incident,
  };
}

/** Efficiency (fraction) of the series tandem; convenience for worked examples and sweeps. */
export const tandemEfficiency = (topEV, bottomEV = 1.12, opts) => tandemLimit(topEV, bottomEV, opts).efficiency;

/** Sample tandem efficiency over top-cell gaps for a fixed bottom gap: [{ gap, efficiency, fourTerminal }]. */
export function tandemSweep(bottomEV = 1.12, { from = 1.3, to = 2.4, step = 0.02, ...opts } = {}) {
  const out = [];
  for (let g = from; g <= to + 1e-9; g += step) {
    const gap = Number(g.toFixed(4));
    const r = tandemLimit(gap, bottomEV, opts);
    out.push({ gap, efficiency: r.efficiency, fourTerminal: r.fourTerminal });
  }
  return out;
}

/** The top-cell gap (eV) that maximises the series tandem on a given bottom cell: { gap, efficiency }. */
export function optimumTopGap(bottomEV = 1.12, opts) {
  const r = argmax((g) => tandemEfficiency(g, bottomEV, opts), bottomEV + 0.05, 3.0, 50);
  return { gap: r.x, efficiency: r.f };
}

/** Best pair of gaps for a series tandem (coarse grid, then golden-section refinement): { top, bottom, efficiency }. */
export function optimumPair(opts) {
  let best = { top: 0, bottom: 0, efficiency: -1 };
  for (let b = 0.6; b <= 1.4 + 1e-9; b += 0.05) {
    const t = optimumTopGap(b, opts);
    if (t.efficiency > best.efficiency) best = { top: t.gap, bottom: b, efficiency: t.efficiency };
  }
  const r = argmax((b) => optimumTopGap(b, opts).efficiency, best.bottom - 0.05, best.bottom + 0.05, 30);
  const t = optimumTopGap(r.x, opts);
  return { top: t.gap, bottom: r.x, efficiency: t.efficiency };
}

/**
 * Where the incident sunlight's photons go in a stack, as fractions of all photons from the sun:
 * { top, bottom, lost } (photons absorbed by the top cell, by the bottom cell, and passing below the bottom gap).
 */
export function photonShares(topEV, bottomEV = 1.12, opts) {
  const all = sunPhotonFlux(0.005, Infinity, opts);
  const top = sunPhotonFlux(topEV, Infinity, opts) / all;
  const bottom = sunPhotonFlux(bottomEV, topEV, opts) / all;
  return { top, bottom, lost: 1 - top - bottom };
}
