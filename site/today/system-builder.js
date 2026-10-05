// System builder: drag cells -> module -> strings -> array -> inverter -> grid.
// Every number comes from physics/system.js (diode-model modules, design checks,
// clipping) and physics/solar.js (clear-sky irradiance on a tilted plane).
import { h, clear, fmt, reducedMotion, animate } from '../assets/js/dom.js';
import { moduleStc, moduleCoefficients, designChecks, dcPowerTrace, clippingIntegral, maxModulesInSeries, yearlyFromMonthly } from '../assets/js/physics/system.js';
import { dailyInsolation } from '../assets/js/physics/solar.js';

const S = (tag, attrs = {}, ...kids) => h.svg(tag, attrs, ...kids);
const ETA = 0.97; const LOSSES = 0.1; const NOCT = 45; const STEP_MIN = 10; const T_HOT = 70;

// Illustrative string inverters (not real products): AC rating, max DC voltage, MPPT window, max DC short-circuit current.
const INVERTERS = [
  { id: 'i36', label: '3.6 kW home inverter', acKW: 3.6, vMax: 600, mpptMin: 100, mpptMax: 500, iscMax: 20 },
  { id: 'i5', label: '5 kW home inverter', acKW: 5, vMax: 600, mpptMin: 100, mpptMax: 480, iscMax: 40 },
  { id: 'i10', label: '10 kW small business inverter', acKW: 10, vMax: 1000, mpptMin: 200, mpptMax: 850, iscMax: 40 },
  { id: 'i30', label: '30 kW commercial inverter', acKW: 30, vMax: 1000, mpptMin: 200, mpptMax: 850, iscMax: 80 },
  { id: 'i100', label: '100 kW commercial inverter', acKW: 100, vMax: 1100, mpptMin: 200, mpptMax: 1000, iscMax: 300 },
];
const PLACES = [
  { id: 'la', label: 'Los Angeles, USA', lat: 34.05, lon: -118.24 },
  { id: 'madrid', label: 'Madrid, Spain', lat: 40.42, lon: -3.70 },
  { id: 'berlin', label: 'Berlin, Germany', lat: 52.52, lon: 13.40 },
  { id: 'delhi', label: 'Delhi, India', lat: 28.61, lon: 77.21 },
  { id: 'nairobi', label: 'Nairobi, Kenya', lat: -1.29, lon: 36.82 },
  { id: 'sydney', label: 'Sydney, Australia', lat: -33.87, lon: 151.21 },
];
const DAYS = [
  { id: 'jun', label: 'June solstice (21 June)', m: 5, d: 21 },
  { id: 'mar', label: 'March equinox (20 March)', m: 2, d: 20 },
  { id: 'dec', label: 'December solstice (21 December)', m: 11, d: 21 },
];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const st = { chain: 72, half: true, series: 6, parallel: 2, inv: 1, connected: false, place: 'la', day: 'jun', air: 25, tmin: -10, hour: 12 };
const LIM = { chain: [36, 78], series: [1, 24], parallel: [1, 8] };

const $ = (id) => document.getElementById(id);
const svg = $('sb-svg');

// ---------- model ----------
const traceCache = new Map();
function siteOpts(p) { return { lat: p.lat, lon: p.lon, tilt: Math.min(35, Math.round(Math.abs(p.lat) * 0.9)), surfaceAzimuth: p.lat >= 0 ? 180 : 0 }; }
function trace(placeId, month, day, stepMin) {
  const key = `${placeId}|${month}|${day}|${stepMin}`;
  if (!traceCache.has(key)) {
    const p = PLACES.find((x) => x.id === placeId);
    traceCache.set(key, dailyInsolation(new Date(Date.UTC(2025, month, day)), { ...siteOpts(p), stepMin }));
  }
  return traceCache.get(key);
}

let M = null; // current results
function compute() {
  const cells = st.half ? 2 * st.chain : st.chain;
  const opts = { cells, halfCut: st.half };
  const mod = moduleStc(opts);
  const coeff = moduleCoefficients(opts);
  const inv = INVERTERS[st.inv];
  const dc = designChecks({ module: mod, coeff, series: st.series, parallel: st.parallel, inverter: inv, tMinC: st.tmin, tHotCellC: T_HOT });
  const tripped = dc.checks.some((c) => c.level === 'error' && c.id === 'vmax');
  const exporting = st.connected && !tripped;
  const dd = DAYS.find((d) => d.id === st.day);
  const day = trace(st.place, dd.m, dd.d, STEP_MIN);
  const dcKW = dcPowerTrace(day.trace, { kWp: dc.kWp, gammaPctPerC: coeff.pmax, ambientC: st.air, noctC: NOCT, otherLosses: LOSSES });
  const clip = clippingIntegral(dcKW, STEP_MIN / 60, inv.acKW, ETA);
  const year = yearlyFromMonthly(MONTH_DAYS.map((n, m) => {
    const t = trace(st.place, m, 15, 20);
    const p = dcPowerTrace(t.trace, { kWp: dc.kWp, gammaPctPerC: coeff.pmax, ambientC: st.air, noctC: NOCT, otherLosses: LOSSES });
    return { kwh: clippingIntegral(p, 20 / 60, inv.acKW, ETA).acKWh, days: n };
  }));
  M = { cells, mod, coeff, inv, dc, tripped, exporting, dcKW, clip, year, maxN: maxModulesInSeries(inv.vMax, mod.Voc, coeff.voc, st.tmin) };
}
const idxAt = (hour) => Math.max(0, Math.min(M.dcKW.length - 1, Math.floor((hour * 60) / STEP_MIN)));
function nowPower() {
  const i = idxAt(st.hour);
  const dcAvail = M.dcKW[i] * ETA;
  const ac = M.exporting ? M.clip.acKW[i] : 0;
  return { dc: M.exporting ? M.dcKW[i] : 0, dcPotential: M.dcKW[i], dcAvail, ac };
}

// ---------- layout (wide and narrow) ----------
const WIDE = { vb: [1000, 470], mod: { x: 40, y: 78, rh: 22, cw: 20 }, arr: { x: 250, y: 78, pitch: 17, mw: 14, mh: 40, row: 50 }, bus: 690, inv: { x: 722, y: 186, w: 104, h: 110 }, socket: { x: 948, y: 241 }, plugRest: { x: 886, y: 372 }, labelY: 40, side: 1 };
const NARROW = { vb: [420, 900], mod: { x: 26, y: 58, rh: 15, cw: 15 }, arr: { x: 26, y: 318, pitch: 15, mw: 12, mh: 28, row: 36 }, bus: 398, inv: { x: 268, y: 672, w: 116, h: 104 }, socket: { x: 70, y: 724 }, plugRest: { x: 190, y: 842 }, labelY: 26, side: -1 };
// The narrow layout's lower half follows the array down, so the drawing is only as tall as it needs to be.
function fitNarrow() {
  const { y: ay, mh, row } = NARROW.arr;
  const iy = Math.max(430, ay + (st.parallel - 1) * row + mh + 86);
  NARROW.inv.y = iy; NARROW.socket.y = iy + NARROW.inv.h / 2; NARROW.plugRest.y = iy + NARROW.inv.h + 70;
  NARROW.vb = [420, iy + 200];
}
let L = WIDE;

const layers = { stat: S('g'), flow: S('g'), handles: S('g') };
const handles = {};
let plugPos = null;

function makeHandle(kind, label) {
  const g = S('g', { class: `sb-handle sb-handle-${kind}`, 'data-kind': kind });
  g.append(S('circle', { r: 16, class: 'hit' }), S('circle', { r: 10, class: 'knob' }), S('path', { class: 'glyph' }));
  g.append(S('title', {}, label));
  layers.handles.append(g);
  handles[kind] = g;
  g.addEventListener('pointerdown', (e) => startDrag(e, kind, g));
  return g;
}
function placeHandle(kind, x, y, glyph) {
  const g = handles[kind];
  g.setAttribute('transform', `translate(${x} ${y})`);
  g.querySelector('.glyph').setAttribute('d', glyph);
}
const V_GLYPH = 'M-4 -2 L0 -6 L4 -2 M-4 2 L0 6 L4 2';
const H_GLYPH = 'M-2 -4 L-6 0 L-2 4 M2 -4 L6 0 L2 4';

function buildPlug() {
  const g = S('g', { class: 'sb-plug', 'data-kind': 'plug' });
  g.append(S('circle', { r: 20, class: 'hit' }), S('rect', { x: -13, y: -11, width: 26, height: 22, rx: 5, class: 'body' }),
    S('path', { d: 'M13 -5 H20 M13 5 H20', class: 'pins' }), S('title', {}, 'Plug: drag onto the grid socket'));
  layers.handles.append(g);
  handles.plug = g;
  g.addEventListener('pointerdown', (e) => startDrag(e, 'plug', g));
}

// ---------- drawing ----------
function draw() {
  if (L === NARROW) fitNarrow();
  const [W, H] = L.vb;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const s = clear(layers.stat); const f = clear(layers.flow);
  const pw = nowPower();
  const pRef = Math.max(M.dc.kWp, M.inv.acKW, 0.5);
  const width = (kw) => (kw > 0.001 ? 2 + 12 * Math.min(1.2, kw / pRef) : 0);

  // module template
  const { x: mx, y: my, rh, cw } = L.mod;
  const rows = st.chain / 6; const mW = 6 * cw + 8; const mH = rows * rh + 8;
  s.append(S('text', { x: mx, y: L.labelY, class: 'sb-label' }, 'Module'));
  s.append(S('rect', { x: mx, y: my, width: mW, height: mH, rx: 4, class: 'sb-frame' }));
  for (let r = 0; r < rows * (st.half ? 2 : 1); r++) {
    const ch = st.half ? rh / 2 : rh;
    for (let c = 0; c < 6; c++) s.append(S('rect', { x: mx + 4 + c * cw + 1, y: my + 4 + r * ch + 1, width: cw - 2, height: ch - 2, rx: 1.5, class: 'sb-cell' }));
  }
  const nx = L === NARROW ? mx + mW + 16 : mx; const ny = L === NARROW ? my + 14 : my + mH + 42;
  s.append(S('text', { x: nx, y: ny, class: 'sb-note' }, `${M.cells} ${st.half ? 'half-cut ' : ''}cells`),
    S('text', { x: nx, y: ny + 18, class: 'sb-note' }, `${fmt(M.mod.Pmax, 3)} W, ${fmt(M.mod.Voc, 3)} V`));
  placeHandle('cells', mx + mW / 2, my + mH + 14, V_GLYPH);

  // copy arrow from module to array
  const { x: ax, y: ay, pitch, mw, mh, row } = L.arr;
  const narrow = L === NARROW;
  s.append(S('path', { d: narrow ? `M${mx + mW + 16} ${my + 56} C ${mx + mW + 150} ${my + 70}, ${ax + 200} ${ay - 80}, ${ax + 170} ${ay - 46}` : `M${mx + mW + 8} ${my + 30} C ${mx + mW + 40} ${my + 30}, ${ax - 40} ${ay + mh / 2}, ${ax - 10} ${ay + mh / 2}`, class: 'sb-copy' }));

  // array
  s.append(S('text', { x: ax, y: narrow ? ay - 30 : L.labelY, class: 'sb-label' }, `Array: ${st.parallel} × ${st.series} modules`));
  const strKW = pw.dc / st.parallel;
  for (let p = 0; p < st.parallel; p++) {
    const yy = ay + p * row;
    const endX = ax + st.series * pitch;
    // string wire: along the bottom of the modules, then to the bus
    const d = `M${ax + mw / 2} ${yy + mh + 4} H${endX - pitch + mw / 2} M${endX - pitch + mw} ${yy + mh / 2} H${L.bus}`;
    s.append(S('path', { d, class: 'sb-wire' }));
    const wd = width(strKW);
    if (wd) f.append(S('path', { d: `M${endX - pitch + mw} ${yy + mh / 2} H${L.bus}`, class: 'sb-flow dc', 'stroke-width': wd }), S('path', { d: `M${endX - pitch + mw} ${yy + mh / 2} H${L.bus}`, class: 'sb-dash', 'stroke-width': Math.max(1.5, wd / 3) }));
    for (let k = 0; k < st.series; k++) {
      s.append(S('rect', { x: ax + k * pitch, y: yy, width: mw, height: mh, rx: 2, class: 'sb-mod' }), S('path', { d: `M${ax + k * pitch + mw / 2} ${yy + 3} V${yy + mh - 3}`, class: 'sb-mod-line' }));
    }
  }
  const lastY = ay + (st.parallel - 1) * row;
  placeHandle('series', ax + st.series * pitch + 10, ay + mh / 2, H_GLYPH);
  placeHandle('parallel', ax + mw, lastY + mh + 26, V_GLYPH);

  // DC bus to inverter
  const { x: ix, y: iy, w: iw, h: ih } = L.inv;
  const busTop = ay + mh / 2; const busBot = lastY + mh / 2;
  const busPath = narrow ? `M${L.bus} ${busTop} V${iy + ih / 2} H${ix + iw}` : `M${L.bus} ${busTop} V${Math.max(busBot, iy + ih / 2)} M${L.bus} ${iy + ih / 2} H${ix}`;
  s.append(S('path', { d: `M${L.bus} ${busTop} V${busBot}`, class: 'sb-wire' }), S('path', { d: busPath, class: 'sb-wire' }));
  const wBus = width(pw.dc);
  const flowBus = narrow ? `M${L.bus} ${busTop} V${iy + ih / 2} H${ix + iw}` : `M${L.bus} ${busTop} V${iy + ih / 2} H${ix}`;
  if (wBus) f.append(S('path', { d: flowBus, class: 'sb-flow dc', 'stroke-width': wBus }), S('path', { d: flowBus, class: 'sb-dash', 'stroke-width': Math.max(1.5, wBus / 3) }));
  s.append(S('text', narrow ? { x: L.bus - 8, y: iy - 34, 'text-anchor': 'end', class: 'sb-power' } : { x: L.bus - 8, y: iy + ih / 2 - 12, 'text-anchor': 'end', class: 'sb-power' }, `${fmt(pw.dc, 2)} kW DC`));

  // inverter
  const loading = M.inv.acKW ? pw.ac / M.inv.acKW : 0;
  s.append(S('text', { x: ix, y: narrow ? iy - 12 : L.labelY, class: 'sb-label' }, 'Inverter'));
  s.append(S('rect', { x: ix, y: iy, width: iw, height: ih, rx: 8, class: `sb-inv${M.tripped ? ' is-tripped' : ''}` }),
    S('text', { x: ix + iw / 2, y: iy + 36, 'text-anchor': 'middle', class: 'sb-inv-kw' }, `${M.inv.acKW} kW`),
    S('path', { d: `M${ix + 22} ${iy + 62} H${ix + 44} M${ix + 60} ${iy + 62} q 7 -14 14 0 t 14 0`, class: 'sb-glyph' }),
    S('text', { x: ix + iw / 2, y: iy + 90, 'text-anchor': 'middle', class: 'sb-note' }, M.tripped ? 'over voltage' : `${fmt(100 * loading, 2)} % loaded`));
  // loading bar
  const bar = S('rect', { x: ix + 10, y: iy + ih - 12, width: Math.max(0, (iw - 20) * Math.min(1, loading)), height: 5, rx: 2, class: 'sb-load' });
  s.append(S('rect', { x: ix + 10, y: iy + ih - 12, width: iw - 20, height: 5, rx: 2, class: 'sb-load-track' }), bar);
  placeHandle('inverter', ix + iw + (narrow ? 0 : 0), iy + ih + 16, V_GLYPH);
  handles.inverter.setAttribute('transform', `translate(${ix + iw / 2} ${iy + ih + 16})`);

  // grid
  const { x: gx, y: gy } = L.socket;
  s.append(S('text', { x: gx + 2, y: narrow ? gy - 64 : L.labelY, 'text-anchor': 'middle', class: 'sb-label' }, 'Grid'));
  s.append(S('path', { d: `M${gx - 18} ${gy + 110} L${gx} ${gy - 58} L${gx + 18} ${gy + 110} M${gx - 26} ${gy - 34} H${gx + 26} M${gx - 20} ${gy - 12} H${gx + 20} M${gx - 12} ${gy + 30} L${gx + 12} ${gy + 60} M${gx + 12} ${gy + 30} L${gx - 12} ${gy + 60}`, class: 'sb-pylon' }));
  s.append(S('rect', { x: gx - 16, y: gy - 14, width: 32, height: 28, rx: 6, class: `sb-socket${st.connected ? ' is-on' : ''}` }), S('path', { d: `M${gx - 7} ${gy - 5} V${gy + 5} M${gx + 7} ${gy - 5} V${gy + 5}`, class: 'sb-socket-holes' }));

  // AC cable to plug
  const sd = L.side;
  const pp = plugPos ?? (st.connected ? { x: gx - 36 * sd, y: gy } : L.plugRest);
  const ox = sd > 0 ? ix + iw : ix; const oy = iy + ih / 2;
  const sag = st.connected ? 0 : 40;
  const cable = `M${ox} ${oy} C ${ox + 40 * sd} ${oy + sag}, ${pp.x - 50 * sd} ${pp.y + sag}, ${pp.x - 13 * sd} ${pp.y}`;
  s.append(S('path', { d: cable, class: 'sb-wire' }));
  const wAc = width(pw.ac);
  if (wAc) f.append(S('path', { d: cable, class: 'sb-flow ac', 'stroke-width': wAc }), S('path', { d: cable, class: 'sb-dash', 'stroke-width': Math.max(1.5, wAc / 3) }));
  s.append(S('text', narrow ? { x: ox - 8, y: oy - 16, 'text-anchor': 'end', class: 'sb-power' } : { x: ox + 6, y: oy - 16, class: 'sb-power' }, `${fmt(pw.ac, 2)} kW AC`));
  handles.plug.setAttribute('transform', `translate(${pp.x} ${pp.y}) scale(${sd} 1)`);
  handles.plug.classList.toggle('is-on', st.connected);

  $('sb-title').textContent = `Diagram: a module of ${M.cells} cells copied into ${st.parallel} strings of ${st.series} modules (${fmt(M.dc.kWp, 3)} kWp), wired to a ${M.inv.acKW} kW inverter that is ${st.connected ? 'connected to' : 'not connected to'} the grid. At ${fmtHour(st.hour)} the array delivers ${fmt(pw.dc, 2)} kW DC and the inverter sends ${fmt(pw.ac, 2)} kW AC to the grid.`;
}

// ---------- day chart ----------
const neg = (x) => String(x).replace('-', '−');
const fmtHour = (x) => { const m = Math.round(x * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
function drawDay() {
  const el = $('sb-daychart'); const title = el.querySelector('title');
  clear(el); el.append(title);
  const A = { l: 56, r: 880, t: 16, b: 214 };
  const h0 = 4; const h1 = 20;
  const avail = M.dcKW.map((p) => p * ETA);
  const ac = M.clip.acKW;
  const top = Math.max(0.5, ...avail, M.inv.acKW) * 1.12;
  const nice = top > 50 ? 20 : top > 20 ? 5 : top > 8 ? 2 : top > 3 ? 1 : 0.5;
  const yMax = Math.ceil(top / nice) * nice;
  const X = (hr) => A.l + ((A.r - A.l) * (hr - h0)) / (h1 - h0);
  const Y = (p) => A.b - ((A.b - A.t) * p) / yMax;
  const g = S('g', { class: 'mppt-axes' });
  for (let p = 0; p <= yMax + 1e-9; p += nice) g.append(S('line', { x1: A.l, x2: A.r, y1: Y(p), y2: Y(p), class: 'grid' }), S('text', { x: A.l - 8, y: Y(p) + 4, 'text-anchor': 'end' }, fmt(p, 3)));
  for (let hr = h0; hr <= h1; hr += 2) g.append(S('text', { x: X(hr), y: A.b + 18, 'text-anchor': 'middle' }, `${String(hr).padStart(2, '0')}:00`));
  g.append(S('line', { x1: A.l, x2: A.r, y1: A.b, y2: A.b, class: 'axis' }), S('text', { x: 14, y: (A.t + A.b) / 2, 'text-anchor': 'middle', class: 'title', transform: `rotate(-90 14 ${(A.t + A.b) / 2})` }, 'kW'),
    S('text', { x: (A.l + A.r) / 2, y: A.b + 40, 'text-anchor': 'middle', class: 'title' }, 'Local solar time'));
  el.append(g);
  const pts = []; for (let i = 0; i < avail.length; i++) { const hr = ((i + 0.5) * STEP_MIN) / 60; if (hr >= h0 && hr <= h1) pts.push([hr, avail[i], ac[i]]); }
  const line = (k) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join(' ');
  const clipArea = `${line(1)} ${pts.slice().reverse().map((p) => `L${X(p[0]).toFixed(1)} ${Y(p[2]).toFixed(1)}`).join(' ')} Z`;
  el.append(S('path', { d: `${line(2)} L${X(pts[pts.length - 1][0])} ${A.b} L${X(pts[0][0])} ${A.b} Z`, class: 'sb-ac-area' }),
    S('path', { d: clipArea, class: 'sb-clip-area' }),
    S('path', { d: line(1), class: 'sb-dc-line' }), S('path', { d: line(2), class: 'sb-ac-line' }),
    S('line', { x1: A.l, x2: A.r, y1: Y(M.inv.acKW), y2: Y(M.inv.acKW), class: 'sb-limit' }),
    S('text', { x: A.r, y: Y(M.inv.acKW) - 6, 'text-anchor': 'end', class: 'sb-chart-label' }, `Inverter limit ${M.inv.acKW} kW`));
  const i = idxAt(st.hour);
  el.append(S('line', { x1: X(st.hour), x2: X(st.hour), y1: A.t, y2: A.b, class: 'sb-cursor' }), S('circle', { cx: X(st.hour), cy: Y(ac[i]), r: 5, class: 'sb-cursor-dot' }));
  title.textContent = `Power over the clear day: the array could deliver up to ${fmt(Math.max(...avail), 3)} kW; the inverter caps output at ${M.inv.acKW} kW, clipping ${fmt(M.clip.clippedKWh, 3)} kWh (${fmt(100 * M.clip.clippedFraction, 2)} %).`;
}

// ---------- checks and readouts ----------
function renderChecks() {
  const list = clear($('sb-checks'));
  const c = Object.fromEntries(M.dc.checks.map((x) => [x.id, x]));
  const item = (level, head, text) => list.append(h('li', { class: `sb-check is-${level}` }, h('strong', {}, `${head}. `), text));
  const v = (x) => `${fmt(x, 3)} V`;
  if (c.vmax.level === 'error') item('error', 'Problem: string voltage too high', `On a ${neg(st.tmin)} °C morning each string's open-circuit voltage reaches ${v(c.vmax.value)}, above this inverter's ${c.vmax.limit} V maximum. It would be damaged, so here it stays off. Use at most ${M.maxN} modules per string.`);
  else if (c.vmax.level === 'warn') item('warn', 'Check: close to the voltage limit', `${v(c.vmax.value)} on the coldest morning, within 3 % of the ${c.vmax.limit} V maximum.`);
  else item('ok', 'Voltage OK', `${v(c.vmax.value)} on a ${neg(st.tmin)} °C morning, under the ${c.vmax.limit} V maximum (at most ${M.maxN} modules per string).`);
  if (c['mppt-low'].level !== 'ok') item('warn', 'Check: below the tracking window', `With cells at ${T_HOT} °C the string works at about ${v(c['mppt-low'].value)}, under the ${c['mppt-low'].limit} V bottom of the MPPT window, so the inverter cannot hold the best point on hot afternoons. Add modules per string.`);
  else if (c['mppt-high'].level !== 'ok') item('warn', 'Check: above the tracking window', `On cold days the working voltage reaches ${v(c['mppt-high'].value)}, above the ${c['mppt-high'].limit} V top of the window; the inverter will hold a lower voltage and lose some power.`);
  else item('ok', 'Tracking window OK', `Working voltage from ${v(c['mppt-low'].value)} (hot) to ${v(c['mppt-high'].value)} (cold) stays inside ${M.inv.mpptMin}–${M.inv.mpptMax} V.`);
  if (c.current.level === 'error') item('error', 'Problem: too much current', `${st.parallel} strings give a design current of ${fmt(c.current.value, 3)} A (short-circuit current plus 25 %), above the inverter's ${c.current.limit} A. Use fewer strings or a larger inverter.`);
  else item('ok', 'Current OK', `${fmt(c.current.value, 3)} A design current, under the ${c.current.limit} A limit.`);
  const clipPct = `${fmt(100 * M.clip.clippedFraction, 2)} %`;
  if (c.dcac.value > 1.5) item('warn', 'Check: heavily oversized array', `DC/AC ratio ${fmt(c.dcac.value, 3)}. Clipping costs ${clipPct} of this clear day's energy.`);
  else if (c.dcac.value < 0.8) item('warn', 'Check: oversized inverter', `DC/AC ratio ${fmt(c.dcac.value, 3)}: the inverter will rarely work near its rating. A smaller one would cost less.`);
  else item('ok', 'DC/AC ratio', `${fmt(c.dcac.value, 3)}. Clipping costs ${clipPct} of this clear day's energy.`);
  if (!st.connected) item('warn', 'Not connected', 'An inverter will not export without a grid to follow (anti-islanding), so nothing flows yet. Drag the plug onto the socket, or use the Connect button.');
  else if (M.tripped) item('error', 'Connected, but off', 'The inverter refuses to start while the string voltage can exceed its maximum.');
  else item('ok', 'Connected', 'The inverter follows the grid and exports.');
}

function renderReadouts() {
  const pw = nowPower();
  const box = (k, v, unit) => h('div', {}, h('dt', {}, k), h('dd', {}, v, unit ? h('small', {}, ` ${unit}`) : null));
  const grp = (title, ...items) => h('div', { class: 'sb-group' }, h('h4', {}, title), h('dl', { class: 'readout' }, ...items));
  const yearKWh = M.exporting ? M.year : 0;
  clear($('sb-readouts')).append(
    grp('One module (standard test conditions)',
      box('Open-circuit voltage', fmt(M.mod.Voc, 3), 'V'), box('Short-circuit current', fmt(M.mod.Isc, 3), 'A'), box('Maximum power', fmt(M.mod.Pmax, 3), 'W'), box('Power coefficient', M.coeff.pmax.toFixed(2).replace('-', '−'), '%/°C')),
    grp('Array',
      box('Rated power', fmt(M.dc.kWp, 3), 'kWp'), box('Modules', String(st.series * st.parallel)), box('String Voc, coldest morning', fmt(M.dc.vocCold, 3), 'V'), box('String working voltage, hot', fmt(M.dc.vmpHot, 3), 'V')),
    grp(`Inverter at ${fmtHour(st.hour)}`,
      box('DC/AC ratio', fmt(M.dc.ratio, 3)), box('Array delivering', fmt(pw.dc, 3), 'kW'), box('Sent to grid', fmt(pw.ac, 3), 'kW'), box('Inverter loading', fmt((100 * pw.ac) / M.inv.acKW, 3), '%')),
    grp('Energy, clear sky',
      box('This day, to grid', fmt(M.exporting ? M.clip.acKWh : 0, 3), 'kWh'), box('Clipped this day', fmt(M.clip.clippedKWh, 3), 'kWh'), box('Clear-sky year', fmt(yearKWh / 1000, 3), 'MWh'), box('Per kWp per year', fmt(M.dc.kWp ? yearKWh / M.dc.kWp : 0, 3), 'kWh')));
}

// ---------- controls ----------
function syncControls() {
  $('sb-cells').value = st.chain; $('sb-half').checked = st.half;
  $('sb-series').value = st.series; $('sb-parallel').value = st.parallel;
  $('sb-inverter').value = INVERTERS[st.inv].id;
  const b = $('sb-connect'); b.textContent = st.connected ? 'Disconnect from the grid' : 'Connect to the grid';
  const inv = INVERTERS[st.inv];
  $('sb-inv-spec').textContent = `Max ${inv.vMax} V DC; tracks ${inv.mpptMin}–${inv.mpptMax} V; up to ${inv.iscMax} A short-circuit current. Illustrative, not a real product.`;
}
function update(full = true) {
  if (full) compute();
  syncControls(); draw(); drawDay(); renderReadouts(); if (full) renderChecks();
}
const clampSet = (key, v) => { const [a, b] = LIM[key]; const step = key === 'chain' ? 6 : 1; st[key] = Math.max(a, Math.min(b, Math.round(v / step) * step)); };

function bindControls() {
  for (const sp of document.querySelectorAll('.stepper')) {
    const key = sp.dataset.key === 'cells' ? 'chain' : sp.dataset.key;
    const inp = sp.querySelector('input');
    const step = key === 'chain' ? 6 : 1;
    sp.querySelectorAll('.step-btn').forEach((b) => b.addEventListener('click', () => { clampSet(key, st[key] + step * Number(b.dataset.d)); update(); }));
    inp.addEventListener('change', () => { clampSet(key, Number(inp.value) || st[key]); update(); });
  }
  $('sb-half').addEventListener('change', (e) => { st.half = e.target.checked; update(); });
  const inv = $('sb-inverter');
  for (const x of INVERTERS) inv.append(h('option', { value: x.id }, x.label));
  inv.addEventListener('change', () => { st.inv = INVERTERS.findIndex((x) => x.id === inv.value); update(); });
  $('sb-connect').addEventListener('click', () => { st.connected = !st.connected; plugPos = null; update(); });
  const place = $('sb-place'); for (const p of PLACES) place.append(h('option', { value: p.id }, p.label));
  place.value = st.place; place.addEventListener('change', () => { st.place = place.value; update(); });
  const day = $('sb-day'); for (const d of DAYS) day.append(h('option', { value: d.id }, d.label));
  day.value = st.day; day.addEventListener('change', () => { st.day = day.value; update(); });
  const air = $('sb-air'); air.addEventListener('input', () => { st.air = Number(air.value); $('sb-air-out').textContent = `${st.air} °C`.replace('-', '−'); update(); });
  const tmin = $('sb-tmin'); tmin.addEventListener('input', () => { st.tmin = Number(tmin.value); $('sb-tmin-out').textContent = `${st.tmin} °C`.replace('-', '−'); update(); });
  const hour = $('sb-hour'); hour.addEventListener('input', () => { setPlaying(false); st.hour = Number(hour.value); $('sb-hour-out').textContent = fmtHour(st.hour); update(false); });
  $('sb-play').addEventListener('click', () => {
    if (reducedMotion()) { st.hour = st.hour >= 20 ? 4 : Math.min(20, Math.floor(st.hour) + 1); syncHour(); update(false); return; }
    setPlaying(!playing);
  });
  if (reducedMotion()) $('sb-play').textContent = 'Next hour';
}
function syncHour() { $('sb-hour').value = st.hour; $('sb-hour-out').textContent = fmtHour(st.hour); }

// ---------- dragging ----------
let drag = null;
function svgPoint(e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
function startDrag(e, kind, el) {
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  const p = svgPoint(e);
  drag = { kind, el, start: p, inv0: st.inv, chain0: st.chain, series0: st.series, parallel0: st.parallel };
  el.classList.add('is-dragging');
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', endDrag, { once: true });
  el.addEventListener('pointercancel', endDrag, { once: true });
}
let pending = false;
function onMove(e) {
  if (!drag) return;
  const p = svgPoint(e);
  const before = JSON.stringify(st);
  const dx = p.x - drag.start.x; const dy = p.y - drag.start.y;
  if (drag.kind === 'cells') clampSet('chain', drag.chain0 + Math.round(dy / L.mod.rh) * 6);
  else if (drag.kind === 'series') clampSet('series', drag.series0 + Math.round(dx / L.arr.pitch));
  else if (drag.kind === 'parallel') clampSet('parallel', drag.parallel0 + Math.round(dy / L.arr.row));
  else if (drag.kind === 'inverter') st.inv = Math.max(0, Math.min(INVERTERS.length - 1, drag.inv0 + Math.round((drag.start.y - p.y) / 28)));
  else if (drag.kind === 'plug') { plugPos = { x: p.x, y: p.y }; st.connected = false; }
  if (drag.kind === 'plug' || JSON.stringify(st) !== before) {
    if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; update(drag?.kind !== 'plug'); }); }
  }
}
function endDrag(e) {
  if (!drag) return;
  const { el, kind } = drag;
  el.removeEventListener('pointermove', onMove);
  el.classList.remove('is-dragging');
  if (kind === 'plug') {
    const p = svgPoint(e); const s = L.socket;
    st.connected = Math.hypot(p.x - (s.x - 36 * L.side), p.y - s.y) < 60;
    plugPos = null;
  }
  drag = null;
  update();
}

// ---------- flow animation and the played day ----------
let playing = false; let dashOffset = 0;
function setPlaying(on) {
  playing = on;
  const b = $('sb-play'); b.textContent = on ? 'Pause the day' : 'Play a clear day';
  if (on && st.hour >= 19.9) st.hour = 4;
}
function startLoop() {
  if (reducedMotion()) return;
  animate(svg, (dt) => {
    const pw = M ? nowPower() : { dc: 0 };
    if (pw.dc > 0.001 || pw.ac > 0.001) {
      dashOffset -= dt * (25 + 70 * Math.min(1, pw.dc / Math.max(0.5, M.dc.kWp)));
      for (const d of layers.flow.querySelectorAll('.sb-dash')) d.style.strokeDashoffset = String(dashOffset);
    }
    if (playing) {
      st.hour = Math.min(20, st.hour + dt * 1.2);
      syncHour(); update(false);
      if (st.hour >= 20) setPlaying(false);
    }
  });
}

// ---------- layout switching ----------
function chooseLayout() {
  const next = svg.clientWidth && svg.clientWidth < 620 ? NARROW : WIDE;
  if (next !== L) { L = next; if (M) update(false); }
}

svg.append(layers.stat, layers.flow, layers.handles);
makeHandle('cells', 'Drag to change the number of cells'); makeHandle('series', 'Drag to change modules per string');
makeHandle('parallel', 'Drag to change the number of strings'); makeHandle('inverter', 'Drag up or down to change inverter size');
buildPlug();
bindControls();
chooseLayout();
new ResizeObserver(chooseLayout).observe(svg);
update();
syncHour();
startLoop();
