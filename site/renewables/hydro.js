// Hydropower page: share of world electricity and the animated dam cross-section.
import { mountShare, stage, ink, arrow, label, bindRange, segmented, setText, fmt, logScale, reducedMotion, along } from './renewables-a-common.js';
import { hydroPower } from '../assets/js/physics/renewables.js';
import { turbineForHead, jetSpeed } from '../assets/js/physics/fluids.js';

const $ = (id) => document.getElementById(id);
mountShare(document.querySelector('.today-figure'), { source: 'hydro', noun: 'hydropower', leaders: 3 });

const headScale = logScale(2, 1500);
const flowScale = logScale(1, 5000);
const NAMES = { kaplan: 'Kaplan', francis: 'Francis', pelton: 'Pelton' };
const st = { head: 100, flow: 200, eta: 0.9, choice: 'auto', mode: 'storage', pumping: false, spin: 0, t: 0, parts: [] };
for (let i = 0; i < 46; i++) st.parts.push(Math.random());
const turbine = () => (st.choice === 'auto' ? turbineForHead(st.head, st.flow) : st.choice);

// ---- geometry of the scene for each mode, in fractions of the canvas
function scene(w, h) {
  const base = h * (st.mode === 'river' ? 0.72 : 0.86); // river bed / tailwater level
  const hn = Math.min(1, Math.max(0, Math.log(st.head / 2) / Math.log(750))); // 0..1
  if (st.mode === 'pumped') {
    const upper = h * (0.34 - 0.16 * hn);
    return {
      base, upper, tail: base - h * 0.05,
      path: [[w * 0.2, upper + h * 0.06], [w * 0.3, upper + h * 0.08], [w * 0.52, base - h * 0.08], [w * 0.6, base - h * 0.08]],
      out: [[w * 0.66, base - h * 0.06], [w * 0.98, base - h * 0.06]],
      house: { x: w * 0.54, y: base - h * 0.2, w: w * 0.12, h: h * 0.16 },
    };
  }
  const damH = st.mode === 'river' ? h * 0.12 : h * (0.28 + 0.3 * hn);
  const upper = base - damH;
  const dx = w * 0.44;
  return {
    base, upper, tail: base - h * 0.04, damX: dx, damH,
    path: st.mode === 'river'
      ? [[dx - w * 0.02, base - damH * 0.45], [dx + w * 0.1, base - h * 0.06]]
      : [[dx - w * 0.015, upper + damH * 0.55], [dx + w * 0.03, upper + damH * 0.62], [dx + w * 0.13, base - h * 0.07], [dx + w * 0.18, base - h * 0.07]],
    out: [[dx + w * 0.24, base - h * 0.05], [w * 0.98, base - h * 0.05]],
    house: st.mode === 'river' ? { x: dx + w * 0.06, y: base - h * 0.17, w: w * 0.14, h: h * 0.15 } : { x: dx + w * 0.14, y: base - h * 0.18, w: w * 0.12, h: h * 0.16 },
  };
}

function drawRunner(ctx, cx, cy, r, type, spin, c) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = c.panel; ctx.strokeStyle = c.rule; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, r + 10, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = c.ink; ctx.lineWidth = 1.6;
  if (type === 'pelton') {
    ctx.rotate(spin);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, 2 * Math.PI); ctx.stroke();
    for (let k = 0; k < 16; k++) {
      const a = (k * 2 * Math.PI) / 16; ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(r * 0.78, 0, r * 0.2, r * 0.11, 0, 0, 2 * Math.PI); ctx.fillStyle = c.paper2; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.6, 0); ctx.lineTo(r * 0.97, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.rotate(-spin);
    // the jet
    ctx.strokeStyle = c.hydro; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 1.6, r * 0.8); ctx.lineTo(-r * 0.15, r * 0.8); ctx.stroke(); ctx.lineCap = 'butt';
  } else if (type === 'francis') {
    // spiral casing seen from above
    ctx.strokeStyle = c.ink2; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let a = 0; a <= 2 * Math.PI * 0.95; a += 0.05) { const rr = r * (1.0 - 0.18 * a / (2 * Math.PI)); const x = Math.cos(a) * rr; const y = Math.sin(a) * rr; if (a) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.rotate(spin);
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1.8;
    for (let k = 0; k < 13; k++) {
      const a = (k * 2 * Math.PI) / 13; ctx.beginPath();
      for (let s = 0; s <= 1.0001; s += 0.1) { const rr = r * (0.72 - 0.5 * s); const aa = a + 0.9 * s; const x = Math.cos(aa) * rr; const y = Math.sin(aa) * rr; if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, 2 * Math.PI); ctx.stroke();
  } else {
    // Kaplan: propeller seen along the shaft
    ctx.rotate(spin);
    for (let k = 0; k < 5; k++) {
      ctx.save(); ctx.rotate((k * 2 * Math.PI) / 5);
      ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.08); ctx.quadraticCurveTo(r * 0.75, -r * 0.42, r * 0.92, -r * 0.05);
      ctx.quadraticCurveTo(r * 0.7, r * 0.18, r * 0.2, r * 0.1); ctx.closePath();
      ctx.fillStyle = c.paper2; ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, 2 * Math.PI); ctx.fillStyle = c.panel; ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function draw(ctx, w, h, dt) {
  const c = ink();
  const S = scene(w, h);
  const q = Math.log10(st.flow + 1);
  if (dt) { st.spin += dt * (st.pumping ? -1 : 1) * (0.8 + q * 0.6); for (let i = 0; i < st.parts.length; i++) st.parts[i] = (st.parts[i] + dt * (0.08 + q * 0.06) * (st.pumping ? -1 : 1) + 1) % 1; }
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = c.paper2; ctx.fillRect(0, 0, w, h);
  const ground = c.rule;
  // terrain
  ctx.fillStyle = ground;
  if (st.mode === 'pumped') {
    ctx.beginPath(); ctx.moveTo(0, S.upper + h * 0.1); ctx.lineTo(w * 0.32, S.upper + h * 0.1);
    ctx.bezierCurveTo(w * 0.42, S.upper + h * 0.14, w * 0.5, S.base - h * 0.12, w * 0.62, S.base - h * 0.02);
    ctx.lineTo(w * 0.7, S.base); ctx.lineTo(w, S.base); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    // upper reservoir basin
    ctx.fillStyle = c.hydro; ctx.globalAlpha = 0.35;
    ctx.fillRect(w * 0.03, S.upper, w * 0.27, h * 0.1); ctx.globalAlpha = 1;
    ctx.fillStyle = c.ink2; ctx.fillRect(w * 0.3, S.upper - 6, 6, h * 0.1 + 6);
    // lower reservoir
    ctx.fillStyle = c.hydro; ctx.globalAlpha = 0.35; ctx.fillRect(w * 0.7, S.tail, w * 0.3, S.base - S.tail + 2); ctx.globalAlpha = 1;
    label(ctx, 'upper reservoir', w * 0.04, S.upper - 12, { color: c.ink, size: 12, halo: c.paper2 });
    label(ctx, 'lower reservoir', w * 0.97, S.tail - 12, { color: c.ink, size: 12, align: 'right', halo: c.paper2 });
  } else {
    ctx.fillRect(0, S.base, w, h - S.base);
    // reservoir water
    ctx.fillStyle = c.hydro; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(0, S.upper); ctx.lineTo(S.damX, S.upper); ctx.lineTo(S.damX, S.base); ctx.lineTo(0, S.base); ctx.closePath(); ctx.fill();
    ctx.fillRect(S.damX, S.tail, w - S.damX, S.base - S.tail);
    ctx.globalAlpha = 1;
    // dam body (trapezoid, thicker at the base)
    const top = S.upper - 8; const bw = st.mode === 'river' ? w * 0.05 : Math.min(w * 0.16, S.damH * 0.7);
    ctx.fillStyle = c.ink2; ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.moveTo(S.damX, top); ctx.lineTo(S.damX + w * 0.025, top); ctx.lineTo(S.damX + bw, S.base); ctx.lineTo(S.damX, S.base); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    label(ctx, st.mode === 'river' ? 'weir' : 'dam', S.damX + w * 0.012, top - 12, { color: c.ink, size: 12, align: 'center', halo: c.paper2 });
    label(ctx, 'reservoir', w * 0.04, S.upper + 16, { color: c.ink, size: 12, halo: c.paper2 });
    label(ctx, 'river', w * 0.97, S.tail - 12, { color: c.ink, size: 12, align: 'right', halo: c.paper2 });
  }
  // penstock
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = c.ink; ctx.lineWidth = 13;
  ctx.beginPath(); S.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.strokeStyle = c.panel; ctx.lineWidth = 9;
  ctx.beginPath(); S.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.lineCap = 'butt';
  // tailrace
  ctx.strokeStyle = c.hydro; ctx.globalAlpha = 0.5; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(S.out[0][0], S.out[0][1]); ctx.lineTo(S.out[1][0], S.out[1][1]); ctx.stroke(); ctx.globalAlpha = 1;
  // water particles
  ctx.fillStyle = c.hydro;
  for (const p of st.parts) {
    const [x, y] = along(S.path, p); ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 2 * Math.PI); ctx.fill();
    const [x2, y2] = along(S.out, (p * 1.7) % 1); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(x2, y2 + ((p * 97) % 1 - 0.5) * 5, 2, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1;
  }
  // powerhouse with generator on top of the turbine
  const Hs = S.house;
  ctx.fillStyle = c.panel; ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
  ctx.fillRect(Hs.x, Hs.y, Hs.w, Hs.h); ctx.strokeRect(Hs.x, Hs.y, Hs.w, Hs.h);
  const tx = Hs.x + Hs.w / 2; const ty = Hs.y + Hs.h * 0.74; const gy = Hs.y + Hs.h * 0.28;
  ctx.strokeStyle = c.ink2; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, gy); ctx.stroke();
  ctx.fillStyle = c.sun; ctx.beginPath(); ctx.arc(tx, gy, Math.min(Hs.w, Hs.h) * 0.17, 0, 2 * Math.PI); ctx.fill();
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(st.spin); ctx.strokeStyle = c.ink; ctx.lineWidth = 2;
  for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(-Hs.w * 0.2, 0); ctx.lineTo(Hs.w * 0.2, 0); ctx.stroke(); }
  ctx.restore();
  label(ctx, 'generator', Hs.x + Hs.w + 6, gy, { color: c.ink, size: 12, halo: c.paper2 });
  label(ctx, 'turbine', Hs.x + Hs.w + 6, ty, { color: c.ink, size: 12, halo: c.paper2 });
  label(ctx, st.mode === 'pumped' ? 'penstock' : 'intake', S.path[0][0] - 6, S.path[0][1] + 18, { color: c.ink2, size: 11, align: 'right', halo: c.paper2 });
  label(ctx, 'tailrace', S.out[0][0] + 6, S.out[0][1] + 16, { color: c.ink2, size: 11, halo: c.paper2 });
  // head dimension
  const hx = st.mode === 'pumped' ? w * 0.36 : Math.max(w * 0.06, S.damX - w * 0.12);
  ctx.strokeStyle = c.sunInk; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(hx - 10, S.upper); ctx.lineTo(hx + 10, S.upper); ctx.moveTo(hx - 10, S.tail); ctx.lineTo(hx + 10, S.tail); ctx.stroke(); ctx.setLineDash([]);
  arrow(ctx, hx, (S.upper + S.tail) / 2, hx, S.upper + 1, { color: c.sunInk, width: 1.5, head: 7 });
  arrow(ctx, hx, (S.upper + S.tail) / 2, hx, S.tail - 1, { color: c.sunInk, width: 1.5, head: 7 });
  label(ctx, `head ${fmt(st.head, 3)} m`, hx + 8, (S.upper + S.tail) / 2, { color: c.sunInk, size: 13, weight: 700, halo: c.paper2 });
  // runner inset
  const r = Math.min(w, h) * 0.1;
  const ix = w - r - 22; const iy = r + 26;
  drawRunner(ctx, ix, iy, r, turbine(), st.spin * 2, c);
  label(ctx, `${NAMES[turbine()]} runner`, ix, iy + r + 22, { color: c.ink, size: 12, align: 'center', halo: c.paper2 });
  if (st.mode === 'pumped') label(ctx, st.pumping ? 'pumping uphill' : 'generating', w * 0.04, h * 0.06, { color: st.pumping ? c.storage : c.ink, size: 14, weight: 700, halo: c.paper2 });
}

const damStage = stage($('dam-canvas'), draw, { playButton: $('dam-play') });

function update() {
  const type = turbine(); const best = turbineForHead(st.head, st.flow);
  const p = hydroPower(st.flow, st.head, st.eta);
  const pumpP = (1000 * 9.80665 * st.flow * st.head) / st.eta;
  const pText = (x) => (x >= 1e9 ? `${fmt(x / 1e9, 3)} GW` : x >= 1e6 ? `${fmt(x / 1e6, 3)} MW` : `${fmt(x / 1e3, 3)} kW`);
  setText('o-p-k', st.pumping ? 'Power drawn (pumping)' : 'Power');
  setText('o-p', st.pumping ? pText(pumpP) : pText(p));
  setText('o-e', `${fmt((st.eta * 1000 * 9.80665 * st.head) / 3.6e6, 2)} kWh`);
  setText('o-v', `${fmt(jetSpeed(st.head), 2)} m/s`);
  setText('o-t', NAMES[type]);
  document.querySelectorAll('.ra-table tbody tr').forEach((tr) => tr.setAttribute('aria-current', String(tr.id === `row-${type}`)));
  let msg = '';
  if (st.pumping) msg = `Pumping: the machine runs backwards as a pump and draws ${pText(pumpP)} to lift ${fmt(st.flow, 3)} m³ of water ${fmt(st.head, 3)} m every second. Running back down returns less, because losses hit both ways.`;
  else if (type !== best) msg = `A ${NAMES[type]} runner is a poor fit for ${fmt(st.head, 3)} m of head: ${best === 'pelton' ? 'at this head the water is fast enough for jets and cups' : best === 'kaplan' ? 'at this low head only a large propeller can pass enough water' : 'a Francis runner handles this middle range best'}. Engineers would choose ${NAMES[best]}.`;
  else msg = `${NAMES[type]} suits ${fmt(st.head, 3)} m of head. Each cubic metre of water delivers ${fmt((st.eta * 1000 * 9.80665 * st.head) / 3.6e6, 2)} kWh; at ${fmt(st.flow, 3)} m³/s that is ${pText(p)}.`;
  if (st.mode === 'river' && st.head > 40) msg += ' Run-of-river plants usually have heads of only a few to a few tens of metres.';
  setText('h-status', msg);
  if (!damStage.isPlaying()) damStage.redraw(0);
}

const headIn = $('h-head'); const flowIn = $('h-flow');
const setRange = (el, scale, v) => { el.value = String(Math.round(scale.toPos(v))); el.dispatchEvent(new Event('input')); };
bindRange(headIn, $('h-head-out'), (p) => `${fmt(headScale.toValue(p), 3)} m`, (p) => { st.head = Number(fmt(headScale.toValue(p), 3).replace(/,/g, '')); update(); });
bindRange(flowIn, $('h-flow-out'), (p) => `${fmt(flowScale.toValue(p), 3)} m³/s`, (p) => { st.flow = Number(fmt(flowScale.toValue(p), 3).replace(/,/g, '')); update(); });
bindRange($('h-eta'), $('h-eta-out'), (v) => `${v} %`, (v) => { st.eta = v / 100; update(); });
setRange(headIn, headScale, 100); setRange(flowIn, flowScale, 200);
segmented($('tt'), (v) => { st.choice = v; update(); });
const pumpBtn = $('pump');
pumpBtn.addEventListener('click', () => {
  st.pumping = !st.pumping;
  pumpBtn.textContent = st.pumping ? 'Switch to generating' : 'Switch to pumping';
  update();
});
const PRESET = { storage: [100, 200], river: [12, 600], pumped: [350, 120] };
let first = true;
segmented($('mode'), (m) => {
  st.mode = m; pumpBtn.hidden = m !== 'pumped';
  if (m !== 'pumped' && st.pumping) pumpBtn.click();
  if (!first) { setRange(headIn, headScale, PRESET[m][0]); setRange(flowIn, flowScale, PRESET[m][1]); }
  first = false; update();
});
if (reducedMotion()) setText('h-status', `${$('h-status').textContent} (Animation paused for reduced motion; press Play to run it.)`);
