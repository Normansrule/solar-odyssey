// Geothermal page: share figure and the animated production / plant / reinjection loop.
import { mountShare, stage, ink, label, bindRange, segmented, setText, fmt, along, pipe, reducedMotion } from './renewables-a-common.js';
import { carnotEfficiency, heatFlow } from '../assets/js/physics/renewables.js';
import { streamEfficiencyLimit } from '../assets/js/physics/fluids.js';

const $ = (id) => document.getElementById(id);
mountShare(document.querySelector('.today-figure'), { source: 'other_renewable_exc_biofuel', noun: 'geothermal, tidal and wave', leaders: 3 });

const FLASH_MIN_C = 182; // DOE: flash plants need fluid hotter than about 182 °C
const COND_C = 40;
const K = 273.15;
const st = { tRes: 250, tOut: 80, mdot: 100, eta: 0.12, plant: 'flash', t: 0 };
const N = 60; const parts = Array.from({ length: N }, () => Math.random());

function layout(w, h) {
  const y0 = h * (w < 520 ? 0.46 : 0.42); // ground surface
  const xp = w * 0.12; const xr = w * 0.9;
  const resTop = h * 0.8; const resY = h * 0.88;
  const flash = st.plant === 'flash';
  const hx = { x: w * 0.2, y: h * 0.14, w: w * 0.08, h: h * 0.2 }; // separator or heat exchanger
  const turb = { x: w * 0.38, y: h * 0.12, w: w * 0.1, h: h * 0.1 };
  const gen = { x: w * 0.5, y: h * 0.13, w: w * 0.08, h: h * 0.08 };
  const cond = { x: w * 0.38, y: h * 0.25, w: w * 0.12, h: h * 0.08 };
  const tower = { x: w * 0.62, y: h * 0.15, w: w * 0.13, h: y0 - h * 0.15 };
  return {
    y0, xp, xr, resTop, resY, flash, hx, turb, gen, cond, tower,
    up: [[xp, resY], [xp, y0], [xp, hx.y + hx.h * 0.75], [hx.x, hx.y + hx.h * 0.75]],
    steam: flash
      ? [[hx.x + hx.w / 2, hx.y], [hx.x + hx.w / 2, turb.y + turb.h / 2 - h * 0.08], [turb.x, turb.y + turb.h / 2 - h * 0.08], [turb.x, turb.y + turb.h / 2]]
      : [[hx.x + hx.w, hx.y + hx.h * 0.25], [turb.x, hx.y + hx.h * 0.25], [turb.x, turb.y + turb.h / 2]],
    exhaust: [[turb.x + turb.w / 2, turb.y + turb.h], [turb.x + turb.w / 2, cond.y]],
    loopBack: [[cond.x, cond.y + cond.h / 2], [hx.x + hx.w + w * 0.03, cond.y + cond.h / 2], [hx.x + hx.w + w * 0.03, hx.y + hx.h * 0.8], [hx.x + hx.w, hx.y + hx.h * 0.8]],
    brine: [[hx.x + hx.w / 2, hx.y + hx.h], [hx.x + hx.w / 2, y0 + h * 0.035], [xr, y0 + h * 0.035]],
    down: [[xr, y0], [xr, resY]],
    res: [[xr, resY], [w * 0.5, resY + h * 0.03], [xp, resY]],
    toTower: [[cond.x + cond.w, cond.y + cond.h / 2], [tower.x + tower.w * 0.2, cond.y + cond.h / 2]],
  };
}

function lerpColor(ctx, a, b, f) { ctx.fillStyle = f < 0.5 ? a : b; ctx.globalAlpha = 0.45 + 0.5 * Math.abs(f - 0.5); }

function draw(ctx, w, h, dt) {
  const c = ink();
  const L = layout(w, h);
  if (dt) { st.t += dt; for (let i = 0; i < N; i++) parts[i] = (parts[i] + dt * 0.09) % 1; }
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = c.paper2; ctx.fillRect(0, 0, w, h);
  // ground: warmer with depth
  for (let i = 0; i < 6; i++) {
    const y = L.y0 + ((h - L.y0) * i) / 6;
    ctx.fillStyle = c.rule; ctx.globalAlpha = 1; ctx.fillRect(0, y, w, (h - L.y0) / 6 + 1);
    ctx.fillStyle = c.geo; ctx.globalAlpha = 0.04 + 0.06 * i; ctx.fillRect(0, y, w, (h - L.y0) / 6 + 1);
  }
  ctx.globalAlpha = 1;
  // reservoir
  ctx.fillStyle = c.geo; ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.ellipse(w * 0.51, L.resY, w * 0.46, h * 0.07, 0, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1;
  // crack pattern in reservoir
  ctx.strokeStyle = c.geo; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
  for (let i = 0; i < 14; i++) { const x = w * (0.12 + i * 0.056); ctx.beginPath(); ctx.moveTo(x, L.resY - h * 0.04); ctx.lineTo(x + 8, L.resY); ctx.lineTo(x - 4, L.resY + h * 0.04); ctx.stroke(); }
  ctx.globalAlpha = 1;
  label(ctx, `hot reservoir, ${st.tRes} °C`, w * 0.5, L.resY - h * 0.09, { color: c.ink, size: 13, weight: 700, align: 'center', halo: c.rule });
  label(ctx, 'cap rock', w * 0.5, L.y0 + h * 0.12, { color: c.ink2, size: 12, align: 'center', halo: c.rule });
  // wells
  for (const [x, col] of [[L.xp, c.geo], [L.xr, c.hydro]]) {
    ctx.strokeStyle = c.ink; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x, L.y0); ctx.lineTo(x, L.resY); ctx.stroke();
    ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, L.y0); ctx.lineTo(x, L.resY); ctx.stroke(); ctx.globalAlpha = 1;
  }
  label(ctx, 'production well', L.xp + 10, L.y0 + h * 0.2, { color: c.ink, size: 12, halo: c.rule });
  label(ctx, 'reinjection well', L.xr - 10, L.y0 + h * 0.2, { color: c.ink, size: 12, align: 'right', halo: c.rule });
  // surface line
  ctx.strokeStyle = c.ink2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, L.y0); ctx.lineTo(w, L.y0); ctx.stroke();

  // pipes
  const hot = { outer: c.ink, inner: c.panel, width: 8 };
  pipe(ctx, L.up.slice(1), hot);
  pipe(ctx, L.brine, hot);
  pipe(ctx, L.steam, hot);
  pipe(ctx, L.exhaust, hot);
  if (!L.flash) pipe(ctx, L.loopBack, { outer: c.storage, inner: c.panel, width: 8 });
  if (L.flash) pipe(ctx, L.toTower, hot);

  // components
  const box = (b, fill) => { ctx.fillStyle = fill; ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h); };
  if (L.flash) {
    ctx.fillStyle = c.panel; ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
    const r = L.hx.w / 2; ctx.beginPath(); ctx.roundRect(L.hx.x, L.hx.y, L.hx.w, L.hx.h, r); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c.geo; ctx.globalAlpha = 0.3; ctx.fillRect(L.hx.x + 2, L.hx.y + L.hx.h * 0.6, L.hx.w - 4, L.hx.h * 0.4 - r * 0.6); ctx.globalAlpha = 1;
    label(ctx, 'separator', L.hx.x + L.hx.w / 2, L.hx.y - 12, { color: c.ink, size: 12, align: 'center', halo: c.paper2 });
  } else {
    box(L.hx, c.panel);
    ctx.strokeStyle = c.storage; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 8; i++) { const x = L.hx.x + L.hx.w * (0.15 + (0.7 * (i % 2))); const y = L.hx.y + L.hx.h * (0.1 + 0.8 * i / 8); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
    label(ctx, 'heat exchanger', L.hx.x + L.hx.w / 2, L.hx.y - 12, { color: c.ink, size: 12, align: 'center', halo: c.paper2 });
  }
  // turbine (expanding trapezoid)
  ctx.fillStyle = c.panel; ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(L.turb.x, L.turb.y + L.turb.h * 0.3); ctx.lineTo(L.turb.x + L.turb.w, L.turb.y); ctx.lineTo(L.turb.x + L.turb.w, L.turb.y + L.turb.h); ctx.lineTo(L.turb.x, L.turb.y + L.turb.h * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
  label(ctx, 'turbine', L.turb.x + L.turb.w / 2 + (w < 520 ? -6 : 0), w < 520 ? L.turb.y - 22 : L.turb.y - 10, { color: c.ink, size: 12, align: 'center', halo: c.paper2 });
  ctx.strokeStyle = c.ink2; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L.turb.x + L.turb.w, L.turb.y + L.turb.h / 2); ctx.lineTo(L.gen.x, L.turb.y + L.turb.h / 2); ctx.stroke();
  box(L.gen, c.sun);
  label(ctx, 'generator', L.gen.x + L.gen.w / 2, w < 520 ? L.gen.y + L.gen.h + 10 : L.gen.y - 10, { color: c.ink, size: 12, align: 'center', halo: c.paper2 });
  box(L.cond, c.panel);
  label(ctx, L.flash ? `condenser ~${COND_C} °C` : `air-cooled condenser ~${COND_C} °C`, L.cond.x + L.cond.w / 2, L.cond.y + L.cond.h + 12, { color: c.ink, size: 12, align: 'center', halo: c.paper2 });
  if (L.flash) {
    // cooling tower with a plume
    const T = L.tower; ctx.fillStyle = c.panel; ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(T.x, T.y + T.h); ctx.quadraticCurveTo(T.x + T.w * 0.3, T.y + T.h * 0.5, T.x + T.w * 0.15, T.y);
    ctx.lineTo(T.x + T.w * 0.85, T.y); ctx.quadraticCurveTo(T.x + T.w * 0.7, T.y + T.h * 0.5, T.x + T.w, T.y + T.h); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c.ink2;
    for (let i = 0; i < 6; i++) { const f = (st.t * 0.15 + i / 6) % 1; ctx.globalAlpha = 0.25 * (1 - f); ctx.beginPath(); ctx.arc(T.x + T.w / 2 + Math.sin(i * 2 + st.t) * 6, T.y - f * h * 0.08, 6 + f * 12, 0, 2 * Math.PI); ctx.fill(); }
    ctx.globalAlpha = 1;
    label(ctx, 'cooling tower', T.x + T.w / 2, T.y + T.h * 0.6, { color: c.ink, size: 12, align: 'center', halo: c.panel });
  } else {
    // fans on the air-cooled condenser
    for (let k = 0; k < 2; k++) {
      const fx = L.cond.x + L.cond.w * (0.3 + 0.4 * k); const fy = L.cond.y + L.cond.h / 2;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(st.t * 4); ctx.strokeStyle = c.ink2; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke(); ctx.restore();
    }
    label(ctx, 'working fluid loop (low boiling point)', L.hx.x + L.hx.w + w * 0.05, L.cond.y + L.cond.h * 1.9, { color: c.storage, size: 11, halo: c.paper2 });
  }

  // particles
  const dot = (p, col, r = 2.4, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1; };
  parts.forEach((f, i) => {
    dot(along(L.up, f), c.geo);
    dot(along(L.down, f), c.hydro);
    const pr = along(L.res, f); lerpColor(ctx, c.hydro, c.geo, f); ctx.beginPath(); ctx.arc(pr[0], pr[1] + ((i * 37) % 11) - 5, 2, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1;
    if (i % 2 === 0) dot(along(L.brine, f), c.hydro, 2.2, 0.8);
    if (L.flash) { if (i % 2) dot(along(L.steam, f), c.ink2, 2.6, 0.6); if (i % 3 === 0) dot(along(L.exhaust, f), c.ink2, 2, 0.5); }
    else if (i % 2) { const loop = [...L.steam, ...L.exhaust, [L.cond.x + L.cond.w / 2, L.cond.y + L.cond.h / 2], ...L.loopBack]; dot(along(loop, f), c.storage, 2.4, 0.9); }
  });
  // temperature tags
  label(ctx, `${st.tRes} °C`, L.xp + 10, L.y0 - h * 0.035, { color: c.geo, size: 13, weight: 700, halo: c.paper2 });
  label(ctx, `${st.tOut} °C`, L.xr - 10, L.y0 - h * 0.035, { color: c.hydro, size: 13, weight: 700, align: 'right', halo: c.paper2 });
}

const geoStage = stage($('geo-canvas'), draw, { playButton: $('geo-play') });
const plantSeg = segmented($('plant'), (v) => { st.plant = v; update(); });

function bar(id, v, vmax = 0.5) { $(id).style.width = `${Math.max(0, Math.min(1, v / vmax)) * 100}%`; }
function update() {
  const flashBtn = $('plant').querySelector('button[value="flash"]');
  const flashOk = st.tRes >= FLASH_MIN_C;
  flashBtn.disabled = !flashOk;
  if (!flashOk && st.plant === 'flash') { plantSeg.pick('binary', false); st.plant = 'binary'; }
  const th = st.tRes + K; const tout = Math.min(st.tOut, st.tRes - 5) + K; const tc = COND_C + K;
  const carnot = carnotEfficiency(th, tc);
  const stream = streamEfficiencyLimit(th, tout, tc);
  const q = heatFlow(st.mdot, 4200, th - tout);
  setText('o-q', `${fmt(q / 1e6, 3)} MW`);
  setText('o-p', `${fmt((q * st.eta) / 1e6, 3)} MW`);
  setText('v-carnot', `${(carnot * 100).toFixed(0)} %`); bar('b-carnot', carnot);
  setText('v-stream', `${(stream * 100).toFixed(0)} %`); bar('b-stream', stream);
  setText('v-real', `${(st.eta * 100).toFixed(1).replace('.0', '')} %`); bar('b-real', st.eta);
  let msg;
  if (st.tOut >= st.tRes - 5) msg = 'The water must come back cooler than it went in, or no heat is taken from the rock. Lower the return temperature.';
  else if (st.eta > stream && st.eta <= carnot) msg = 'That efficiency is below the Carnot ceiling but above what a cooling stream of brine can reach: no real plant could do it.';
  else if (st.eta > carnot) msg = 'That efficiency is above the Carnot ceiling for these temperatures: impossible for any heat engine.';
  else if (!flashOk) msg = `Below about ${FLASH_MIN_C} °C there is too little pressure to flash the water to steam, so a binary plant is used.`;
  else if (st.plant === 'flash') msg = `Flash: the pressure drops in the separator, part of the ${st.tRes} °C water boils to steam for the turbine, and the leftover brine goes straight back down. ${fmt((q * (1 - st.eta)) / 1e6, 3)} MW of heat leaves through the cooling tower and reinjected water.`;
  else msg = `Binary: the brine heats a second fluid that boils at a low temperature; that fluid's vapour spins the turbine in a sealed loop. The brine never touches the turbine.`;
  setText('g-status', msg);
  if (!geoStage.isPlaying()) geoStage.redraw(0);
}
bindRange($('g-t'), $('g-t-out'), (v) => `${v} °C`, (v) => { st.tRes = v; update(); });
bindRange($('g-out'), $('g-out-out'), (v) => `${v} °C`, (v) => { st.tOut = v; update(); });
bindRange($('g-m'), $('g-m-out'), (v) => `${v} kg/s`, (v) => { st.mdot = v; update(); });
bindRange($('g-eta'), $('g-eta-out'), (v) => `${v} %`, (v) => { st.eta = v / 100; update(); });
if (reducedMotion()) geoStage.redraw(0);
