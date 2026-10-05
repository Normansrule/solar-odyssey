// P-n junction explorer: an animated cross-section of a cell, its band diagram,
// and a small I-V chart, all driven by physics/junction.js and physics/pv.js.
import { fitCanvas, cssVar, onTheme, animate, reducedMotion, fmt } from '../assets/js/dom.js';
import { siliconCell, maxPowerPoint, openCircuitVoltage, shortCircuitCurrent, diodeCurrent } from '../assets/js/physics/pv.js';
import { junction, loadPoint, EG_SI_300 } from '../assets/js/physics/junction.js';

const $ = (id) => document.getElementById(id);
const canvas = $('pnj-canvas');
const ivCanvas = $('pnj-iv');
if (canvas && ivCanvas) init();

function init() {
  const ui = {
    light: $('pnj-light'), load: $('pnj-load'), na: $('pnj-na'), nd: $('pnj-nd'),
    lightOut: $('pnj-light-out'), loadOut: $('pnj-load-out'), naOut: $('pnj-na-out'), ndOut: $('pnj-nd-out'),
    i: $('pnj-i'), v: $('pnj-v'), p: $('pnj-p'), share: $('pnj-share'),
    vbi: $('pnj-vbi'), w: $('pnj-w'), e: $('pnj-e'), split: $('pnj-split'),
    summary: $('pnj-summary'), toggle: $('pnj-toggle'), step: $('pnj-step'),
  };

  // ---------- model state ----------
  const ISC_ONE_SUN = shortCircuitCurrent(siliconCell({ suns: 1 }));
  const R_MIN = 1e-3; const R_MAX = 10; // Ω, the log part of the load slider (1…99)
  const sliderToR = (s) => (s <= 0 ? 0 : s >= 100 ? Infinity : 10 ** (Math.log10(R_MIN) + ((s - 1) / 98) * Math.log10(R_MAX / R_MIN)));
  const rToSlider = (R) => (R <= 0 ? 0 : !Number.isFinite(R) ? 100 : Math.max(1, Math.min(99, Math.round(10 * (1 + (98 * Math.log10(R / R_MIN)) / Math.log10(R_MAX / R_MIN))) / 10)));
  const S = { suns: 1, R: 0.065, Na: 1e16, Nd: 1e19, cell: null, op: null, mpp: null, voc: 0, isc: 0, jn: null, jn0: null, frac: 1 };

  function recompute() {
    S.suns = Number(ui.light.value);
    S.R = sliderToR(Number(ui.load.value));
    S.Na = 10 ** Number(ui.na.value); S.Nd = 10 ** Number(ui.nd.value);
    S.cell = siliconCell({ suns: S.suns });
    if (S.suns > 0) {
      S.op = loadPoint(S.cell, S.R); S.mpp = maxPowerPoint(S.cell); S.voc = openCircuitVoltage(S.cell); S.isc = shortCircuitCurrent(S.cell);
    } else {
      S.op = { V: 0, I: 0, P: 0 }; S.mpp = { V: 0, I: 0, P: 0 }; S.voc = 0; S.isc = 0;
    }
    S.frac = S.cell.Iph > 0 ? Math.max(0, Math.min(1, S.op.I / S.cell.Iph)) : 0;
    S.jn = junction(S.Na, S.Nd, Math.min(S.op.V, 0.98 * junction(S.Na, S.Nd).Vbi));
    S.jn0 = junction(S.Na, S.Nd);
    writeReadouts();
    drawIV();
    if (paused) drawScene(true);
  }

  const loadLabel = (R) => (R === 0 ? 'short circuit' : !Number.isFinite(R) ? 'open circuit' : `${fmt(R, 2)} Ω`);
  function writeReadouts() {
    ui.lightOut.textContent = `${S.suns.toFixed(2)} sun${S.suns === 1 ? '' : 's'}`;
    ui.loadOut.textContent = loadLabel(S.R);
    ui.naOut.textContent = sci(S.Na); ui.ndOut.textContent = sci(S.Nd);
    ui.i.textContent = `${S.op.I.toFixed(2)} A`;
    ui.v.textContent = `${S.op.V.toFixed(3)} V`;
    ui.p.textContent = `${S.op.P.toFixed(2)} W`;
    ui.share.textContent = S.mpp.P > 0 ? `${Math.round((100 * S.op.P) / S.mpp.P)} %` : '—';
    ui.vbi.textContent = `${S.jn0.Vbi.toFixed(3)} V`;
    ui.w.textContent = `${S.jn.W_um.toFixed(3)} µm`;
    ui.e.textContent = `${fmt(S.jn.Emax_Vcm, 2)} V/cm`;
    ui.split.textContent = `${fmt(S.jn.xp_um * 1000, 3)} / ${fmt(S.jn.xn_um * 1000, 3)} nm`;
    const where = S.R === 0 ? 'with the terminals shorted' : !Number.isFinite(S.R) ? 'with nothing connected' : `into a ${fmt(S.R, 2)} Ω load`;
    const text = S.suns === 0
      ? 'In the dark the junction still has its built-in field, but no pairs are made, so no current flows and the cell gives no voltage.'
      : `At ${S.suns.toFixed(2)} sun ${where}, the cell delivers ${S.op.I.toFixed(2)} A at ${S.op.V.toFixed(3)} V, which is ${S.op.P.toFixed(2)} W, ${Math.round((100 * S.op.P) / S.mpp.P)} % of the ${S.mpp.P.toFixed(2)} W it could give at its maximum power point (${S.mpp.V.toFixed(3)} V, ${S.mpp.I.toFixed(2)} A). The barrier in the band diagram is ${(S.jn0.Vbi - S.op.V).toFixed(2)} eV tall and the depletion region ${S.jn.W_um.toFixed(2)} µm wide.`;
    ui.summary.textContent = text;
    canvas.setAttribute('aria-label', `Cross-section of a p-n junction solar cell with its band-energy diagram. ${text}`);
  }
  const sci = (x) => { const e = Math.floor(Math.log10(x) + 1e-9); return `${(x / 10 ** e).toFixed(1)}e${e} cm⁻³`; };

  // ---------- colours ----------
  let C = {};
  const readColours = () => {
    C = { ink: cssVar('--ink'), ink2: cssVar('--ink-2'), rule: cssVar('--rule'), paper: cssVar('--paper'), paper2: cssVar('--paper-2'), panel: cssVar('--panel'),
      e: cssVar('--electron'), h: cssVar('--hole'), sun: cssVar('--sun'), sunInk: cssVar('--sun-ink'), silicon: cssVar('--silicon') };
  };

  // ---------- geometry ----------
  let G = null; let ctx = null;
  function layout() {
    const w = Math.max(280, canvas.parentElement.clientWidth);
    const narrow = w < 460;
    const top = 62; const slabH = Math.round(Math.max(118, w * 0.25));
    const bandTop = top + slabH + 46; const bandH = Math.round(Math.max(160, w * 0.3));
    const H = bandTop + bandH + 14;
    ctx = fitCanvas(canvas, w, H);
    const x0 = 14; const x1 = w - 14; const contact = 7;
    G = { w, H, narrow, top, slabH, y0: top, y1: top + slabH, x0: x0 + contact, x1: x1 - contact, cx0: x0, cx1: x1, wireY: 18, bandTop, bandH };
    G.xj = G.x0 + (G.x1 - G.x0) * 0.64;
    placeDepletion();
  }
  // Drawn depletion width follows the physics monotonically but compressed, so it stays visible:
  // 0.34 µm (the default junction in the dark) is drawn as 17 % of the slab.
  function placeDepletion() {
    const span = G.x1 - G.x0;
    const wpx = Math.max(10, Math.min(0.42 * span, 0.17 * span * (S.jn.W_um / 0.34) ** 0.75));
    const share = S.jn.xp_um / (S.jn.xp_um + S.jn.xn_um);
    const nShare = Math.max(0.22, 1 - share); // the heavily doped side is drawn wider than scale
    G.dl = G.xj - wpx * (1 - nShare); G.dr = G.xj + wpx * nShare; G.pShare = share;
  }

  // ---------- particles ----------
  let seed = 7;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let majE = []; let majH = []; let carriers = []; let photons = []; let flashes = []; let wirePhase = 0; let genAcc = 0;

  function seedMajority() {
    const count = Math.round((G.x1 - G.x0) * G.slabH / 1400);
    majH = Array.from({ length: Math.round(count * 0.64) }, () => ({ x: G.x0 + rnd() * (G.dl - G.x0), y: G.y0 + 6 + rnd() * (G.slabH - 12), vx: 0, vy: 0 }));
    majE = Array.from({ length: Math.round(count * 0.36) }, () => ({ x: G.dr + rnd() * (G.x1 - G.dr), y: G.y0 + 6 + rnd() * (G.slabH - 12), vx: 0, vy: 0 }));
  }

  const region = (x) => (x < G.dl ? 'p' : x > G.dr ? 'n' : 'd');

  function spawnPair() {
    const collect = rnd() < S.frac;
    // doomed pairs are born in the neutral regions (the field would sweep anything born in the depletion region)
    let x;
    for (let k = 0; k < 10; k++) { x = G.x0 + 6 + rnd() * (G.x1 - G.x0 - 12); if (collect || region(x) !== 'd') break; }
    const y = G.y0 + 10 + rnd() * (G.slabH - 20);
    photons.push({ x, y: G.y0 - 44, ty: y, collect });
  }

  function makePair(x, y, collect) {
    const r = region(x);
    const life = 0.8 + rnd() * 1.0;
    const e = { kind: 'e', x, y, vx: 0, vy: 0, age: 0 };
    const hh = { kind: 'h', x: x + (rnd() - 0.5) * 6, y: y + (rnd() - 0.5) * 6, vx: 0, vy: 0, age: 0 };
    if (!collect) {
      e.state = 'doom'; hh.state = 'doom'; e.life = life; hh.life = life; e.home = r; hh.home = r; e.partner = hh; hh.partner = e;
    } else if (r === 'p') { e.state = 'seek'; hh.state = 'out'; }
    else if (r === 'n') { hh.state = 'seek'; e.state = 'out'; }
    else { e.state = 'drift'; hh.state = 'drift'; }
    carriers.push(e, hh);
    flashes.push({ x, y, t: 0, kind: 'gen' });
  }

  function jiggle(p, speed, dt) {
    p.vx += (rnd() - 0.5) * speed * 6 * dt * 10; p.vy += (rnd() - 0.5) * speed * 6 * dt * 10;
    const v = Math.hypot(p.vx, p.vy); if (v > speed) { p.vx *= speed / v; p.vy *= speed / v; }
  }
  const clampY = (p) => { if (p.y < G.y0 + 5) { p.y = G.y0 + 5; p.vy = Math.abs(p.vy); } if (p.y > G.y1 - 5) { p.y = G.y1 - 5; p.vy = -Math.abs(p.vy); } };

  function step(dt) {
    // majority carriers jiggle in their own neutral region
    for (const p of majH) { jiggle(p, 22, dt); p.x += p.vx * dt; p.y += p.vy * dt; clampY(p); if (p.x < G.x0 + 4) { p.x = G.x0 + 4; p.vx = Math.abs(p.vx); } if (p.x > G.dl - 3) { p.x -= Math.max(1, (p.x - G.dl + 3) * 0.3); p.vx = -Math.abs(p.vx); } }
    for (const p of majE) { jiggle(p, 22, dt); p.x += p.vx * dt; p.y += p.vy * dt; clampY(p); if (p.x > G.x1 - 4) { p.x = G.x1 - 4; p.vx = -Math.abs(p.vx); } if (p.x < G.dr + 3) { p.x += Math.max(1, (G.dr + 3 - p.x) * 0.3); p.vx = Math.abs(p.vx); } }

    // light
    genAcc += dt * 9 * S.suns;
    while (genAcc >= 1) { genAcc -= 1; spawnPair(); }
    for (const ph of photons) { ph.y += 700 * dt; }
    for (const ph of photons.filter((q) => q.y >= q.ty)) makePair(ph.x, ph.ty, ph.collect);
    photons = photons.filter((q) => q.y < q.ty);

    // generated carriers
    const dead = new Set();
    for (const c of carriers) {
      c.age += dt;
      const toward = c.kind === 'e' ? 1 : -1; // electrons head for n (right), holes for p (left)
      const r = region(c.x);
      if (c.state === 'doom') {
        jiggle(c, 46, dt); c.x += c.vx * dt; c.y += c.vy * dt; clampY(c);
        const lo = c.home === 'n' ? G.dr + 3 : G.x0 + 4; const hi = c.home === 'n' ? G.x1 - 4 : G.dl - 3;
        if (c.x < lo) { c.x = lo; c.vx = Math.abs(c.vx); } if (c.x > hi) { c.x = hi; c.vx = -Math.abs(c.vx); }
        if (c.kind === 'h' && c.partner) { c.x += (c.partner.x - c.x) * Math.min(1, dt * c.age * 1.2); c.y += (c.partner.y - c.y) * Math.min(1, dt * c.age * 1.2); }
        if (c.age >= c.life && c.kind === 'e') { dead.add(c); dead.add(c.partner); flashes.push({ x: c.x, y: c.y, t: 0, kind: 'rec' }); }
        continue;
      }
      if (c.state === 'seek') {
        jiggle(c, 44, dt); c.vx += toward * 60 * dt; c.x += c.vx * dt; c.y += c.vy * dt; clampY(c);
        if (r === 'd') c.state = 'drift';
        if (c.x < G.x0 + 4) { c.x = G.x0 + 4; c.vx = Math.abs(c.vx); } if (c.x > G.x1 - 4) { c.x = G.x1 - 4; c.vx = -Math.abs(c.vx); }
      } else if (c.state === 'drift') {
        c.vx = toward * 240; c.vy *= 0.9; c.x += c.vx * dt; c.y += c.vy * dt;
        if ((toward > 0 && c.x > G.dr + 2) || (toward < 0 && c.x < G.dl - 2)) c.state = 'out';
      } else if (c.state === 'out') {
        c.vx = toward * 95; c.vy = (G.y0 + G.slabH * 0.5 - c.y) * 0.4; c.x += c.vx * dt; c.y += c.vy * dt;
        if (c.x > G.x1 - 1 || c.x < G.x0 + 1) dead.add(c);
      }
    }
    carriers = carriers.filter((c) => !dead.has(c));
    for (const f of flashes) f.t += dt;
    flashes = flashes.filter((f) => f.t < 0.6);
    wirePhase = (wirePhase + dt * 150 * (S.op.I / ISC_ONE_SUN)) % 10000;
  }

  // ---------- band diagram ----------
  const E_TOP = EG_SI_300 + 0.32; const E_BOT = -1.16; // eV, fixed scale so the step change is visible
  const ey = (E) => G.bandTop + ((E_TOP - E) / (E_TOP - E_BOT)) * G.bandH;
  function stepAt(x) {
    const s = Math.max(0, S.jn0.Vbi - S.op.V);
    if (x <= G.dl) return 0;
    if (x >= G.dr) return s;
    const a = G.pShare;
    if (x <= G.xj) { const u = (x - G.dl) / (G.xj - G.dl); return s * a * u * u; }
    const u = (G.dr - x) / (G.dr - G.xj); return s - s * (1 - a) * u * u;
  }
  const ec = (x) => EG_SI_300 - stepAt(x);
  const ev = (x) => -stepAt(x);

  // ---------- drawing ----------
  function drawScene(still) {
    const { w, H } = G;
    ctx.clearRect(0, 0, w, H);
    ctx.fillStyle = C.paper2; ctx.fillRect(0, 0, w, H);
    const font = (px, weight = 500) => `${weight} ${px}px "Atkinson Next", system-ui, sans-serif`;

    // circuit wire and load
    const lx = G.cx0 + 3.5; const rx = G.cx1 - 3.5; const mid = w / 2;
    ctx.strokeStyle = C.ink2; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    const open = !Number.isFinite(S.R); const short = S.R === 0;
    ctx.beginPath(); ctx.moveTo(lx, G.y0); ctx.lineTo(lx, G.wireY); ctx.lineTo(mid - 30, G.wireY);
    if (short) ctx.lineTo(mid + 30, G.wireY);
    else if (!open) { for (let k = 0; k <= 6; k++) ctx.lineTo(mid - 24 + k * 8, G.wireY + (k === 0 || k === 6 ? 0 : k % 2 ? -6 : 6)); ctx.lineTo(mid + 30, G.wireY); }
    ctx.moveTo(mid + 30, G.wireY); ctx.lineTo(rx, G.wireY); ctx.lineTo(rx, G.y0); ctx.stroke();
    if (open) { ctx.fillStyle = C.ink2; ctx.beginPath(); ctx.arc(mid - 30, G.wireY, 2.5, 0, 7); ctx.arc(mid + 30, G.wireY, 2.5, 0, 7); ctx.fill(); }
    ctx.fillStyle = C.ink2; ctx.font = font(11, 650); ctx.textAlign = 'center';
    ctx.fillText(short ? 'short circuit' : open ? 'open circuit' : `load ${loadLabel(S.R)}`, mid, G.wireY + 20);
    ctx.textAlign = 'left'; ctx.fillText('+', lx + 6, G.y0 - 6); ctx.textAlign = 'right'; ctx.fillText('−', rx - 6, G.y0 - 6);
    // electrons in the wire: they leave the n contact, pass the load, and enter the p contact
    if (S.op.I > 1e-4) {
      const path = [[rx, G.y0], [rx, G.wireY], [lx, G.wireY], [lx, G.y0]];
      const segs = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
      const L = segs.reduce((a, b) => a + b, 0); const gap = 26;
      ctx.fillStyle = C.e;
      for (let d = wirePhase % gap; d < L; d += gap) {
        let s = d; let i = 0; while (i < segs.length - 1 && s > segs[i]) { s -= segs[i]; i++; }
        const t = s / segs[i]; const px = path[i][0] + (path[i + 1][0] - path[i][0]) * t; const py = path[i][1] + (path[i + 1][1] - path[i][1]) * t;
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 7); ctx.fill();
      }
    }

    // slab regions
    ctx.save();
    ctx.globalAlpha = 0.1; ctx.fillStyle = C.h; ctx.fillRect(G.x0, G.y0, G.dl - G.x0, G.slabH);
    ctx.fillStyle = C.e; ctx.fillRect(G.dr, G.y0, G.x1 - G.dr, G.slabH);
    ctx.restore();
    ctx.fillStyle = C.panel; ctx.fillRect(G.dl, G.y0, G.dr - G.dl, G.slabH);
    ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.strokeRect(G.x0 + 0.5, G.y0 + 0.5, G.x1 - G.x0 - 1, G.slabH - 1);
    ctx.beginPath(); ctx.moveTo(G.xj + 0.5, G.y0); ctx.lineTo(G.xj + 0.5, G.y1); ctx.stroke();
    // contacts
    ctx.fillStyle = C.ink2; ctx.fillRect(G.cx0, G.y0 - 4, G.x0 - G.cx0, G.slabH + 8); ctx.fillRect(G.x1, G.y0 - 4, G.cx1 - G.x1, G.slabH + 8);

    // fixed ions: equal numbers of − (boron) and + (phosphorus), because the uncovered charge balances
    const rows = Math.max(3, Math.floor(G.slabH / 22));
    const cols = Math.max(1, Math.round((G.dr - G.dl) / 34));
    ctx.font = font(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const sideCols = (x0, x1) => { const n = Math.max(1, Math.min(cols, Math.floor((x1 - x0) / 9))); return Array.from({ length: n }, (_, k) => x0 + ((k + 0.5) * (x1 - x0)) / n); };
    const pc = sideCols(G.dl, G.xj); const nc = sideCols(G.xj, G.dr);
    const nIons = Math.min(pc.length, nc.length) * rows;
    const placeIons = (xs, sign, colour) => {
      ctx.fillStyle = colour; let k = 0;
      const perCol = Math.ceil(nIons / xs.length);
      for (const x of xs) for (let r = 0; r < perCol && k < nIons; r++, k++) ctx.fillText(sign, x, G.y0 + ((r + 0.5) * G.slabH) / perCol);
    };
    placeIons(pc, '−', C.h); placeIons(nc, '+', C.e);
    ctx.textBaseline = 'alphabetic';

    // majority carriers
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = C.h; for (const p of majH) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, 7); ctx.stroke(); }
    ctx.fillStyle = C.e; for (const p of majE) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, 7); ctx.fill(); }

    // photons (wavy amber streaks)
    ctx.strokeStyle = C.sun; ctx.lineWidth = 2;
    for (const ph of photons) {
      ctx.beginPath();
      for (let k = 0; k <= 14; k++) { const yy = ph.y - 24 + k * 2; const xx = ph.x + Math.sin(k * 1.2) * 3; if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    // flashes: generation (amber burst) and recombination (grey ring = heat)
    for (const f of flashes) {
      const r = 3 + f.t * 22; ctx.globalAlpha = Math.max(0, 1 - f.t / 0.6);
      ctx.strokeStyle = f.kind === 'gen' ? C.sun : C.ink2; ctx.lineWidth = f.kind === 'gen' ? 2 : 1.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // generated carriers (bigger, with a ring so they stand out from the majority)
    for (const c of carriers) drawCarrier(c.x, c.y, c.kind, 4.4, still);

    // field arrow and labels
    ctx.fillStyle = C.ink; ctx.font = font(G.narrow ? 11 : 12, 650); ctx.textAlign = 'left';
    ctx.fillText(G.narrow ? 'p-type (boron)' : 'p-type silicon (boron)', G.x0 + 8, G.y1 + 16);
    ctx.textAlign = 'right'; ctx.fillText(G.narrow ? 'n-type' : 'n-type (phosphorus)', G.x1 - 6, G.y1 + 16);
    // depletion bracket
    ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(G.dl, G.y1 + 3); ctx.lineTo(G.dl, G.y1 + 7); ctx.lineTo(G.dr, G.y1 + 7); ctx.lineTo(G.dr, G.y1 + 3); ctx.stroke();
    ctx.fillStyle = C.ink2; ctx.font = font(11, 600); ctx.textAlign = 'center';
    ctx.fillText('depletion region', Math.min(Math.max((G.dl + G.dr) / 2, G.x0 + 150), G.x1 - 100), G.y1 + 28);
    // the built-in field points from + (n) to − (p)
    const ay = G.y0 - 12; const ax0 = G.dr; const ax1 = Math.min(G.dl, G.dr - 34);
    ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1 + 4, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax1, ay); ctx.lineTo(ax1 + 7, ay - 4); ctx.lineTo(ax1 + 7, ay + 4); ctx.closePath(); ctx.fill();
    ctx.font = font(11, 650); ctx.textAlign = 'left'; ctx.fillText('field', ax0 + 5, ay + 4);

    drawBands(font, still);
  }

  function drawCarrier(x, y, kind, r, still, vx) {
    ctx.lineWidth = 2;
    if (kind === 'e') { ctx.fillStyle = C.e; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.strokeStyle = C.panel; ctx.lineWidth = 1.5; ctx.stroke(); }
    else { ctx.fillStyle = C.panel; ctx.strokeStyle = C.h; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); }
    if (still) {
      // with motion paused, an arrow shows where the carrier is heading
      const dir = kind === 'e' ? 1 : -1; const len = 11;
      ctx.strokeStyle = kind === 'e' ? C.e : C.h; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + dir * (r + 2), y); ctx.lineTo(x + dir * (r + 2 + len), y);
      ctx.lineTo(x + dir * (r + len - 2), y - 3); ctx.moveTo(x + dir * (r + 2 + len), y); ctx.lineTo(x + dir * (r + len - 2), y + 3); ctx.stroke();
    }
  }

  function drawBands(font) {
    const { x0, x1 } = G;
    ctx.fillStyle = C.ink2; ctx.font = font(11, 650); ctx.textAlign = 'left';
    ctx.fillText('Electron energy (band diagram)', x0, G.bandTop - 6);
    // bands
    const trace = (f) => { ctx.beginPath(); for (let x = x0; x <= x1; x += 2) { const y = ey(f(x)); if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); };
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; trace(ec); trace(ev);
    // quasi-Fermi levels
    const V = S.op.V;
    const efp = ev(x0) + S.jn0.evOffsetP_eV; const efn = efp + V;
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    ctx.strokeStyle = C.h; ctx.beginPath(); ctx.moveTo(x0, ey(efp)); ctx.lineTo(G.dr, ey(efp)); ctx.stroke();
    ctx.strokeStyle = C.e; ctx.beginPath(); ctx.moveTo(G.dl, ey(efn)); ctx.lineTo(x1, ey(efn)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = font(11, 600); ctx.fillStyle = C.ink2;
    ctx.textAlign = 'left'; ctx.fillText(G.narrow ? 'conduction band' : 'conduction band edge', x0 + 4, ey(ec(x0)) + 15);
    ctx.textAlign = 'right'; ctx.fillText(G.narrow ? 'valence band' : 'valence band edge', x1 - 4, ey(ev(x1)) + 17);
    ctx.textAlign = 'right';
    ctx.fillText(V > 0.02 ? 'electron level' : 'Fermi level', x1 - 14, ey(efn) + 14);
    if (V > 0.02) { ctx.textAlign = 'left'; ctx.fillText('hole level', x0 + 4, ey(efp) - 5); }
    // qV bracket in the depletion region, where both levels are drawn
    if (V > 0.02) {
      const bx = (G.dl + G.dr) / 2; ctx.strokeStyle = C.sunInk; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx, ey(efn)); ctx.lineTo(bx, ey(efp)); ctx.moveTo(bx - 4, ey(efn)); ctx.lineTo(bx + 4, ey(efn)); ctx.moveTo(bx - 4, ey(efp)); ctx.lineTo(bx + 4, ey(efp)); ctx.stroke();
      ctx.fillStyle = C.sunInk; ctx.textAlign = 'left'; ctx.font = font(12, 700);
      ctx.textAlign = 'right'; ctx.fillText(`qV = ${V.toFixed(2)} eV`, bx - 7, (ey(efn) + ey(efp)) / 2 + 4);
    }
    // barrier height marker at the right
    const s = Math.max(0, S.jn0.Vbi - V);
    const mx = x1 - 6;
    ctx.strokeStyle = C.ink2; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, ey(ec(x0))); ctx.lineTo(mx, ey(ec(x1))); ctx.moveTo(G.dr + 4, ey(ec(x0))); ctx.lineTo(x1, ey(ec(x0))); ctx.stroke();
    ctx.fillStyle = C.ink2; ctx.textAlign = 'right'; ctx.font = font(11, 600);
    // drawn after the riding carriers (below) so it stays legible
    // generated carriers ride the band edges: electrons roll down Ec, holes float up Ev
    for (const c of carriers) {
      const y = c.kind === 'e' ? ey(ec(c.x)) - 5 : ey(ev(c.x)) + 5;
      drawCarrier(c.x, y, c.kind, 3.6, false);
    }
    if (s > 0.12) {
      const txt = `barrier ${s.toFixed(2)} eV`; const ty = (ey(ec(x0)) + ey(ec(x1))) / 2 + 4;
      ctx.font = font(11, 600); const tw = ctx.measureText(txt).width;
      ctx.fillStyle = C.paper2; ctx.fillRect(mx - 8 - tw, ty - 11, tw + 6, 15);
      ctx.fillStyle = C.ink2; ctx.textAlign = 'right'; ctx.fillText(txt, mx - 5, ty);
    }
    for (const f of flashes) if (f.kind === 'gen' && f.t < 0.35) {
      ctx.strokeStyle = C.sun; ctx.lineWidth = 2; ctx.globalAlpha = 1 - f.t / 0.35;
      ctx.beginPath(); ctx.moveTo(f.x, ey(ev(f.x)) - 2); ctx.lineTo(f.x, ey(ec(f.x)) + 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  // ---------- mini I-V ----------
  let ivCtx = null; let IVG = null;
  const V_MAX = 0.8; const I_MAX = 12;
  function layoutIV() {
    const w = Math.max(220, ivCanvas.parentElement.clientWidth); const h = 200;
    ivCtx = fitCanvas(ivCanvas, w, h);
    IVG = { w, h, l: 44, r: w - 10, t: 10, b: h - 36 };
  }
  const ivx = (V) => IVG.l + (V / V_MAX) * (IVG.r - IVG.l);
  const ivy = (I) => IVG.b - (I / I_MAX) * (IVG.b - IVG.t);
  function drawIV() {
    if (!ivCtx) return;
    const c = ivCtx; const { w, h, l, r, t, b } = IVG;
    c.clearRect(0, 0, w, h);
    c.font = '500 11px "Atkinson Next", system-ui, sans-serif';
    c.strokeStyle = C.rule; c.lineWidth = 1; c.fillStyle = C.ink2;
    for (let I = 0; I <= I_MAX; I += 4) { c.beginPath(); c.moveTo(l, ivy(I) + 0.5); c.lineTo(r, ivy(I) + 0.5); c.stroke(); c.textAlign = 'right'; c.fillText(String(I), l - 6, ivy(I) + 4); }
    for (let V = 0; V <= V_MAX + 1e-9; V += 0.2) { c.textAlign = 'center'; c.fillText(V.toFixed(1), ivx(V), b + 15); }
    c.textAlign = 'center'; c.fillText('Voltage (V)', (l + r) / 2, h - 4);
    c.save(); c.translate(11, (t + b) / 2); c.rotate(-Math.PI / 2); c.fillText('Current (A)', 0, 0); c.restore();
    if (S.suns <= 0) return;
    // power rectangle at the operating point
    c.fillStyle = C.sun; c.globalAlpha = 0.22; c.fillRect(l, ivy(S.op.I), ivx(S.op.V) - l, b - ivy(S.op.I)); c.globalAlpha = 1;
    // load line V = I·R
    if (S.R > 0 && Number.isFinite(S.R)) {
      c.strokeStyle = C.ink2; c.lineWidth = 1; c.beginPath(); c.moveTo(l, b);
      const Vend = Math.min(V_MAX, I_MAX * S.R); c.lineTo(ivx(Vend), ivy(Vend / S.R)); c.stroke();
    }
    // curve
    c.strokeStyle = C.silicon; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath();
    const N = 80;
    for (let k = 0; k <= N; k++) { const V = (S.voc * k) / N; const I = Math.max(0, diodeCurrent(V, S.cell)); if (k) c.lineTo(ivx(V), ivy(I)); else c.moveTo(ivx(V), ivy(I)); }
    c.stroke();
    // MPP ring and operating point
    c.strokeStyle = C.silicon; c.lineWidth = 2; c.beginPath(); c.arc(ivx(S.mpp.V), ivy(S.mpp.I), 7, 0, 7); c.stroke();
    c.fillStyle = C.sun; c.strokeStyle = C.panel; c.lineWidth = 2; c.beginPath(); c.arc(ivx(S.op.V), ivy(S.op.I), 5, 0, 7); c.fill(); c.stroke();
    c.fillStyle = C.ink2; c.textAlign = 'left';
    const mx = ivx(S.mpp.V); const my = ivy(S.mpp.I);
    c.fillText('MPP', Math.min(mx + 9, r - 26), my - 9);
  }
  // choosing a point by dragging on the chart sets the load resistance R = V / I
  let dragging = false;
  const pick = (ev) => {
    const rect = ivCanvas.getBoundingClientRect();
    const V = Math.max(0, Math.min(S.voc, ((ev.clientX - rect.left - IVG.l) / (IVG.r - IVG.l)) * V_MAX));
    const I = Math.max(0, diodeCurrent(V, S.cell));
    ui.load.value = String(V <= 1e-4 ? 0 : I <= 1e-4 ? 100 : rToSlider(V / I));
    recompute();
  };
  ivCanvas.addEventListener('pointerdown', (ev) => { if (S.suns <= 0) return; dragging = true; ivCanvas.setPointerCapture(ev.pointerId); pick(ev); });
  ivCanvas.addEventListener('pointermove', (ev) => { if (dragging) pick(ev); });
  ivCanvas.addEventListener('pointerup', () => { dragging = false; });

  // ---------- controls ----------
  for (const el of [ui.light, ui.load, ui.na, ui.nd]) el.addEventListener('input', () => { recompute(); placeDepletion(); if (paused) drawScene(true); });
  document.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.load;
    ui.load.value = String(k === 'short' ? 0 : k === 'open' ? 100 : rToSlider(S.mpp.V / Math.max(1e-9, S.mpp.I)));
    recompute(); placeDepletion(); if (paused) drawScene(true);
  }));

  let paused = reducedMotion();
  let loop = null;
  const setPaused = (p) => {
    paused = p; ui.toggle.textContent = p ? 'Play' : 'Pause';
    if (p) { loop?.stop(); loop = null; drawScene(true); }
    else if (!loop) loop = animate(canvas, (dt) => { step(dt); drawScene(false); });
  };
  ui.toggle.addEventListener('click', () => setPaused(!paused));
  ui.step.addEventListener('click', () => { if (!paused) setPaused(true); for (let k = 0; k < 12; k++) step(1 / 40); drawScene(true); });

  // ---------- boot ----------
  readColours();
  ui.load.value = String(rToSlider(0.065));
  S.jn = junction(S.Na, S.Nd); S.jn0 = S.jn;
  layout(); layoutIV();
  recompute(); placeDepletion();
  seedMajority();
  for (let k = 0; k < 120; k++) step(1 / 40); // pre-warm so the still frame has carriers in flight
  onTheme(() => { readColours(); drawScene(paused); drawIV(); });
  let lastW = 0;
  new ResizeObserver(() => {
    const w = canvas.parentElement.clientWidth; if (Math.abs(w - lastW) < 2) return; lastW = w;
    layout(); layoutIV(); seedMajority(); carriers = []; photons = [];
    for (let k = 0; k < 80; k++) step(1 / 40);
    drawScene(paused); drawIV();
  }).observe(canvas.parentElement);
  setPaused(paused);
}
