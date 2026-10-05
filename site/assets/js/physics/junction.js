// p-n junction electrostatics and temperature-dependent cell models.
// Pure functions. Doping densities in cm⁻³ (the unit every textbook quotes),
// everything else SI unless the name says otherwise.
//
// References
//   [Sze]  S. M. Sze & K. K. Ng, Physics of Semiconductor Devices, 3rd ed., Wiley (2007),
//          ch. 2 (abrupt junction in the depletion approximation). doi:10.1002/0470068329
//   [Alt]  P. P. Altermatt et al., J. Appl. Phys. 93, 1598 (2003): ni(300 K) = 9.65e9 cm⁻³.
//          doi:10.1063/1.1529297 (the older Sproul & Green 1991 value is 1.00e10 cm⁻³).
//   [Grn]  M. A. Green, Prog. Photovolt. 11, 333 (2003): I0 ∝ T^γ exp(−Eg0/kT), dVoc/dT.
//          doi:10.1002/pip.496
//   [PVE]  C. Honsberg & S. Bowden, PVEducation: Eg0 ≈ 1.2 eV and γ ≈ 3 for silicon,
//          Isc rises about 0.06 %/°C, Voc falls about 2.2 mV/°C.

import { Q, KB } from './constants.js';
import { diodeCurrent, openCircuitVoltage, shortCircuitCurrent, maxPowerPoint, thermalVoltage, efficiency } from './pv.js';

/** Vacuum permittivity ε0, F/m (CODATA 2018). */
export const EPS0 = 8.8541878128e-12;
/** Relative permittivity of silicon (Sze & Ng, appendix; PVEducation). */
export const EPS_R_SI = 11.7;
/** Intrinsic carrier density of silicon at 300 K, cm⁻³ [Alt]. Literature spread: 9.65e9 to 1.0e10 (and older 1.45e10). */
export const NI_SI_300 = 9.65e9;
/** Silicon band gap at 300 K, eV (PVEducation general properties of silicon). */
export const EG_SI_300 = 1.12;
/** Band gap linearly extrapolated to 0 K, used in the I0(T) law, eV [Grn, PVE]. */
export const EG0_SI = 1.2;
/** Effective densities of states of silicon at 300 K, cm⁻³ (PVEducation general properties of silicon). Only used to draw the band diagram. */
export const NC_SI = 3e19;
export const NV_SI = 1e19;
/** Short-circuit-current temperature coefficient of silicon, per K [PVE]. */
export const ALPHA_ISC_SI = 0.0006;
/** Reference cell temperature for standard test conditions, K (25 °C). */
export const T_STC = 298.15;

const cm3 = 1e6; // cm⁻³ → m⁻³

/** Built-in potential of an abrupt junction, volts: Vbi = (kT/q)·ln(Na·Nd / ni²) [Sze eq. 2.10 form]. */
export function builtInPotential(Na, Nd, { T = 300, ni = NI_SI_300 } = {}) {
  return thermalVoltage(T) * Math.log((Na * Nd) / (ni * ni));
}

/**
 * Total depletion width of an abrupt junction at applied (forward) bias V, metres:
 * W = sqrt( 2ε (Vbi − V) (Na + Nd) / (q Na Nd) ) [Sze, depletion approximation].
 * Valid while V is comfortably below Vbi; returns 0 at or beyond Vbi.
 */
export function depletionWidth(Na, Nd, V = 0, opts = {}) {
  const { epsR = EPS_R_SI } = opts;
  const psi = builtInPotential(Na, Nd, opts) - V;
  if (psi <= 0) return 0;
  const na = Na * cm3; const nd = Nd * cm3;
  return Math.sqrt((2 * epsR * EPS0 * psi * (na + nd)) / (Q * na * nd));
}

/** Share of W on each side (charge neutrality Na·xp = Nd·xn): { xn, xp } in metres. */
export function depletionSplit(Na, Nd, V = 0, opts = {}) {
  const W = depletionWidth(Na, Nd, V, opts);
  return { xn: (W * Na) / (Na + Nd), xp: (W * Nd) / (Na + Nd) };
}

/** Peak electric field at the metallurgical junction, V/m: Emax = q·Nd·xn / ε = 2(Vbi − V)/W. */
export function maxField(Na, Nd, V = 0, opts = {}) {
  const W = depletionWidth(Na, Nd, V, opts);
  return W > 0 ? (2 * (builtInPotential(Na, Nd, opts) - V)) / W : 0;
}

/**
 * Everything about one junction in convenient units, for widgets and worked examples:
 * { Vbi (V), W_um, xn_um, xp_um, Emax_Vcm, Emax_Vm, ecOffsetN_eV, evOffsetP_eV }.
 * ecOffsetN = Ec − EF in the neutral n side = kT ln(Nc/Nd); evOffsetP = EF − Ev in the p side = kT ln(Nv/Na).
 */
export function junction(Na, Nd, V = 0, opts = {}) {
  const { T = 300 } = opts;
  const W = depletionWidth(Na, Nd, V, opts);
  const { xn, xp } = depletionSplit(Na, Nd, V, opts);
  const Emax = maxField(Na, Nd, V, opts);
  const vt = thermalVoltage(T);
  return {
    Vbi: builtInPotential(Na, Nd, opts),
    W_um: W * 1e6, xn_um: xn * 1e6, xp_um: xp * 1e6,
    Emax_Vm: Emax, Emax_Vcm: Emax / 100,
    ecOffsetN_eV: Math.max(0, vt * Math.log(NC_SI / Nd)),
    evOffsetP_eV: Math.max(0, vt * Math.log(NV_SI / Na)),
  };
}

// ---------- temperature ----------

/**
 * Dark saturation current at temperature T, scaled from its value at Tref [Grn]:
 * I0(T) = I0(Tref) · (T/Tref)^(γ/n) · exp( −(Eg0 / (n k)) · (1/T − 1/Tref) ).
 * With n = 1 this is the textbook I0 ∝ T³ exp(−Eg0/kT) (γ = 3); with n = 2 it becomes the
 * depletion-region recombination law ∝ ni ∝ T^1.5 exp(−Eg0/2kT).
 */
export function saturationCurrentAt(I0ref, T, { Tref = T_STC, Eg0 = EG0_SI, gamma = 3, n = 1 } = {}) {
  const egK = (Eg0 * Q) / KB; // band gap expressed as a temperature, K
  return I0ref * (T / Tref) ** (gamma / n) * Math.exp(-(egK / n) * (1 / T - 1 / Tref));
}

/** Photocurrent at temperature T: Iph(T) = Iph(Tref)·(1 + α (T − Tref)), α ≈ +0.06 %/K for silicon [PVE]. */
export const photocurrentAt = (IphRef, T, { Tref = T_STC, alpha = ALPHA_ISC_SI } = {}) => IphRef * (1 + alpha * (T - Tref));

/**
 * Analytic dVoc/dT for an ideal cell (n = 1), V/K [Grn]:
 * dVoc/dT = −(Eg0/q − Voc + γ kT/q) / T.
 */
export const vocTemperatureCoefficient = (Voc, T = T_STC, { Eg0 = EG0_SI, gamma = 3 } = {}) =>
  -(Eg0 - Voc + gamma * thermalVoltage(T)) / T;

/**
 * Illustrative silicon cell (the same one as pv.siliconCell) at any irradiance and temperature.
 * irradiance in W/m² (1000 = one sun at STC), tempC in °C, Rs and Rsh per unit area (Ω·cm²), ideality n.
 * The reference dark current is chosen so that the ideal one-sun, 25 °C open-circuit voltage is the same
 * for every n (a teaching choice: changing n then shows its effect on the shape of the curve, not a jump in Voc).
 * Returns diode parameters for pv.diodeCurrent.
 */
export function cellAt({ irradiance = 1000, tempC = 25, RsOhmCm2 = 0.5, RshOhmCm2 = 5000, n = 1, areaCm2 = 243, jscAcm2 = 0.040, j0Acm2 = 5e-14 } = {}) {
  const T = tempC + 273.15;
  const vt = thermalVoltage(T_STC);
  const vocRef = vt * Math.log1p(jscAcm2 / j0Acm2);
  const j0n = jscAcm2 / Math.expm1(vocRef / (n * vt));
  return {
    Iph: photocurrentAt(jscAcm2 * areaCm2 * (irradiance / 1000), T),
    I0: saturationCurrentAt(j0n * areaCm2, T, { n }),
    n, T,
    Rs: RsOhmCm2 / areaCm2,
    Rsh: RshOhmCm2 / areaCm2,
  };
}

/**
 * Headline numbers for a cell made by cellAt(opts):
 * { Isc (A), Voc (V), Vmp (V), Imp (A), Pmax (W), FF, eta } with eta = Pmax / (G·A).
 */
export function cellSummary(opts = {}) {
  const { irradiance = 1000, areaCm2 = 243 } = opts;
  const p = cellAt(opts);
  if (p.Iph <= 0) return { Isc: 0, Voc: 0, Vmp: 0, Imp: 0, Pmax: 0, FF: 0, eta: 0 };
  const Isc = shortCircuitCurrent(p);
  const Voc = openCircuitVoltage(p);
  const mpp = maxPowerPoint(p);
  return {
    Isc, Voc, Vmp: mpp.V, Imp: mpp.I, Pmax: mpp.P,
    FF: mpp.P / (Voc * Isc),
    eta: irradiance > 0 ? efficiency(mpp.P, irradiance, areaCm2 * 1e-4) : 0,
  };
}

/**
 * Operating point of the pv.siliconCell-like cell at `suns` driving a resistive load R (Ω).
 * R = 0 is a short circuit, R = Infinity an open circuit. Returns { V, I, P }.
 */
export function loadPoint(p, R) {
  if (R <= 0) { const I = shortCircuitCurrent(p); return { V: 0, I, P: 0 }; }
  const voc = openCircuitVoltage(p);
  if (!Number.isFinite(R)) return { V: voc, I: 0, P: 0 };
  let lo = 0; let hi = voc;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (diodeCurrent(mid, p) - mid / R > 0) lo = mid; else hi = mid;
  }
  const V = (lo + hi) / 2; const I = V / R;
  return { V, I, P: V * I };
}

/** Voc of the cellAt() cell, for worked examples: vocAt({ tempC: 50 }). */
export const vocAt = (opts = {}) => openCircuitVoltage(cellAt(opts));

/** Percent change of a quantity per kelvin between two temperatures, for readouts and worked examples. */
export const percentPerKelvin = (a, b, dT) => (100 * (b - a)) / (a * dT);

/** dVoc/dT (%/K) of the cellAt cell, by finite difference around tempC. */
export function vocCoefficientPercent(opts = {}) {
  const t = opts.tempC ?? 25;
  const a = vocAt({ ...opts, tempC: t - 0.5 }); const b = vocAt({ ...opts, tempC: t + 0.5 });
  const mid = vocAt({ ...opts, tempC: t });
  return (100 * (b - a)) / mid;
}

/** dPmax/dT (%/K) of the cellAt cell, by finite difference around tempC. */
export function powerCoefficientPercent(opts = {}) {
  const t = opts.tempC ?? 25;
  const a = cellSummary({ ...opts, tempC: t - 0.5 }).Pmax; const b = cellSummary({ ...opts, tempC: t + 0.5 }).Pmax;
  const mid = cellSummary({ ...opts, tempC: t }).Pmax;
  return (100 * (b - a)) / mid;
}

/** Fill factor from its three ingredients: FF = Pmp / (Voc · Isc). */
export const fillFactorFrom = (Pmp, Voc, Isc) => Pmp / (Voc * Isc);

/**
 * Green's empirical fill factor of an ideal cell with no resistive losses (Green 1981,
 * Solid-State Electronics 24, 788): FF0 = (voc − ln(voc + 0.72)) / (voc + 1), voc = Voc / (n kT/q).
 */
export function fillFactorEmpirical(Voc, { n = 1, T = T_STC } = {}) {
  const voc = Voc / (n * thermalVoltage(T));
  return (voc - Math.log(voc + 0.72)) / (voc + 1);
}

/** Silicon atoms per cm³ (diamond lattice, a = 5.431 Å: 8 / a³). */
export const SILICON_ATOMS_CM3 = 8 / (5.431e-8) ** 3;

/** One dopant atom in how many silicon atoms, for a doping density in cm⁻³. */
export const atomsPerDopant = (N) => SILICON_ATOMS_CM3 / N;
