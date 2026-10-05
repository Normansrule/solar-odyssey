// The band gap: a band-gap slider splits the blackbody solar spectrum into
// "not absorbed", "lost as heat" and "usable", beside the Shockley–Queisser curve.

import { h, clear, fmt, cssVar, onTheme, fitCanvas, esc } from '../assets/js/dom.js';
import { loadData, setBadge, is } from '../assets/js/data.js';
import { makeChart, baseOption } from '../assets/js/charts.js';
import { cutoffWavelengthNm, shockleyQueisser, sqCurve, spectrumBudget } from '../assets/js/physics/pv.js';
import { spectrumSplit, sqPeak } from '../assets/js/physics/photons.js';

const $ = (id) => document.getElementById(id);
const canvas = $('bg-spectrum');
if (canvas) init();

function init() {
  const E_MIN = 0; const E_MAX = 4;
  const st = { gap: 1.12, materials: [], col: {}, ctx: null, w: 0, hgt: 0, plot: null, chart: null };
  const curve = sqCurve(0.5, 3, 0.02);
  const peak = sqPeak();
  const familyVar = { silicon: '--t-silicon', thinfilm: '--t-thinfilm', perovskite: '--t-perovskite', multijunction: '--t-multijunction', emerging: '--t-emerging', tandem: '--t-tandem' };

  // spectrum peak value (for the y scale), computed once
  const sample = spectrumSplit(0.5, { from: 0.02, to: E_MAX, n: 400 });
  const yMax = Math.max(...sample.map((p) => p.total)) * 1.12;

  function readColours() {
    st.col = {
      ink: cssVar('--ink'), ink2: cssVar('--ink-2'), rule: cssVar('--rule'), panel: cssVar('--panel'), paper2: cssVar('--paper-2'),
      use: cssVar('--electron'), heat: cssVar('--sun'), below: cssVar('--ink-2'), sun: cssVar('--sun'),
    };
  }

  // ---------- spectrum canvas ----------
  function layout() {
    const w = canvas.parentElement.clientWidth;
    const hgt = Math.round(Math.min(360, Math.max(260, w * 0.62)));
    canvas.style.height = `${hgt}px`;
    st.ctx = fitCanvas(canvas, w, hgt); st.w = w; st.hgt = hgt;
    st.plot = { l: 46, r: w - 14, t: 18, b: hgt - 46 };
    drawSpectrum();
  }
  const xOf = (E) => st.plot.l + ((E - E_MIN) / (E_MAX - E_MIN)) * (st.plot.r - st.plot.l);
  const eOf = (x) => E_MIN + ((x - st.plot.l) / (st.plot.r - st.plot.l)) * (E_MAX - E_MIN);
  const yOf = (v) => st.plot.b - (v / yMax) * (st.plot.b - st.plot.t);
  const font = (px, wgt = 500) => `${wgt} ${px}px "Atkinson Next", system-ui, sans-serif`;

  function hatch(c, color) {
    const p = document.createElement('canvas'); p.width = 8; p.height = 8;
    const g = p.getContext('2d'); g.strokeStyle = color; g.lineWidth = 1.4; g.globalAlpha = 0.75;
    g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.moveTo(-2, 2); g.lineTo(2, -2); g.stroke();
    return c.createPattern(p, 'repeat');
  }

  function drawSpectrum() {
    const c = st.ctx; if (!c) return;
    const { col, plot, gap } = { ...st, gap: st.gap };
    c.clearRect(0, 0, st.w, st.hgt);
    const pts = spectrumSplit(gap, { from: 0.01, to: E_MAX, n: Math.max(200, Math.round(st.w)) });
    const area = (top, bottom, fill, alpha) => {
      c.beginPath();
      pts.forEach((p, i) => { const x = xOf(p.E); const y = yOf(top(p)); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      for (let i = pts.length - 1; i >= 0; i--) c.lineTo(xOf(pts[i].E), yOf(bottom(pts[i])));
      c.closePath(); c.globalAlpha = alpha; c.fillStyle = fill; c.fill(); c.globalAlpha = 1;
    };
    // gridlines
    c.strokeStyle = col.rule; c.lineWidth = 1; c.globalAlpha = 0.6;
    for (let E = 1; E <= E_MAX; E++) { c.beginPath(); c.moveTo(xOf(E), plot.t); c.lineTo(xOf(E), plot.b); c.stroke(); }
    c.globalAlpha = 1;
    // regions: usable sits on the baseline, heat on top of it; below-gap hatched
    area((p) => p.below, () => 0, hatch(c, col.below), 1);
    area((p) => p.below, () => 0, col.below, 0.08);
    area((p) => p.usable, () => 0, col.use, 0.85);
    area((p) => p.usable + p.heat, (p) => p.usable, col.heat, 0.8);
    // 2px surface gap between usable and heat fills
    c.strokeStyle = col.panel; c.lineWidth = 2; c.beginPath();
    pts.filter((p) => p.E >= gap).forEach((p, i) => { const x = xOf(p.E); const y = yOf(p.usable); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.stroke();
    // outline of the full spectrum
    c.strokeStyle = col.ink; c.lineWidth = 1.5; c.beginPath();
    pts.forEach((p, i) => { const x = xOf(p.E); const y = yOf(p.total); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.stroke();
    // axes
    c.strokeStyle = col.rule; c.lineWidth = 1; c.beginPath(); c.moveTo(plot.l, plot.b + 0.5); c.lineTo(plot.r, plot.b + 0.5); c.stroke();
    c.fillStyle = col.ink2; c.font = font(12); c.textAlign = 'center';
    for (let E = 0; E <= E_MAX; E += 0.5) {
      c.fillText(Number.isInteger(E) ? String(E) : '', xOf(E), plot.b + 16);
      c.beginPath(); c.moveTo(xOf(E), plot.b); c.lineTo(xOf(E), plot.b + 4); c.stroke();
    }
    c.fillText('Photon energy (eV)', (plot.l + plot.r) / 2, plot.b + 36);
    c.save(); c.translate(14, (plot.t + plot.b) / 2); c.rotate(-Math.PI / 2);
    c.fillText('Power per eV (W/m²/eV)', 0, 0); c.restore();
    c.textAlign = 'right';
    for (let v = 0; v <= yMax; v += 200) {
      const y = yOf(v); if (y < plot.t + 4) break;
      c.fillText(String(v), plot.l - 6, y + 4);
    }
    // gap handle
    const gx = xOf(gap);
    c.strokeStyle = col.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(gx, plot.t - 4); c.lineTo(gx, plot.b); c.stroke();
    c.fillStyle = col.ink; c.beginPath(); c.arc(gx, plot.t + 2, 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = col.panel; c.beginPath(); c.arc(gx, plot.t + 2, 2.4, 0, Math.PI * 2); c.fill();
    c.font = font(12, 700); c.fillStyle = col.ink;
    const right = gx < st.w - 150;
    c.textAlign = right ? 'left' : 'right';
    c.fillText(`Gap ${gap.toFixed(2)} eV`, gx + (right ? 10 : -10), plot.t + 6);
    c.font = font(12); c.fillStyle = col.ink2;
    c.fillText(`= ${Math.round(cutoffWavelengthNm(gap))} nm`, gx + (right ? 10 : -10), plot.t + 21);
    // direct labels inside the regions
    const b = spectrumBudget(gap);
    const pct = (x) => `${Math.round(100 * x)} %`;
    labelIn(c, 'Not absorbed', pct(b.belowGap), Math.max(plot.l + 40, xOf(gap / 2)), gap > 0.75, col);
    const above = pts.filter((p) => p.E >= gap);
    if (above.length > 3) {
      const peakU = above.reduce((m, p) => (p.usable > m.usable ? p : m));
      const xu = Math.min(Math.max(xOf(peakU.E) + 6, gx + 34), plot.r - 100);
      tag(c, xu, yOf(peakU.usable * 0.45), 'Usable', pct(b.ultimate), col);
      // heat label: where the heat band is thickest, at least one label-width to the right of "Usable"
      const cands = above.filter((p) => xOf(p.E) >= xu + 62 && xOf(p.E) <= plot.r - 30);
      if (b.thermalisation > 0.06 && cands.length) {
        const ph = cands.reduce((m, p) => (p.heat > m.heat ? p : m));
        const yh = yOf(ph.usable + ph.heat * 0.5);
        tag(c, Math.min(xOf(ph.E), plot.r - 30), Math.min(yh, yOf(ph.usable) - 18), 'Heat', pct(b.thermalisation), col);
      }
    }
  }
  function tag(c, x, y, a, bTxt, col) {
    c.font = font(12, 700); const w = Math.max(c.measureText(a).width, c.measureText(bTxt).width) + 10;
    c.globalAlpha = 0.9; c.fillStyle = col.panel; c.beginPath(); c.roundRect?.(x - w / 2, y - 15, w, 32, 4); if (!c.roundRect) c.rect(x - w / 2, y - 15, w, 32); c.fill(); c.globalAlpha = 1;
    c.fillStyle = col.ink; c.textAlign = 'center'; c.fillText(a, x, y); c.font = font(12, 500); c.fillText(bTxt, x, y + 13);
  }
  function labelIn(c, a, bTxt, x, show, col) {
    if (!show) return;
    tag(c, x, st.plot.b - 26, a, bTxt, col);
  }

  // drag on the canvas
  let dragging = false;
  const setFromEvent = (ev) => {
    const r = canvas.getBoundingClientRect();
    const E = eOf(ev.clientX - r.left);
    setGap(Math.round(Math.min(2.5, Math.max(0.5, E)) * 100) / 100);
  };
  canvas.addEventListener('pointerdown', (ev) => { dragging = true; canvas.setPointerCapture(ev.pointerId); setFromEvent(ev); });
  canvas.addEventListener('pointermove', (ev) => { if (dragging) setFromEvent(ev); });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  // ---------- SQ chart ----------
  function sqOption(c) {
    const b = baseOption();
    const mats = st.materials.map((m) => {
      const eff = shockleyQueisser(m.gap).efficiency * 100;
      return { m, eff };
    });
    const labelPos = { ge: 'right', si: 'bottom', cigs: 'top', gaas: 'top', cdte: 'bottom', mapbi3: 'top', asi: 'bottom' };
    const effNow = shockleyQueisser(st.gap).efficiency * 100;
    return {
      ...b,
      animation: false,
      legend: { show: false },
      title: { text: `Your gap ${st.gap.toFixed(2)} eV: limit ${effNow.toFixed(1)} %`, right: 16, bottom: 52, textStyle: { color: c.ink, fontSize: 13, fontWeight: 700, fontFamily: 'Atkinson Next, system-ui, sans-serif' } },
      grid: { left: 52, right: 16, top: 30, bottom: 46, containLabel: false },
      tooltip: { ...b.tooltip, trigger: 'item', formatter: (p) => (p.seriesName === 'Materials'
        ? `${esc(p.data.name)}: ${fmt(p.data.value[0], 3)} eV, limit ${p.data.value[1].toFixed(1)} %`
        : `Gap ${p.value[0].toFixed(2)} eV: limit ${p.value[1].toFixed(1)} %`) },
      xAxis: { ...b._axis, type: 'value', min: 0.5, max: 2.5, interval: 0.5, name: 'Band gap (eV)', nameLocation: 'middle', nameGap: 28, splitLine: { show: false } },
      yAxis: { ...b._axis, type: 'value', min: 0, max: 35, interval: 10, name: 'Limit (%)', nameLocation: 'middle', nameGap: 34 },
      series: [
        {
          name: 'Detailed-balance limit', type: 'line', showSymbol: false, smooth: false, lineStyle: { width: 2, color: c.silicon },
          data: curve.filter((p) => p.gap <= 2.5).map((p) => [p.gap, p.efficiency * 100]), z: 2,
          markLine: {
            silent: true, symbol: 'none', animation: false,
            lineStyle: { color: c.ink2, width: 1, type: 'dashed' },
            label: { show: false },
            data: [{ xAxis: st.gap }],
          },
          markPoint: {
            silent: true, symbol: 'circle', symbolSize: 7, animation: false,
            itemStyle: { color: c.ink2 }, label: { show: false },
            data: [{ coord: [peak.gap, peak.efficiency * 100] }],
          },
        },
        {
          name: 'Your gap', type: 'scatter', symbol: 'circle', symbolSize: 12, z: 4, silent: true,
          itemStyle: { color: c.panel, borderColor: c.ink, borderWidth: 2.5 },
          label: { show: false },
          data: [[st.gap, effNow]],
        },
        {
          name: 'Materials', type: 'scatter', symbolSize: 10, z: 3,
          labelLayout: { hideOverlap: true },
          data: mats.map(({ m, eff }) => ({
            name: m.short, value: [m.gap, eff], id: m.id,
            itemStyle: { color: cssVar(familyVar[m.family] || '--silicon'), borderColor: c.panel, borderWidth: 2 },
            label: { show: true, position: labelPos[m.id] || 'right', distance: 6, color: c.ink, fontSize: 12, fontWeight: 650, formatter: m.short },
          })),
        },
      ],
    };
  }

  // ---------- text ----------
  function updateText() {
    const g = st.gap; const b = spectrumBudget(g); const eff = shockleyQueisser(g).efficiency;
    $('bg-gap-out').textContent = `${g.toFixed(2)} eV`;
    $('bg-gap-help').textContent = `Absorbs light with wavelength shorter than ${Math.round(cutoffWavelengthNm(g))} nm.`;
    $('bg-below').textContent = (100 * b.belowGap).toFixed(0);
    $('bg-heat').textContent = (100 * b.thermalisation).toFixed(0);
    $('bg-use').textContent = (100 * b.ultimate).toFixed(0);
    $('bg-eff').textContent = (100 * eff).toFixed(1);
    const near = st.materials.find((m) => Math.abs(m.gap - g) < 0.005);
    let msg;
    if (g < 0.95) msg = 'A low step: almost every photon is absorbed, but most of their energy turns to heat.';
    else if (g > 1.8) msg = 'A high step: each absorbed photon keeps a lot of energy, but most photons are too weak to be absorbed.';
    else msg = 'Close to the sweet spot: the two losses roughly balance.';
    $('bg-explain').textContent = `${near ? `${near.name}. ` : ''}${msg} Even the usable share is not all collected: the detailed-balance limit (${(100 * eff).toFixed(1)} %) also counts the light every cell must give back out.`;
    document.querySelectorAll('#bg-jumps button').forEach((btn) => btn.setAttribute('aria-pressed', String(Math.abs(Number(btn.value) - g) < 0.005)));
  }

  let raf = 0;
  function setGap(g) {
    st.gap = g; $('bg-gap').value = String(g);
    updateText();
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawSpectrum(); st.chart?.refresh(); });
  }
  $('bg-gap').addEventListener('input', (ev) => setGap(Number(ev.target.value)));

  // ---------- materials ----------
  function buildMaterials() {
    const jumps = clear($('bg-jumps'));
    for (const m of st.materials) {
      const btn = h('button', { type: 'button', class: 'btn ghost bg-jump', value: String(m.gap), 'aria-pressed': 'false', title: `${m.name}, ${m.gap} eV` }, m.short);
      btn.addEventListener('click', () => setGap(m.gap));
      jumps.append(btn);
    }
    const tb = clear($('bg-tbody'));
    for (const m of st.materials) {
      const kind = m.kind === 'direct' ? 'Direct' : m.kind === 'indirect' ? 'Indirect' : 'Amorphous';
      tb.append(h('tr', {},
        h('th', { scope: 'row' }, `${m.name} (${m.short})`),
        h('td', { class: 'num' }, m.range ? `${m.gap} (${m.range[0]}–${m.range[1]})` : String(m.gap)),
        h('td', {}, kind),
        h('td', { class: 'num' }, String(Math.round(cutoffWavelengthNm(m.gap)))),
        h('td', { class: 'num' }, `${(100 * shockleyQueisser(m.gap).efficiency).toFixed(1)} %`),
        h('td', {}, m.use || '')));
    }
  }

  // ---------- boot ----------
  onTheme(() => { readColours(); drawSpectrum(); });
  readColours();
  layout();
  updateText();
  new ResizeObserver(() => { if (canvas.parentElement.clientWidth !== st.w) layout(); }).observe(canvas.parentElement);
  document.fonts?.ready.then(drawSpectrum);

  const badge = $('bg-badge');
  const valid = (d) => is.obj(d) && is.arr(d.data) && d.data.every((m) => is.str(m.id) && is.str(m.short) && is.num(m.gap) && m.gap > 0.2 && m.gap < 4);
  loadData('materials.json', valid).then(({ data, state }) => {
    setBadge(badge, state, 'materials.json');
    st.materials = [...data.data].sort((a, b) => a.gap - b.gap);
    buildMaterials(); updateText(); st.chart?.refresh();
  }).catch((err) => {
    console.error(err); setBadge(badge, 'failed');
    clear($('bg-tbody')).append(h('tr', {}, h('td', { colspan: '6' }, 'The materials dataset failed its integrity check, so it is not shown.')));
  });

  makeChart($('bg-sq'), (c) => sqOption(c)).then((ch) => {
    st.chart = ch;
    ch.chart.on('click', (p) => { if (p.seriesName === 'Materials') setGap(p.data.value[0]); });
  });
}
