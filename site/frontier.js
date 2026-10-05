// The frontier: tandem designer (spectrum split, current matching, efficiency curve) driven by
// physics/tandem.js, and the "how far from the ceiling" table built from efficiency-records.json.
import { h, clear, fitCanvas, cssVar, onTheme, fmt } from './assets/js/dom.js';
import { loadData, setBadge, is } from './assets/js/data.js';
import { tandemLimit, tandemSweep, singleJunction, optimumTopGap, sunSpectrumEV } from './assets/js/physics/tandem.js';
import { sqCurve } from './assets/js/physics/pv.js';

const $ = (id) => document.getElementById(id);
const SI = 1.12;
const E_MIN = 0.3; const E_MAX = 4.0; // eV range drawn

if ($('fr-spectrum')) initDesigner();
if ($('fr-limits')) initLimits();

function initDesigner() {
  const ui = {
    top: $('fr-top'), bottom: $('fr-bottom'), topOut: $('fr-top-out'), bottomOut: $('fr-bottom-out'),
    eff: $('fr-eff'), single: $('fr-single'), sq: $('fr-sq'), limit: $('fr-limit'),
    jt: $('fr-jt'), jb: $('fr-jb'), v: $('fr-v'), fourT: $('fr-4t'), summary: $('fr-summary'),
    barTop: $('fr-bar-top'), barBottom: $('fr-bar-bottom'), barStack: $('fr-bar-stack'),
  };
  const spec = $('fr-spectrum'); const curve = $('fr-curve');
  const SQ_BEST = Math.max(...sqCurve(0.8, 2.0, 0.01).map((p) => p.efficiency));
  // spectrum samples (W/m²/eV), computed once
  const N = 360;
  const samples = Array.from({ length: N + 1 }, (_, i) => { const E = E_MIN + ((E_MAX - E_MIN) * i) / N; return { E, P: sunSpectrumEV(E) }; });
  const pMax = Math.max(...samples.map((s) => s.P));
  let sweepCache = { bottom: null, data: null };
  let S = null;

  const expert = () => document.documentElement.dataset.depth === 'expert';
  const bottomGap = () => (expert() ? Number(ui.bottom.value) : SI);

  function compute() {
    const bottom = bottomGap();
    let top = Number(ui.top.value);
    if (top <= bottom + 0.02) { top = Math.min(2.4, bottom + 0.05); ui.top.value = top.toFixed(2); }
    const r = tandemLimit(top, bottom);
    const single = singleJunction(bottom).efficiency;
    if (sweepCache.bottom !== bottom) {
      sweepCache = { bottom, data: tandemSweep(bottom, { from: Math.max(1.3, bottom + 0.06), to: 2.4, step: 0.02 }) };
    }
    S = { top, bottom, r, single };
    write(); drawSpectrum(); drawCurve();
  }

  const pct = (x) => `${(100 * x).toFixed(1)} %`;
  function write() {
    const { top, bottom, r, single } = S;
    ui.topOut.textContent = `${top.toFixed(2)} eV`;
    ui.bottomOut.textContent = `${bottom.toFixed(2)} eV${Math.abs(bottom - SI) < 0.005 ? ' (silicon)' : ''}`;
    ui.eff.textContent = pct(r.efficiency);
    ui.single.textContent = pct(single);
    ui.sq.textContent = pct(SQ_BEST);
    const balanced = Math.abs(r.mismatch) < 0.03;
    ui.limit.textContent = balanced ? 'both (matched)' : r.limitedBy === 'top' ? 'top cell' : 'bottom cell';
    ui.jt.textContent = `${(r.top.Jsc / 10).toFixed(1)} mA/cm²`;
    ui.jb.textContent = `${(r.bottom.Jsc / 10).toFixed(1)} mA/cm²`;
    ui.v.textContent = `${r.V.toFixed(2)} V`;
    ui.fourT.textContent = pct(r.fourTerminal);
    const jmax = Math.max(r.top.Jsc, r.bottom.Jsc, 1);
    ui.barTop.style.width = `${(100 * r.top.Jsc) / jmax}%`;
    ui.barBottom.style.width = `${(100 * r.bottom.Jsc) / jmax}%`;
    ui.barStack.style.width = `${(100 * r.J) / jmax}%`;
    const gain = r.efficiency - single;
    const who = r.limitedBy === 'top' ? 'The top cell is starved: its gap is so wide that it lets most light through, so it makes less current than the bottom cell.'
      : 'The bottom cell is starved: the top cell takes so much light that too little reaches the bottom one.';
    ui.summary.textContent = `${balanced ? 'The two currents match, so neither cell holds the other back.' : who} `
      + `The stack reaches ${pct(r.efficiency)}, ${gain >= 0 ? `${(100 * gain).toFixed(1)} points more` : `${(-100 * gain).toFixed(1)} points less`} than the bottom cell alone (${pct(single)}).`;
    spec.setAttribute('aria-label', `Sunlight spectrum split at ${top.toFixed(2)} eV and ${bottom.toFixed(2)} eV: the top cell absorbs photons above ${top.toFixed(2)} eV, the bottom cell photons between the two gaps, and photons below ${bottom.toFixed(2)} eV pass through.`);
  }

  // ---------- spectrum: energy on x, power per eV on y; bands split at the two gaps ----------
  function drawSpectrum() {
    const w = spec.clientWidth; const hgt = Math.round(Math.min(260, Math.max(190, w * 0.42)));
    spec.style.height = `${hgt}px`;
    const ctx = fitCanvas(spec, w, hgt);
    const c = { ink: cssVar('--ink'), ink2: cssVar('--ink-2'), rule: cssVar('--rule'), top: cssVar('--t-perovskite'), bottom: cssVar('--t-silicon'), heat: cssVar('--hole'), lost: cssVar('--rule'), paper: cssVar('--paper-2') };
    const pad = { l: 12, r: 12, t: 26, b: 34 };
    const X = (E) => pad.l + ((E - E_MIN) / (E_MAX - E_MIN)) * (w - pad.l - pad.r);
    const Y = (P) => hgt - pad.b - (P / pMax) * (hgt - pad.t - pad.b) * 0.95;
    ctx.clearRect(0, 0, w, hgt);
    const { top, bottom } = S;
    // for each sample: total P; for absorbed photons the kept fraction is gap/E (each photon keeps the gap energy)
    // fill three regions as paths: lost (below bottom gap), bottom cell and top cell; each absorbed
    // region splits into what the cell keeps (gap/E of each photon's energy) and heat (the rest)
    const at = (E) => ({ E, P: sunSpectrumEV(E) });
    const region = (lo, hi) => [at(lo), ...samples.filter((s) => s.E > lo && s.E < hi), at(hi)];
    const fillBetween = (pts, upper, lower, colour, alpha = 1) => {
      if (pts.length < 2) return;
      ctx.globalAlpha = alpha; ctx.fillStyle = colour; ctx.beginPath();
      pts.forEach((s, i) => (i ? ctx.lineTo(X(s.E), Y(upper(s))) : ctx.moveTo(X(s.E), Y(upper(s)))));
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(X(pts[i].E), Y(lower(pts[i])));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    };
    const lostPts = region(E_MIN, bottom);
    fillBetween(lostPts, (s) => s.P, () => 0, c.lost);
    for (const [lo, hi, col] of [[bottom, top, c.bottom], [top, E_MAX, c.top]]) {
      const pts = region(lo, hi);
      const kept = (s) => s.P * (lo / s.E);
      fillBetween(pts, kept, () => 0, col);
      fillBetween(pts, (s) => s.P, kept, c.heat, 0.3);
    }
    // outline
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1.2; ctx.beginPath();
    samples.forEach((s, i) => (i ? ctx.lineTo(X(s.E), Y(s.P)) : ctx.moveTo(X(s.E), Y(s.P))));
    ctx.stroke();
    // axis
    ctx.strokeStyle = c.rule; ctx.beginPath(); ctx.moveTo(pad.l, Y(0) + 0.5); ctx.lineTo(w - pad.r, Y(0) + 0.5); ctx.stroke();
    ctx.fillStyle = c.ink2; ctx.font = '12px "Atkinson Next", system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let E = 0.5; E <= E_MAX + 1e-9; E += 0.5) {
      ctx.fillText(E.toFixed(1), X(E), Y(0) + 15);
      ctx.fillRect(X(E) - 0.5, Y(0), 1, 4);
    }
    ctx.fillText(w < 520 ? 'Photon energy (eV)' : 'Photon energy (eV): red and infrared on the left, blue and violet on the right', w / 2, hgt - 4);
    // gap markers with labels
    const marker = (E, label, col, align) => {
      const x = X(E);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, pad.t - 6); ctx.lineTo(x, Y(0)); ctx.stroke();
      ctx.fillStyle = c.ink; ctx.font = '600 12px "Atkinson Next", system-ui, sans-serif';
      ctx.textAlign = align;
      ctx.fillText(label, x + (align === 'left' ? 5 : -5), pad.t - 10);
    };
    // bottom label to the left of its line, top label to the right, so they never collide
    const short = w < 520;
    marker(bottom, short ? `${bottom.toFixed(2)}` : `bottom ${bottom.toFixed(2)} eV`, c.bottom, X(bottom) > (short ? 40 : 120) ? 'right' : 'left');
    marker(top, short ? `${top.toFixed(2)} eV` : `top ${top.toFixed(2)} eV`, c.top, X(top) > w - 100 ? 'right' : 'left');
  }

  // ---------- efficiency against top gap ----------
  function drawCurve() {
    const w = curve.clientWidth; const hgt = Math.round(Math.min(240, Math.max(180, w * 0.38)));
    curve.style.height = `${hgt}px`;
    const ctx = fitCanvas(curve, w, hgt);
    const c = { ink: cssVar('--ink'), ink2: cssVar('--ink-2'), rule: cssVar('--rule'), line: cssVar('--t-tandem'), sq: cssVar('--ink-2'), dot: cssVar('--t-perovskite'), panel: cssVar('--panel') };
    const pad = { l: 40, r: 14, t: 16, b: 34 };
    const g0 = 1.3; const g1 = 2.4; const e0 = 0.1; const e1 = 0.45;
    const X = (g) => pad.l + ((g - g0) / (g1 - g0)) * (w - pad.l - pad.r);
    const Y = (e) => hgt - pad.b - ((e - e0) / (e1 - e0)) * (hgt - pad.t - pad.b);
    ctx.clearRect(0, 0, w, hgt);
    ctx.font = '12px "Atkinson Next", system-ui, sans-serif'; ctx.fillStyle = c.ink2;
    ctx.strokeStyle = c.rule; ctx.lineWidth = 1;
    for (let e = 0.1; e <= 0.45 + 1e-9; e += 0.05) {
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(pad.l, Math.round(Y(e)) + 0.5); ctx.lineTo(w - pad.r, Math.round(Y(e)) + 0.5); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.textAlign = 'right'; ctx.fillText(`${Math.round(e * 100)} %`, pad.l - 6, Y(e) + 4);
    }
    ctx.textAlign = 'center';
    for (let g = 1.4; g <= 2.4 + 1e-9; g += 0.2) ctx.fillText(g.toFixed(1), X(g), hgt - pad.b + 16);
    ctx.fillText('Top cell band gap (eV)', (pad.l + w - pad.r) / 2, hgt - 4);
    // single-junction best
    ctx.setLineDash([2, 4]); ctx.strokeStyle = c.sq; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(SQ_BEST)); ctx.lineTo(w - pad.r, Y(SQ_BEST)); ctx.stroke(); ctx.setLineDash([]);
    // key for the dotted line in the empty top-left corner (the curve never reaches it)
    ctx.fillStyle = c.ink2; ctx.textAlign = 'left'; ctx.fillText(`dotted: best single cell ${(SQ_BEST * 100).toFixed(1)} %`, pad.l + 6, pad.t + 4);
    // tandem curve
    ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t - 4, w - pad.l - pad.r, hgt - pad.t - pad.b + 4); ctx.clip();
    ctx.strokeStyle = c.line; ctx.lineWidth = 2.2; ctx.beginPath();
    sweepCache.data.forEach((p, i) => (i ? ctx.lineTo(X(p.gap), Y(p.efficiency)) : ctx.moveTo(X(p.gap), Y(p.efficiency))));
    ctx.stroke(); ctx.restore();
    // current point
    const x = X(S.top); const y = Y(S.r.efficiency);
    ctx.fillStyle = c.dot; ctx.strokeStyle = c.panel; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, Math.max(pad.t, y), 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c.ink; ctx.font = '600 12px "Atkinson Next", system-ui, sans-serif';
    // label on the side away from the curve: the curve rises left of the optimum and falls right of it
    const peakGap = sweepCache.data.reduce((a, b) => (b.efficiency > a.efficiency ? b : a)).gap;
    const leftOfPeak = S.top < peakGap;
    // below the point, on the side where the curve is higher, so the text sits in empty space under it
    ctx.textAlign = leftOfPeak ? 'left' : 'right';
    ctx.fillText(`stack ${(S.r.efficiency * 100).toFixed(1)} %`, x + (leftOfPeak ? 10 : -10), Math.min(hgt - pad.b - 6, y + 22));
  }

  ui.top.addEventListener('input', compute);
  ui.bottom.addEventListener('input', compute);
  $('fr-best').addEventListener('click', () => { ui.top.value = optimumTopGap(bottomGap()).gap.toFixed(2); compute(); });
  $('fr-mapi').addEventListener('click', () => { ui.top.value = '1.62'; compute(); });
  document.addEventListener('so:depth', () => { if (!expert()) ui.bottom.value = String(SI); compute(); });
  onTheme(() => { if (S) { drawSpectrum(); drawCurve(); } });
  new ResizeObserver(() => { if (S) { drawSpectrum(); drawCurve(); } }).observe(spec);
  compute();
}

// ---------- limits table ----------
async function initLimits() {
  const valid = (d) => is.obj(d) && is.obj(d.data) && is.arr(d.data.points) && is.arr(d.data.series);
  try {
    const { data, state } = await loadData('efficiency-records.json', valid);
    setBadge($('fr-badge'), state, 'efficiency-records.json');
    const best = (id) => data.data.points.filter((p) => p.tech === id).sort((a, b) => b.efficiency - a.efficiency)[0];
    const rows = [
      { what: 'Silicon cell', limit: 'about 29.4 % (silicon’s own losses)', lim: 29.4, rec: best('si-mono') },
      { what: 'Perovskite cell (one junction)', limit: 'about 33 % (any single junction)', lim: 33.16, rec: best('perovskite') },
      { what: 'Perovskite on silicon (two junctions)', limit: 'about 42 % (two junctions, one sun)', lim: 42, rec: best('perovskite-si') },
      { what: 'Many junctions, one sun', limit: 'about 68 % (infinite stack)', lim: 68, rec: best('iii-v-1sun') },
      { what: 'Many junctions, concentrated light', limit: 'about 86 % (infinite stack)', lim: 86, rec: best('iii-v-conc') },
    ];
    const table = h('table', {},
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Kind of cell'), h('th', { scope: 'col' }, 'Physical ceiling'), h('th', { scope: 'col', class: 'num' }, 'Best so far'), h('th', { scope: 'col', class: 'num' }, 'Share of ceiling'))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        h('th', { scope: 'row' }, r.what), h('td', {}, r.limit),
        h('td', { class: 'num' }, `${r.rec.efficiency} %`, h('br'), h('span', { class: 'muted fr-who' }, `${r.rec.institution}, ${r.rec.year}${r.rec.suns ? `, ${r.rec.suns} suns` : ''}`)),
        h('td', { class: 'num' }, `${fmt((100 * r.rec.efficiency) / r.lim, 2)} %`)))));
    clear($('fr-limits')).append(table);
  } catch (e) {
    console.error(e); setBadge($('fr-badge'), 'failed');
    clear($('fr-limits')).append(h('p', {}, 'The records could not be loaded.'));
  }
}
