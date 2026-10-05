// Concentrated solar power: a heliostat field tracking the Sun (plan view) and a molten-salt day.
import { mountShares, bindRange, segmented, fitCanvas, animate, onTheme, reducedMotion, ink, label, alpha, fmt } from './renewables-b-common.js';
import { sunVector, heliostatNormal, cosineEfficiency, mirrorAttitude, towerDay } from '../assets/js/physics/csp.js';
import { sunPosition, clearSky } from '../assets/js/physics/solar.js';
import { makeChart, baseOption } from '../assets/js/charts.js';

mountShares();

const LAT = 37.56; // Gemasolar, near Seville
const TOWER = [0, 0, 140]; // receiver height (m), Gemasolar's tower is 140 m
const dateFor = (month, hours) => {
  const day = { 3: 20, 6: 21, 12: 21 }[month] || 21;
  return new Date(Date.UTC(2025, month - 1, day) + hours * 3600e3);
};
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const compass = (az) => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];

// ---------- field layout: staggered rings, biased to the north (pole side) ----------
const MIRRORS = [];
for (let r = 70, ring = 0; r <= 380; r += 26, ring += 1) {
  const n = Math.floor((2 * Math.PI * r) / 30);
  for (let i = 0; i < n; i += 1) {
    const a = ((i + (ring % 2) * 0.5) / n) * 2 * Math.PI; // angle from north, clockwise
    const x = r * Math.sin(a); const y = r * Math.cos(a);
    if (y < -r * 0.25 && r > 200) continue; // thin field to the south
    if (y < -r * 0.6 && r > 130) continue;
    MIRRORS.push([x, y, 0]);
  }
}
const nearest = (tx, ty) => MIRRORS.reduce((best, m) => (Math.hypot(m[0] - tx, m[1] - ty) < Math.hypot(best[0] - tx, best[1] - ty) ? m : best), MIRRORS[0]);
const FOLLOW = { n: nearest(0, 230), e: nearest(230, 0), s: nearest(0, -150), w: nearest(-230, 0) };

const st = { t: 10, month: 6, follow: 'n', playing: false };
const canvas = document.getElementById('field-canvas');
const timeIn = document.getElementById('f-time');
const playBtn = document.getElementById('field-play');
let ctx = null; let W = 0; let H = 0;

function size() { const r = canvas.getBoundingClientRect(); if (!r.width) return false; W = r.width; H = r.height; ctx = fitCanvas(canvas, W, H); return true; }

function sunNow() {
  const p = sunPosition(dateFor(st.month, st.t), LAT, 0);
  return { el: p.elevation, az: p.azimuth, up: p.elevation > 0.5, v: sunVector(p.elevation, p.azimuth) };
}

function drawField() {
  if (!ctx && !size()) return;
  const c = ink(); const sun = sunNow();
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2; const cy = H / 2 + 8;
  const R = Math.min(W, H) / 2 - 34;
  const k = R / 400; // px per metre
  const P = (m) => [cx + m[0] * k, cy - m[1] * k];
  // compass ring
  ctx.strokeStyle = c.rule; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.stroke();
  for (const [t, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    const rr = R + 20; const ang = (a * Math.PI) / 180;
    label(ctx, t, cx + rr * Math.sin(ang), cy - rr * Math.cos(ang), { size: 12, align: 'center', color: c.ink2, weight: 700, halo: c.paper2 });
  }
  // mirrors
  let sum = 0;
  for (const m of MIRRORS) {
    const [px, py] = P(m);
    let u = 0; let n = null;
    if (sun.up) { n = heliostatNormal(sun.v, m, TOWER); u = cosineEfficiency(sun.v, m, TOWER); sum += u; }
    ctx.save(); ctx.translate(px, py);
    // mirror drawn as a short bar perpendicular to its facing direction (projected normal)
    const face = n ? Math.atan2(n[0], n[1]) : 0; // radians clockwise from north
    ctx.rotate(face);
    const len = Math.max(5, 15 * k); const wid = Math.max(2.5, len * 0.45);
    ctx.fillStyle = sun.up ? alpha(c.sun, 0.12 + 0.88 * Math.max(0, (u - 0.6) / 0.4)) : alpha(c.ink2, 0.25);
    ctx.strokeStyle = sun.up ? alpha(c.sunInk, 0.55) : alpha(c.ink2, 0.4); ctx.lineWidth = 0.8;
    ctx.fillRect(-len / 2, -wid / 2, len, wid); ctx.strokeRect(-len / 2, -wid / 2, len, wid);
    ctx.restore();
  }
  // tower
  ctx.fillStyle = c.ink; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = c.panel; ctx.lineWidth = 2; ctx.stroke();
  label(ctx, 'Tower', cx + 12, cy + 1, { size: 12, color: c.ink, halo: c.paper2 });
  // sun on the compass ring
  if (sun.up) {
    const ang = (sun.az * Math.PI) / 180; const rr = R + 6;
    const sx = cx + rr * Math.sin(ang); const sy = cy - rr * Math.cos(ang);
    ctx.fillStyle = c.sun; ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c.panel; ctx.lineWidth = 2; ctx.stroke();
  }
  // followed mirror
  const fm = FOLLOW[st.follow]; const [fx, fy] = P(fm);
  ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fx, fy, 11, 0, Math.PI * 2); ctx.stroke();
  if (sun.up) {
    const ang = (sun.az * Math.PI) / 180; const L = R * 0.55;
    // sunlight arriving (drawn from the sun's direction)
    arrow(fx + L * Math.sin(ang), fy - L * Math.cos(ang), fx + 13 * Math.sin(ang), fy - 13 * Math.cos(ang), c.sunInk, [6, 5]);
    // reflected beam to the tower
    const d = Math.hypot(fx - cx, fy - cy);
    arrow(fx, fy, cx + ((fx - cx) / d) * 10, cy + ((fy - cy) / d) * 10, c.csp, null);
  } else {
    label(ctx, 'Sun below the horizon: mirrors stowed flat', cx, cy + R * 0.5, { size: 13, align: 'center', color: c.ink2, halo: c.paper2 });
  }
  // readouts
  const avg = sun.up ? sum / MIRRORS.length : NaN;
  const att = sun.up ? mirrorAttitude(sun.v, fm, TOWER) : null;
  const me = sun.up ? cosineEfficiency(sun.v, fm, TOWER) : NaN;
  setV('r-el', sun.el > 0 ? `${sun.el.toFixed(0)}°` : 'below horizon');
  setV('r-az', sun.up ? compass(sun.az) : '—');
  setV('r-field', sun.up ? `${(100 * avg).toFixed(0)} %` : '—');
  setV('r-mirror', sun.up ? `${(100 * me).toFixed(0)} %` : '—');
  setV('r-tilt', att ? `${att.tiltDeg.toFixed(0)}°` : 'stowed');
  setV('r-face', att ? compass(att.facingDeg) : '—');
  document.getElementById('field-status').textContent = sun.up
    ? `At ${hhmm(st.t)} the followed mirror presents ${(100 * me).toFixed(0)} % of its area to the Sun; the field as a whole averages ${(100 * avg).toFixed(0)} %.`
    : 'Night: no direct sunlight. A plant with molten-salt storage can still be generating (see below).';
}

function arrow(x1, y1, x2, y2, color, dash) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - 7 * Math.cos(a), y2 - 7 * Math.sin(a)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 10 * Math.cos(a - 0.4), y2 - 10 * Math.sin(a - 0.4)); ctx.lineTo(x2 - 10 * Math.cos(a + 0.4), y2 - 10 * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
  ctx.restore();
}
const setV = (id, t) => { document.getElementById(id).textContent = t; };
const hhmm = (t) => `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`;

const timeOut = document.getElementById('f-time-out');
const setTime = (t) => { st.t = Math.max(5, Math.min(19, t)); timeIn.value = String(st.t); timeOut.textContent = hhmm(st.t); drawField(); };
bindRange(timeIn, timeOut, hhmm, (v) => { st.t = v; drawField(); });
segmented(document.getElementById('f-season'), (v) => { st.month = Number(v); drawField(); }, { fire: false });
document.getElementById('f-follow').addEventListener('change', (e) => { st.follow = e.target.value; drawField(); });
document.getElementById('field-back').addEventListener('click', () => setTime(st.t - 1));
document.getElementById('field-fwd').addEventListener('click', () => setTime(st.t + 1));

let loop = null;
const playLabel = () => { playBtn.textContent = st.playing ? 'Pause' : 'Play the day'; };
playBtn.addEventListener('click', () => {
  if (reducedMotion()) { setTime(st.t >= 19 ? 5 : st.t + 1); return; }
  st.playing = !st.playing;
  if (st.playing && st.t >= 19) setTime(5);
  playLabel();
  loop ??= animate(canvas, (dt) => {
    if (!st.playing) return;
    st.t += dt * 1.2;
    if (st.t >= 19) { st.t = 19; st.playing = false; playLabel(); }
    timeIn.value = String(st.t); timeOut.textContent = hhmm(st.t); drawField();
  });
  loop.kick();
});
if (reducedMotion()) playBtn.textContent = 'Next hour';
new ResizeObserver(() => { size(); drawField(); }).observe(canvas);
onTheme(() => drawField());

// ---------- after sunset: a day of the molten-salt tower ----------
const night = { storageH: 15, month: 6 };
const DT = 0.25;
const hours = Array.from({ length: 96 }, (_, i) => i * DT);
const dniFor = (month) => hours.map((h) => clearSky(dateFor(month, h + DT / 2), LAT, 0).dni);
let res = null; let chartP = null; let chartT = null; let buildP = null; let buildT = null;

function compute() {
  res = towerDay({ dni: dniFor(night.month), dt: DT, fieldM2: 2650 * 120, etaOpt: 0.55, ratedMWe: 20, etaCycle: 0.4, storageH: night.storageH });
  setV('n-hours', `${fmt(res.fullLoadHours, 3)} h`);
  document.getElementById('n-mwh').textContent = `${Math.round(res.electricMWh)} MWh`;
  setV('n-spill', `${Math.round((100 * res.spilledMWhTh) / Math.max(1, res.collectedMWhTh))} %`);
}

const xLabels = hours.map((h) => hhmm(h));
const tip = (b, rows) => ({
  ...b.tooltip, trigger: 'axis',
  formatter: (ps) => `<div class="tt-head">${ps[0].axisValue} solar time</div>${ps.map((p) => `<div class="tt-row"><span class="tt-name"><span class="tt-k k-${rows[p.seriesIndex][0]}"></span>${p.seriesName}</span><strong>${rows[p.seriesIndex][1](p.value)}</strong></div>`).join('')}`,
});

async function renderNight() {
  compute();
  buildP = (c) => {
    const b = baseOption();
    return {
      ...b, legend: { show: false }, grid: { left: 8, right: 16, top: 24, bottom: 4, containLabel: true },
      tooltip: tip(b, [['curtailed', (v) => `${Math.round(v)} MW thermal`], ['charge', (v) => `${Math.round(v)} MW`]]),
      xAxis: { ...b._axis, type: 'category', data: xLabels, boundaryGap: false, axisLabel: { ...b._axis.axisLabel, interval: document.getElementById('night-chart').clientWidth < 520 ? 23 : 11 }, splitLine: { show: false } },
      yAxis: { ...b._axis, type: 'value', name: 'MW', nameGap: 8, nameTextStyle: { ...b._axis.nameTextStyle, align: 'right' } },
      series: [
        { name: 'Heat into the salt', type: 'line', symbol: 'none', data: res.qField.map((v) => +v.toFixed(2)), lineStyle: { width: 1.5, color: c.sun }, itemStyle: { color: c.sun }, areaStyle: { color: c.sun, opacity: 0.18 } },
        { name: 'Electricity out', type: 'line', step: 'middle', symbol: 'none', data: res.power, lineStyle: { width: 2.5, color: c.source.csp }, itemStyle: { color: c.source.csp } },
      ],
    };
  };
  buildT = (c) => {
    const b = baseOption();
    return {
      ...b, legend: { show: false }, grid: { left: 8, right: 16, top: 12, bottom: 4, containLabel: true },
      tooltip: tip(b, [['store', (v) => `${Math.round(v)} %`]]),
      xAxis: { ...b._axis, type: 'category', data: xLabels, boundaryGap: false, axisLabel: { ...b._axis.axisLabel, interval: document.getElementById('night-chart').clientWidth < 520 ? 23 : 11 }, splitLine: { show: false } },
      yAxis: { ...b._axis, type: 'value', min: 0, max: 100, interval: 50, axisLabel: { ...b._axis.axisLabel, formatter: '{value} %' } },
      series: [{ name: 'Hot tank', type: 'line', symbol: 'none', data: res.level.map((v) => +(100 * v).toFixed(1)), lineStyle: { width: 2, color: c.source.storage }, itemStyle: { color: c.source.storage }, areaStyle: { color: c.source.storage, opacity: 0.12 } }],
    };
  };
  if (!chartP) { chartP = await makeChart(document.getElementById('night-chart'), (c) => buildP(c)); chartT = await makeChart(document.getElementById('tank-chart'), (c) => buildT(c)); }
  else { chartP.refresh(); chartT.refresh(); }
}
bindRange(document.getElementById('n-store'), document.getElementById('n-store-out'), (v) => `${v} hour${v === 1 ? '' : 's'}`, (v) => { night.storageH = v; if (chartP) renderNight(); });
segmented(document.getElementById('n-season'), (v) => { night.month = Number(v); renderNight(); }, { fire: false });
renderNight();
