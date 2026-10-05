// Geometry of concentrating solar power: how a heliostat must tilt to send sunlight to a tower.
// Vectors are [east, north, up]. Pure functions; tested in tests/unit/renewables-b.test.mjs.
//
// Law of reflection: the mirror's normal bisects the direction to the sun and the direction to
// the receiver, n = (ŝ + r̂) / |ŝ + r̂|. The "cosine efficiency" is ŝ·n = cos(θ/2), where θ is the
// angle between ŝ and r̂: the mirror presents only that fraction of its area to the sun.

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export const norm = (v) => Math.hypot(...v);
export const unit = (v) => { const m = norm(v); return v.map((x) => x / m); };
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const sub = (a, b) => a.map((x, i) => x - b[i]);

/** Unit vector towards the sun from elevation and azimuth (degrees, azimuth clockwise from north). */
export function sunVector(elevationDeg, azimuthDeg) {
  const e = rad(elevationDeg); const a = rad(azimuthDeg);
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
}

/** Unit normal a flat mirror at `mirror` needs so that sunlight from direction `sun` reaches `receiver`. */
export function heliostatNormal(sun, mirror, receiver) {
  const r = unit(sub(receiver, mirror));
  return unit(unit(sun).map((x, i) => x + r[i]));
}

/** Fraction of a heliostat's area the sun sees: ŝ·n = cos(θ/2). */
export function cosineEfficiency(sun, mirror, receiver) {
  return dot(unit(sun), heliostatNormal(sun, mirror, receiver));
}

/** Tilt of the mirror from horizontal (degrees) and the compass direction its face points to (degrees). */
export function mirrorAttitude(sun, mirror, receiver) {
  const n = heliostatNormal(sun, mirror, receiver);
  return { tiltDeg: deg(Math.acos(Math.max(-1, Math.min(1, n[2])))), facingDeg: (deg(Math.atan2(n[0], n[1])) + 360) % 360 };
}

/** Worked-example helper: cosine efficiency from sun angles and a mirror position relative to a tower of height towerM. */
export const cosineEfficiencyAt = (elevationDeg, azimuthDeg, eastM, northM, towerM) =>
  cosineEfficiency(sunVector(elevationDeg, azimuthDeg), [eastM, northM, 0], [0, 0, towerM]);

/** Reflect direction d (pointing along the ray) in a mirror with unit normal n. */
export const reflect = (d, n) => { const k = 2 * dot(d, n); return d.map((x, i) => x - k * n[i]); };

/**
 * A day of a molten-salt power tower (a teaching model, not a plant simulator).
 *   dni: array of direct-normal irradiance (W/m²) at each step; dt step length (h).
 *   fieldM2: mirror area; etaOpt: share of the sunlight on the mirrors that ends up as heat in the salt
 *   (cosine, reflectivity, spillage and receiver losses together); ratedMWe: turbine output;
 *   etaCycle: steam-cycle efficiency; storageH: hours of full-load heat the hot tank can hold.
 * Heat goes into the hot tank; the turbine runs at full load whenever the tank holds enough heat for
 * the step; heat that arrives when the tank is full is spilled (mirrors defocused). The day is repeated
 * until it starts and ends with the same tank level. Energies in MWh (thermal: _th, electric: _e).
 */
export function towerDay({ dni, dt = 0.25, fieldM2, etaOpt = 0.55, ratedMWe, etaCycle = 0.4, storageH }) {
  const qTurb = ratedMWe / etaCycle;            // MW_th the turbine needs at full load
  const cap = Math.max(qTurb * dt, storageH * qTurb); // tank size, MWh_th (at least one step of buffer)
  const qField = dni.map((d) => (d * fieldM2 * etaOpt) / 1e6); // MW_th collected
  let s0 = 0; let out;
  for (let k = 0; k < 30; k += 1) {
    let s = s0; const level = []; const power = []; const spilled = [];
    for (let i = 0; i < dni.length; i += 1) {
      s += qField[i] * dt;
      let spill = 0;
      if (s > cap) { spill = (s - cap) / dt; s = cap; }
      let pe = 0;
      if (s >= qTurb * dt - 1e-9) { s -= qTurb * dt; pe = ratedMWe; }
      level.push(s / cap); power.push(pe); spilled.push(spill);
    }
    out = { qField, level, power, spilled, capMWh: cap, qTurb, endLevel: s };
    if (Math.abs(s - s0) < 1e-6 * cap) break;
    s0 = s;
  }
  const sum = (a) => a.reduce((t, x) => t + x * dt, 0);
  const powerHours = out.power.filter((p) => p > 0).length * dt;
  return { ...out, collectedMWhTh: sum(qField), spilledMWhTh: sum(out.spilled), electricMWh: sum(out.power), fullLoadHours: powerHours };
}
