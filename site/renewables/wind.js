// Wind page: share of world electricity, the blade-element rotor animation,
// the power-curve / capacity-factor widget and (expert) the Cp(a) chart.
import { mountShare, stage, ink, arrow, label, bindRange, setText, fmt, reducedMotion } from './renewables-a-common.js';
import { makeChart, baseOption } from '../assets/js/charts.js';
import { BETZ, kineticPower, actuatorDiscCp, airDensity, turbinePowerCurve, rayleighPdf, turbineCapacityFactor } from '../assets/js/physics/renewables.js';
import { bladeSection, tipSpeedRatio, ratedWindSpeed, sweptArea } from '../assets/js/physics/fluids.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;

mountShare(document.querySelector('.today-figure'), { source: 'wind', noun: 'wind', leaders: 3 });

// ---------------------------------------------------------------- blade animation
const R = 118; // m, a 236 m rotor
const DESIGN_TSR = 8; const DESIGN_ALPHA = 6;
const twistAt = (rFrac) => Math.atan2(2 / 3, DESIGN_TSR * rFrac) / DEG - DESIGN_ALPHA;

const st = { v: 10, rpm: 6.5, pitch: 0, rFrac: 0.5, rotor: 0, particles: [] };
for (let i = 0; i < 26; i++) st.particles.push({ u: Math.random(), w: Math.random() });

const section = () => bladeSection({ windMs: st.v, rpm: st.rpm, radiusM: st.rFrac * R, pitchDeg: st.pitch, twistDeg: twistAt(st.rFrac) });

function aerofoilPath(ctx, x, y, chord, theta, color, fill) {
  // NACA-like 12 % thick section with 3 % camber toward the suction (downwind, +x) side.
  const lex = x - Math.sin(theta) * chord * 0.3; const ley = y - Math.cos(theta) * chord * 0.3;
  const ux = Math.sin(theta); const uy = Math.cos(theta); // along chord, LE → TE
  const nx = Math.cos(theta); const ny = -Math.sin(theta); // toward the suction side
  const pts = [];
  const N = 40;
  const thick = (s) => 0.6 * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4);
  const camber = (s) => (s < 0.4 ? (0.03 / 0.16) * (0.8 * s - s * s) : (0.03 / 0.36) * (0.2 + 0.8 * s - s * s));
  for (let i = 0; i <= N; i++) { const s = 1 - Math.cos((Math.PI * i) / N) / 2 - 0.5; pts.push([s, camber(s) + thick(s)]); }
  for (let i = N; i >= 0; i--) { const s = 1 - Math.cos((Math.PI * i) / N) / 2 - 0.5; pts.push([s, camber(s) - thick(s)]); }
  ctx.beginPath();
  pts.forEach(([s, t], i) => {
    const px = lex + ux * s * chord + nx * t * chord; const py = ley + uy * s * chord + ny * t * chord;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  return { lex, ley, ux, uy };
}

function drawBlade(ctx, w, h, dt) {
  const c = ink();
  const s = section();
  const omega = (st.rpm * 2 * Math.PI) / 60;
  if (dt) {
    st.rotor += omega * dt;
    for (const p of st.particles) { p.u += dt * (0.15 + Math.min(s.W, 120) / 180); if (p.u > 1) { p.u -= 1; p.w = Math.random(); } }
  }
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = c.paper2; ctx.fillRect(0, 0, w, h);
  const side = w >= 560;
  const A = side ? { x: 0, y: 0, w: w * 0.42, h } : { x: 0, y: 0, w, h: h * 0.44 };
  const B = side ? { x: w * 0.42, y: 0, w: w * 0.58, h } : { x: 0, y: h * 0.44, w, h: h * 0.56 };

  // ---- rotor seen from upwind
  const cx = A.x + A.w / 2; const cy = A.y + A.h * (side ? 0.42 : 0.47);
  const Rp = Math.min(A.w, A.h) * (side ? 0.38 : 0.4);
  ctx.strokeStyle = c.rule; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  // tower
  ctx.fillStyle = c.ink2;
  ctx.beginPath(); ctx.moveTo(cx - 3, cy); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx + 6, A.y + A.h); ctx.lineTo(cx - 6, A.y + A.h); ctx.closePath();
  ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1;
  for (let k = 0; k < 3; k++) {
    const ang = -st.rotor + (k * 2 * Math.PI) / 3 - Math.PI / 2; // clockwise seen from upwind
    const ca = Math.cos(ang); const sa = Math.sin(ang);
    const P = (r, off) => [cx + ca * r * Rp - sa * off * Rp, cy + sa * r * Rp + ca * off * Rp];
    const chord = (r) => (r < 0.18 ? 0.05 + 0.1 * (r / 0.18) : 0.15 * (1 - r) / 0.82 + 0.02);
    ctx.beginPath();
    const steps = 18;
    for (let i = 0; i <= steps; i++) { const r = 0.06 + (0.94 * i) / steps; const [x, y] = P(r, chord(r) * 0.35); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    for (let i = steps; i >= 0; i--) { const r = 0.06 + (0.94 * i) / steps; const [x, y] = P(r, -chord(r) * 0.65); ctx.lineTo(x, y); }
    ctx.closePath();
    ctx.fillStyle = c.panel; ctx.fill(); ctx.strokeStyle = c.ink; ctx.lineWidth = 1.2; ctx.stroke();
    if (k === 0) {
      const [x1, y1] = P(st.rFrac, chord(st.rFrac) * 0.35 + 0.05); const [x2, y2] = P(st.rFrac, -chord(st.rFrac) * 0.65 - 0.05);
      ctx.strokeStyle = c.sun; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.lineCap = 'butt';
    }
  }
  ctx.fillStyle = c.ink; ctx.beginPath(); ctx.arc(cx, cy, Math.max(5, Rp * 0.06), 0, 2 * Math.PI); ctx.fill();
  // rotation direction: a short arc with a head, clockwise as seen from upwind
  ctx.strokeStyle = c.ink2; ctx.lineWidth = 1.5;
  const ra = Rp + 12; const a0 = -Math.PI * 0.36; const a1 = -Math.PI * 0.14;
  ctx.beginPath(); ctx.arc(cx, cy, ra, a0, a1); ctx.stroke();
  arrow(ctx, cx + Math.cos(a1 - 0.08) * ra, cy + Math.sin(a1 - 0.08) * ra, cx + Math.cos(a1 + 0.04) * ra, cy + Math.sin(a1 + 0.04) * ra, { color: c.ink2, width: 1.5, head: 9 });
  label(ctx, 'Seen from upwind', A.x + 12, A.y + 16, { color: c.ink2, size: 12, halo: c.paper2 });
  label(ctx, `Tips: ${fmt(omega * R, 3)} m/s`, A.x + 12, A.y + A.h - 14, { color: c.ink, size: 12, halo: c.paper2 });

  // ---- blade section seen from the tip
  const bx = B.x + B.w * 0.56; const by = B.y + B.h * 0.64;
  const span = Math.min(B.w, B.h);
  // rotor plane: short ticks above and below the section
  ctx.strokeStyle = c.ink2; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(bx, B.y + B.h - 34); ctx.lineTo(bx, B.y + B.h - 8); ctx.stroke(); ctx.setLineDash([]);
  label(ctx, 'rotor plane', bx + 6, B.y + B.h - 16, { color: c.ink2, size: 11, halo: c.paper2 });

  // flow particles along W
  const phi = s.phiDeg * DEG;
  const wx = Math.sin(phi); const wy = Math.cos(phi);
  const L = span * 1.2;
  ctx.fillStyle = c.wind;
  for (const p of st.particles) {
    const off = (p.w - 0.5) * span * 0.95;
    const x = bx + wx * (p.u - 0.5) * L + wy * off; const y = by + wy * (p.u - 0.5) * L - wx * off;
    if (x < B.x + 2 || x > B.x + B.w - 2 || y < B.y + 2 || y > B.y + B.h - 2) continue;
    ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.globalAlpha = 1;

  const theta = (twistAt(st.rFrac) + st.pitch) * DEG;
  const chord = span * 0.3;
  const geo = aerofoilPath(ctx, bx, by, chord, theta, c.ink, c.panel);
  // chord line, extended forward
  ctx.strokeStyle = c.ink2; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(geo.lex - geo.ux * chord * 0.45, geo.ley - geo.uy * chord * 0.45); ctx.lineTo(geo.lex + geo.ux * chord, geo.ley + geo.uy * chord); ctx.stroke(); ctx.setLineDash([]);

  // velocity triangle ending at the leading edge
  const vmax = Math.max(s.W, 1);
  const k = (span * 0.4) / vmax;
  const lx = geo.lex - geo.ux * 4; const ly = geo.ley - geo.uy * 4;
  const sx0 = lx - s.axial * k; const sy0 = ly - s.tangential * k;
  arrow(ctx, sx0, sy0, lx, ly, { color: c.silicon, width: 3, head: 11 });
  arrow(ctx, sx0, sy0, sx0 + s.axial * k, sy0, { color: c.wind, width: 2.5, head: 9 });
  if (s.tangential * k > 3) arrow(ctx, sx0 + s.axial * k, sy0, lx, ly, { color: c.ink2, width: 2, head: 9, dash: [5, 4] });
  label(ctx, 'wind', sx0 + (s.axial * k) / 2, sy0 - 10, { color: c.ink, size: 12, align: 'center', halo: c.paper2 });
  if (s.tangential * k > 24) label(ctx, 'blade motion', sx0 + s.axial * k + 6, sy0 + (s.tangential * k) / 2, { color: c.ink2, size: 12, halo: c.paper2 });
  label(ctx, `apparent wind ${fmt(s.W, 2)} m/s`, sx0 - 6 + (lx - sx0) * 0.45, sy0 + (ly - sy0) * 0.45, { color: c.silicon, size: 12, align: 'right', halo: c.paper2 });

  // forces at quarter chord
  const qx = geo.lex + geo.ux * chord * 0.25; const qy = geo.ley + geo.uy * chord * 0.25;
  const fs = span * 0.26;
  const liftLen = Math.max(-1.6, Math.min(1.6, s.cl)) * fs;
  const dragLen = Math.max(4, Math.min(1.6, s.cd) * fs);
  arrow(ctx, qx, qy, qx + Math.cos(phi) * liftLen, qy - Math.sin(phi) * liftLen, { color: c.good, width: 3, head: 11 });
  arrow(ctx, qx, qy, qx + wx * dragLen, qy + wy * dragLen, { color: c.hole, width: 2.5, head: 9 });
  label(ctx, 'lift', qx + Math.cos(phi) * liftLen + 8, qy - Math.sin(phi) * liftLen, { color: c.good, size: 12, halo: c.paper2 });
  label(ctx, 'drag', qx + wx * dragLen + 6, qy + wy * dragLen + 10, { color: c.hole, size: 12, halo: c.paper2 });
  // turning push (component along the blade's motion, −y), exaggerated
  const drive = (s.cl * Math.sin(phi) - s.cd * Math.cos(phi)) * fs * 5;
  const tx = B.x + B.w - 28;
  if (Math.abs(drive) > 2) arrow(ctx, tx, by, tx, by - drive, { color: c.sunInk, width: 4, head: 10 });
  label(ctx, drive >= 0 ? 'turning push ×5' : 'braking ×5', tx, by + (drive >= 0 ? 14 : -14), { color: c.sunInk, size: 11, align: 'right', halo: c.paper2 });
  // blade moves this way
  arrow(ctx, B.x + 18, B.y + B.h * 0.7, B.x + 18, B.y + B.h * 0.7 - 40, { color: c.ink2, width: 1.5, head: 7 });
  label(ctx, 'blade moves', B.x + 26, B.y + B.h * 0.7 - 20, { color: c.ink2, size: 11, halo: c.paper2 });
  label(ctx, 'Blade slice, seen from the tip', B.x + 12, side ? B.y + 16 : B.y + B.h - 16, { color: c.ink2, size: 12, halo: c.paper2 });
  if (s.stalled && s.alphaDeg > 0) label(ctx, 'STALLED', bx + chord * 0.3, by + chord * 0.55, { color: c.hole, size: 13, weight: 800, align: 'center', halo: c.paper2 });
}

const bladeCanvas = $('blade-canvas');
const bladeStage = stage(bladeCanvas, drawBlade, { playButton: $('blade-play') });

function bladeReadouts() {
  const s = section();
  setText('r-tsr', st.rpm > 0 ? tipSpeedRatio(st.rpm, R, st.v).toFixed(1) : '0');
  $('r-w').replaceChildren(fmt(s.W, 3), ' ', Object.assign(document.createElement('small'), { textContent: 'm/s' }));
  setText('r-alpha', `${s.alphaDeg.toFixed(1)}°`);
  setText('r-ld', s.cd > 0 ? fmt(s.cl / s.cd, 2) : '—');
  $('r-alpha').classList.toggle('warn', s.stalled || s.alphaDeg < 0);
  let msg;
  if (st.pitch >= 20) msg = 'Feathered: the blade is turned nearly edge-on to the wind. The angle of attack is negative, so what force remains brakes the rotor and it slows to a stop. Turbines do this in storms and for maintenance.';
  else if (st.rpm === 0) msg = 'Rotor parked: the blade feels the wind almost face-on, the angle of attack is huge, and the blade is stalled.';
  else if (s.stalled) msg = `Stalled: at ${s.alphaDeg.toFixed(0)}° the air separates from the blade, lift falls and drag soars. Speed the rotor up or pitch the blade.`;
  else if (s.alphaDeg < 0) msg = 'Negative angle of attack: lift now points backwards and the blade brakes the rotor. This is how a turbine sheds power.';
  else if (s.torqueForce <= 0) msg = 'Drag outweighs the forward lean of lift: this slice is not helping the rotor.';
  else msg = `Lift leans ${s.phiDeg.toFixed(1)}° forward of downwind. That small lean is what turns the rotor; the rest pushes on the tower as thrust.`;
  setText('b-status', msg);
  if (!bladeStage.isPlaying()) bladeStage.redraw(0);
}
bindRange($('b-wind'), $('b-wind-out'), (v) => `${v} m/s`, (v) => { st.v = v; bladeReadouts(); });
bindRange($('b-rpm'), $('b-rpm-out'), (v) => `${v.toFixed(1)} rpm`, (v) => { st.rpm = v; bladeReadouts(); });
bindRange($('b-pitch'), $('b-pitch-out'), (v) => `${v}°`, (v) => { st.pitch = v; bladeReadouts(); });
bindRange($('b-r'), $('b-r-out'), (v) => `${v} % of the way to the tip`, (v) => { st.rFrac = v / 100; bladeReadouts(); });
const setPitch = (p) => { const el = $('b-pitch'); el.value = String(Math.max(-5, Math.min(35, Math.round(p * 2) / 2))); el.dispatchEvent(new Event('input')); };
$('blade-best').addEventListener('click', () => { const s = section(); setPitch(st.pitch + s.alphaDeg - DESIGN_ALPHA); });
$('blade-feather').addEventListener('click', () => setPitch(30));
$('blade-step').addEventListener('click', () => { bladeStage.setPlaying(false); bladeStage.redraw(0.25); });
if (reducedMotion()) setText('b-status', 'Animation is paused because your system asks for reduced motion. Use Step to turn the rotor.');

// ---------------------------------------------------------------- power curve widget
const PRESETS = {
  gedser: { d: 24, p: 0.2, cutIn: 3, cutOut: 25, note: 'Rotor and rating from Möllerström et al. (2025); cut-in and cut-out assumed.' },
  putnam: { d: 53, p: 1.25, cutIn: 3, cutOut: 25, note: 'Rotor and rating from Möllerström et al. (2025); cut-in and cut-out assumed.' },
  v172: { d: 172, p: 7.2, cutIn: 3, cutOut: 25, note: 'Vestas data: 172 m, 7.2 MW, cut-in 3 m/s, cut-out 25 m/s.' },
  v236: { d: 236, p: 15, cutIn: 3, cutOut: 31, note: 'Vestas data: 236 m, 15 MW, cut-in 3 m/s, cut-out 31 m/s.' },
  iea15: { d: 240, p: 15, cutIn: 3, cutOut: 25, note: 'Open reference design (Gaertner et al., 2020); cut-in and cut-out assumed here.' },
  dec26: { d: 310, p: 26, cutIn: 3, cutOut: 25, note: 'Prototype reported by trade press (2025); cut-in and cut-out assumed.' },
  custom: { note: 'Your own rotor: cut-in 3 m/s and cut-out 25 m/s assumed.' },
};
const tw = { d: 236, p: 15, cutIn: 3, cutOut: 31, v: 10, mean: 9, tempC: 15 };
const rho = () => airDensity(101325, 273.15 + tw.tempC);
function curve() {
  let rated = ratedWindSpeed(tw.p * 1e6, tw.d, 0.45, rho());
  rated = Math.max(tw.cutIn + 0.5, Math.min(tw.cutOut, rated));
  return { ratedW: tw.p * 1e6, cutIn: tw.cutIn, rated, cutOut: tw.cutOut };
}

let pcChart = null; let enChart = null;
function pcOption(c) {
  const b = baseOption(); const cv = curve(); const area = sweptArea(tw.d); const r = rho();
  const xs = []; for (let v = 0; v <= 35.001; v += 0.25) xs.push(v);
  const P = (v) => turbinePowerCurve(v, cv) / 1e6;
  const ymax = Math.max(1, tw.p * 2.2);
  const clip = (y) => (y > ymax * 1.05 ? null : y);
  return {
    ...b,
    grid: { ...b.grid, top: 64, left: 52, right: 18 },
    legend: { ...b.legend, top: 0, left: 0, itemWidth: 22, data: ['Turbine output', 'Betz ceiling', 'Power in the wind'] },
    tooltip: { ...b.tooltip, trigger: 'axis', valueFormatter: (x) => (x == null ? '—' : `${fmt(x, 3)} MW`) },
    xAxis: { ...b._axis, type: 'value', min: 0, max: 35, name: 'Wind speed (m/s)', nameLocation: 'middle', nameGap: 30 },
    yAxis: { ...b._axis, type: 'value', min: 0, max: Number(ymax.toPrecision(2)), name: 'Power (MW)' },
    series: [
      { name: 'Power in the wind', type: 'line', showSymbol: false, data: xs.map((v) => [v, clip(kineticPower(r, area, v) / 1e6)]), lineStyle: { width: 1.5, type: 'dashed', color: c.ink2 }, itemStyle: { color: c.ink2 } },
      { name: 'Betz ceiling', type: 'line', showSymbol: false, data: xs.map((v) => [v, clip((BETZ * kineticPower(r, area, v)) / 1e6)]), lineStyle: { width: 2, type: 'dotted', color: c.source.csp }, itemStyle: { color: c.source.csp } },
      {
        name: 'Turbine output', type: 'line', showSymbol: false, data: xs.map((v) => [v, P(v)]), lineStyle: { width: 2.5, color: c.source.wind }, itemStyle: { color: c.source.wind },
        markLine: {
          silent: true, symbol: 'none', lineStyle: { color: c.rule, type: 'solid', width: 1 },
          label: { color: c.ink2, formatter: '{b}', position: 'insideEndTop', fontSize: 11 },
          data: [{ name: 'cut-in', xAxis: cv.cutIn }, { name: 'rated', xAxis: Number(cv.rated.toFixed(1)) }, { name: 'cut-out', xAxis: cv.cutOut }],
        },
        markPoint: { symbol: 'circle', symbolSize: 11, itemStyle: { color: c.source.wind, borderColor: c.panel, borderWidth: 2 }, label: { show: false }, data: [{ coord: [tw.v, P(tw.v)] }] },
      },
    ],
  };
}
function enOption(c) {
  const b = baseOption(); const cv = curve();
  const bins = [];
  for (let lo = 0; lo < 32; lo++) {
    let e = 0; for (let v = lo + 0.025; v < lo + 1; v += 0.05) e += turbinePowerCurve(v, cv) * rayleighPdf(v, tw.mean) * 0.05;
    bins.push([lo + 0.5, (e * 8760) / 1e9]);
  }
  return {
    ...b,
    grid: { ...b.grid, top: 24, left: 52, right: 18 },
    tooltip: { ...b.tooltip, trigger: 'axis', formatter: (ps) => `${ps[0].value[0] - 0.5}–${ps[0].value[0] + 0.5} m/s: ${fmt(ps[0].value[1], 3)} GWh` },
    xAxis: { ...b._axis, type: 'value', min: 0, max: 32, name: 'Wind speed (m/s)', nameLocation: 'middle', nameGap: 30 },
    yAxis: { ...b._axis, type: 'value', name: 'GWh per year' },
    series: [{ type: 'bar', data: bins, barWidth: '70%', itemStyle: { color: c.source.wind, borderRadius: [3, 3, 0, 0] } }],
  };
}
function updateTurbine() {
  const cv = curve(); const r = rho();
  const now = turbinePowerCurve(tw.v, cv);
  const wind = kineticPower(r, sweptArea(tw.d), tw.v);
  const cf = turbineCapacityFactor(tw.mean, cv);
  const set = (id, val, unit) => { const el = $(id); el.replaceChildren(val, unit ? ' ' : '', unit ? Object.assign(document.createElement('small'), { textContent: unit }) : ''); };
  set('o-now', fmt(now / 1e6, 3), 'MW');
  set('o-wind', fmt(wind / 1e6, 3), 'MW');
  set('o-cf', `${Math.round(cf * 100)} %`);
  set('o-e', fmt((cf * tw.p * 8760) / 1000, 3), 'GWh');
  let msg;
  if (tw.v < cv.cutIn) msg = 'Below cut-in: too little wind to overcome friction and losses, so the turbine waits.';
  else if (tw.v >= cv.cutOut) msg = 'Above cut-out: the blades feather and the rotor stops to protect itself.';
  else if (tw.v >= cv.rated) msg = `Rated power: the blades pitch to spill the extra. The wind now carries ${fmt(wind / (tw.p * 1e6), 2)} times the generator's rating.`;
  else msg = `Below rated (${cv.rated.toFixed(1)} m/s): output follows the cube of wind speed. Capturing ${Math.round((100 * now) / wind)} % of the wind's power.`;
  setText('t-status', msg);
  pcChart?.refresh(); enChart?.refresh();
}
const dIn = $('t-d'); const pIn = $('t-p'); const sel = $('t-model');
const applyPreset = (key) => {
  const p = PRESETS[key]; setText('t-note', p.note);
  if (p.d) { tw.cutIn = p.cutIn; tw.cutOut = p.cutOut; dIn.value = String(p.d); pIn.value = String(p.p); dIn.dispatchEvent(new Event('input')); pIn.dispatchEvent(new Event('input')); sel.value = key; }
  else { tw.cutIn = 3; tw.cutOut = 25; updateTurbine(); }
};
let applying = false;
bindRange(dIn, $('t-d-out'), (v) => `${v} m`, (v) => { tw.d = v; if (!applying) markCustom(); updateTurbine(); });
bindRange(pIn, $('t-p-out'), (v) => `${fmt(v, 3)} MW`, (v) => { tw.p = v; if (!applying) markCustom(); updateTurbine(); });
function markCustom() { if (sel.value !== 'custom' && PRESETS[sel.value].d && (Number(dIn.value) !== PRESETS[sel.value].d || Number(pIn.value) !== PRESETS[sel.value].p)) { sel.value = 'custom'; setText('t-note', PRESETS.custom.note); tw.cutIn = 3; tw.cutOut = 25; } }
sel.addEventListener('change', () => { applying = true; applyPreset(sel.value); applying = false; });
bindRange($('t-v'), $('t-v-out'), (v) => `${v} m/s`, (v) => { tw.v = v; updateTurbine(); });
bindRange($('t-mean'), $('t-mean-out'), (v) => `${v.toFixed(1)} m/s`, (v) => { tw.mean = v; updateTurbine(); });
bindRange($('t-temp'), $('t-temp-out'), (v) => `${v} °C`, (v) => { tw.tempC = v; updateTurbine(); });
applying = true; applyPreset('v236'); applying = false;

makeChart($('pc-chart'), pcOption).then((ch) => { pcChart = ch; });
makeChart($('en-chart'), enOption).then((ch) => { enChart = ch; });

// ---------------------------------------------------------------- expert: Cp(a)
let cpMade = false;
function makeCp() {
  if (cpMade || document.documentElement.dataset.depth !== 'expert') return;
  cpMade = true;
  makeChart($('cp-chart'), (c) => {
    const b = baseOption();
    const data = []; for (let a = 0; a <= 0.5001; a += 0.005) data.push([Number(a.toFixed(3)), actuatorDiscCp(a)]);
    return {
      ...b,
      grid: { ...b.grid, top: 24, left: 52, right: 24 },
      tooltip: { ...b.tooltip, trigger: 'axis', valueFormatter: (x) => fmt(x, 3) },
      xAxis: { ...b._axis, type: 'value', min: 0, max: 0.5, name: 'Induction factor a', nameLocation: 'middle', nameGap: 30 },
      yAxis: { ...b._axis, type: 'value', min: 0, max: 0.7, name: 'Cp' },
      series: [{
        type: 'line', showSymbol: false, data, lineStyle: { width: 2.5, color: c.source.wind }, itemStyle: { color: c.source.wind },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: c.ink2, type: 'dashed', width: 1 }, label: { color: c.ink2, formatter: 'Betz 16/27', position: 'insideEndTop' }, data: [{ yAxis: BETZ }] },
        markPoint: { symbol: 'circle', symbolSize: 10, itemStyle: { color: c.source.wind, borderColor: c.panel, borderWidth: 2 }, label: { show: true, position: 'bottom', color: c.ink, formatter: 'a = 1/3' }, data: [{ coord: [1 / 3, BETZ] }] },
      }],
    };
  });
}
makeCp();
document.addEventListener('so:depth', makeCp);
