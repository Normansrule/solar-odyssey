// Physics of the other renewables, storage and heat engines.
import { G0 } from './constants.js';

// ---------- wind (and tidal stream: same physics, denser fluid) ----------

/** The Betz limit: no rotor can extract more than 16/27 ≈ 59.3 % of the kinetic power in the wind passing its disc. */
export const BETZ = 16 / 27;

/** Kinetic power in a fluid stream through area A (W): P = ½ ρ A v³. */
export const kineticPower = (rho, areaM2, v) => 0.5 * rho * areaM2 * v ** 3;

/** Power extracted by a rotor of diameter D (m) with power coefficient Cp (≤ Betz): P = ½ ρ A v³ Cp. */
export const rotorPower = (rho, diameterM, v, cp) => kineticPower(rho, Math.PI * (diameterM / 2) ** 2, v) * cp;

/** Actuator-disc power coefficient for axial induction factor a: Cp = 4a(1 − a)². Peaks at a = 1/3, Cp = 16/27. */
export const actuatorDiscCp = (a) => 4 * a * (1 - a) ** 2;

/** Dry-air density (kg/m³) from pressure (Pa) and temperature (K): ρ = p / (R_d T), R_d = 287.05 J/(kg·K). */
export const airDensity = (pressurePa = 101325, T = 288.15) => pressurePa / (287.05 * T);

/**
 * Simple turbine power curve (W): zero below cut-in, cubic ramp to rated power at rated speed,
 * flat to cut-out, zero above cut-out (the turbine feathers and stops to protect itself).
 */
export function turbinePowerCurve(v, { ratedW, cutIn = 3, rated = 12, cutOut = 25 }) {
  if (v < cutIn || v >= cutOut) return 0;
  if (v >= rated) return ratedW;
  return ratedW * (v ** 3 - cutIn ** 3) / (rated ** 3 - cutIn ** 3);
}

/** Rayleigh probability density for wind speed v with mean speed vMean (a Weibull with k = 2). */
export const rayleighPdf = (v, vMean) => {
  const s = vMean * Math.sqrt(2 / Math.PI);
  return (v / (s * s)) * Math.exp(-(v * v) / (2 * s * s));
};

/** Expected capacity factor of a turbine at a site with Rayleigh winds of mean vMean (numerical integration). */
export function turbineCapacityFactor(vMean, curve) {
  let e = 0; const dv = 0.05;
  for (let v = dv / 2; v < 40; v += dv) e += turbinePowerCurve(v, curve) * rayleighPdf(v, vMean) * dv;
  return e / curve.ratedW;
}

// ---------- hydro ----------

/** Hydropower (W): P = η ρ g Q H, with flow Q in m³/s and head H in m. */
export const hydroPower = (flowM3s, headM, eta = 0.9, rho = 1000, g = G0) => eta * rho * g * flowM3s * headM;

/** Gravitational energy stored by lifting a volume of water (J): E = ρ V g H. Convert with / 3.6e6 for kWh. */
export const liftedWaterEnergyJ = (volumeM3, headM, rho = 1000, g = G0) => rho * volumeM3 * g * headM;

// ---------- ocean ----------

/** Potential energy released by draining a tidal basin of area A (m²) through range R (m) once (J): E = ½ ρ g A R². */
export const tidalBasinEnergyJ = (areaM2, rangeM, rho = 1025, g = G0) => 0.5 * rho * g * areaM2 * rangeM ** 2;

/** Deep-water wave energy flux per metre of wave crest (W/m): P = ρ g² H_s² T_e / (64 π). */
export const waveEnergyFlux = (hsM, teS, rho = 1025, g = G0) => (rho * g * g * hsM * hsM * teS) / (64 * Math.PI);

// ---------- heat engines (geothermal, CSP, biomass) ----------

/** Carnot efficiency, the ceiling for any heat engine between hot and cold reservoirs (kelvin): 1 − Tc/Th. */
export const carnotEfficiency = (hotK, coldK) => 1 - coldK / hotK;

/** Heat flow carried by a fluid (W): Q = ṁ c_p ΔT. */
export const heatFlow = (massFlowKgS, cpJkgK, deltaT) => massFlowKgS * cpJkgK * deltaT;

/** Geometric concentration ratio of a solar concentrator: aperture area ÷ receiver area. */
export const concentrationRatio = (apertureM2, receiverM2) => apertureM2 / receiverM2;

/** Sensible heat stored in a mass of material (J): E = m c_p ΔT (e.g. molten nitrate salt, c_p ≈ 1500 J/(kg·K)). */
export const sensibleHeatJ = (massKg, cpJkgK, deltaT) => massKg * cpJkgK * deltaT;

// ---------- storage ----------

/** Round-trip efficiency of a storage chain: the product of each stage's efficiency. */
export const roundTrip = (...stages) => stages.reduce((a, b) => a * b, 1);

/** Hours a store can deliver at full power: energy (MWh) ÷ power (MW). */
export const storageDurationH = (energyMWh, powerMW) => energyMWh / powerMW;

/** Energy content of hydrogen (J) for a mass (kg), using the lower heating value 120 MJ/kg (33.3 kWh/kg). */
export const hydrogenEnergyJ = (massKg, lhvJkg = 120e6) => massKg * lhvJkg;

/** Grid frequency deviation after a sudden power imbalance, first instant (swing equation): df/dt = ΔP·f0 / (2·H·S). */
export const rocof = (deltaPMW, inertiaH_s, ratingMVA, f0 = 50) => (deltaPMW * f0) / (2 * inertiaH_s * ratingMVA);
