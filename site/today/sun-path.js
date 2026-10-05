// Sun path and energy yield: sky dome / sun path chart, live clear-sky irradiance,
// the day's curve, the year by month, a tilt sweep, an orientation map and an energy calculator.
// Physics: physics/solar.js (cross-checked against pvlib) and physics/sunpath.js.
import { h, clear, fmt, reducedMotion, animate, onTheme } from '../assets/js/dom.js';
import { loadData, setBadge, is } from '../assets/js/data.js';
import { makeChart, baseOption } from '../assets/js/charts.js';
import { sunPosition, clearSky, poaIsotropic, aoi as aoiDeg, airMass, dailyInsolation, arrayEnergyKWh } from '../assets/js/physics/solar.js';
import { solarTimeToDate, dayPath, aboveHorizonRuns, yearSamples, annualFromSamples, tiltSweep, orientationGrid, compassPoint, jacobsonFitTilt, dayLengthHours } from '../assets/js/physics/sunpath.js';
import { createFlat } from './sun-path-flat.js';

const YEAR = 2026;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const $ = (id) => document.getElementById(id);
const ABBR = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const abbr = (az) => ABBR[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
const LA = { id: 'los-angeles', name: 'Los Angeles', country: 'USA', region: 'North America', lat: 34.05, lon: -118.24, elevation: 90, utcOffset: -8 };

const todayDoy = () => {
  const d = new Date(); let n = d.getDate();
  for (let m = 0; m < d.getMonth(); m++) n += MONTH_DAYS[m];
  return Math.min(365, n);
};
const fromDoy = (doy) => { let m = 0; let d = doy; while (d > MONTH_DAYS[m]) { d -= MONTH_DAYS[m]; m++; } return { m0: m, d }; };
const dateLabel = (doy) => { const { m0, d } = fromDoy(doy); return new Date(Date.UTC(YEAR, m0, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }); };
const hhmm = (min) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const latStr = (lat) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
const lonStr = (lon) => `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
const tzStr = (tz) => { if (tz === 0) return 'UTC'; const a = Math.abs(tz); const hh = Math.floor(a); const mm = Math.round((a - hh) * 60); return `UTC${tz > 0 ? '+' : '−'}${hh}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`; };

const st = {
  place: LA.id, name: LA.name, lat: LA.lat, lon: LA.lon, elevM: LA.elevation, tz: LA.utcOffset, custom: false,
  doy: todayDoy(), min: 630, tilt: 30, az: 180, albedo: 0.2, view: 'dome', kwp: 5, pr: 0.8,
};
let PLACES = [LA];

// ---------------- model ----------------
const elevKm = () => st.elevM / 1000;
const siteKey = () => `${st.lat}|${st.lon}|${st.elevM}`;
const at = (min) => { const { m0, d } = fromDoy(st.doy); return solarTimeToDate(YEAR, m0, d, min, st.lon); };

function nowModel() {
  const t = at(st.min);
  const s = clearSky(t, st.lat, st.lon, elevKm());
  const up = s.zenith < 90;
  const poa = up ? poaIsotropic({ ...s, tilt: st.tilt, surfaceAzimuth: st.az, albedo: st.albedo }) : { total: 0, beam: 0, sky: 0, ground: 0 };
  return { t, s, up, poa, aoi: aoiDeg(st.tilt, st.az, s.zenith, s.azimuth), am: up ? airMass(s.zenith) : NaN };
}

const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) { if (cache.size > 80) cache.clear(); cache.set(key, fn()); } return cache.get(key); }

function pathsModel() {
  const { m0, d } = fromDoy(st.doy);
  const base = cached(`paths|${st.lat}|${st.lon}`, () => {
    const mk = (mm, dd) => dayPath(YEAR, mm, dd, st.lat, st.lon, 5);
    const jun = mk(5, 21); const eq = mk(2, 20); const dec = mk(11, 21);
    const noonOf = (p) => p.reduce((a, b) => (b.elevation > a.elevation ? b : a));
    return { jun, eq, dec, noon: { jun: noonOf(jun), eq: noonOf(eq), dec: noonOf(dec) } };
  });
  const day = cached(`path|${st.lat}|${st.lon}|${st.doy}`, () => dayPath(YEAR, m0, d, st.lat, st.lon, 5));
  const near = (a, b) => Math.abs(a - b) <= 3;
  const showDay = !(near(st.doy, 172) || near(st.doy, 79) || near(st.doy, 355) || near(st.doy, 266));
  const polar = day.every((p) => p.elevation > 0);
  const hourMarks = day.filter((p) => p.min % 60 === 0 && p.min < 1440 && p.elevation > 0)
    .map((p) => ({ ...p, label: (p.min / 60) % 3 === 0 && p.min !== 720 ? hhmm(p.min) : (polar && p.min % 360 === 0 && p.min !== 720 ? hhmm(p.min) : null) }));
  return {
    pathKey: `${st.lat}|${st.lon}|${st.doy}|${showDay}`,
    paths: { jun: aboveHorizonRuns(base.jun), eq: aboveHorizonRuns(base.eq), dec: aboveHorizonRuns(base.dec), day: aboveHorizonRuns(day) },
    noon: base.noon, showDay, hourMarks, day,
  };
}

function dayModel() {
  const { m0, d } = fromDoy(st.doy);
  const date = new Date(Date.UTC(YEAR, m0, d));
  const base = { lat: st.lat, lon: st.lon, albedo: st.albedo, elevationKm: elevKm(), stepMin: 10 };
  const tilted = cached(`day|${siteKey()}|${st.doy}|${st.tilt}|${st.az}|${st.albedo}`, () => dailyInsolation(date, { ...base, tilt: st.tilt, surfaceAzimuth: st.az }));
  const flat = cached(`day|${siteKey()}|${st.doy}|flat`, () => dailyInsolation(date, { ...base, tilt: 0, surfaceAzimuth: 180, albedo: 0 }));
  return { tilted, flat };
}

const samples = () => cached(`ys|${siteKey()}`, () => yearSamples({ lat: st.lat, lon: st.lon, elevationKm: elevKm() }, { year: YEAR }));
function yearModel() {
  const ys = samples();
  const ann = annualFromSamples(ys, { tilt: st.tilt, surfaceAzimuth: st.az, albedo: st.albedo });
  const flat = annualFromSamples(ys, { tilt: 0, surfaceAzimuth: 180, albedo: st.albedo });
  const sweep = cached(`sweep|${siteKey()}|${st.az}|${st.albedo}`, () => tiltSweep(ys, { surfaceAzimuth: st.az, albedo: st.albedo, step: 1 }));
  const grid = cached(`grid|${siteKey()}|${st.albedo}`, () => orientationGrid(ys, { albedo: st.albedo, tiltStep: 5, azStep: 10 }));
  return { ann, flat, sweep, grid };
}

// ---------------- stage (dome or flat chart) ----------------
const stageHost = $('sp-stage');
const flatHost = h('div', { class: 'sp-flat-host' });
stageHost.append(flatHost);
const flat = createFlat(flatHost);
let dome = null; let domeFailed = false;

function stageState(N, P) {
  const sunDesc = N.up
    ? `the Sun is ${Math.round(N.s.elevation)}° high in the ${compassPoint(N.s.azimuth)}, the angle of incidence on the panel is ${Math.round(N.aoi)}°`
    : 'the Sun is below the horizon';
  return {
    ...P, tilt: st.tilt, az: st.az, aoi: N.aoi, sun: N.up ? { elevation: N.s.elevation, azimuth: N.s.azimuth } : null,
    hemisphere: st.lat >= 0 ? 'N' : 'S',
    label: `${st.view === 'dome' ? 'Sky dome' : 'Sun path chart'} for ${st.name} on ${dateLabel(st.doy)} at ${hhmm(st.min)} solar time: ${sunDesc}. Panel tilted ${st.tilt}° facing ${compassPoint(st.az)}. Arcs show the Sun's path on the June solstice, the equinoxes and the December solstice${P.showDay ? ', and on the chosen date' : ''}.`,
  };
}

function setView(v) {
  st.view = v === 'dome' && !domeFailed ? 'dome' : 'flat';
  $('sp-view-dome').setAttribute('aria-pressed', String(st.view === 'dome'));
  $('sp-view-flat').setAttribute('aria-pressed', String(st.view === 'flat'));
  stageHost.dataset.view = st.view;
  $('sp-orbit').hidden = st.view !== 'dome';
  $('sp-hint').textContent = st.view === 'dome'
    ? 'Drag the dome to look around it, or use the buttons. The amber line runs from the Sun to the panel; the arrow sticking straight out of the panel is its normal. The angle between them, θ, is the angle of incidence.'
    : 'The sky seen from above, as on a map: the zenith in the centre, the horizon at the edge, north at the top. Rings mark 30° and 60° of elevation. The diamond is where the panel faces; the dashed arc to the Sun is the angle of incidence.';
  if (st.view === 'dome' && dome) dome.resize();
  renderNow();
}

async function initDome() {
  const mod = await import('./sun-path-dome.js');
  if (!mod.webglAvailable()) throw new Error('WebGL is not available');
  dome = mod.createDome(stageHost);
}

// ---------------- readouts ----------------
const setText = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
let chartCursorT = 0;

function renderNow({ fromPlay = false } = {}) {
  const N = nowModel();
  const P = pathsModel();
  setText('sp-time-out', hhmm(st.min));
  setText('r-el', N.up ? `${N.s.elevation.toFixed(1)}°` : 'below horizon');
  setText('r-az', `${Math.round(N.s.azimuth)}° ${abbr(N.s.azimuth)}`);
  setText('r-am', N.up ? fmt(N.am, 3) : '—');
  setText('r-aoi', N.up ? `${N.aoi.toFixed(1)}°` : '—');
  setText('r-dni', `${Math.round(N.s.dni)} W/m²`); setText('r-dhi', `${Math.round(N.s.dhi)} W/m²`); setText('r-ghi', `${Math.round(N.s.ghi)} W/m²`);
  setText('r-poa', String(Math.round(N.poa.total)));
  setText('r-beam', String(Math.round(N.poa.beam))); setText('r-sky', String(Math.round(N.poa.sky))); setText('r-ground', String(Math.round(N.poa.ground)));
  const scale = 1200;
  $('sp-bar-beam').style.width = `${(100 * N.poa.beam) / scale}%`;
  $('sp-bar-sky').style.width = `${(100 * N.poa.sky) / scale}%`;
  $('sp-bar-ground').style.width = `${(100 * N.poa.ground) / scale}%`;
  $('sp-poa-bar').setAttribute('aria-label', `Plane-of-array irradiance ${Math.round(N.poa.total)} W/m²: beam ${Math.round(N.poa.beam)}, sky ${Math.round(N.poa.sky)}, ground ${Math.round(N.poa.ground)} W/m², on a scale to 1200 W/m².`);

  // clock time
  const utc = N.t.getUTCHours() * 60 + N.t.getUTCMinutes() + N.t.getUTCSeconds() / 60;
  const clock = st.custom || st.tz == null
    ? `That moment is ${hhmm(utc)} UTC. Clock time depends on the local time zone.`
    : `That is about ${hhmm(utc + st.tz * 60)} standard time in ${st.name} (${tzStr(st.tz)}), an hour later where daylight saving applies, and ${hhmm(utc)} UTC.`;
  setText('sp-clock', clock);

  const S = stageState(N, P);
  if (st.view === 'dome' && dome) dome.update(S); else flat.update(S);

  if (!fromPlay || performance.now() - chartCursorT > 90) { chartCursorT = performance.now(); moveDayCursor(N); }
  if (!fromPlay) renderStatus(N, P);
}

function renderStatus(N, P) {
  const day = P.day;
  const ups = day.filter((p) => p.elevation > 0).length;
  let msg;
  if (ups === 0) msg = `On ${dateLabel(st.doy)} the Sun does not rise here: polar night.`;
  else if (ups === day.length) msg = `On ${dateLabel(st.doy)} the Sun never sets here: midnight sun.`;
  else {
    const cross = (rise) => {
      for (let i = 1; i < day.length; i++) {
        const a = day[i - 1]; const b = day[i];
        if (rise ? a.elevation <= 0 && b.elevation > 0 : a.elevation > 0 && b.elevation <= 0) return a.min + ((0 - a.elevation) / (b.elevation - a.elevation)) * (b.min - a.min);
      }
      return null;
    };
    const r = cross(true); const s = cross(false);
    msg = `Sunrise ${r != null ? hhmm(r) : '—'}, sunset ${s != null ? hhmm(s) : '—'} solar time.`;
  }
  if (!N.up && ups > 0 && ups < day.length) msg += ' The Sun is below the horizon now; move the time slider or press play.';
  setText('sp-status', msg);
}

// ---------------- day chart ----------------
let dayChart = null; let D = null;
function renderDay() {
  D = dayModel();
  setText('d-poa', fmt(D.tilted.kwhm2, 3));
  setText('d-ghi', fmt(D.flat.kwhm2, 3));
  setText('d-len', fmt(dayLengthHours(D.flat.trace, 10), 3));
  dayChart?.refresh();
  renderYield();
}
const dayX = (i) => (i * 10 + 5) / 60;
function dayOption(c) {
  const b = baseOption();
  const poa = D.tilted.trace.map((s, i) => [dayX(i), Math.round(s.poa)]);
  const ghi = D.flat.trace.map((s, i) => [dayX(i), Math.round(s.ghi)]);
  const peak = Math.max(1000, ...poa.map((p) => p[1]), ...ghi.map((p) => p[1]));
  const N = nowModel();
  return {
    ...b, animation: false,
    grid: { left: 8, right: 18, top: 44, bottom: 8, containLabel: true },
    legend: { ...b.legend, top: 0, right: 0, itemWidth: 18, itemHeight: 10, data: ['Tilted panel (POA)', 'Flat ground (GHI)'] },
    tooltip: { ...b.tooltip, trigger: 'axis', valueFormatter: (v) => `${v} W/m²`, axisPointer: { type: 'line', lineStyle: { color: c.ink2 } } },
    xAxis: { ...b._axis, type: 'value', min: 0, max: 24, interval: ($('sp-day-chart').clientWidth || 600) < 520 ? 6 : 3, splitLine: { show: false }, axisLabel: { ...b._axis.axisLabel, formatter: (v) => `${String(v).padStart(2, '0')}:00` } },
    yAxis: { ...b._axis, type: 'value', min: 0, max: Math.ceil(peak / 200) * 200, interval: 200, name: 'W/m²', nameGap: 12 },
    series: [
      {
        id: 'poa', name: 'Tilted panel (POA)', type: 'line', showSymbol: false, data: poa, z: 3,
        lineStyle: { width: 2.5, color: c.sun, cap: 'round', join: 'round' }, itemStyle: { color: c.sun }, areaStyle: { color: c.sun, opacity: 0.12 },
        markLine: { symbol: 'none', silent: true, animation: false, label: { show: false }, lineStyle: { color: c.ink2, width: 1, type: 'solid' }, data: [{ xAxis: st.min / 60 }] },
        markPoint: { symbol: 'circle', symbolSize: 10, silent: true, animation: false, itemStyle: { color: c.sun, borderColor: c.panel, borderWidth: 2 }, label: { show: false }, data: [{ coord: [st.min / 60, Math.round(N.poa.total)] }] },
      },
      { id: 'ghi', name: 'Flat ground (GHI)', type: 'line', showSymbol: false, data: ghi, z: 2, lineStyle: { width: 2, color: c.silicon }, itemStyle: { color: c.silicon } },
    ],
  };
}
function moveDayCursor(N) {
  if (!dayChart) return;
  dayChart.chart.setOption({ series: [{ id: 'poa', markLine: { data: [{ xAxis: st.min / 60 }] }, markPoint: { data: [{ coord: [st.min / 60, Math.round(N.poa.total)] }] } }] });
}

// ---------------- year ----------------
let monthChart = null; let tiltChart = null; let Y = null; let yearTimer = 0;
function scheduleYear(delay = 140) { clearTimeout(yearTimer); yearTimer = setTimeout(renderYear, delay); }
function renderYear() {
  Y = yearModel();
  monthChart?.refresh(); tiltChart?.refresh();
  renderWheel(); renderBestText(); renderYield();
  setText('y-poa', Math.round(Y.ann.annual).toLocaleString('en-US'));
  setText('y-ghi', Math.round(Y.flat.annual).toLocaleString('en-US'));
  setText('sp-sweep-dir', `${compassPoint(st.az)} (${st.az}°)`);
  setText('sp-year-setup', `${st.name} (${latStr(st.lat)}, ${lonStr(st.lon)}, ${Math.round(st.elevM)} m), panel tilted ${st.tilt}° facing ${compassPoint(st.az)} (${st.az}°), ground albedo ${st.albedo.toFixed(2)}. Change them in the widget above.`);
}
function monthOption(c) {
  const b = baseOption();
  return {
    ...b, animationDurationUpdate: 300,
    grid: { left: 8, right: 8, top: 40, bottom: 4, containLabel: true },
    legend: { ...b.legend, top: 0, right: 0, itemWidth: 12, itemHeight: 10, data: ['Tilted panel', 'Flat ground'] },
    tooltip: { ...b.tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: c.rule, opacity: 0.25 } }, valueFormatter: (v) => `${v} kWh/m² per day` },
    xAxis: { ...b._axis, type: 'category', data: MONTHS, axisTick: { show: false }, splitLine: { show: false } },
    yAxis: { ...b._axis, type: 'value', min: 0 },
    series: [
      { name: 'Tilted panel', type: 'bar', barMaxWidth: 14, barGap: '18%', data: Y.ann.monthly.map((m) => +m.daily.toFixed(2)), itemStyle: { color: c.sun, borderRadius: [3, 3, 0, 0] } },
      { name: 'Flat ground', type: 'bar', barMaxWidth: 14, data: Y.flat.monthly.map((m) => +m.daily.toFixed(2)), itemStyle: { color: c.silicon, borderRadius: [3, 3, 0, 0] } },
    ],
  };
}
function tiltOption(c) {
  const b = baseOption();
  const data = Y.sweep.tilts.map((t, i) => [t, Math.round(Y.sweep.annual[i])]);
  const best = Y.sweep.best; const lat = Math.abs(st.lat);
  const mine = Math.round(annualFromSamples(samples(), { tilt: st.tilt, surfaceAzimuth: st.az, albedo: st.albedo }).annual);
  const lbl = { color: c.ink, fontSize: 12, fontWeight: 600 };
  return {
    ...b, animation: false,
    grid: { left: 8, right: 16, top: 40, bottom: 4, containLabel: true },
    tooltip: { ...b.tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: c.ink2 } }, formatter: (ps) => { const p = ps.find((x) => x.seriesId === 'sweep') || ps[0]; return `Tilt ${p.value[0]}°: ${p.value[1].toLocaleString('en-US')} kWh/m² per year`; } },
    legend: { show: false },
    xAxis: { ...b._axis, type: 'value', min: 0, max: 90, interval: 15, splitLine: { show: false }, axisLabel: { ...b._axis.axisLabel, formatter: (v) => `${v}°` } },
    yAxis: { ...b._axis, type: 'value', min: 0, max: Math.ceil((best.annual * 1.18) / 500) * 500 },
    series: [
      {
        id: 'sweep', name: 'Yearly sunlight', type: 'line', showSymbol: false, data, lineStyle: { width: 2.5, color: c.sun }, itemStyle: { color: c.sun }, z: 2,
        markLine: lat <= 90 ? { symbol: 'none', silent: true, lineStyle: { color: c.ink2, width: 1, type: 'solid' }, label: { formatter: `latitude ${Math.round(lat)}°`, color: c.ink2, position: 'end', distance: 4 }, data: [{ xAxis: lat }] } : undefined,
        markPoint: { symbol: 'circle', symbolSize: 10, silent: true, itemStyle: { color: c.ink, borderColor: c.panel, borderWidth: 2 }, label: { ...lbl, position: 'top', distance: 8, align: lat >= best.tilt ? 'right' : 'left', formatter: `best ${Math.round(best.tilt)}°` }, data: [{ coord: [best.tilt, Math.round(best.annual)] }] },
      },
      { id: 'mine', name: 'Your tilt', type: 'scatter', symbolSize: 11, z: 3, data: [[st.tilt, mine]], itemStyle: { color: c.silicon, borderColor: c.panel, borderWidth: 2 }, label: { show: true, ...lbl, position: 'bottom', distance: 8, formatter: 'yours' }, tooltip: { show: false } },
    ],
  };
}

// ---------------- orientation wheel ----------------
const WS = 360; const WC = WS / 2; const WR = 140;
const wheel = $('sp-wheel');
const BINS = [[0.98, '98–100 %'], [0.95, '95–98 %'], [0.9, '90–95 %'], [0.8, '80–90 %'], [0.7, '70–80 %'], [0, 'under 70 %']];
const wp = (tilt, az) => { const r = (WR * tilt) / 90; return [WC + r * Math.sin((az * Math.PI) / 180), WC - r * Math.cos((az * Math.PI) / 180)]; };
let wheelCells = null; let wheelMarks = null;
function buildWheel() {
  const S = (t, a = {}, ...k) => h.svg(t, a, ...k);
  const cells = S('g', { class: 'spw-cells' }); wheelCells = [];
  for (let ti = 0; ti <= 18; ti++) {
    const row = [];
    for (let ai = 0; ai < 36; ai++) {
      const t = ti * 5; const a = ai * 10;
      const r0 = (WR * Math.max(0, t - 2.5)) / 90; const r1 = (WR * Math.min(90, t + 2.5)) / 90;
      const a0 = ((a - 5) * Math.PI) / 180; const a1 = ((a + 5) * Math.PI) / 180;
      const P = (r, ang) => `${(WC + r * Math.sin(ang)).toFixed(2)} ${(WC - r * Math.cos(ang)).toFixed(2)}`;
      const d = r0 > 0
        ? `M${P(r1, a0)} A${r1} ${r1} 0 0 1 ${P(r1, a1)} L${P(r0, a1)} A${r0} ${r0} 0 0 0 ${P(r0, a0)} Z`
        : `M${WC} ${WC} L${P(r1, a0)} A${r1} ${r1} 0 0 1 ${P(r1, a1)} Z`;
      const el = S('path', { d }); cells.append(el); row.push(el);
    }
    wheelCells.push(row);
  }
  const grid = S('g', { class: 'spw-grid' });
  for (const t of [30, 60, 90]) grid.append(S('circle', { cx: WC, cy: WC, r: (WR * t) / 90 }));
  for (const a of [0, 90, 180, 270]) { const [x, y] = wp(90, a); grid.append(S('line', { x1: WC, y1: WC, x2: x, y2: y })); }
  const labels = S('g', { class: 'spw-labels' });
  for (const [t, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) { const [x, y] = wp(103, a); labels.append(S('text', { x, y: y + 5, 'text-anchor': 'middle', class: 'spw-compass' }, t)); }
  for (const t of [30, 60, 90]) { const [x, y] = wp(t, 45); labels.append(S('text', { x: x + 3, y: y - 3, class: 'spw-tick' }, `${t}°`)); }
  wheelMarks = S('g');
  wheel.append(cells, grid, labels, wheelMarks);
  const legend = $('sp-wheel-legend');
  BINS.forEach(([, label], i) => legend.append(h('li', {}, h('span', { class: `swatch spw-sw spw-q${i}`, 'aria-hidden': 'true' }), label)));
  wheel.addEventListener('click', (e) => {
    const pt = wheel.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(wheel.getScreenCTM().inverse());
    const dx = p.x - WC; const dy = WC - p.y; const r = Math.hypot(dx, dy);
    if (r > WR + 6) return;
    const tilt = Math.min(90, Math.round((r / WR) * 90));
    const az = Math.round((((Math.atan2(dx, dy) * 180) / Math.PI) + 360) % 360) % 360;
    setPanel(tilt, tilt === 0 ? st.az : az);
  });
}
function renderWheel() {
  if (!wheelCells) buildWheel();
  const best = Y.grid.best.annual;
  Y.grid.values.forEach((row, ti) => row.forEach((v, ai) => {
    const f = v / best; const q = BINS.findIndex(([lo]) => f >= lo);
    const cls = `spw-q${q}`; const el = wheelCells[ti][ai];
    if (el.getAttribute('class') !== cls) el.setAttribute('class', cls);
  }));
  clear(wheelMarks);
  const S = (t, a = {}, ...k) => h.svg(t, a, ...k);
  const [bx, by] = wp(Y.grid.best.tilt, Y.grid.best.azimuth);
  const [mx, my] = wp(st.tilt, st.az);
  wheelMarks.append(S('circle', { cx: bx, cy: by, r: 5, class: 'spw-best' }), S('circle', { cx: mx, cy: my, r: 9, class: 'spw-mine' }));
  const share = annualFromSamples(samples(), { tilt: st.tilt, surfaceAzimuth: st.az, albedo: st.albedo }).annual / best;
  wheel.setAttribute('aria-label', `Orientation map for ${st.name}: yearly clear-sky sunlight for every tilt and direction, as a share of the best. The best is ${Y.grid.best.tilt}° facing ${compassPoint(Y.grid.best.azimuth)}; your panel, ${st.tilt}° facing ${compassPoint(st.az)}, gets ${(share * 100).toFixed(0)} % of it.`);
}

function bestOverall() {
  const ys = samples(); const az = Y.grid.best.azimuth;
  const sw = cached(`sweep|${siteKey()}|${az}|${st.albedo}`, () => tiltSweep(ys, { surfaceAzimuth: az, albedo: st.albedo, step: 1 }));
  return { az, tilt: Math.round(sw.best.tilt) };
}
function renderBestText() {
  const lat = Math.abs(st.lat); const bt = Y.sweep.best.tilt; const mine = Y.ann.annual / Y.sweep.best.annual;
  const dir = `facing ${compassPoint(st.az)} (${st.az}°)`;
  let cmp;
  if (lat < 1.5) cmp = 'Near the equator the Sun passes overhead on both sides through the year, so a flat panel does best.';
  else if (Math.abs(bt - lat) < 1.5) cmp = `That is close to the latitude, ${lat.toFixed(0)}°.`;
  else cmp = `That is about ${Math.abs(bt - lat).toFixed(0)}° ${bt < lat ? 'flatter' : 'steeper'} than the latitude, ${lat.toFixed(0)}°.`;
  const parts = [`Under clear skies, a panel ${dir} collects the most sunlight over a year at a tilt of ${bt.toFixed(0)}°: ${Math.round(Y.sweep.best.annual).toLocaleString('en-US')} kWh/m². ${cmp}`,
    ` Your tilt of ${st.tilt}° collects ${(mine * 100).toFixed(1)} % of that.`];
  const bo = bestOverall();
  const eqAz = st.lat >= 0 ? 180 : 0;
  if (Math.abs(((st.az - eqAz + 540) % 360) - 180) > 15 && lat >= 1.5) parts.push(` Turning to face ${compassPoint(bo.az)} at ${bo.tilt}° would do better still.`);
  if (st.lat > 1 && st.lat <= 70) parts.push(` With real weather, the Jacobson–Jadhav fit for the Northern Hemisphere suggests about ${jacobsonFitTilt(st.lat).toFixed(0)}° at this latitude.`);
  setText('sp-best-text', parts.join(''));
}

// ---------------- energy ----------------
function renderYield() {
  if (!D) return;
  const psh = D.tilted.kwhm2; const day = arrayEnergyKWh(st.kwp, psh, st.pr);
  setText('e-day', fmt(day, 3));
  if (Y) {
    const year = arrayEnergyKWh(st.kwp, Y.ann.annual, st.pr);
    setText('e-year', Math.round(year).toLocaleString('en-US'));
    setText('e-avg', fmt(year / 365, 3));
    setText('e-spec', Math.round(Y.ann.annual * st.pr).toLocaleString('en-US'));
  }
  setText('sp-formula', `E = ${fmt(st.kwp, 4)} kWp × ${psh.toFixed(2)} peak sun hours × ${st.pr.toFixed(2)} = ${fmt(day, 3)} kWh on ${dateLabel(st.doy)}${Y ? `, and ${fmt(st.kwp, 4)} kWp × ${Math.round(Y.ann.annual).toLocaleString('en-US')} kWh/m² × ${st.pr.toFixed(2)} = ${Math.round(arrayEnergyKWh(st.kwp, Y.ann.annual, st.pr)).toLocaleString('en-US')} kWh over the year` : ''}.`);
}

// ---------------- controls ----------------
function syncInputs() {
  $('sp-tilt').value = st.tilt; setText('sp-tilt-out', `${st.tilt}°`);
  $('sp-az').value = st.az; setText('sp-az-out', `${st.az}° ${compassPoint(st.az)}`);
  $('sp-albedo').value = st.albedo; setText('sp-albedo-out', st.albedo.toFixed(2));
  $('sp-day').value = st.doy; setText('sp-day-out', dateLabel(st.doy));
  $('sp-time').value = Math.round(st.min / 5) * 5;
  $('sp-lat').value = st.lat; $('sp-lon').value = st.lon; $('sp-elev').value = Math.round(st.elevM);
  setText('sp-place-name', st.name);
  document.querySelectorAll('[data-albedo]').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.albedo) - st.albedo) < 1e-9)));
  document.querySelectorAll('[data-az]').forEach((b) => { const v = b.dataset.az === 'equator' ? (st.lat >= 0 ? 180 : 0) : Number(b.dataset.az); b.setAttribute('aria-pressed', String(v === st.az && b.dataset.az !== 'equator')); });
}
function update({ day = true, year = true } = {}) {
  syncInputs();
  renderNow();
  if (day) renderDay();
  if (year) scheduleYear();
}
function setPanel(tilt, az) { st.tilt = tilt; st.az = az; update(); }

function choosePlace(p) {
  const flip = (p.lat >= 0) !== (st.lat >= 0) && st.az === (st.lat >= 0 ? 180 : 0);
  Object.assign(st, { place: p.id, name: p.name, lat: p.lat, lon: p.lon, elevM: p.elevation, tz: p.utcOffset, custom: false });
  if (flip) st.az = st.lat >= 0 ? 180 : 0;
  setMsg('sp-place-msg', flip ? `Turned the panel to face the equator (${compassPoint(st.az)}), as panels in the ${st.lat >= 0 ? 'Northern' : 'Southern'} Hemisphere usually do.` : `${p.name}, ${p.country}: ${latStr(p.lat)}, ${lonStr(p.lon)}, ${p.elevation} m above sea level.`);
  update();
}
function setMsg(id, text, bad = false) { const el = $(id); el.textContent = text; el.classList.toggle('is-bad', bad); }

function readCustom() {
  const lat = Number($('sp-lat').value); const lon = Number($('sp-lon').value); const el = Number($('sp-elev').value);
  const bad = [];
  const flag = (id, ok) => $(id).setAttribute('aria-invalid', String(!ok));
  const latOk = $('sp-lat').value !== '' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const lonOk = $('sp-lon').value !== '' && Number.isFinite(lon) && lon >= -180 && lon <= 180;
  const elOk = $('sp-elev').value !== '' && Number.isFinite(el) && el >= -430 && el <= 8850;
  flag('sp-lat', latOk); flag('sp-lon', lonOk); flag('sp-elev', elOk);
  if (!latOk) bad.push('latitude must be a number from −90 to 90');
  if (!lonOk) bad.push('longitude must be a number from −180 to 180');
  if (!elOk) bad.push('elevation must be from −430 m (the Dead Sea shore) to 8850 m (Everest)');
  if (bad.length) { const s = bad.join('; '); setMsg('sp-place-msg', `${s.charAt(0).toUpperCase()}${s.slice(1)}.`, true); return; }
  const same = Math.abs(lat - st.lat) < 1e-9 && Math.abs(lon - st.lon) < 1e-9;
  const flip = (lat >= 0) !== (st.lat >= 0) && st.az === (st.lat >= 0 ? 180 : 0);
  if (same) { st.elevM = el; } else {
    Object.assign(st, { place: 'custom', name: `${latStr(lat)}, ${lonStr(lon)}`, lat, lon, elevM: el, tz: null, custom: true });
    ensureCustomOption(); $('sp-place').value = 'custom';
  }
  if (flip) st.az = st.lat >= 0 ? 180 : 0;
  setMsg('sp-place-msg', same ? `Site elevation set to ${Math.round(el)} m.` : `Showing a custom place at ${latStr(lat)}, ${lonStr(lon)}, ${Math.round(el)} m.${flip ? ` The panel now faces ${compassPoint(st.az)}, towards the equator.` : ''}`);
  update();
}
function ensureCustomOption() {
  const sel = $('sp-place');
  if (!sel.querySelector('option[value="custom"]')) sel.append(h('option', { value: 'custom' }, 'Custom location'));
}

let player = null;
function setPlaying(on) {
  const btn = $('sp-play');
  if (on && !player) {
    let min = st.min;
    player = animate(stageHost, (dt) => {
      const N = nowModel();
      min += dt * (N.up ? 60 : 480);
      if (min >= 1440) min -= 1440;
      st.min = min; $('sp-time').value = Math.round(min / 5) * 5;
      renderNow({ fromPlay: true });
    });
  } else if (!on && player) { player.stop(); player = null; st.min = Math.round(st.min / 5) * 5; renderNow(); }
  btn.textContent = player ? 'Pause' : 'Play the day';
}

function bindControls() {
  $('sp-time').addEventListener('input', (e) => { if (player) setPlaying(false); st.min = Number(e.target.value); renderNow(); });
  $('sp-play').addEventListener('click', () => setPlaying(!player));
  $('sp-day').addEventListener('input', (e) => { st.doy = Number(e.target.value); update(); });
  document.querySelectorAll('[data-doy]').forEach((b) => b.addEventListener('click', () => { st.doy = b.dataset.doy === 'today' ? todayDoy() : Number(b.dataset.doy); update(); }));
  $('sp-tilt').addEventListener('input', (e) => { st.tilt = Number(e.target.value); update(); });
  $('sp-az').addEventListener('input', (e) => { st.az = Number(e.target.value); update(); });
  document.querySelectorAll('[data-az]').forEach((b) => b.addEventListener('click', () => { st.az = b.dataset.az === 'equator' ? (st.lat >= 0 ? 180 : 0) : Number(b.dataset.az); update(); }));
  $('sp-albedo').addEventListener('input', (e) => { st.albedo = Number(e.target.value); update(); });
  document.querySelectorAll('[data-albedo]').forEach((b) => b.addEventListener('click', () => { st.albedo = Number(b.dataset.albedo); update(); }));
  $('sp-place').addEventListener('change', (e) => { const p = PLACES.find((x) => x.id === e.target.value); if (p) choosePlace(p); });
  for (const id of ['sp-lat', 'sp-lon', 'sp-elev']) $(id).addEventListener('change', readCustom);
  $('sp-kwp').addEventListener('input', (e) => {
    const v = Number(e.target.value); const ok = e.target.value !== '' && Number.isFinite(v) && v >= 0.1 && v <= 100000;
    e.target.setAttribute('aria-invalid', String(!ok));
    setMsg('sp-kwp-msg', ok ? 'Array size is the total rated power of the panels, in kilowatts at 1000 W/m². A 400 W panel is 0.4 kWp.' : 'Enter an array size from 0.1 to 100,000 kWp.', !ok);
    if (ok) { st.kwp = v; setText('sp-kwp-out', `${fmt(v, 4)} kWp`); renderYield(); }
  });
  $('sp-pr').addEventListener('input', (e) => { st.pr = Number(e.target.value); setText('sp-pr-out', st.pr.toFixed(2)); renderYield(); });
  $('sp-use-best').addEventListener('click', () => { if (!Y) return; const b = bestOverall(); setPanel(b.tilt, b.az); });
  $('sp-view-dome').addEventListener('click', () => setView('dome'));
  $('sp-view-flat').addEventListener('click', () => setView('flat'));
  for (const [id, kind] of [['sp-turn-l', 'left'], ['sp-turn-r', 'right'], ['sp-top', 'top'], ['sp-reset', 'reset']]) $(id).addEventListener('click', () => dome?.setView(kind));
}

function fillPlaces() {
  const sel = $('sp-place'); clear(sel);
  const regions = [...new Set(PLACES.map((p) => p.region))];
  for (const r of regions) sel.append(h('optgroup', { label: r }, PLACES.filter((p) => p.region === r).map((p) => h('option', { value: p.id }, `${p.name}, ${p.country}`))));
  if (st.custom) { ensureCustomOption(); sel.value = 'custom'; } else sel.value = st.place;
}

const validPlaces = (d) => is.arr(d?.data) && d.data.length >= 10 && d.data.every((p) => is.str(p.id) && is.str(p.name) && is.str(p.country) && is.str(p.region)
  && is.num(p.lat) && p.lat >= -90 && p.lat <= 90 && is.num(p.lon) && p.lon >= -180 && p.lon <= 180 && is.num(p.elevation) && is.num(p.utcOffset));

async function init() {
  if (reducedMotion()) { $('sp-play').hidden = true; }
  bindControls();
  stageHost.dataset.view = 'flat';
  setView('flat');
  update();
  renderYear();
  const c1 = makeChart($('sp-day-chart'), (c) => dayOption(c)).then((ch) => { dayChart = ch; });
  const c2 = makeChart($('sp-month-chart'), (c) => monthOption(c)).then((ch) => { monthChart = ch; });
  const c3 = makeChart($('sp-tilt-chart'), (c) => tiltOption(c)).then((ch) => { tiltChart = ch; });
  onTheme(() => { dome?.theme(); });
  try {
    const { data, state } = await loadData('places.json', validPlaces);
    PLACES = data.data; fillPlaces(); setBadge($('sp-badge'), state, 'GeoNames');
  } catch (e) { console.error(e); setBadge($('sp-badge'), 'failed'); }
  try { await initDome(); setView('dome'); } catch (e) { domeFailed = true; $('sp-view-dome').disabled = true; $('sp-view-dome').title = 'Needs WebGL, which this browser does not offer'; setView('flat'); }
  await Promise.all([c1, c2, c3]);
}
init();
