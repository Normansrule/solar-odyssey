// Sun path page: preset places dataset, and physical sanity checks on the clear-sky
// sun-path and insolation code (physics/solar.js, physics/sunpath.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as solar from '../../site/assets/js/physics/solar.js';
import * as sp from '../../site/assets/js/physics/sunpath.js';

const close = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} got ${a}, want ${b} ± ${tol}`);
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

// ---------- places.json ----------
const src = read('../../data-src/datasets/places.json');
const built = read('../../site/data/places.json');
const sources = read('../../site/data/sources.json');

test('places.json: built copy matches the source', () => assert.deepEqual(built, src));

test('places.json: meta is complete and cites known sources', () => {
  for (const k of ['title', 'units', 'sources', 'license', 'last_verified']) assert.ok(src.meta[k], `meta.${k}`);
  for (const s of src.meta.sources) assert.ok(sources[s], `unknown source ${s}`);
});

test('places.json: every place has a valid shape and range', () => {
  const ids = new Set();
  assert.ok(src.data.length >= 20, 'at least 20 presets');
  for (const p of src.data) {
    assert.match(p.id, /^[a-z0-9-]+$/); assert.ok(!ids.has(p.id), `duplicate id ${p.id}`); ids.add(p.id);
    for (const k of ['name', 'country', 'region']) assert.equal(typeof p[k], 'string', `${p.id}.${k}`);
    assert.ok(Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90, `${p.id} lat`);
    assert.ok(Number.isFinite(p.lon) && p.lon >= -180 && p.lon <= 180, `${p.id} lon`);
    assert.ok(Number.isFinite(p.elevation) && p.elevation >= -430 && p.elevation <= 8850, `${p.id} elevation`);
    assert.ok(Number.isFinite(p.utcOffset) && p.utcOffset >= -12 && p.utcOffset <= 14, `${p.id} utcOffset`);
    // standard time zones sit within a few hours of the longitude's solar time
    assert.ok(Math.abs(p.utcOffset - p.lon / 15) < 3.5, `${p.id}: UTC offset ${p.utcOffset} far from longitude ${p.lon}`);
  }
});

test('places.json: spread across hemispheres, continents and latitudes', () => {
  const lats = src.data.map((p) => p.lat);
  assert.ok(Math.max(...lats) > 75 && Math.min(...lats) < -50, 'from the Arctic to the far south');
  assert.ok(lats.filter((l) => Math.abs(l) < 5).length >= 3, 'several near the equator');
  assert.ok(new Set(src.data.map((p) => p.region)).size >= 6);
  for (const name of ['Los Angeles', 'Seattle', 'Anchorage', 'Mexico City', 'Quito', 'São Paulo', 'London', 'Oslo', 'Madrid', 'Cairo', 'Nairobi', 'Cape Town', 'Riyadh', 'Delhi', 'Beijing', 'Tokyo', 'Singapore', 'Sydney', 'Alice Springs', 'Reykjavík']) {
    assert.ok(src.data.some((p) => p.name.startsWith(name)), `missing ${name}`);
  }
  for (const id of ['calama', 'longyearbyen']) assert.ok(src.data.some((p) => p.id === id), id);
});

// ---------- geometry ----------
test('equinox solar noon on the equator puts the Sun at the zenith', () => {
  // On 2026-03-20 the equation of time is about −7.4 min, so solar noon at 0° E is 12:07:26 UTC.
  const p = sp.sunAt('2026-03-20T12:07:26Z', 0, 0);
  assert.ok(p.zenith < 0.1, `zenith ${p.zenith}`);
  close(p.equationOfTime, -7.43, 0.05, 'equation of time');
});

test('noon zenith = latitude − declination (spherical formula agrees with the full calculation)', () => {
  close(sp.zenithFromAngles(34.05, 23.44, 0), 10.61, 1e-9);
  close(sp.zenithFromAngles(0, 0, 90), 90, 1e-9, 'equinox sunset on the equator');
  const d = solar.sunPosition(new Date('2026-06-21T12:00:00Z'), 0, 0).declination;
  close(d, 23.44, 0.01, 'June solstice declination');
  // full calculation at local solar noon in Los Angeles on the solstice
  const t = sp.solarTimeToDate(2026, 5, 21, 720, -118.24);
  const p = solar.sunPosition(t, 34.05, -118.24);
  close(p.elevation, 90 - (34.05 - p.declination), 0.05, 'LA solstice noon elevation');
  close(sp.noonElevation(78.22, -23.44), -11.66, 1e-9);
});

test('equinox: sunrise due east, about 12 hours of daylight, at several latitudes', () => {
  for (const lat of [-45, -20, 0, 34, 60]) {
    const path = sp.dayPath(2026, 2, 20, lat, 0, 2);
    const up = path.filter((p) => p.elevation > 0);
    close((up.length * 2) / 60, 12, 0.25, `day length at ${lat}°`);
    close(up[0].azimuth, 90, 2, `sunrise azimuth at ${lat}°`);
  }
});

test('polar night and midnight sun at Longyearbyen (78.2° N)', () => {
  const dec = solar.dailyInsolation(new Date(Date.UTC(2026, 11, 21)), { lat: 78.22, lon: 15.65, tilt: 0 });
  assert.equal(dec.kwhm2, 0);
  const jun = sp.dayPath(2026, 5, 21, 78.22, 15.65, 10);
  assert.ok(jun.every((p) => p.elevation > 0), 'Sun above the horizon all day in June');
});

test('panel normal and sun vector agree with cosAOI', () => {
  for (const [tilt, saz, zen, az] of [[30, 180, 40, 200], [60, 90, 70, 100], [10, 0, 20, 300]]) {
    const n = sp.panelNormal(tilt, saz); const s = sp.skyVector(90 - zen, az);
    close(n[0] * s[0] + n[1] * s[1] + n[2] * s[2], solar.cosAOI(tilt, saz, zen, az), 1e-12);
  }
  assert.equal(sp.compassPoint(180), 'south'); assert.equal(sp.compassPoint(200), 'south-southwest'); assert.equal(sp.compassPoint(-10), 'north');
});

// ---------- irradiance ----------
test('a flat panel receives exactly the global horizontal irradiance', () => {
  const s = solar.clearSky(new Date('2026-05-01T18:00:00Z'), 34.05, -118.24);
  const p = solar.poaIsotropic({ ...s, tilt: 0, surfaceAzimuth: 180, albedo: 0.75 });
  close(p.total, s.ghi, 1e-9);
});

test('altitude raises the clear-sky beam', () => {
  assert.ok(solar.clearSkyDNI(30, 2.85) > solar.clearSkyDNI(30, 0));
  close(solar.clearSkyDNI(0, 0), 947.2, 0.1); close(solar.clearSkyDNI(0, 2.24), 1074.4, 0.1);
});

test('yearSamples + annualFromSamples reproduce solar.annualInsolation exactly', () => {
  for (const [lat, lon, tilt, az, alb, el] of [[34.05, -118.24, 30, 180, 0.2, 0], [-33.87, 151.21, 25, 0, 0.4, 0.02], [61.22, -149.9, 70, 135, 0.75, 0], [-0.18, -78.47, 5, 90, 0.2, 2.85]]) {
    const ys = sp.yearSamples({ lat, lon, elevationKm: el });
    const a = sp.annualFromSamples(ys, { tilt, surfaceAzimuth: az, albedo: alb });
    const b = solar.annualInsolation({ lat, lon, tilt, surfaceAzimuth: az, albedo: alb, elevationKm: el });
    close(a.annual, b.annual, 1e-6, `annual at ${lat}`);
    a.monthly.forEach((m, i) => close(m.daily, b.monthly[i].daily, 1e-9));
  }
});

test('best annual tilt at 34° N: a few degrees flatter than the latitude, as the clear-sky model gives it', () => {
  // The clear-sky optimum is below the latitude because summer days are longer and the low winter
  // Sun shines through more air (and a flatter panel sees more diffuse sky).
  const bt = sp.bestTiltFor({ lat: 34, lon: 0 });
  assert.ok(bt > 27 && bt < 33, `best tilt ${bt}`);
  close(sp.bestTiltFor({ lat: 34.05, lon: -118.24 }), 30.15, 0.2, 'Los Angeles');
  // the optimum is flat: ±10° costs under 2 %
  const ys = sp.yearSamples({ lat: 34.05, lon: -118.24 });
  const sw = sp.tiltSweep(ys, { surfaceAzimuth: 180 });
  for (const t of [20, 40]) assert.ok(sw.annual[t] / sw.best.annual > 0.98, `tilt ${t}`);
  assert.ok(sw.annual.every((v) => v <= sw.best.annual + 1e-6), 'refined best is the maximum');
});

test('best tilt rises with latitude, is near zero at the equator, and the best direction faces the equator', () => {
  const tilts = [0, 15, 30, 45, 60].map((lat) => sp.bestTiltFor({ lat }));
  assert.ok(tilts[0] < 1, `equator ${tilts[0]}`);
  for (let i = 1; i < tilts.length; i++) assert.ok(tilts[i] > tilts[i - 1], `monotonic ${tilts}`);
  const north = sp.orientationGrid(sp.yearSamples({ lat: 40, lon: 0 }), {});
  assert.equal(north.best.azimuth, 180);
  const south = sp.orientationGrid(sp.yearSamples({ lat: -34, lon: 151 }), {});
  assert.equal(south.best.azimuth, 0);
  close(sp.bestTiltFor({ lat: -34, lon: 151 }), sp.bestTiltFor({ lat: 34, lon: -151 }), 3, 'hemispheres roughly mirror');
});

test('Jacobson–Jadhav fit matches its published examples roughly and the page value exactly', () => {
  close(sp.jacobsonFitTilt(34.05), 28.755, 0.001);
  assert.ok(sp.jacobsonFitTilt(51) > 35 && sp.jacobsonFitTilt(51) < 45);
});

test('daily insolation equals peak sun hours and drives the energy formula', () => {
  const psh = sp.dailyInsolationOn('2026-06-21', { lat: 34.05, lon: -118.24, tilt: 0 });
  close(psh, 8.56, 0.01);
  close(solar.arrayEnergyKWh(5, 5.5, 0.8), 22, 1e-12);
  const tr = solar.dailyInsolation(new Date('2026-06-21'), { lat: 34.05, lon: -118.24, tilt: 0 }).trace;
  close(sp.dayLengthHours(tr, 10), 14.33, 0.2, 'LA solstice day length');
  // summer beats winter on flat ground; a tilted panel narrows the gap
  const dec = sp.dailyInsolationOn('2026-12-21', { lat: 34.05, lon: -118.24, tilt: 0 });
  const decT = sp.dailyInsolationOn('2026-12-21', { lat: 34.05, lon: -118.24, tilt: 30 });
  assert.ok(psh > dec && decT > dec);
});
