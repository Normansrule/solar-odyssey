// Sun position and clear-sky irradiance on a tilted surface.
// Solar position: NOAA Solar Calculator equations (after Meeus, "Astronomical
// Algorithms"), accurate to about 0.01° for years 1800–2100. Air mass: Kasten &
// Young (1989). Clear-sky direct beam: Meinel & Meinel (1976) via PVEducation.
// Plane-of-array: isotropic sky model (Liu & Jordan). Cross-checked against pvlib
// in tests/py/test_solar_vs_pvlib.py.

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const mod = (a, n) => ((a % n) + n) % n;

/** Julian Day for a JS Date (UTC). */
export const julianDay = (date) => date.getTime() / 86400000 + 2440587.5;

/**
 * Sun position for a moment and place.
 * lat, lon in degrees (north and east positive). Returns degrees:
 * { zenith (geometric), elevation (geometric), apparentElevation (with refraction),
 *   azimuth (clockwise from north), declination, equationOfTime (minutes), hourAngle }.
 */
export function sunPosition(date, lat, lon) {
  const jc = (julianDay(date) - 2451545) / 36525;
  const L0 = mod(280.46646 + jc * (36000.76983 + jc * 0.0003032), 360);
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const Cc = Math.sin(rad(M)) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
    + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * jc) + Math.sin(rad(3 * M)) * 0.000289;
  const trueLong = L0 + Cc;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const meanObliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(appLong))));
  const y = Math.tan(rad(obliq / 2)) ** 2;
  const eqTime = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M))
    + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
    - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  const minutesUTC = mod(date.getTime() / 60000, 1440);
  const tst = mod(minutesUTC + eqTime + 4 * lon, 1440);
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const cosZ = Math.sin(rad(lat)) * Math.sin(rad(decl)) + Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(ha));
  const zenith = deg(Math.acos(Math.max(-1, Math.min(1, cosZ))));
  const elevation = 90 - zenith;
  // Azimuth measured clockwise from north.
  const denom = Math.cos(rad(lat)) * Math.sin(rad(zenith));
  let azimuth;
  if (Math.abs(denom) < 1e-9) azimuth = lat > 0 ? 180 : 0;
  else {
    const x = Math.max(-1, Math.min(1, (Math.sin(rad(lat)) * Math.cos(rad(zenith)) - Math.sin(rad(decl))) / denom));
    azimuth = ha > 0 ? mod(deg(Math.acos(x)) + 180, 360) : mod(540 - deg(Math.acos(x)), 360);
  }
  return { zenith, elevation, apparentElevation: elevation + refraction(elevation), azimuth, declination: decl, equationOfTime: eqTime, hourAngle: ha };
}

/** NOAA atmospheric refraction correction in degrees for a geometric elevation (degrees). */
export function refraction(elev) {
  if (elev > 85) return 0;
  const te = Math.tan(rad(elev));
  let arcsec;
  if (elev > 5) arcsec = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elev > -0.575) arcsec = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
  else arcsec = -20.772 / te;
  return arcsec / 3600;
}

/** Relative optical air mass, Kasten & Young (1989). NaN when the Sun is below the horizon. */
export function airMass(zenithDeg) {
  if (zenithDeg >= 90) return NaN;
  return 1 / (Math.cos(rad(zenithDeg)) + 0.50572 * (96.07995 - zenithDeg) ** -1.6364);
}

/**
 * Clear-sky direct-normal irradiance (W/m²), Meinel & Meinel: I_D = 1353·[(1 − a·h)·0.7^(AM^0.678) + a·h],
 * a = 0.14 per km of site elevation h. A teaching model: real clear-sky DNI also depends on aerosols and water vapour.
 */
export function clearSkyDNI(zenithDeg, elevationKm = 0) {
  const am = airMass(zenithDeg);
  if (!Number.isFinite(am)) return 0;
  const a = 0.14 * elevationKm;
  return 1353 * ((1 - a) * 0.7 ** (am ** 0.678) + a);
}

/** Cosine of the angle of incidence between the sun and a surface (tilt from horizontal, surface azimuth from north). */
export function cosAOI(tilt, surfaceAzimuth, zenith, azimuth) {
  return Math.cos(rad(zenith)) * Math.cos(rad(tilt))
    + Math.sin(rad(zenith)) * Math.sin(rad(tilt)) * Math.cos(rad(azimuth - surfaceAzimuth));
}
export const aoi = (tilt, surfaceAzimuth, zenith, azimuth) =>
  deg(Math.acos(Math.max(-1, Math.min(1, cosAOI(tilt, surfaceAzimuth, zenith, azimuth)))));

/**
 * Plane-of-array irradiance with the isotropic sky model (W/m²):
 * beam = DNI·max(cos θ, 0); sky = DHI·(1 + cos β)/2; ground = GHI·ρ·(1 − cos β)/2.
 */
export function poaIsotropic({ dni, dhi, ghi, tilt, surfaceAzimuth, zenith, azimuth, albedo = 0.2 }) {
  const beam = dni * Math.max(cosAOI(tilt, surfaceAzimuth, zenith, azimuth), 0);
  const sky = dhi * (1 + Math.cos(rad(tilt))) / 2;
  const ground = ghi * albedo * (1 - Math.cos(rad(tilt))) / 2;
  return { total: beam + sky + ground, beam, sky, ground };
}

/**
 * Clear-sky irradiance components at a moment. Diffuse is taken as 10 % of the
 * direct beam (PVEducation's rule of thumb for clear days).
 */
export function clearSky(date, lat, lon, elevationKm = 0) {
  const pos = sunPosition(date, lat, lon);
  if (pos.zenith >= 90) return { ...pos, dni: 0, dhi: 0, ghi: 0 };
  const dni = clearSkyDNI(pos.zenith, elevationKm);
  const dhi = 0.1 * dni;
  const ghi = dni * Math.cos(rad(pos.zenith)) + dhi;
  return { ...pos, dni, dhi, ghi };
}

/**
 * Clear-sky insolation on a tilted surface over one day, in kWh/m² (numerically equal to
 * "peak sun hours"). `day` is any Date on the wanted UTC calendar day; the integration covers
 * the 24 h centred on local solar noon, in `stepMin` minute steps.
 */
export function dailyInsolation(day, { lat, lon, tilt = 0, surfaceAzimuth = 180, albedo = 0.2, elevationKm = 0, stepMin = 10 }) {
  const noonUTC = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12) - (lon / 15) * 3600000;
  let whm2 = 0; const trace = [];
  for (let m = -720; m < 720; m += stepMin) {
    const t = new Date(noonUTC + (m + stepMin / 2) * 60000);
    const s = clearSky(t, lat, lon, elevationKm);
    const poa = s.zenith < 90 ? poaIsotropic({ ...s, tilt, surfaceAzimuth, albedo }).total : 0;
    whm2 += poa * (stepMin / 60);
    trace.push({ t, elevation: s.elevation, azimuth: s.azimuth, poa, ghi: s.ghi });
  }
  return { kwhm2: whm2 / 1000, trace };
}

/** Clear-sky insolation for the 15th of each month and the year's total (kWh/m²). */
export function annualInsolation(opts, year = 2025) {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const monthly = days.map((n, i) => ({ month: i + 1, daily: dailyInsolation(new Date(Date.UTC(year, i, 15)), { ...opts, stepMin: 15 }).kwhm2, days: n }));
  return { monthly, annual: monthly.reduce((s, m) => s + m.daily * m.days, 0) };
}

/**
 * Energy from an array: E = P_rated × peak-sun-hours × performance ratio.
 * kWp in kW (rated at 1000 W/m²), psh in kWh/m² per day (= hours at 1 sun). Returns kWh.
 */
export const arrayEnergyKWh = (kWp, peakSunHours, performanceRatio = 0.8) => kWp * peakSunHours * performanceRatio;

/** Rated array power in kW from module count, area (m²) and efficiency, at 1000 W/m². */
export const ratedPowerKW = (modules, moduleAreaM2, efficiency) => (modules * moduleAreaM2 * efficiency * 1000) / 1000;
