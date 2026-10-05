// Sun paths, yearly insolation and the best fixed tilt, built on physics/solar.js.
// Pure functions; tested in tests/unit/sunpath.test.mjs.
//
// The yearly numbers use exactly the sampling of solar.annualInsolation (the 15th of each
// month, 15-minute steps over the 24 h centred on local solar noon), but split the work in
// two: the Sun's position and the clear-sky light are computed once per place
// (yearSamples), then any tilt and orientation is only a cheap sum over those samples
// (annualFromSamples). That makes a full tilt sweep or orientation map take milliseconds.

import { sunPosition, clearSky, dailyInsolation } from './solar.js';

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Sun position for an ISO 8601 time string (so worked examples can pass plain JSON). */
export const sunAt = (iso, lat, lon) => sunPosition(new Date(iso), lat, lon);

/**
 * Solar zenith angle (degrees) from latitude, declination and hour angle:
 * cos θz = sin φ sin δ + cos φ cos δ cos ω.
 */
export function zenithFromAngles(lat, decl, hourAngle) {
  const c = Math.sin(rad(lat)) * Math.sin(rad(decl)) + Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(hourAngle));
  return deg(Math.acos(clamp(c, -1, 1)));
}

/** Highest elevation the Sun reaches on a day with declination δ: 90° − |φ − δ| (negative: it never rises). */
export const noonElevation = (lat, decl) => 90 - Math.abs(lat - decl);

/**
 * The moment (a Date) at `minutes` past local mean solar midnight on a calendar day.
 * Local mean solar time runs 4 minutes behind UTC per degree of longitude west.
 */
export function solarTimeToDate(year, month0, day, minutes, lon) {
  return new Date(Date.UTC(year, month0, day) + (minutes - 4 * lon) * 60000);
}

/** The Sun's track across one day: [{ min, elevation, azimuth }] every stepMin minutes of local mean solar time. */
export function dayPath(year, month0, day, lat, lon, stepMin = 5) {
  const out = [];
  for (let m = 0; m <= 1440; m += stepMin) {
    const p = sunPosition(solarTimeToDate(year, month0, day, m, lon), lat, lon);
    out.push({ min: m, elevation: p.elevation, azimuth: p.azimuth });
  }
  return out;
}

/** Split a path into runs where the Sun is above the horizon (for drawing). */
export function aboveHorizonRuns(path) {
  const runs = []; let cur = null;
  for (const p of path) {
    if (p.elevation > 0) { if (!cur) { cur = []; runs.push(cur); } cur.push(p); } else cur = null;
  }
  return runs;
}

/** Clear-sky insolation (kWh/m², = peak sun hours) for an ISO date string. */
export const dailyInsolationOn = (iso, opts) => dailyInsolation(new Date(iso), opts).kwhm2;

/** Hours of daylight in a dailyInsolation trace (geometric centre of the Sun above the horizon). */
export const dayLengthHours = (trace, stepMin = 10) => trace.filter((s) => s.elevation > 0).length * stepMin / 60;

/**
 * Precompute clear-sky samples for a year at one place.
 * Returns { months: [{ month, days, cz, sz, az, dni, dhi, ghi (Float64Arrays) }], stepMin }.
 */
export function yearSamples({ lat, lon, elevationKm = 0 }, { year = 2025, stepMin = 15 } = {}) {
  const months = MONTH_DAYS.map((days, i) => {
    const noonUTC = Date.UTC(year, i, 15, 12) - (lon / 15) * 3600000;
    const cz = []; const sz = []; const az = []; const dni = []; const dhi = []; const ghi = [];
    for (let m = -720; m < 720; m += stepMin) {
      const s = clearSky(new Date(noonUTC + (m + stepMin / 2) * 60000), lat, lon, elevationKm);
      if (s.zenith >= 90) continue; // night: contributes nothing to any surface
      cz.push(Math.cos(rad(s.zenith))); sz.push(Math.sin(rad(s.zenith))); az.push(rad(s.azimuth));
      dni.push(s.dni); dhi.push(s.dhi); ghi.push(s.ghi);
    }
    const f = (a) => Float64Array.from(a);
    return { month: i + 1, days, cz: f(cz), sz: f(sz), az: f(az), dni: f(dni), dhi: f(dhi), ghi: f(ghi) };
  });
  return { months, stepMin };
}

/**
 * Daily (per month) and annual clear-sky insolation on a plane, kWh/m², from yearSamples.
 * Identical to solar.annualInsolation for the same place and plane.
 */
export function annualFromSamples(ys, { tilt = 0, surfaceAzimuth = 180, albedo = 0.2 }) {
  const cb = Math.cos(rad(tilt)); const sb = Math.sin(rad(tilt)); const g = rad(surfaceAzimuth);
  const skyF = (1 + cb) / 2; const gndF = albedo * (1 - cb) / 2; const h = ys.stepMin / 60;
  let annual = 0;
  const monthly = ys.months.map((mo) => {
    let wh = 0;
    for (let k = 0; k < mo.cz.length; k++) {
      const cosT = mo.cz[k] * cb + mo.sz[k] * sb * Math.cos(mo.az[k] - g);
      wh += (mo.dni[k] * (cosT > 0 ? cosT : 0) + mo.dhi[k] * skyF + mo.ghi[k] * gndF) * h;
    }
    const daily = wh / 1000;
    annual += daily * mo.days;
    return { month: mo.month, daily, days: mo.days };
  });
  return { monthly, annual };
}

/**
 * Annual insolation for every tilt from 0° to 90° in `step` degrees, plus the best tilt
 * refined to ±0.05° by golden-section search. Returns { tilts, annual, best: { tilt, annual } }.
 */
export function tiltSweep(ys, { surfaceAzimuth = 180, albedo = 0.2, step = 1 } = {}) {
  const tilts = []; const annual = [];
  for (let t = 0; t <= 90 + 1e-9; t += step) { tilts.push(t); annual.push(annualFromSamples(ys, { tilt: t, surfaceAzimuth, albedo }).annual); }
  const i = annual.indexOf(Math.max(...annual));
  let a = Math.max(0, tilts[i] - step); let b = Math.min(90, tilts[i] + step);
  const f = (t) => annualFromSamples(ys, { tilt: t, surfaceAzimuth, albedo }).annual;
  const r = (Math.sqrt(5) - 1) / 2;
  let c = b - r * (b - a); let d = a + r * (b - a); let fc = f(c); let fd = f(d);
  while (b - a > 0.05) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = f(d); }
  }
  let bt = (a + b) / 2; let ba = f(bt);
  if (annual[i] > ba) { bt = tilts[i]; ba = annual[i]; } // optimum at an end of the range (e.g. 0° near the equator)
  return { tilts, annual, best: { tilt: bt, annual: ba } };
}

/** Best fixed tilt (degrees) for a place and orientation, under the clear-sky model. */
export function bestTiltFor({ lat, lon = 0, elevationKm = 0, surfaceAzimuth, albedo = 0.2, year = 2025 }) {
  const ys = yearSamples({ lat, lon, elevationKm }, { year });
  const az = surfaceAzimuth ?? (lat >= 0 ? 180 : 0);
  return tiltSweep(ys, { surfaceAzimuth: az, albedo }).best.tilt;
}

/**
 * Annual insolation for a grid of tilts × orientations, as a fraction of the grid's best.
 * Returns { tilts, azimuths, values: number[tilt][azimuth] (kWh/m²), best: { tilt, azimuth, annual } }.
 */
export function orientationGrid(ys, { albedo = 0.2, tiltStep = 5, azStep = 10 } = {}) {
  const tilts = []; const azimuths = [];
  for (let t = 0; t <= 90; t += tiltStep) tilts.push(t);
  for (let a = 0; a < 360; a += azStep) azimuths.push(a);
  const best = { tilt: 0, azimuth: 180, annual: -1 };
  const values = tilts.map((t) => azimuths.map((a) => {
    const v = annualFromSamples(ys, { tilt: t, surfaceAzimuth: a, albedo }).annual;
    if (v > best.annual) Object.assign(best, { tilt: t, azimuth: a, annual: v });
    return v;
  }));
  return { tilts, azimuths, values, best };
}

const POINTS = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast',
  'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest'];
/** Name of the nearest of the 16 compass points for an azimuth in degrees. */
export const compassPoint = (az) => POINTS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

/** Unit vector [east, north, up] for an elevation and azimuth (degrees). */
export function skyVector(elevationDeg, azimuthDeg) {
  const e = rad(elevationDeg); const a = rad(azimuthDeg);
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
}

/** Unit normal [east, north, up] of a panel with tilt β facing azimuth γ. */
export const panelNormal = (tilt, surfaceAzimuth) => skyVector(90 - tilt, surfaceAzimuth);

/**
 * Jacobson & Jadhav (2018) fit of optimal fixed tilt (degrees) against latitude for the
 * Northern Hemisphere, derived from PVWatts runs with typical-year weather (R = 0.96).
 */
export const jacobsonFitTilt = (lat) => 1.3793 + lat * (1.2011 + lat * (-0.014404 + lat * 0.000080509));
