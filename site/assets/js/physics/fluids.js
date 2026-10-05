// Fluid-machine physics for the wind, hydro, geothermal and ocean pages.
// Pure functions, no DOM. Builds on renewables.js; tested in tests/unit/renewables-a.test.mjs.
import { G0 } from './constants.js';
import { actuatorDiscCp } from './renewables.js';

const DEG = Math.PI / 180;

// ---------- wind: rotor and blade section ----------

/** Tip-speed ratio λ = ω R / v: how fast the blade tips move compared with the wind. rpm → rad/s inside. */
export const tipSpeedRatio = (rpm, radiusM, windMs) => (rpm * 2 * Math.PI / 60) * radiusM / windMs;

/**
 * Wind speed (m/s) at which a rotor of diameter D reaches its rated power, if it runs at power coefficient cp
 * until then: v = (2 P / (ρ A Cp))^(1/3). Real turbines publish this; we use it to build consistent model curves.
 */
export const ratedWindSpeed = (ratedW, diameterM, cp = 0.45, rho = 1.225) =>
  Math.cbrt((2 * ratedW) / (rho * Math.PI * (diameterM / 2) ** 2 * cp));

/** Swept area of a rotor (m²). */
export const sweptArea = (diameterM) => Math.PI * (diameterM / 2) ** 2;

/**
 * Lift and drag coefficients of a generic thin aerofoil section against angle of attack α (degrees).
 * Linear lift CL = 2π α below stall (thin-aerofoil theory), a soft collapse after stall at ~14°,
 * and a drag polar CD = 0.008 + 0.6 α² (α in rad, pre-stall) that climbs steeply once the flow separates.
 * An illustrative model: real sections are measured in wind tunnels.
 */
export function aerofoilCoefficients(alphaDeg, stallDeg = 14) {
  const a = alphaDeg * DEG;
  const s = stallDeg * DEG;
  if (Math.abs(alphaDeg) <= stallDeg) return { cl: 2 * Math.PI * a, cd: 0.008 + 0.6 * a * a, stalled: false };
  const over = Math.abs(a) - s;
  const cl = Math.sign(a) * 2 * Math.PI * s * Math.max(0.55, 1 - 1.6 * over);
  const cd = 0.008 + 0.6 * s * s + 0.05 + 1.4 * Math.sin(Math.min(over, Math.PI / 2));
  return { cl, cd, stalled: true };
}

/**
 * The flow seen by one slice of blade at radius r.
 * The blade meets the incoming wind (slowed by the rotor to v(1 − a)) and the "headwind" from its own motion ωr.
 * Their sum is the apparent wind W at inflow angle φ from the rotor plane. The blade's chord sits at
 * θ = twist + pitch from the rotor plane, so the angle of attack is α = φ − θ.
 * Lift acts at right angles to W, drag along W; resolving them gives the torque-making force (in the rotor plane)
 * and the thrust (along the wind). Forces are per unit span (N/m) for chord c.
 */
export function bladeSection({ windMs, rpm, radiusM, pitchDeg = 0, twistDeg = 0, a = 1 / 3, chordM = 1, rho = 1.225 }) {
  const omega = rpm * 2 * Math.PI / 60;
  const axial = windMs * (1 - a);
  const tangential = omega * radiusM;
  const W = Math.hypot(axial, tangential);
  const phi = Math.atan2(axial, tangential);
  const alphaDeg = phi / DEG - twistDeg - pitchDeg;
  const { cl, cd, stalled } = aerofoilCoefficients(alphaDeg);
  const q = 0.5 * rho * W * W * chordM;
  const lift = q * cl; const drag = q * cd;
  const torqueForce = lift * Math.sin(phi) - drag * Math.cos(phi);
  const thrustForce = lift * Math.cos(phi) + drag * Math.sin(phi);
  return { W, phiDeg: phi / DEG, alphaDeg, cl, cd, lift, drag, torqueForce, thrustForce, stalled, axial, tangential };
}

/** Optimum induction factor of the actuator disc (a = 1/3) found numerically: returns { a, cp }. */
export function actuatorDiscOptimum(steps = 3000) {
  let best = { a: 0, cp: 0 };
  for (let i = 0; i <= steps; i++) { const a = 0.5 * i / steps; const cp = actuatorDiscCp(a); if (cp > best.cp) best = { a, cp }; }
  return best;
}

/** Wind speed that carries the same power per square metre as a water current of speed v (cube-root of the density ratio). */
export const equivalentWindSpeed = (currentMs, rhoWater = 1025, rhoAir = 1.225) => currentMs * Math.cbrt(rhoWater / rhoAir);

/** Power density of a moving fluid (W/m²): ½ ρ v³. */
export const powerDensity = (rho, v) => 0.5 * rho * v ** 3;

// ---------- hydro ----------

/**
 * Which turbine family suits a head (m), following the DOE rule of thumb: propeller/Kaplan for low head and high flow,
 * Francis for medium to high head (about 40–600 m), Pelton (impulse) for very high head and low flow.
 * Boundaries overlap in practice; this returns the usual choice.
 */
export function turbineForHead(headM, flowM3s = 10) {
  if (headM < 40) return 'kaplan';
  if (headM > 600 || (headM > 300 && flowM3s < 5)) return 'pelton';
  return 'francis';
}

/** Speed of water leaving a nozzle at the foot of a head H (m/s), ignoring losses: v = √(2 g H) (Torricelli). */
export const jetSpeed = (headM, g = G0) => Math.sqrt(2 * g * headM);

// ---------- heat engines (geothermal) ----------

/**
 * Ceiling on the efficiency of turning heat from a hot stream into work when the stream cools from T_hot to
 * T_out (kelvin) and waste heat goes to surroundings at T0: η = 1 − T0 ln(T_hot / T_out) / (T_hot − T_out).
 * It is the average Carnot efficiency over the stream's cooling, and always below the Carnot value at T_hot.
 */
export function streamEfficiencyLimit(hotK, outK, ambientK) {
  if (Math.abs(hotK - outK) < 1e-9) return 1 - ambientK / hotK;
  return 1 - (ambientK * Math.log(hotK / outK)) / (hotK - outK);
}

// ---------- ocean: waves ----------

/** Deep-water wavelength (m) of a wave of period T (s): L = g T² / (2π). */
export const deepWaterWavelength = (periodS, g = G0) => (g * periodS * periodS) / (2 * Math.PI);

/** Deep-water group velocity (m/s): c_g = g T / (4π), half the phase speed. Energy travels at this speed. */
export const deepWaterGroupVelocity = (periodS, g = G0) => (g * periodS) / (4 * Math.PI);

/** Mean energy per square metre of sea surface for an irregular sea (J/m²): E = ρ g H_s² / 16. */
export const waveEnergyDensity = (hsM, rho = 1025, g = G0) => (rho * g * hsM * hsM) / 16;

// ---------- ocean: tidal barrage ----------

/**
 * Time-step model of an ebb-generating tidal barrage over whole tides.
 * The sea follows a sine of range R and period T. On the flood the sluices open and the basin fills;
 * at high water the gates shut and the basin holds while the sea falls; once the head reaches startHead the
 * turbines run until the head drops to minHead; then the basin holds again until the rising sea meets it.
 * Flow through an opening: Q = Cd A √(2 g h). Power: P = η ρ g Q h.
 * Returns the series for the last tide (hours, sea, basin, power MW, phase) and the energy of that tide (J).
 */
export function simulateEbbBarrage({
  rangeM = 8, basinAreaM2 = 22e6, turbineAreaM2 = 540, sluiceAreaM2 = 1500, startHeadM = 3.5, minHeadM = 1.0,
  eta = 0.85, cd = 1.0, periodS = 44712, dt = 20, tides = 3, rho = 1025, g = G0,
} = {}) {
  const sea = (t) => (rangeM / 2) * Math.cos((2 * Math.PI * t) / periodS);
  let basin = sea(0); let phase = 'hold';
  const series = []; let energy = 0;
  const lastStart = (tides - 1) * periodS; const steps = Math.round((tides * periodS) / dt);
  const every = Math.max(1, Math.round(300 / dt));
  for (let i = 0; i <= steps; i++) {
    const t = i * dt; const s = sea(t); let h = basin - s; let q = 0; let p = 0;
    if (phase === 'sluice' && h > 0.02 && sea(t + dt) < s) phase = 'hold';
    if (phase === 'hold' && h >= startHeadM) phase = 'generate';
    if (phase === 'generate' && h <= minHeadM) phase = 'hold';
    if (phase === 'hold' && h < 0) phase = 'sluice';
    if (phase === 'sluice') {
      h = Math.min(0, h);
      q = -cd * (sluiceAreaM2 + turbineAreaM2) * Math.sqrt(2 * g * -h); // negative: into the basin
    } else if (phase === 'generate') {
      q = cd * turbineAreaM2 * Math.sqrt(2 * g * h);
      p = eta * rho * g * q * h;
    }
    basin -= (q * dt) / basinAreaM2;
    if (t >= lastStart) {
      energy += p * dt;
      if ((i % every) === 0) series.push({ h: (t - lastStart) / 3600, sea: s, basin, mw: p / 1e6, phase });
    }
  }
  return { energyJ: energy, series, periodH: periodS / 3600 };
}
