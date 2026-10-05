// Tidal and wave page: share figure, ebb-barrage animation with level and power charts,
// tidal-stream versus wind comparison, and the wave-energy widget.
import { mountShare, stage, ink, arrow, label, bindRange, setText, fmt, reducedMotion } from './renewables-a-common.js';
import { makeChart, baseOption } from '../assets/js/charts.js';
import { tidalBasinEnergyJ, waveEnergyFlux, rotorPower } from '../assets/js/physics/renewables.js';
import { simulateEbbBarrage, equivalentWindSpeed, powerDensity, deepWaterWavelength, deepWaterGroupVelocity, waveEnergyDensity } from '../assets/js/physics/fluids.js';

const $ = (id) => document.getElementById(id);
mountShare(document.querySelector('.today-figure'), { source: 'other_renewable_exc_biofuel', noun: 'geothermal, tidal and wave', leaders: 0 });

// ---------------------------------------------------------------- tidal barrage
const BASIN = 22e6;
const TIDES_PER_YEAR = (365.25 * 24) / 12.42;
const PHASE = { sluice: 'Sluicing', hold: 'Holding', generate: 'Generating' };
const tb = { range: 8, start: 3.5, time: 0, sim: null, playing: true, spin: 0, parts: Array.from({ length: 30 }, () => Math.random()) };

function runSim() { tb.sim = simulateEbbBarrage({ rangeM: tb.range, basinAreaM2: BASIN, startHeadM: tb.start }); }
function sample(t) {
  const s = tb.sim.series; const f = (t / tb.sim.periodH) * (s.length - 1);
  const i = Math.max(0, Math.min(s.length - 2, Math.floor(f))); const u = f - i;
  const a = s[i]; const b = s[i + 1];
  return { sea: a.sea + (b.sea - a.sea) * u, basin: a.basin + (b.basin - a.basin) * u, mw: a.mw + (b.mw - a.mw) * u, phase: u < 0.5 ? a.phase : b.phase };
}

function drawTide(ctx, w, h, dt) {
  const c = ink();
  if (dt && tb.playing) { tb.time = (tb.time + dt * 1.0) % tb.sim.periodH; syncTime(); }
  const now = sample(tb.time);
  if (dt) { tb.spin += dt * (now.phase === 'generate' ? 6 : 0); for (let i = 0; i < tb.parts.length; i++) tb.parts[i] = (tb.parts[i] + dt * 0.6) % 1; }
  const mid = h * 0.44; const ppm = h * 0.042; const Y = (m) => mid - m * ppm;
  const bed = Y(-8.2);
  const x0 = w * 0.42; const x1 = w * 0.56;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = c.paper2; ctx.fillRect(0, 0, w, h);
  // water
  const water = (xa, xb, lvl) => {
    ctx.fillStyle = c.ocean; ctx.globalAlpha = 0.32; ctx.fillRect(xa, Y(lvl), xb - xa, bed - Y(lvl)); ctx.globalAlpha = 1;
    ctx.strokeStyle = c.ocean; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xa, Y(lvl)); ctx.lineTo(xb, Y(lvl)); ctx.stroke();
  };
  water(0, x0, now.sea); water(x1, w, now.basin);
  // reference levels
  ctx.strokeStyle = c.ink2; ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
  for (const lv of [tb.range / 2, -tb.range / 2]) { ctx.beginPath(); ctx.moveTo(0, Y(lv)); ctx.lineTo(x0, Y(lv)); ctx.stroke(); }
  ctx.setLineDash([]);
  label(ctx, 'high water', 8, Y(tb.range / 2) - 9, { color: c.ink2, size: 11, halo: c.paper2 });
  label(ctx, 'low water', 8, Y(-tb.range / 2) + 11, { color: c.ink2, size: 11, halo: c.paper2 });
  // sea bed
  ctx.fillStyle = c.rule; ctx.fillRect(0, bed, w, h - bed);
  // barrage
  const top = Y(8.2);
  ctx.fillStyle = c.ink2; ctx.globalAlpha = 0.55; ctx.fillRect(x0, top, x1 - x0, bed - top); ctx.globalAlpha = 1;
  // turbine duct and bulb
  const dTop = bed - h * 0.11; const dBot = bed - h * 0.02;
  ctx.fillStyle = c.paper2; ctx.fillRect(x0, dTop, x1 - x0, dBot - dTop);
  const cx = (x0 + x1) / 2; const cy = (dTop + dBot) / 2;
  ctx.fillStyle = c.panel; ctx.strokeStyle = c.ink; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(cx + (x1 - x0) * 0.08, cy, (x1 - x0) * 0.24, (dBot - dTop) * 0.28, 0, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  const bl = (dBot - dTop) * 0.42;
  ctx.strokeStyle = c.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - (x1 - x0) * 0.2, cy - bl * Math.cos(tb.spin)); ctx.lineTo(cx - (x1 - x0) * 0.2, cy + bl * Math.cos(tb.spin)); ctx.stroke();
  // sluice opening and gate
  const sTop = Y(-1.5); const sBot = Y(-4.2);
  const open = now.phase === 'sluice';
  ctx.fillStyle = c.paper2; ctx.fillRect(x0, sTop, x1 - x0, sBot - sTop);
  ctx.fillStyle = c.ink; const gH = sBot - sTop;
  ctx.fillRect(x1 - 7, open ? sTop - gH * 0.85 : sTop, 6, gH);
  label(ctx, 'sluice', x1 + 6, (sTop + sBot) / 2 - (open ? 0 : 0), { color: c.ink2, size: 11, halo: c.paper2 });
  label(ctx, 'turbine', x1 + 6, cy, { color: c.ink2, size: 11, halo: c.paper2 });
  // flow particles
  ctx.fillStyle = c.ocean;
  for (const p of tb.parts) {
    if (open) { const x = x0 - 20 + p * (x1 - x0 + 40); const y = sTop + 4 + ((p * 53) % 1) * (gH - 8); ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 2 * Math.PI); ctx.fill(); }
    if (now.phase === 'generate') { const x = x1 + 20 - p * (x1 - x0 + 40); const y = dTop + 4 + ((p * 37) % 1) * (dBot - dTop - 8); ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 2 * Math.PI); ctx.fill(); }
  }
  if (open) arrow(ctx, x0 - w * 0.12, (sTop + sBot) / 2, x0 - w * 0.03, (sTop + sBot) / 2, { color: c.ocean, width: 2.5, head: 9 });
  if (now.phase === 'generate') arrow(ctx, x0 - w * 0.03, cy, x0 - w * 0.12, cy, { color: c.ocean, width: 2.5, head: 9 });
  // head marker
  const head = now.basin - now.sea;
  if (Math.abs(head) > 0.15) {
    const hx = x1 + w * 0.08;
    ctx.strokeStyle = c.sunInk; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x0 - 10, Y(now.sea)); ctx.lineTo(hx + 8, Y(now.sea)); ctx.stroke(); ctx.setLineDash([]);
    arrow(ctx, hx, Y(now.sea), hx, Y(now.basin), { color: c.sunInk, width: 1.5, head: 7 });
    label(ctx, `head ${Math.abs(head).toFixed(1)} m`, hx + 8, (Y(now.sea) + Y(now.basin)) / 2, { color: c.sunInk, size: 12, weight: 700, halo: c.paper2 });
  }
  label(ctx, 'sea', w * 0.03, bed - 16, { color: c.ink, size: 13, weight: 700, halo: c.paper2 });
  label(ctx, 'basin', w * 0.97, bed - 16, { color: c.ink, size: 13, weight: 700, align: 'right', halo: c.paper2 });
  label(ctx, 'barrage', (x0 + x1) / 2, top - 10, { color: c.ink, size: 12, align: 'center', halo: c.paper2 });
  label(ctx, `${PHASE[now.phase]} · ${tb.time.toFixed(1)} h`, w * 0.97, 18, { color: c.ink, size: 14, weight: 700, align: 'right', halo: c.paper2 });
  if (now.mw > 0.5) label(ctx, `${fmt(now.mw, 3)} MW`, w * 0.97, 38, { color: c.ocean, size: 14, weight: 700, align: 'right', halo: c.paper2 });
}

let lvChart = null; let pwChart = null; let lastChartT = -1;
const cursor = (c) => ({ silent: true, symbol: 'none', animation: false, lineStyle: { color: c.ink, width: 1, type: 'solid' }, label: { show: false }, data: [{ xAxis: Number(tb.time.toFixed(2)) }] });
function genAreas() {
  const s = tb.sim.series; const out = []; let start = null;
  s.forEach((p, i) => { if (p.phase === 'generate' && start == null) start = p.h; if ((p.phase !== 'generate' || i === s.length - 1) && start != null) { out.push([{ xAxis: start }, { xAxis: p.h }]); start = null; } });
  return out;
}
function lvOption(c) {
  const b = baseOption(); const s = tb.sim.series;
  return {
    ...b, animation: false,
    grid: { ...b.grid, top: 34, left: 48, right: 16, bottom: 30 },
    legend: { ...b.legend, top: 0, left: 0, data: ['Sea', 'Basin'] },
    tooltip: { ...b.tooltip, trigger: 'axis', valueFormatter: (x) => `${fmt(x, 3)} m` },
    xAxis: { ...b._axis, type: 'value', min: 0, max: Number(tb.sim.periodH.toFixed(2)), axisLabel: { ...b._axis.axisLabel, formatter: '{value} h' } },
    yAxis: { ...b._axis, type: 'value', min: -7, max: 7 },
    series: [
      { id: 'sea', name: 'Sea', type: 'line', showSymbol: false, data: s.map((p) => [p.h, p.sea]), lineStyle: { width: 2, color: c.source.ocean }, itemStyle: { color: c.source.ocean },
        markLine: cursor(c), markArea: { silent: true, itemStyle: { color: c.sun, opacity: 0.14 }, data: genAreas() } },
      { name: 'Basin', type: 'line', showSymbol: false, data: s.map((p) => [p.h, p.basin]), lineStyle: { width: 2, type: 'dashed', color: c.source.csp }, itemStyle: { color: c.source.csp } },
    ],
  };
}
function pwOption(c) {
  const b = baseOption(); const s = tb.sim.series;
  return {
    ...b, animation: false,
    grid: { ...b.grid, top: 12, left: 48, right: 16, bottom: 30 },
    tooltip: { ...b.tooltip, trigger: 'axis', valueFormatter: (x) => `${fmt(x, 3)} MW` },
    xAxis: { ...b._axis, type: 'value', min: 0, max: Number(tb.sim.periodH.toFixed(2)), axisLabel: { ...b._axis.axisLabel, formatter: '{value} h' } },
    yAxis: { ...b._axis, type: 'value', min: 0, max: 600, splitNumber: 3 },
    series: [{ id: 'pw', type: 'line', showSymbol: false, data: s.map((p) => [p.h, p.mw]), lineStyle: { width: 2, color: c.source.ocean }, itemStyle: { color: c.source.ocean }, areaStyle: { color: c.source.ocean, opacity: 0.15 }, markLine: cursor(c) }],
  };
}
function moveCursors() {
  if (Math.abs(tb.time - lastChartT) < 0.15) return;
  lastChartT = tb.time;
  const c = { ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() };
  lvChart?.chart.setOption({ series: [{ id: 'sea', markLine: cursor(c) }] });
  pwChart?.chart.setOption({ series: [{ id: 'pw', markLine: cursor(c) }] });
}

const timeIn = $('t-time');
function syncTime() {
  timeIn.value = String(Math.round((tb.time / tb.sim.periodH) * 1000));
  setText('t-time-out', `${tb.time.toFixed(1)} h`);
  tideReadouts();
  moveCursors();
}
function tideReadouts() {
  const now = sample(tb.time);
  setText('o-phase', PHASE[now.phase]);
  setText('o-head', `${Math.abs(now.basin - now.sea).toFixed(1)} m`);
  setText('o-mw', `${fmt(Math.max(0, now.mw), 3)} MW`);
  const msg = now.phase === 'sluice' ? 'The sluices are open: the rising sea flows freely into the basin, so the basin follows the tide up.'
    : now.phase === 'hold' && now.basin > now.sea ? 'High water has passed and the gates are shut. The sea falls away outside while the basin stays full, building up head.'
      : now.phase === 'hold' ? 'The head has fallen too low for the turbines. The gates stay shut until the rising sea catches up with the basin.'
        : 'Generating: water runs from the full basin back to the lower sea through the turbines.';
  setText('tide-status', tb.sim.energyJ > 0 ? msg : 'The tide never builds enough head to reach the start value, so the turbines never run. Lower the start head or raise the range.');
}
function tideTotals() {
  const e = tb.sim.energyJ;
  setText('o-tide', `${fmt(e / 3.6e12, 3)} GWh`);
  setText('o-year', `${fmt((e * TIDES_PER_YEAR) / 3.6e12, 3)} GWh`);
  setText('o-ideal', `${Math.round((100 * e) / tidalBasinEnergyJ(BASIN, tb.range))} %`);
}

runSim();
const tideStage = stage($('tide-canvas'), drawTide, { playButton: $('tide-play') });
tb.playing = tideStage.isPlaying();
$('tide-play').addEventListener('click', () => { tb.playing = tideStage.isPlaying(); });
timeIn.addEventListener('input', () => {
  if (tideStage.isPlaying()) { tideStage.setPlaying(false); tb.playing = false; }
  tb.time = (Number(timeIn.value) / 1000) * tb.sim.periodH * 0.999;
  setText('t-time-out', `${tb.time.toFixed(1)} h`); tideReadouts(); lastChartT = -1; moveCursors(); tideStage.redraw(0);
});
const resim = () => { runSim(); tideTotals(); lvChart?.refresh(); pwChart?.refresh(); lastChartT = -1; syncTime(); tideStage.redraw(0); };
bindRange($('t-range'), $('t-range-out'), (v) => `${v} m`, (v) => { tb.range = v; if (tb.sim) resim(); });
bindRange($('t-start'), $('t-start-out'), (v) => `${v} m`, (v) => { tb.start = v; if (tb.sim) resim(); });
resim();
makeChart($('lv-chart'), lvOption).then((ch) => { lvChart = ch; lastChartT = -1; moveCursors(); });
makeChart($('pw-chart'), pwOption).then((ch) => { pwChart = ch; lastChartT = -1; moveCursors(); });
if (reducedMotion()) { tb.time = 5; syncTime(); tideStage.redraw(0); }

// ---------------------------------------------------------------- tidal stream versus wind
function stream(v) {
  const pw = powerDensity(1025, v); const a10 = powerDensity(1.225, 10); const a25 = powerDensity(1.225, 25);
  const kw = (x) => `${fmt(x / 1000, 2)} kW`;
  setText('s-pd', kw(pw)); setText('s-eq', `${fmt(equivalentWindSpeed(v), 3)} m/s`);
  setText('s-p', `${fmt(rotorPower(1025, 18, v, 0.43) / 1e6, 2)} MW`);
  setText('s-k1', `Water at ${v.toFixed(1)} m/s`);
  const max = Math.max(pw, a25);
  [['s-b1', 's-v1', pw], ['s-b2', 's-v2', a10], ['s-b3', 's-v3', a25]].forEach(([b, t, x]) => { $(b).style.width = `${(100 * x) / max}%`; setText(t, kw(x)); });
  setText('s-status', `A ${v.toFixed(1)} m/s current carries ${fmt(pw / a10, 2)} times the power per square metre of a 10 m/s wind.`);
}
bindRange($('s-v'), $('s-v-out'), (v) => `${v.toFixed(1)} m/s`, stream);

// ---------------------------------------------------------------- waves
const wv = { hs: 2, te: 8, phase: 0 };
function drawWave(ctx, w, h, dt) {
  const c = ink();
  const lambda = deepWaterWavelength(wv.te); const k = (2 * Math.PI) / lambda;
  if (dt) wv.phase += dt * (2 * Math.PI / wv.te);
  const span = Math.max(250, 2.3 * lambda); const pxm = w / span; const vpx = h * 0.06;
  const mid = h * 0.5;
  const eta = (xm) => (wv.hs / 2) * Math.sin(k * xm - wv.phase);
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = c.paper2; ctx.fillRect(0, 0, w, h);
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 3) ctx.lineTo(x, mid - eta(x / pxm) * vpx);
  ctx.lineTo(w, h); ctx.closePath();
  ctx.fillStyle = c.ocean; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = c.ocean; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = 0; x <= w; x += 3) { const y = mid - eta(x / pxm) * vpx; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.stroke();
  // buoy
  const bx = w * 0.62; const by = mid - eta(bx / pxm) * vpx;
  ctx.strokeStyle = c.ink2; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, h); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = c.sun; ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, 9, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  label(ctx, 'buoy', bx + 14, by - 12, { color: c.ink, size: 12, halo: c.paper2 });
  // wavelength marker between two crests
  const crest0 = ((Math.PI / 2 + wv.phase) / k) % lambda; let xc = crest0; while (xc * pxm < w * 0.05) xc += lambda;
  const xa = xc * pxm; const xb = (xc + lambda) * pxm; const yTop = mid - (wv.hs / 2) * vpx - 16;
  if (xb < w - 4) {
    arrow(ctx, (xa + xb) / 2, yTop, xa, yTop, { color: c.ink, width: 1.2, head: 7 }); arrow(ctx, (xa + xb) / 2, yTop, xb, yTop, { color: c.ink, width: 1.2, head: 7 });
    label(ctx, `wavelength ${fmt(lambda, 3)} m`, (xa + xb) / 2, yTop - 12, { color: c.ink, size: 12, align: 'center', halo: c.paper2 });
  }
  // height marker at the first crest
  const hx = xa; const yc = mid - (wv.hs / 2) * vpx; const yt = mid + (wv.hs / 2) * vpx;
  ctx.strokeStyle = c.sunInk; ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(hx - 8, yt); ctx.lineTo(hx + 30, yt); ctx.stroke(); ctx.setLineDash([]);
  arrow(ctx, hx + 22, (yc + yt) / 2, hx + 22, yc, { color: c.sunInk, width: 1.5, head: 6 }); arrow(ctx, hx + 22, (yc + yt) / 2, hx + 22, yt, { color: c.sunInk, width: 1.5, head: 6 });
  label(ctx, `H ${wv.hs.toFixed(1)} m`, hx + 30, (yc + yt) / 2, { color: c.sunInk, size: 12, weight: 700, halo: c.paper2 });
  arrow(ctx, w * 0.04, h * 0.9, w * 0.2, h * 0.9, { color: c.ink2, width: 1.5, head: 8 });
  label(ctx, 'waves travel', w * 0.04, h * 0.9 - 14, { color: c.ink2, size: 11, halo: c.paper2 });
}
const waveStage = stage($('wave-canvas'), drawWave, { playButton: $('wave-play') });
function waves() {
  const p = waveEnergyFlux(wv.hs, wv.te);
  setText('w-p', `${fmt(p / 1000, 3)} kW/m`);
  setText('w-l', `${fmt(deepWaterWavelength(wv.te), 3)} m`);
  setText('w-cg', `${fmt(deepWaterGroupVelocity(wv.te), 2)} m/s`);
  setText('w-e', `${fmt(waveEnergyDensity(wv.hs) / 1000, 2)} kJ`);
  setText('w-status', p > 50e3 ? `A storm-class sea: ${fmt(p / 1000, 3)} kW arrives across each metre of crest, and devices must survive far more than they can use.` : `Across a 1 km front this sea delivers about ${fmt(p / 1000, 3)} MW, before any device takes its share.`);
  if (!waveStage.isPlaying()) waveStage.redraw(0);
}
bindRange($('w-hs'), $('w-hs-out'), (v) => `${v.toFixed(1)} m`, (v) => { wv.hs = v; waves(); });
bindRange($('w-te'), $('w-te-out'), (v) => `${v} s`, (v) => { wv.te = v; waves(); });
