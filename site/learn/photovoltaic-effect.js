// The photovoltaic effect: photons striking a semiconductor, drawn twice —
// as a slab of crystal (where the photon goes) and as a band diagram (what
// happens to its energy). All numbers come from physics/pv.js and photons.js.

import { fmt, cssVar, onTheme, fitCanvas, animate, reducedMotion } from '../assets/js/dom.js';
import { loadData, setBadge, is } from '../assets/js/data.js';
import { photonEnergyEV, photonEnergyJ, frequencyHz, cutoffWavelengthNm, isAbsorbed, excessEnergyEV, photonRate } from '../assets/js/physics/pv.js';
import { wavelengthRGB, usableFraction, photonSampler } from '../assets/js/physics/photons.js';

const $ = (id) => document.getElementById(id);
const canvas = $('pv-canvas');
const strip = $('pv-strip');
if (canvas) init();

function init() {
  const FALLBACK = [{ id: 'si', name: 'Crystalline silicon', short: 'Si', gap: 1.12, kind: 'indirect', note: '' }];
  const reduce = reducedMotion();
  const NM_MIN = 280; const NM_MAX = 1600;
  const sample = photonSampler({ minNm: NM_MIN, maxNm: NM_MAX });
  // mean photon energy (J) of sunlight between 280 and 1600 nm, for the photon-rate readout in sunlight mode
  const MEAN_J = (() => { let s = 0; const n = 2000; for (let i = 0; i < n; i++) s += photonEnergyJ(sample((i + 0.5) / n)); return s / n; })();

  const st = {
    materials: FALLBACK, mat: FALLBACK[0], source: 'mono', nm: 500, level: 50, playing: false,
    events: [], lane: 0, acc: 0, last: null, dirty: true,
    tally: { n: 0, abs: 0, ein: 0, use: 0, heat: 0, pass: 0 },
  };
  let col = {}; let G = null; let ctx = null;

  // ---------- timing (seconds) ----------
  const T_TRAVEL = 1.0; const T_UP = 0.35; const T_RELAX = 0.9; const T_HOLD = 2.6; const T_FADE = 1.0; const T_PASS = 1.7;
  const settled = (e) => (e.abs ? T_TRAVEL + T_UP + T_RELAX : T_PASS) + 0.001;
  const lifetime = (e) => settled(e) + T_HOLD + T_FADE;

  // ---------- helpers ----------
  const powerW = () => 10 ** (-5 + (4 * st.level) / 100);
  const ease = (u) => 1 - (1 - u) ** 3;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const colourName = (nm) => (nm < 380 ? 'ultraviolet' : nm < 450 ? 'violet' : nm < 485 ? 'blue' : nm < 500 ? 'cyan'
    : nm < 565 ? 'green' : nm < 590 ? 'yellow' : nm < 625 ? 'orange' : nm <= 750 ? 'red' : 'infrared');
  function style(nm) {
    const rgb = wavelengthRGB(nm);
    if (rgb) return { color: `rgb(${rgb.join(',')})`, dashed: false, tag: null };
    return { color: col.ink2, dashed: true, tag: nm < 380 ? 'UV' : 'IR' };
  }
  const font = (px, weight = 500) => `${weight} ${px}px "Atkinson Next", system-ui, sans-serif`;

  function readColours() {
    col = {
      ink: cssVar('--ink'), ink2: cssVar('--ink-2'), rule: cssVar('--rule'), paper2: cssVar('--paper-2'), panel: cssVar('--panel'),
      electron: cssVar('--electron'), hole: cssVar('--hole'), sun: cssVar('--sun'), silicon: cssVar('--silicon'),
    };
  }

  // ---------- layout ----------
  function layout() {
    const w = canvas.parentElement.clientWidth;
    const wide = w >= 540;
    const hgt = wide ? Math.round(clamp(w * 0.62, 320, 420)) : 520;
    canvas.style.height = `${hgt}px`;
    ctx = fitCanvas(canvas, w, hgt);
    const slab = wide ? { x: 0, y: 0, w: Math.round(w * 0.54), h: hgt } : { x: 0, y: 0, w, h: 200 };
    const band = wide ? { x: slab.w + 10, y: 0, w: w - slab.w - 10, h: hgt } : { x: 0, y: 210, w, h: hgt - 210 };
    slab.air = slab.x + Math.round(slab.w * 0.24);
    slab.top = slab.y + 30; slab.bot = slab.y + slab.h - 12;
    band.left = band.x + 46; band.right = band.x + band.w - 92; band.top = band.y + 30; band.bot = band.y + band.h - 14;
    G = { w, h: hgt, slab, band };
    drawStrip();
    st.dirty = true; draw();
  }

  // ---------- events ----------
  function makeEvent(nm, { demo = false } = {}) {
    const E = photonEnergyEV(nm); const gap = st.mat.gap;
    const abs = isAbsorbed(nm, gap); const heat = excessEnergyEV(nm, gap);
    // illustrative absorption depth: high-energy photons are absorbed close to the surface
    const mean = 0.08 + 0.5 * Math.exp(-heat / 0.45);
    const depth = abs ? clamp(0.03 + -Math.log(1 - Math.random() * 0.95) * mean, 0.03, 0.92) : 1;
    return { nm, E, gap, abs, heat, depth, yf: 0.1 + 0.8 * Math.random(), lane: st.lane++, ang: Math.random() * Math.PI * 2, t: 0, demo };
  }
  function fire(nm, announce) {
    const e = makeEvent(nm);
    if (reduce) e.t = settled(e);
    st.events.push(e); st.last = e;
    const T = st.tally; T.n++; T.ein += e.E;
    if (e.abs) { T.abs++; T.use += e.gap; T.heat += e.heat; } else T.pass += e.E;
    if (announce) {
      $('pv-live').textContent = e.abs
        ? `Photon at ${Math.round(nm)} nanometres, ${fmt(e.E, 3)} electronvolts: absorbed. An electron–hole pair is made and ${fmt(e.heat, 3)} electronvolts become heat.`
        : `Photon at ${Math.round(nm)} nanometres, ${fmt(e.E, 3)} electronvolts: below the ${st.mat.gap} electronvolt gap, so it passes straight through.`;
    }
    updateReadout(); updateTally();
    st.dirty = true; if (reduce) draw();
  }
  const nextNm = () => (st.source === 'sun' ? sample(Math.random()) : st.nm);

  // ---------- drawing ----------
  function draw() {
    if (!ctx || !G) return;
    const { w, h } = G;
    ctx.clearRect(0, 0, w, h);
    drawSlab(); drawBand();
    const latest = st.events[st.events.length - 1];
    for (const e of st.events) drawEventSlab(e, e === latest);
    for (const e of st.events) drawEventBand(e, e === latest);
    st.dirty = false;
  }

  function drawSlab() {
    const s = G.slab;
    ctx.fillStyle = col.paper2; roundRect(s.x, s.y, s.w, s.h, 8); ctx.fill();
    // the crystal
    ctx.fillStyle = col.panel; ctx.globalAlpha = 0.55; ctx.fillRect(s.air, s.top, s.x + s.w - 8 - s.air, s.bot - s.top); ctx.globalAlpha = 1;
    ctx.strokeStyle = col.rule; ctx.lineWidth = 1; ctx.strokeRect(s.air + 0.5, s.top + 0.5, s.x + s.w - 8 - s.air, s.bot - s.top);
    const sp = 22;
    ctx.strokeStyle = col.rule; ctx.lineWidth = 1;
    for (let y = s.top + sp / 2; y < s.bot; y += sp) { ctx.beginPath(); ctx.moveTo(s.air + 4, y); ctx.lineTo(s.x + s.w - 12, y); ctx.stroke(); }
    for (let x = s.air + sp / 2; x < s.x + s.w - 8; x += sp) { ctx.beginPath(); ctx.moveTo(x, s.top + 4); ctx.lineTo(x, s.bot - 4); ctx.stroke(); }
    ctx.fillStyle = col.ink2;
    for (let y = s.top + sp / 2; y < s.bot; y += sp) for (let x = s.air + sp / 2; x < s.x + s.w - 8; x += sp) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = font(12, 650); ctx.fillStyle = col.ink2; ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left'; ctx.fillText('Light in', s.x + 10, s.y + 20);
    ctx.fillText(`${st.mat.short} crystal`, s.air + 6, s.y + 20);
  }

  function yOf(E) { const b = G.band; const lo = -0.7; const hi = 4.75; return b.bot - ((E - lo) / (hi - lo)) * (b.bot - b.top); }

  function drawBand() {
    const b = G.band; const gap = st.mat.gap;
    ctx.fillStyle = col.paper2; roundRect(b.x, b.y, b.w, b.h, 8); ctx.fill();
    const x0 = b.left - 6; const x1 = b.x + b.w - 10;
    // valence band (full) and conduction band (empty)
    ctx.fillStyle = col.electron; ctx.globalAlpha = 0.2; ctx.fillRect(x0, yOf(0), x1 - x0, b.bot - yOf(0)); ctx.globalAlpha = 0.08;
    ctx.fillRect(x0, b.top, x1 - x0, yOf(gap) - b.top); ctx.globalAlpha = 1;
    ctx.strokeStyle = col.electron; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, yOf(0)); ctx.lineTo(x1, yOf(0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, yOf(gap)); ctx.lineTo(x1, yOf(gap)); ctx.stroke();
    // labels
    ctx.font = font(12, 650); ctx.fillStyle = col.ink; ctx.textAlign = 'right';
    ctx.fillText('Conduction band', x1 - 6, b.top + 16);
    ctx.fillText('Valence band', x1 - 6, b.bot - 8);
    // gap bracket on the right
    const gx = x1 - 10; const ya = yOf(gap); const yb = yOf(0);
    ctx.strokeStyle = col.ink2; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(gx - 5, ya + 2); ctx.lineTo(gx, ya + 2); ctx.lineTo(gx, yb - 2); ctx.lineTo(gx - 5, yb - 2); ctx.stroke();
    ctx.fillStyle = col.ink2; ctx.textAlign = 'right'; ctx.font = font(12, 650);
    ctx.fillText('Band gap', gx - 8, yb - 22); ctx.font = font(12, 500); ctx.fillText(`${fmt(gap, 3)} eV`, gx - 8, yb - 7);
    // energy axis
    ctx.textAlign = 'right'; ctx.font = font(11, 500); ctx.fillStyle = col.ink2; ctx.strokeStyle = col.rule; ctx.lineWidth = 1;
    for (let E = 0; E <= 4; E++) {
      const y = yOf(E); ctx.fillText(`${E}`, b.x + 26, y + 4);
      ctx.beginPath(); ctx.moveTo(b.x + 30, y); ctx.lineTo(b.x + 36, y); ctx.stroke();
    }
    ctx.save(); ctx.translate(b.x + 11, (b.top + b.bot) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
    ctx.fillText('Energy (eV)', 0, 0); ctx.restore();
  }

  function eventAlpha(e, latest) {
    if (latest) return 1;
    const end = settled(e) + T_HOLD;
    const base = 0.4;
    return e.t < settled(e) ? 1 : e.t < end ? base : base * clamp(1 - (e.t - end) / T_FADE);
  }

  function wave(x0, y0, x1, y1, lamPx, amp, sty, alpha) {
    const dx = x1 - x0; const dy = y1 - y0; const len = Math.hypot(dx, dy); if (len < 1) return;
    const ux = dx / len; const uy = dy / len;
    const path = () => {
      ctx.beginPath();
      for (let s = 0; s <= len; s += 1.5) {
        const a = amp * Math.sin((2 * Math.PI * s) / lamPx) * Math.min(1, s / 10, (len - s) / 6 + 0.2);
        const x = x0 + ux * s - uy * a; const y = y0 + uy * s + ux * a;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    };
    ctx.globalAlpha = alpha * 0.35; ctx.strokeStyle = col.ink; ctx.lineWidth = 4.5; ctx.setLineDash([]); path(); ctx.stroke();
    ctx.globalAlpha = alpha; ctx.strokeStyle = sty.color; ctx.lineWidth = 2.2; ctx.setLineDash(sty.dashed ? [5, 3] : []); path(); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  function drawEventSlab(e, latest) {
    const s = G.slab; const a = eventAlpha(e, latest); if (a <= 0) return;
    const sty = style(e.nm); const lamPx = 6 + (16 * (e.nm - NM_MIN)) / (NM_MAX - NM_MIN);
    const y = s.top + e.yf * (s.bot - s.top);
    const xStart = s.x + 8; const xEnd = e.abs ? s.air + e.depth * (s.x + s.w - 8 - s.air) : s.x + s.w + 40;
    const dur = e.abs ? T_TRAVEL : T_PASS; const u = clamp(e.t / dur);
    const head = xStart + (xEnd - xStart) * u;
    const L = 46;
    if (u < 1) {
      ctx.save(); ctx.beginPath(); ctx.rect(s.x, s.y, s.w, s.h); ctx.clip();
      wave(Math.max(xStart, head - L), y, head, y, lamPx, 5, sty, a);
      if (sty.tag) { ctx.font = font(11, 700); ctx.fillStyle = col.ink2; ctx.textAlign = 'center'; ctx.globalAlpha = a; ctx.fillText(sty.tag, head - L / 2, y - 10); ctx.globalAlpha = 1; }
      ctx.restore();
    } else if (e.abs && latest) {
      ctx.globalAlpha = 0.45; ctx.strokeStyle = sty.color; ctx.setLineDash([2, 4]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(xStart, y); ctx.lineTo(xEnd - 8, y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    } else if (!e.abs) {
      // passed through: leave a faint dashed track for the latest photon
      if (latest) {
        ctx.globalAlpha = 0.5; ctx.strokeStyle = col.ink2; ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(xStart, y); ctx.lineTo(s.x + s.w - 8, y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.font = font(12, 650); ctx.textAlign = 'right';
        const ty = clamp(y + 20, s.top + 14, s.bot - 6); const tw = ctx.measureText('passed straight through').width;
        ctx.fillStyle = col.panel; ctx.globalAlpha = 0.9; ctx.fillRect(s.x + s.w - 18 - tw, ty - 12, tw + 8, 16); ctx.globalAlpha = 1;
        ctx.fillStyle = col.ink; ctx.fillText('passed straight through', s.x + s.w - 14, ty);
      }
    }
    if (e.abs && e.t >= T_TRAVEL) {
      const k = e.t - T_TRAVEL;
      // heat: the lattice around the site shakes (an expanding ring)
      if (e.heat > 0.02 && k < T_UP + T_RELAX + 0.4) {
        const r = 4 + 26 * Math.min(1, e.heat / 2.5) * clamp(k / (T_UP + T_RELAX));
        ctx.globalAlpha = a * 0.75 * (1 - clamp((k - T_UP - T_RELAX) / 0.4)); ctx.strokeStyle = col.sun; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(head, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      const d = 4 + 10 * ease(clamp(k / 0.8)) + 4 * Math.min(1, k / 3);
      const ex = head + Math.cos(e.ang) * d; const ey = y + Math.sin(e.ang) * d;
      const hx = head - Math.cos(e.ang) * d; const hy = y - Math.sin(e.ang) * d;
      carrier(ex, ey, 'e', a); carrier(hx, hy, 'h', a);
      if (latest && e.heat > 0.02 && k > T_UP) {
        ctx.font = font(12, 650); ctx.fillStyle = col.ink; ctx.textAlign = 'left'; ctx.globalAlpha = a;
        const tx = Math.min(head + 18, s.x + s.w - 120);
        ctx.fillText('pair made, lattice warms', tx, clamp(y - 16, s.top + 14, s.bot - 6)); ctx.globalAlpha = 1;
      }
    }
  }

  function carrier(x, y, kind, a) {
    ctx.globalAlpha = a;
    if (kind === 'e') { ctx.fillStyle = col.electron; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillStyle = col.panel; ctx.strokeStyle = col.hole; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.strokeStyle = kind === 'e' ? col.panel : col.hole; ctx.lineWidth = 1.6; ctx.beginPath();
    ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y);
    if (kind === 'h') { ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  function arrowHead(x, y, dir, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 9 * dir); ctx.lineTo(x + 5, y + 9 * dir); ctx.closePath(); ctx.fill();
  }

  function drawEventBand(e, latest) {
    const b = G.band;
    const tFront = e.abs ? T_TRAVEL : T_PASS * 0.35;
    if (e.t < tFront) return;
    const a = eventAlpha(e, latest); if (a <= 0) return;
    const lanes = Math.max(3, Math.floor((b.right - b.left) / 26));
    const x = b.left + 8 + ((e.lane % lanes) + 0.5) * ((b.right - b.left - 8) / lanes);
    const sty = style(e.nm);
    const k = e.t - tFront;
    const u = ease(clamp(k / T_UP));
    const y0 = yOf(0); const yTop = yOf(u * e.E);
    // the photon's energy as an upward arrow
    ctx.globalAlpha = a; ctx.lineWidth = 4.5; ctx.strokeStyle = col.ink; ctx.globalAlpha = a * 0.3;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, yTop + 8); ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = sty.color; ctx.lineWidth = 2.4; ctx.setLineDash(sty.dashed || !e.abs ? [5, 3] : []);
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, yTop + 8); ctx.stroke(); ctx.setLineDash([]);
    arrowHead(x, yTop, 1, sty.color === col.ink2 ? col.ink2 : sty.color);
    if (!e.abs) {
      if (u >= 1) {
        ctx.strokeStyle = col.hole; ctx.lineWidth = 2.2; const c = yTop - 10;
        ctx.beginPath(); ctx.moveTo(x - 5, c - 5); ctx.lineTo(x + 5, c + 5); ctx.moveTo(x + 5, c - 5); ctx.lineTo(x - 5, c + 5); ctx.stroke();
        if (latest) label(x, 0, ['No allowed state', 'in the gap'], a, 'right', yOf(e.gap) + 6);
      }
      ctx.globalAlpha = 1; return;
    }
    // electron relaxes from E down to the band edge, shedding heat
    const r = ease(clamp((k - T_UP) / T_RELAX));
    const Ee = e.E - r * e.heat;
    if (k > T_UP && e.heat > 0.01) {
      ctx.strokeStyle = col.sun; ctx.lineWidth = 2; ctx.globalAlpha = a;
      const n = Math.max(1, Math.round(e.heat / 0.16));
      for (let i = 0; i < n; i++) {
        const Ei = e.E - ((i + 0.5) / n) * e.heat; if (Ei < Ee) break;
        const yy = yOf(Ei); ctx.beginPath();
        for (let s = 0; s <= 14; s += 1) { const xx = x + 7 + s; const yo = Math.sin(s * 1.4) * 2.6; if (s === 0) ctx.moveTo(xx, yy + yo); else ctx.lineTo(xx, yy + yo); }
        ctx.stroke();
      }
    }
    carrier(x, yOf(Ee) - 6, 'e', a);
    carrier(x, y0 + 7, 'h', a);
    if (latest && k > T_UP) {
      const lines = e.heat > 0.05 ? [`${fmt(e.E, 3)} eV in`, `${fmt(e.heat, 3)} eV to heat`] : [`${fmt(e.E, 3)} eV in`, 'almost no heat'];
      label(x, yOf(e.E) - 12, lines, a);
    }
    ctx.globalAlpha = 1;
  }

  function label(x, y, lines, a, side = 'right', fixedY = null) {
    const b = G.band; ctx.font = font(12, 650);
    const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 10;
    let lx = side === 'left' ? x - 22 - wMax : x + 22;
    if (lx + wMax > b.x + b.w - 6 || lx < b.x + 36) lx = side === 'left' ? x + 22 : x - 22 - wMax;
    const ly = fixedY ?? clamp(y - 8, b.top + 4, b.bot - 40);
    ctx.globalAlpha = a * 0.92; ctx.fillStyle = col.panel; roundRect(lx, ly - 2, wMax, lines.length * 15 + 6, 4); ctx.fill();
    ctx.globalAlpha = a; ctx.fillStyle = col.ink; ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, lx + 5, ly + 12 + i * 15)); ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- spectrum strip under the wavelength slider ----------
  function drawStrip() {
    if (!strip) return;
    const w = strip.parentElement.clientWidth; const hh = 16;
    strip.style.height = `${hh}px`;
    const c = fitCanvas(strip, w, hh);
    for (let x = 0; x < w; x++) {
      const nm = NM_MIN + ((x + 0.5) / w) * (NM_MAX - NM_MIN);
      const rgb = wavelengthRGB(nm);
      c.fillStyle = rgb ? `rgb(${rgb.join(',')})` : col.paper2; c.fillRect(x, 0, 1, hh);
    }
    // hatch the invisible parts
    c.strokeStyle = col.ink2; c.globalAlpha = 0.45; c.lineWidth = 1;
    const vis0 = ((380 - NM_MIN) / (NM_MAX - NM_MIN)) * w; const vis1 = ((750 - NM_MIN) / (NM_MAX - NM_MIN)) * w;
    for (let x = -hh; x < w; x += 6) { if (x + hh > vis0 && x < vis1) continue; c.beginPath(); c.moveTo(x, hh); c.lineTo(x + hh, 0); c.stroke(); }
    c.globalAlpha = 1;
    const cut = cutoffWavelengthNm(st.mat.gap);
    if (cut > NM_MIN && cut < NM_MAX) {
      const xc = ((cut - NM_MIN) / (NM_MAX - NM_MIN)) * w;
      c.fillStyle = col.ink; c.fillRect(Math.round(xc) - 1, 0, 2, hh);
      c.globalAlpha = 0.18; c.fillRect(xc, 0, w - xc, hh); c.globalAlpha = 1;
    }
    c.strokeStyle = col.rule; c.strokeRect(0.5, 0.5, w - 1, hh - 1);
  }

  // ---------- text outputs ----------
  function updateReadout() {
    const nm = st.source === 'mono' ? st.nm : (st.last ? st.last.nm : st.nm);
    const gap = st.mat.gap; const E = photonEnergyEV(nm); const abs = isAbsorbed(nm, gap);
    $('r-ev').textContent = fmt(E, 3);
    $('r-j').textContent = sci(photonEnergyJ(nm), 2);
    $('r-f').textContent = fmt(frequencyHz(nm) / 1e12, 3);
    $('r-gap').textContent = fmt(gap, 3);
    $('r-abs').textContent = abs ? 'Yes' : 'No, passes through';
    $('r-heat').textContent = abs ? fmt(excessEnergyEV(nm, gap), 3) : '0';
    $('r-use').textContent = fmt(100 * usableFraction(nm, gap), 3);
    const rate = st.source === 'mono' ? photonRate(powerW(), nm) : powerW() / MEAN_J;
    $('r-rate').textContent = sci(rate);
    $('pv-readout-h').textContent = st.source === 'mono' ? `This photon (${Math.round(nm)} nm)` : `Last photon (${Math.round(nm)} nm, ${colourName(nm)})`;
  }
  const sup = (d) => [...String(d)].map((c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])).join('');
  function sci(x, d = 1) { const ex = Math.floor(Math.log10(x)); const m = x / 10 ** ex; return `${m.toFixed(d)} × 10${sup(ex)}`; }

  function updateTally() {
    const T = st.tally; const el = $('pv-tally');
    if (!T.n) { el.textContent = 'No photons fired yet.'; return; }
    const p = (x) => `${Math.round((100 * x) / T.ein)} %`;
    el.textContent = `${T.n} photon${T.n === 1 ? '' : 's'} fired: ${T.abs} absorbed, ${T.n - T.abs} passed through. `
      + `Of their energy, ${p(T.use)} could reach the circuit, ${p(T.heat)} became heat and ${p(T.pass)} went straight through.`;
  }

  function updateControls() {
    const nm = st.nm; const mono = st.source === 'mono';
    $('pv-wl').disabled = !mono;
    $('pv-wl-out').textContent = mono ? `${nm} nm` : 'mixed';
    const cut = cutoffWavelengthNm(st.mat.gap);
    const name = colourName(nm);
    const band = nm < 380 ? 'Ultraviolet, invisible to the eye.' : nm > 750 ? 'Infrared, invisible to the eye.' : `Visible light (${name}).`;
    $('pv-wl-band').textContent = mono
      ? `${band} ${st.mat.short} absorbs wavelengths shorter than ${Math.round(cut)} nm.`
      : `Photon colours are drawn at random in proportion to sunlight. ${st.mat.short} absorbs wavelengths shorter than ${Math.round(cut)} nm.`;
    const P = powerW();
    $('pv-int-out').textContent = P >= 1e-3 ? `${fmt(P * 1e3, 2)} mW` : `${fmt(P * 1e6, 2)} µW`;
    const m = st.mat;
    $('pv-mat-note').textContent = `${m.kind === 'direct' ? 'Direct band gap' : m.kind === 'indirect' ? 'Indirect band gap' : 'Amorphous: no sharp band edge'}. ${m.use ? `${m.use}.` : ''}`;
  }

  // ---------- wiring ----------
  const playBtn = $('pv-play');
  if (reduce) { playBtn.hidden = true; }
  playBtn.addEventListener('click', () => {
    st.playing = !st.playing; playBtn.textContent = st.playing ? 'Pause' : 'Play';
    if (st.playing && st.acc < 0.9) st.acc = 0.9;
  });
  $('pv-step').addEventListener('click', () => fire(nextNm(), true));
  $('pv-reset').addEventListener('click', () => {
    st.tally = { n: 0, abs: 0, ein: 0, use: 0, heat: 0, pass: 0 }; updateTally(); $('pv-live').textContent = 'Tally cleared.';
  });
  $('pv-wl').addEventListener('input', (ev) => { st.nm = Number(ev.target.value); updateControls(); updateReadout(); });
  $('pv-int').addEventListener('input', (ev) => { st.level = Number(ev.target.value); updateControls(); updateReadout(); });
  $('pv-source').addEventListener('change', (ev) => { st.source = ev.target.value; updateControls(); updateReadout(); });
  $('pv-mat').addEventListener('change', (ev) => {
    st.mat = st.materials.find((m) => m.id === ev.target.value) || st.mat;
    st.events = []; st.tally = { n: 0, abs: 0, ein: 0, use: 0, heat: 0, pass: 0 };
    seed(); updateControls(); updateReadout(); updateTally(); drawStrip(); st.dirty = true; draw();
  });

  // a settled demonstration photon so the still frame tells the whole story
  function seed() {
    const e = makeEvent(st.source === 'mono' ? st.nm : 500, { demo: true });
    e.t = settled(e); e.depth = Math.min(e.depth, 0.35); e.yf = 0.55; st.events.push(e); st.last = e;
  }

  onTheme(() => { readColours(); drawStrip(); st.dirty = true; draw(); });
  readColours();
  seed();
  updateControls(); updateReadout(); updateTally();
  layout();
  new ResizeObserver(() => { if (G && canvas.parentElement.clientWidth !== G.w) layout(); }).observe(canvas.parentElement);
  document.fonts?.ready.then(() => { st.dirty = true; draw(); });

  if (!reduce) {
    animate(canvas, (dt) => {
      if (st.playing) {
        st.acc += dt * (0.6 + 9 * (st.level / 100) ** 1.5);
        while (st.acc >= 1) { st.acc -= 1; fire(nextNm(), false); }
      }
      let live = false;
      const latest = st.events[st.events.length - 1];
      for (const e of st.events) { if (e.t < lifetime(e) + 0.1) { e.t += dt; live = true; } }
      st.events = st.events.filter((e) => e === latest || e.t < lifetime(e));
      if (st.events.length > 60) st.events.splice(0, st.events.length - 60);
      if (live || st.dirty) draw();
    });
  }

  // ---------- materials ----------
  const badge = $('pv-badge');
  const valid = (d) => is.obj(d) && is.arr(d.data) && d.data.every((m) => is.str(m.id) && is.str(m.name) && is.str(m.short) && is.num(m.gap) && m.gap > 0.2 && m.gap < 4);
  loadData('materials.json', valid).then(({ data, state }) => {
    setBadge(badge, state, 'materials.json');
    st.materials = [...data.data].sort((p, q) => p.gap - q.gap);
    const sel = $('pv-mat');
    while (sel.firstChild) sel.firstChild.remove();
    for (const m of st.materials) {
      const o = document.createElement('option'); o.value = m.id;
      o.textContent = `${m.name} (${m.short}), ${m.range ? '~' : ''}${m.gap} eV`;
      if (m.id === 'si') o.selected = true; sel.append(o);
    }
    st.mat = st.materials.find((m) => m.id === 'si') || st.materials[0];
    updateControls(); updateReadout(); drawStrip(); st.dirty = true; draw();
  }).catch((err) => { console.error(err); setBadge(badge, 'failed'); });
}
