// Biomass: the carbon-loop animation (biomass loop beside a fossil one).
import { mountShares, bindRange, fitCanvas, animate, onTheme, reducedMotion, ink, label, alpha, fmt } from './renewables-b-common.js';
import { carbonToAir, co2FromCarbonKg } from '../assets/js/physics/bio.js';

mountShares();

const canvas = document.getElementById('loop-canvas');
const playBtn = document.getElementById('loop-play');
const stepBtn = document.getElementById('loop-step');
const resetBtn = document.getElementById('loop-reset');
const regrowIn = document.getElementById('l-regrow');
const captureIn = document.getElementById('l-capture');
const debtIn = document.getElementById('l-debt');

const CYCLES = 10; const DOTS = 12; const DEBT = 3; const DUR = 4.2; // seconds per harvest
const st = { k: 0, t: 0, playing: false, target: 0, regrow: 1, capture: 0, debt: false };
let ctx = null; let W = 0; let H = 0;

const series = () => ({
  bio: carbonToAir({ burnt: 1, regrowth: st.regrow, captured: st.capture, debt: st.debt ? DEBT : 0, cycles: CYCLES }).series,
  fossil: carbonToAir({ burnt: 1, fossil: true, cycles: CYCLES }).series,
});

// deterministic jitter for dot positions
const rnd = (i, s = 1) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const seg = (t, a, b) => ease((t - a) / (b - a));
const lerp = (a, b, u) => a + (b - a) * u;

function size() {
  const r = canvas.getBoundingClientRect();
  if (!r.width) return false;
  W = r.width; H = r.height; ctx = fitCanvas(canvas, W, H);
  return true;
}

function panelRects() {
  const side = W >= 560;
  const gap = 14; const pad = 10;
  if (side) {
    const pw = (W - gap - 2 * pad) / 2;
    return [{ x: pad, y: pad, w: pw, h: H - 2 * pad }, { x: pad + pw + gap, y: pad, w: pw, h: H - 2 * pad }];
  }
  const ph = (H - gap - 2 * pad) / 2;
  return [{ x: pad, y: pad, w: W - 2 * pad, h: ph }, { x: pad, y: pad + ph + gap, w: W - 2 * pad, h: ph }];
}

function draw() {
  if (!ctx && !size()) return;
  const c = ink();
  ctx.clearRect(0, 0, W, H);
  const s = series();
  const [pb, pf] = panelRects();
  drawPanel(pb, 'bio', s.bio, c);
  drawPanel(pf, 'fossil', s.fossil, c);
}

function gaugeValue(kind, ser) {
  const { k, t } = st;
  if (k >= CYCLES) return ser[CYCLES];
  const released = kind === 'fossil' ? 1 : 1 - st.capture;
  const debt = kind === 'bio' && st.debt && k === 0 ? DEBT : 0;
  const uptake = kind === 'fossil' ? 0 : st.regrow;
  return ser[k] + seg(t, 0.3, 0.6) * (released + debt) - seg(t, 0.62, 0.98) * uptake;
}

function drawPanel(p, kind, ser, c) {
  const { x, y, w, h } = p;
  ctx.save();
  // frame
  ctx.fillStyle = c.panel; ctx.strokeStyle = c.rule; ctx.lineWidth = 1;
  roundRect(x, y, w, h, 10); ctx.fill(); ctx.stroke();
  const title = kind === 'bio' ? 'Biomass power station' : 'Coal power station';
  label(ctx, title, x + 12, y + 16, { size: 14, weight: 700, color: c.ink });
  // gauge
  const gx = x + 12; const gy = y + 34; const gw = w - 24; const gh = 10;
  const lo = -10; const hi = 13; const X = (v) => gx + ((v - lo) / (hi - lo)) * gw;
  ctx.fillStyle = c.paper2; roundRect(gx, gy, gw, gh, 5); ctx.fill();
  const v = gaugeValue(kind, ser);
  ctx.fillStyle = v >= 0 ? c.hole : c.good;
  const x0 = X(0); const x1 = X(Math.max(lo, Math.min(hi, v)));
  roundRect(Math.min(x0, x1), gy, Math.max(1, Math.abs(x1 - x0)), gh, 4); ctx.fill();
  ctx.fillStyle = c.ink2; ctx.fillRect(x0 - 1, gy - 4, 2, gh + 8);
  label(ctx, `Extra carbon in the air: ${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} t`, gx, gy + gh + 14, { size: 12, weight: 600, color: c.ink2 });
  // ground
  const ground = y + h * 0.66;
  ctx.fillStyle = alpha(c.ink2, 0.08); ctx.fillRect(x + 1, ground, w - 2, y + h - ground - 1);
  ctx.strokeStyle = c.ink2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 8, ground); ctx.lineTo(x + w - 8, ground); ctx.stroke();
  // power station
  const sx = x + w * 0.70; const sw = Math.min(70, w * 0.2); const sh = h * 0.12;
  ctx.fillStyle = c.ink2; ctx.fillRect(sx - sw / 2, ground - sh, sw, sh);
  const chx = sx + sw * 0.22; const chTop = ground - sh - h * 0.12;
  ctx.fillRect(chx - 5, chTop, 10, h * 0.12);
  // source
  const srcX = x + w * 0.28;
  const skyTop = gy + gh + 28; const skyBot = ground - 14;
  const { k, t } = st;
  let canopy = 1;
  if (kind === 'bio') {
    // canopy carbon: full at start, harvested in phase A, regrows in phase C
    const prevGrowth = k === 0 ? 1 : st.regrow;
    if (k >= CYCLES) canopy = st.regrow;
    else canopy = lerp(prevGrowth, 0, seg(t, 0.02, 0.28)) + st.regrow * seg(t, 0.62, 0.98);
    drawPlant(srcX, ground, Math.min(w * 0.17, h * 0.2), canopy, c);
    if (st.debt) drawStumps(x + w * 0.08, ground, c);
    // underground store for captured carbon
    const stored = Math.min(1, (st.capture * Math.min(k + seg(t, 0.3, 0.6) * (k < CYCLES ? 1 : 0), CYCLES)) / 6);
    ctx.strokeStyle = c.storage; ctx.lineWidth = 1.5; ctx.fillStyle = alpha(c.storage, 0.12 + 0.5 * stored);
    ctx.beginPath(); ctx.ellipse(sx, ground + (y + h - ground) * 0.55, sw * 0.9, (y + h - ground) * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    label(ctx, st.capture > 0 ? 'CO₂ stored deep underground' : 'no capture', sx, ground + (y + h - ground) * 0.55, { size: 11, align: 'center', color: c.ink2, halo: c.paper2 });
  } else {
    // coal seam
    const seamY = ground + (y + h - ground) * 0.55;
    ctx.fillStyle = alpha(c.ink2, 0.6); roundRect(x + 14, seamY - 9, w * 0.5, 18, 6); ctx.fill();
    label(ctx, 'Coal seam: carbon locked away for millions of years', x + 14, seamY + 22, { size: 11, color: c.ink2, halo: c.paper2 });
    ctx.strokeStyle = c.ink2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(srcX, seamY - 9); ctx.lineTo(srcX, ground); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(srcX - 12, ground); ctx.lineTo(srcX, ground - 18); ctx.lineTo(srcX + 12, ground); ctx.stroke();
  }
  // moving dots (only during a cycle)
  if (k < CYCLES && t > 0) {
    const cap = kind === 'bio' ? Math.round(DOTS * st.capture) : 0;
    const regrowDots = kind === 'bio' ? Math.round(DOTS * st.regrow) : 0;
    const from = kind === 'bio' ? { x: srcX, y: ground - Math.min(w * 0.17, h * 0.2) * 0.9 } : { x: srcX, y: ground + (y + h - ground) * 0.55 };
    for (let i = 0; i < DOTS; i += 1) {
      const skyX = x + 20 + rnd(i, k) * (w - 40); const skyY = lerp(skyTop, skyBot - 20, rnd(i, k + 7));
      let px; let py; let col = c.ink2; let show = true;
      if (t < 0.3) { const u = seg(t, 0.02 + i * 0.008, 0.28); px = lerp(from.x + (rnd(i, 3) - 0.5) * 30, sx, u); py = lerp(from.y + (rnd(i, 4) - 0.5) * 20, ground - 6, u); col = kind === 'bio' ? c.biomass : c.ink; }
      else if (t < 0.6) {
        const u = seg(t, 0.3 + i * 0.006, 0.6);
        if (i < cap) { px = lerp(chx, sx + (rnd(i, 5) - 0.5) * sw, u); py = lerp(chTop, ground + (y + h - ground) * 0.55, u); col = c.storage; }
        else { px = lerp(chx, skyX, u); py = lerp(chTop, skyY, u); }
      } else if (i >= cap) {
        // in the air; some descend into the regrowing plant
        const j = i - cap;
        if (j < regrowDots) { const u = seg(t, 0.62 + j * 0.01, 0.98); px = lerp(skyX, srcX + (rnd(i, 6) - 0.5) * 24, u); py = lerp(skyY, ground - Math.min(w * 0.17, h * 0.2) * 0.9, u); col = u > 0.9 ? c.biomass : c.ink2; show = u < 0.99; }
        else { px = skyX; py = skyY; col = c.hole; }
      } else show = false;
      if (show) dot(px, py, col, c);
    }
    if (kind === 'bio' && st.debt && k === 0 && t > 0.3 && t < 0.62) {
      for (let i = 0; i < DOTS * DEBT; i += 1) {
        const u = seg(t, 0.3 + (i % 12) * 0.01, 0.6);
        dot(lerp(x + w * 0.08 + (rnd(i, 9) - 0.5) * 30, x + 20 + rnd(i, 11) * (w - 40), u), lerp(ground - 4, lerp(skyTop, skyBot, rnd(i, 13)), u), c.hole, c);
      }
    }
  }
  ctx.restore();
}

function dot(px, py, col, c) {
  ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = c.panel; ctx.stroke();
}

function drawPlant(px, ground, size, amount, c) {
  ctx.strokeStyle = c.biomass; ctx.lineWidth = 3;
  const n = 3;
  for (let i = 0; i < n; i += 1) {
    const ox = px + (i - 1) * size * 0.7;
    const hgt = size * (0.35 + 0.65 * amount);
    ctx.beginPath(); ctx.moveTo(ox, ground); ctx.lineTo(ox, ground - hgt); ctx.stroke();
    if (amount > 0.02) {
      ctx.fillStyle = alpha(c.biomass, 0.25 + 0.55 * amount);
      ctx.beginPath(); ctx.ellipse(ox, ground - hgt, size * 0.32 * (0.3 + 0.7 * amount), size * 0.42 * (0.3 + 0.7 * amount), 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawStumps(px, ground, c) {
  ctx.fillStyle = c.ink2;
  for (let i = 0; i < 3; i += 1) ctx.fillRect(px + i * 9 - 10, ground - 7, 6, 7);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

function updateText() {
  const s = series(); const k = Math.min(st.k, CYCLES);
  const bio = s.bio[k]; const fos = s.fossil[k];
  document.getElementById('r-bio').firstChild.textContent = `${bio >= 0 ? '' : '−'}${Math.abs(bio).toFixed(1)} `;
  document.getElementById('r-fossil').firstChild.textContent = `${fos.toFixed(1)} `;
  document.getElementById('r-bio-co2').firstChild.textContent = `${bio >= 0 ? '' : '−'}${fmt(Math.abs(co2FromCarbonKg(bio)), 3)} `;
  document.getElementById('r-bio').classList.toggle('good', bio < 0);
  document.getElementById('loop-count').textContent = `Harvest ${k} of ${CYCLES}`;
  const perBio = 1 - st.capture - st.regrow;
  let msg;
  if (Math.abs(perBio) < 1e-9 && !st.debt) msg = 'Each harvest puts back exactly what regrowth takes out: the biomass loop adds nothing to the air.';
  else if (perBio < 0) msg = `Each harvest removes ${Math.abs(perBio).toFixed(1)} t of carbon from the air: capture plus regrowth exceed what is burned.`;
  else msg = `Each harvest adds ${perBio.toFixed(1)} t of carbon to the air, against 1 t for coal.`;
  if (st.debt) msg += ' Clearing the forest added a one-off 3 t at the start.';
  document.getElementById('loop-status').textContent = msg;
  stepBtn.disabled = st.k >= CYCLES;
  playBtn.disabled = st.k >= CYCLES;
}

const label2 = () => { playBtn.textContent = st.playing ? 'Pause' : 'Play'; };

let loop = null;
function tick(dt) {
  if (!st.playing && st.target <= st.k) return;
  st.t += dt / DUR;
  if (st.t >= 1) {
    st.t = 0; st.k += 1;
    updateText();
    if (st.k >= CYCLES || (!st.playing && st.k >= st.target)) { st.playing = false; label2(); draw(); updateText(); return; }
  }
  draw();
}
const run = () => { loop ??= animate(canvas, (dt) => tick(dt)); loop.kick(); };

playBtn.addEventListener('click', () => {
  if (reducedMotion()) { st.k = CYCLES; st.t = 0; draw(); updateText(); return; }
  st.playing = !st.playing; st.target = CYCLES; label2(); if (st.playing) run();
});
stepBtn.addEventListener('click', () => {
  if (st.k >= CYCLES) return;
  if (reducedMotion()) { st.k += 1; st.t = 0; draw(); updateText(); return; }
  st.target = st.k + 1; if (st.t === 0) st.t = 0.0001; run();
});
resetBtn.addEventListener('click', () => { st.k = 0; st.t = 0; st.playing = false; st.target = 0; label2(); draw(); updateText(); });

bindRange(regrowIn, document.getElementById('l-regrow-out'), (v) => `${v} %`, (v) => { st.regrow = v / 100; draw(); updateText(); });
bindRange(captureIn, document.getElementById('l-capture-out'), (v) => `${v} %`, (v) => { st.capture = v / 100; draw(); updateText(); });
debtIn.addEventListener('change', () => { st.debt = debtIn.checked; draw(); updateText(); });

new ResizeObserver(() => { size(); draw(); }).observe(canvas);
onTheme(() => draw());
label2();
updateText();
if (reducedMotion()) playBtn.textContent = 'Show all 10 harvests';
