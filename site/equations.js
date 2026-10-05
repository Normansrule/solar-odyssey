// Equation atlas: small theme-aware plots beside each equation, and the formula
// playground (safe-expr only: user formulas are parsed and evaluated against a
// whitelist, never eval'd).

import { h, clear, fmt } from './assets/js/dom.js';
import { calc, parse, variablesOf, ExprError } from './assets/js/safe-expr.js';
import * as pv from './assets/js/physics/pv.js';
import * as solar from './assets/js/physics/solar.js';
import * as econ from './assets/js/physics/econ.js';
import * as renewables from './assets/js/physics/renewables.js';
import { FORMULAS, byId } from './equations-formulas.js';
import { renderMath } from './assets/js/core.js';

const MODS = { pv, solar, econ, renewables };
const S = (tag, attrs, ...kids) => h.svg(tag, attrs, ...kids);
const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

// ---------------------------------------------------------------- mini plots
// One quiet line chart: thin marks, recessive axes, a marked worked example,
// direct labels, and a hover/focus readout. Colours come from CSS classes that
// use the palette variables, so dark mode needs no redraw.
const W = 320; const H = 212; const M = { l: 44, r: 14, t: 18, b: 38 };

function niceTicks(lo, hi, n = 4) {
  const span = hi - lo; const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= n + 0.5) ?? 10 * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

function linePlot({ x: [x0, x1], y: [y0, y1], series, xLabel, yLabel, xFmt = (v) => fmt(v, 3), yFmt = (v) => fmt(v, 3),
  markers = [], bands = [], hlines = [], rects = [], readout, xTicks, yTicks }) {
  const px = (v) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
  const py = (v) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mini' });
  const g = S('g', { class: 'axes' });
  for (const t of yTicks ?? niceTicks(y0, y1)) {
    g.append(S('line', { x1: M.l, x2: W - M.r, y1: py(t), y2: py(t), class: 'grid' }),
      S('text', { x: M.l - 6, y: py(t) + 3.5, class: 'tick', 'text-anchor': 'end' }, yFmt(t)));
  }
  for (const t of xTicks ?? niceTicks(x0, x1)) {
    g.append(S('text', { x: px(t), y: H - M.b + 14, class: 'tick', 'text-anchor': 'middle' }, xFmt(t)));
  }
  g.append(S('line', { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, class: 'baseline' }),
    S('text', { x: (M.l + W - M.r) / 2, y: H - 6, class: 'axis-label', 'text-anchor': 'middle' }, xLabel),
    S('text', { x: 4, y: 10, class: 'axis-label' }, yLabel));
  svg.append(g);
  for (const b of bands) svg.append(S('rect', { x: px(b.from), y: M.t, width: Math.max(0, px(b.to) - px(b.from)), height: H - M.t - M.b, class: `band ${b.cls ?? ''}` }));
  for (const r of rects) svg.append(S('rect', { x: px(r.x0), y: py(r.y1), width: px(r.x1) - px(r.x0), height: py(r.y0) - py(r.y1), class: r.cls }));
  for (const l of hlines) {
    svg.append(S('line', { x1: M.l, x2: W - M.r, y1: py(l.y), y2: py(l.y), class: `hline ${l.cls ?? ''}` }));
    if (l.label) svg.append(S('text', { x: l.left ? M.l + 4 : W - M.r - 2, y: py(l.y) - 5, class: 'note', 'text-anchor': l.left ? 'start' : 'end' }, l.label));
  }
  for (const s of series) {
    const d = s.pts.filter(([, y]) => Number.isFinite(y)).map(([x, y], i) => `${i ? 'L' : 'M'}${px(x).toFixed(1)},${py(Math.min(Math.max(y, y0 - (y1 - y0)), y1 + (y1 - y0))).toFixed(1)}`).join('');
    svg.append(S('path', { d, class: `line ${s.cls ?? ''}` }));
    if (s.label) {
      const [lx, ly] = s.labelAt ?? s.pts[s.pts.length - 1];
      svg.append(S('text', { x: px(lx) + (s.dx ?? -4), y: py(ly) + (s.dy ?? -7), class: `series-label ${s.cls ?? ''}`, 'text-anchor': s.anchor ?? 'end' }, s.label));
    }
  }
  for (const m of markers) {
    svg.append(S('circle', { cx: px(m.x), cy: py(m.y), r: 4.5, class: `marker ${m.cls ?? ''}` }));
    if (m.label) svg.append(S('text', { x: px(m.x) + (m.dx ?? 8), y: py(m.y) + (m.dy ?? -8), class: 'marker-label', 'text-anchor': m.anchor ?? 'start' }, m.label));
  }
  if (readout) attachHover(svg, px, py, x0, x1, readout);
  return svg;
}

// Crosshair and value readout that follow the pointer (and arrow keys when focused).
function attachHover(svg, px, py, x0, x1, readout) {
  const guide = S('line', { y1: M.t, y2: H - M.b, class: 'guide' });
  const dot = S('circle', { r: 3.5, class: 'guide-dot' });
  const text = S('text', { y: M.t - 5, class: 'guide-text' });
  const layer = S('g', { class: 'hover', 'aria-hidden': 'true' }, guide, dot, text);
  layer.style.display = 'none';
  svg.append(layer);
  let xv = (x0 + x1) / 2;
  const show = (x) => {
    xv = Math.min(x1, Math.max(x0, x));
    const y = readout.f(xv);
    if (!Number.isFinite(y)) { layer.style.display = 'none'; return; }
    layer.style.display = '';
    guide.setAttribute('x1', px(xv)); guide.setAttribute('x2', px(xv));
    dot.setAttribute('cx', px(xv)); dot.setAttribute('cy', py(y));
    const right = px(xv) > W * 0.6;
    text.setAttribute('x', px(xv) + (right ? -6 : 6)); text.setAttribute('text-anchor', right ? 'end' : 'start');
    text.textContent = readout.text(xv, y);
  };
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    show(x0 + ((sx - M.l) / (W - M.l - M.r)) * (x1 - x0));
  });
  svg.addEventListener('pointerleave', () => { layer.style.display = 'none'; });
  svg.tabIndex = 0;
  svg.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight');
  // The crosshair text is drawn inside the image; screen readers hear the same value
  // through a polite live region beside the plot when the arrow keys move it.
  let live = null;
  const say = () => {
    if (!live) { live = h('span', { class: 'visually-hidden', 'aria-live': 'polite' }); svg.after(live); }
    live.textContent = text.textContent;
  };
  svg.addEventListener('focus', () => show(xv));
  svg.addEventListener('blur', () => { layer.style.display = 'none'; });
  svg.addEventListener('keydown', (e) => {
    const step = (x1 - x0) / 50;
    if (e.key === 'ArrowRight') { show(xv + step); say(); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { show(xv - step); say(); e.preventDefault(); }
  });
}

function barRow(items, { max, unit }) {
  // Horizontal stacked comparison bars (label, value), for budgets like power in vs out.
  const svg = S('svg', { viewBox: `0 0 ${W} ${24 + items.length * 44}`, class: 'mini bars' });
  const x = (v) => 8 + (v / max) * (W - 16);
  items.forEach((it, i) => {
    const y = 10 + i * 44;
    svg.append(S('text', { x: 8, y: y + 8, class: 'bar-label' }, it.label),
      S('rect', { x: 8, y: y + 14, width: W - 16, height: 16, rx: 3, class: 'bar-track' }),
      S('rect', { x: 8, y: y + 14, width: Math.max(2, x(it.value) - 8), height: 16, rx: 3, class: `bar ${it.cls ?? ''}` }),
      S('text', { x: W - 8, y: y + 8, class: 'bar-value', 'text-anchor': 'end' }, `${fmt(it.value, 3)} ${unit}`));
  });
  return svg;
}

const cell = { Iph: 9.72, I0: 1.215e-11 };
const cellR = { ...cell, Rs: 0.00205761, Rsh: 20.5761 };

const PLOTS = {
  photon: () => ({
    svg: linePlot({
      x: [300, 1200], y: [0, 4.5], xLabel: 'Wavelength (nm)', yLabel: 'Photon energy (eV)',
      series: [{ pts: range(300, 1200, 90).map((l) => [l, pv.photonEnergyEV(l)]) }],
      markers: [{ x: 500, y: pv.photonEnergyEV(500), label: '500 nm: 2.48 eV' }],
      bands: [{ from: 380, to: 750, cls: 'visible' }],
      readout: { f: pv.photonEnergyEV, text: (x, y) => `${fmt(x, 3)} nm: ${fmt(y, 3)} eV` },
    }),
    caption: 'Photon energy falls as wavelength grows. The shaded band is visible light (about 380 to 750 nm).',
    aria: 'Line chart of photon energy against wavelength from 300 to 1200 nanometres, falling from 4.1 to 1.0 electronvolts; 500 nm is marked at 2.48 eV.',
  }),
  gap: () => ({
    svg: linePlot({
      x: [300, 1400], y: [0, 4.5], xLabel: 'Wavelength (nm)', yLabel: 'Photon energy (eV)',
      series: [{ pts: range(300, 1400, 110).map((l) => [l, pv.photonEnergyEV(l)]) }],
      bands: [{ from: 300, to: pv.cutoffWavelengthNm(1.12), cls: 'absorbed' }],
      hlines: [{ y: 1.12, label: 'Silicon gap 1.12 eV', cls: 'gap' }],
      markers: [{ x: pv.cutoffWavelengthNm(1.12), y: 1.12, label: '1107 nm', dy: -26, anchor: 'middle', dx: 0 }],
      readout: { f: pv.photonEnergyEV, text: (x, y) => `${fmt(x, 3)} nm: ${y >= 1.12 ? 'absorbed' : 'passes through'}` },
    }),
    caption: 'In silicon, photons left of 1107 nm (shaded) have enough energy to be absorbed; longer wavelengths pass through.',
    aria: 'Photon energy against wavelength with a horizontal line at the silicon band gap of 1.12 eV; wavelengths shorter than 1107 nm are shaded as absorbed.',
  }),
  iv: () => {
    const voc = pv.openCircuitVoltage(cell);
    return {
      svg: linePlot({
        x: [0, 0.75], y: [0, 11], xLabel: 'Voltage (V)', yLabel: 'Current (A)', xFmt: (v) => v.toFixed(1),
        series: [{ pts: range(0, voc, 120).map((v) => [v, pv.diodeCurrent(v, cell)]) }],
        markers: [{ x: 0.6, y: pv.diodeCurrent(0.6, cell), label: '0.6 V: 9.55 A', anchor: 'end', dx: -8 }],
        readout: { f: (v) => (v <= voc ? pv.diodeCurrent(v, cell) : NaN), text: (x, y) => `${x.toFixed(3)} V: ${fmt(y, 3)} A` },
      }),
      caption: 'The current stays almost flat until the diode starts to leak, then falls steeply to zero at the open-circuit voltage.',
      aria: 'I-V curve of the example cell: current near 9.7 amps from 0 to about 0.55 volts, then dropping to zero at 0.70 volts; 0.6 V is marked at 9.55 A.',
    };
  },
  voc: () => {
    const f = (lg) => pv.idealVoc({ Iph: cell.Iph * 10 ** lg, I0: cell.I0 });
    return {
      svg: linePlot({
        x: [-2, 2], y: [0.5, 0.85], xLabel: 'Light intensity (suns, log scale)', yLabel: 'Voc (V)',
        xTicks: [-2, -1, 0, 1, 2], xFmt: (v) => String(10 ** v), yFmt: (v) => v.toFixed(2),
        series: [{ pts: range(-2, 2, 80).map((lg) => [lg, f(lg)]) }],
        markers: [{ x: 0, y: f(0), label: '1 sun: 0.704 V', anchor: 'end', dx: -8 }],
        readout: { f, text: (x, y) => `${fmt(10 ** x, 2)} suns: ${y.toFixed(3)} V` },
      }),
      caption: 'Each tenfold step in light adds the same 59 mV, so the line is straight on a logarithmic axis.',
      aria: 'Open-circuit voltage against light intensity on a log scale from 0.01 to 100 suns, rising in a straight line from 0.59 to 0.82 volts; one sun is marked at 0.704 V.',
    };
  },
  ff: () => {
    const voc = pv.openCircuitVoltage(cell); const isc = pv.shortCircuitCurrent(cell); const mpp = pv.maxPowerPoint(cell);
    return {
      svg: linePlot({
        x: [0, 0.75], y: [0, 11], xLabel: 'Voltage (V)', yLabel: 'Current (A)', xFmt: (v) => v.toFixed(1),
        rects: [{ x0: 0, x1: voc, y0: 0, y1: isc, cls: 'box-ideal' }, { x0: 0, x1: mpp.V, y0: 0, y1: mpp.I, cls: 'box-mpp' }],
        series: [{ pts: range(0, voc, 120).map((v) => [v, pv.diodeCurrent(v, cell)]) }],
        markers: [{ x: mpp.V, y: mpp.I, label: 'MPP 5.80 W', anchor: 'end', dx: -8, dy: 16 }],
        readout: { f: (v) => (v <= voc ? pv.diodeCurrent(v, cell) : NaN), text: (x, y) => `${x.toFixed(3)} V × ${fmt(y, 3)} A = ${fmt(x * y, 3)} W` },
      }),
      caption: 'The filled rectangle (power at the maximum power point) covers 84.7 % of the outlined Voc × Isc box: that share is the fill factor.',
      aria: 'I-V curve with the outline of the Voc by Isc box and a filled rectangle up to the maximum power point at 0.62 V and 9.33 A, covering 84.7 percent of the box.',
    };
  },
  eta: () => ({
    svg: barRow([{ label: 'Sunlight in (1000 W/m² × 0.0243 m²)', value: 24.3, cls: 'sun' }, { label: 'Electricity out', value: 5.8, cls: 'elec' }], { max: 24.3, unit: 'W' }),
    caption: 'Power in and power out for the example cell. Their ratio, 5.8 / 24.3, is the 23.9 % efficiency.',
    aria: 'Two bars: sunlight power in 24.3 watts and electrical power out 5.8 watts.',
  }),
  sq: () => {
    const hot = pv.sqCurve(0.5, 3, 0.05, { Tsun: 6000 }); const sun = pv.sqCurve(0.5, 3, 0.05);
    return {
      svg: linePlot({
        x: [0.5, 3], y: [0, 40], xLabel: 'Band gap (eV)', yLabel: 'Max efficiency (%)', xFmt: (v) => v.toFixed(1), yFmt: (v) => String(v),
        yTicks: [0, 10, 20, 30, 40],
        series: [
          { pts: hot.map((p) => [p.gap, p.efficiency * 100]), cls: 'alt', label: '6000 K Sun (dashed)', labelAt: [2.85, 6.2], dx: 0, dy: 0, anchor: 'end' },
          { pts: sun.map((p) => [p.gap, p.efficiency * 100]), label: '5772 K Sun', labelAt: [2.85, 2.2], dx: 0, dy: 0, anchor: 'end' },
        ],
        markers: [
          { x: 1.1, y: 30, label: '1961: 30 %', dx: 6, dy: 26, cls: 'alt' },
          { x: 1.34, y: 33.16, label: 'AM1.5G: 33.16 % at 1.34 eV', dx: -4, dy: -10, cls: 'ref' },
        ],
        readout: { f: (g) => pv.shockleyQueisser(g).efficiency * 100, text: (x, y) => `${x.toFixed(2)} eV: ${y.toFixed(1)} %` },
      }),
      caption: 'Detailed-balance limit against band gap for a blackbody Sun, computed by this site. The 33.16 % point is Rühle\'s value for the real AM1.5G spectrum.',
      aria: 'Two curves of maximum single-junction efficiency against band gap from 0.5 to 3 eV, peaking near 31 percent around 1.3 eV; points mark 30 percent at 1.1 eV and 33.16 percent at 1.34 eV.',
    };
  },
  yield: () => {
    const day = solar.dailyInsolation(new Date(Date.UTC(2025, 5, 21)), { lat: 40, lon: 0, tilt: 0, stepMin: 10 });
    const noon = 12; const psh = day.kwhm2;
    const pts = day.trace.map((p, i) => [i / 6 + 1 / 12, p.poa]);
    return {
      svg: linePlot({
        x: [0, 24], y: [0, 1100], xLabel: 'Solar time (h)', yLabel: 'Irradiance (W/m²)', xTicks: [0, 6, 12, 18, 24], yFmt: (v) => String(v),
        rects: [{ x0: noon - psh / 2, x1: noon + psh / 2, y0: 0, y1: 1000, cls: 'box-psh' }],
        series: [{ pts }],
        hlines: [{ y: 1000, label: '1000 W/m²', left: true, cls: 'gap' }],
        readout: { f: (t) => { const i = Math.round((t - 1 / 12) * 6); return pts[Math.max(0, Math.min(pts.length - 1, i))][1]; }, text: (x, y) => `${x.toFixed(1)} h: ${Math.round(y)} W/m²` },
      }),
      caption: `A clear June day at 40° N on a flat surface (site model): the curve holds ${psh.toFixed(1)} kWh/m², the same area as the shaded block of ${psh.toFixed(1)} hours at 1000 W/m². That is the day's peak sun hours.`,
      aria: `Irradiance through a clear June day at 40 degrees north, a bell curve peaking near 950 W per square metre, with a shaded block of ${psh.toFixed(1)} hours at 1000 W per square metre of equal area.`,
    };
  },
  airmass: () => ({
    svg: linePlot({
      x: [0, 85], y: [0, 10], xLabel: 'Solar zenith angle (°)', yLabel: 'Air mass', yFmt: (v) => String(v),
      series: [
        { pts: range(0, 85, 85).map((z) => [z, 1 / Math.cos((z * Math.PI) / 180)]), cls: 'alt', label: '1 / cos θ', labelAt: [80, 1 / Math.cos((80 * Math.PI) / 180)], anchor: 'end', dx: -6, dy: 0 },
        { pts: range(0, 85, 85).map((z) => [z, solar.airMass(z)]), label: 'Kasten and Young', labelAt: [85, solar.airMass(85)], dy: 14 },
      ],
      markers: [{ x: 48.19, y: 1.5, label: 'AM1.5 at 48.2°', anchor: 'end', dx: -8 }],
      readout: { f: solar.airMass, text: (x, y) => `${x.toFixed(0)}°: AM ${y.toFixed(2)}` },
    }),
    caption: 'Air mass grows slowly until the Sun is low, then fast. The flat-slab formula runs away near the horizon; the fitted formula stays finite.',
    aria: 'Air mass against solar zenith angle from 0 to 85 degrees: both curves start at 1 and rise steeply after 70 degrees; AM1.5 is marked at 48.2 degrees.',
  }),
  aoi: () => {
    const th = (Math.acos(0.8275) * 180) / Math.PI;
    return {
      svg: linePlot({
        x: [0, 90], y: [0, 1.05], xLabel: 'Angle of incidence θ (°)', yLabel: 'Share of beam', xTicks: [0, 30, 60, 90], yFmt: (v) => v.toFixed(2),
        series: [{ pts: range(0, 90, 90).map((a) => [a, Math.cos((a * Math.PI) / 180)]) }],
        markers: [{ x: th, y: 0.8275, label: `θ = ${th.toFixed(0)}°: 0.83` }],
        readout: { f: (a) => Math.cos((a * Math.PI) / 180), text: (x, y) => `${x.toFixed(0)}°: ${(y * 100).toFixed(0)} % of the beam` },
      }),
      caption: 'The share of the direct beam a panel catches is the cosine of the angle of incidence: gentle near square-on, steep near grazing.',
      aria: 'Cosine curve from 1 at 0 degrees to 0 at 90 degrees; the worked example at 34 degrees gives 0.83.',
    };
  },
  cf: () => ({
    svg: barRow([{ label: 'Flat out all year (100 MW × 8760 h)', value: 876000, cls: 'sun' }, { label: 'Delivered', value: 219000, cls: 'elec' }], { max: 876000, unit: 'MWh' }),
    caption: 'What the 100 MW plant could make running flat out all year, and what it delivered: a quarter, so CF = 0.25.',
    aria: 'Two bars: 876,000 megawatt-hours possible and 219,000 delivered.',
  }),
  lcoe: () => {
    const f = (cf) => econ.lcoe({ capex: 1000, fixedOM: 20, cf, r: 0.07, n: 25 });
    return {
      svg: linePlot({
        x: [0.1, 0.5], y: [0, 140], xLabel: 'Capacity factor', yLabel: 'LCOE ($/MWh)', xFmt: (v) => v.toFixed(1), yFmt: (v) => String(v),
        series: [{ pts: range(0.1, 0.5, 80).map((c) => [c, f(c)]) }],
        markers: [{ x: 0.2, y: f(0.2), label: 'CF 0.2: $60.4' }],
        readout: { f, text: (x, y) => `CF ${x.toFixed(2)}: $${y.toFixed(1)}/MWh` },
      }),
      caption: 'The same plant, costs spread over more or fewer MWh: doubling the capacity factor halves the LCOE when there is no fuel.',
      aria: 'LCOE falling from about 121 dollars per MWh at capacity factor 0.1 to 24 at 0.5; the example at 0.2 is 60.4.',
    };
  },
  wright: () => {
    const f = (d) => econ.wrightsLaw(100, 0.2, d);
    return {
      svg: linePlot({
        x: [0, 10], y: [0, 105], xLabel: 'Doublings of cumulative production', yLabel: 'Cost ($)', xTicks: [0, 2, 4, 6, 8, 10], yFmt: (v) => String(v),
        series: [{ pts: range(0, 10, 50).map((d) => [d, f(d)]) }],
        markers: [{ x: 10, y: f(10), label: '$10.74', anchor: 'end', dx: -8, dy: -10 }],
        readout: { f, text: (x, y) => `${x.toFixed(1)} doublings: $${y.toFixed(2)}` },
      }),
      caption: 'Each doubling multiplies the cost by 0.8. After ten doublings about a tenth remains.',
      aria: 'Cost falling from 100 dollars to 10.74 over ten doublings of cumulative production.',
    };
  },
  wind: () => {
    const f = (v) => renewables.kineticPower(1.225, 1, v);
    return {
      svg: linePlot({
        x: [0, 15], y: [0, 2200], xLabel: 'Wind speed (m/s)', yLabel: 'Power per m² (W)', xTicks: [0, 5, 10, 15], yFmt: (v) => String(v),
        series: [{ pts: range(0, 15, 60).map((v) => [v, f(v)]) }],
        markers: [{ x: 5, y: f(5), label: '5 m/s: 77 W', dy: -10, anchor: 'end', dx: -4 }, { x: 10, y: f(10), label: '10 m/s: 613 W', anchor: 'end', dx: -8 }],
        readout: { f, text: (x, y) => `${x.toFixed(1)} m/s: ${Math.round(y)} W/m²` },
      }),
      caption: 'Doubling the wind speed from 5 to 10 m/s multiplies the power eightfold.',
      aria: 'Wind power per square metre rising with the cube of wind speed, from 77 watts at 5 metres per second to 613 at 10 and 2067 at 15.',
    };
  },
  betz: () => ({
    svg: linePlot({
      x: [0, 0.5], y: [0, 0.7], xLabel: 'Axial induction factor a', yLabel: 'Cp', xFmt: (v) => v.toFixed(1), yFmt: (v) => v.toFixed(1),
      series: [{ pts: range(0, 0.5, 60).map((a) => [a, renewables.actuatorDiscCp(a)]) }],
      hlines: [{ y: 16 / 27, label: '16/27 ≈ 0.593', left: true, cls: 'gap' }],
      markers: [{ x: 1 / 3, y: 16 / 27, label: 'a = 1/3', dy: 18, dx: 8 }],
      readout: { f: renewables.actuatorDiscCp, text: (x, y) => `a = ${x.toFixed(2)}: Cp = ${y.toFixed(3)}` },
    }),
    caption: 'The power coefficient peaks at 16/27 when the rotor slows the wind by a third.',
    aria: 'Power coefficient against axial induction factor, a hump peaking at 0.593 when a equals one third.',
  }),
  hydro: () => {
    const f = (H) => renewables.hydroPower(100, H, 0.9) / 1e6;
    return {
      svg: linePlot({
        x: [0, 200], y: [0, 180], xLabel: 'Head (m), 100 m³/s flow', yLabel: 'Power (MW)', yFmt: (v) => String(v),
        series: [{ pts: [[0, 0], [200, f(200)]] }],
        markers: [{ x: 50, y: f(50), label: '50 m: 44.1 MW' }],
        readout: { f, text: (x, y) => `${Math.round(x)} m: ${y.toFixed(1)} MW` },
      }),
      caption: 'Power rises in proportion to the head: the same flow falling four times as far gives four times the power.',
      aria: 'Straight line of power against head for 100 cubic metres per second, from 0 to 176 megawatts at 200 metres; 50 metres gives 44.1 MW.',
    };
  },
  tidal: () => {
    const f = (R) => renewables.tidalBasinEnergyJ(1e7, R) / 3.6e9;
    return {
      svg: linePlot({
        x: [0, 12], y: [0, 2100], xLabel: 'Tidal range (m), 10 km² basin', yLabel: 'Energy (MWh)', xTicks: [0, 4, 8, 12], yFmt: (v) => String(v),
        series: [{ pts: range(0, 12, 60).map((R) => [R, f(R)]) }],
        markers: [{ x: 4, y: f(4), label: '4 m: 223', anchor: 'start', dx: 6, dy: -8 }, { x: 8, y: f(8), label: '8 m: 893 MWh', anchor: 'end', dx: -8 }],
        readout: { f, text: (x, y) => `${x.toFixed(1)} m: ${Math.round(y)} MWh` },
      }),
      caption: 'Doubling the tidal range from 4 to 8 m gives four times the energy per emptying.',
      aria: 'Energy per emptying of a 10 square kilometre basin rising with the square of the tidal range: 223 MWh at 4 metres, 893 at 8 metres.',
    };
  },
  wave: () => {
    const f = (Hs) => renewables.waveEnergyFlux(Hs, 8) / 1000;
    return {
      svg: linePlot({
        x: [0, 5], y: [0, 110], xLabel: 'Significant wave height (m), 8 s period', yLabel: 'Power (kW/m)', yFmt: (v) => String(v),
        series: [{ pts: range(0, 5, 50).map((h2) => [h2, f(h2)]) }],
        markers: [{ x: 2, y: f(2), label: '2 m: 15.7 kW/m' }],
        readout: { f, text: (x, y) => `${x.toFixed(1)} m: ${y.toFixed(1)} kW/m` },
      }),
      caption: 'Wave power grows with the square of the wave height.',
      aria: 'Wave power per metre of crest rising with the square of wave height at an 8 second period: 15.7 kilowatts per metre at 2 metres, 98 at 5 metres.',
    };
  },
  carnot: () => {
    const f = (Th) => renewables.carnotEfficiency(Th, 313.15) * 100;
    return {
      svg: linePlot({
        x: [313.15, 1100], y: [0, 80], xLabel: 'Hot side (°C), cold side 40 °C', yLabel: 'Carnot limit (%)',
        xTicks: [373.15, 573.15, 773.15, 973.15], xFmt: (v) => String(Math.round(v - 273.15)), yFmt: (v) => String(v),
        series: [{ pts: range(313.15, 1100, 80).map((T) => [T, f(T)]) }],
        markers: [{ x: 838.15, y: f(838.15), label: '565 °C: 62.6 %', anchor: 'end', dx: -8 }],
        readout: { f, text: (x, y) => `${Math.round(x - 273.15)} °C: ${y.toFixed(1)} %` },
      }),
      caption: 'The ceiling on heat-engine efficiency rises with the hot-side temperature, fast at first and then more slowly.',
      aria: 'Carnot efficiency against hot-side temperature with a 40 degree Celsius cold side, rising from 0 to about 72 percent at 827 degrees; 565 degrees gives 62.6 percent.',
    };
  },
  roundtrip: () => ({
    svg: barRow([
      { label: 'Energy stored', value: 100, cls: 'sun' },
      { label: 'After charging (95 %)', value: 95, cls: 'mid' },
      { label: 'Back out (95 % × 95 %)', value: 90.25, cls: 'elec' },
    ], { max: 100, unit: 'kWh' }),
    caption: 'Start with 100 kWh; each 95 % step takes its share, and 90.25 kWh comes back.',
    aria: 'Three bars: 100 kWh in, 95 after charging, 90.25 returned.',
  }),
};

function drawPlots() {
  for (const fig of document.querySelectorAll('figure.eq-visual[data-plot]')) {
    const make = PLOTS[fig.dataset.plot];
    if (!make) continue;
    try {
      const { svg, caption, aria } = make();
      svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', aria);
      clear(fig).append(svg, h('figcaption', {}, caption));
    } catch (e) { console.error(`plot ${fig.dataset.plot}`, e); }
  }
}

// ---------------------------------------------------------------- playground
const $ = (id) => document.getElementById(id);
let current = FORMULAS[0];
const values = Object.create(null); // keyed by user-typed names: no inherited keys

function renderTex(el, src) {
  // core.js renders every .tex that lacks data-rendered; reset the element and ask it to.
  clear(el).append(h('div', { class: 'tex', 'data-tex': src }, src));
  renderMath(el);
}

function varInputs(names) {
  const box = $('pg-vars');
  const legend = box.querySelector('legend');
  const keep = new Map([...box.querySelectorAll('input[data-var]')].map((i) => [i.dataset.var, i]));
  clear(box).append(legend);
  if (!names.length) box.append(h('p', { class: 'muted pg-none' }, 'This formula has no variables.'));
  for (const name of names) {
    const spec = current.vars[name];
    if (!(name in values)) values[name] = spec ? spec.value : 1;
    const id = `pg-v-${name}`;
    const input = keep.get(name) ?? h('input', { type: 'number', id, step: 'any', inputmode: 'decimal', 'data-var': name });
    if (!keep.has(name)) {
      input.value = String(values[name]);
      input.addEventListener('input', () => { values[name] = input.value === '' ? NaN : Number(input.value); compute(); });
    }
    box.append(h('div', { class: 'control pg-var' },
      h('label', { for: id }, h('span', {}, spec ? spec.label : 'Your variable', ' ', h('code', {}, name)), spec?.unit ? h('span', { class: 'unit' }, spec.unit) : null),
      input));
  }
}

function compute() {
  const out = $('pg-out'); const status = $('pg-status'); const src = $('pg-formula').value;
  let tree;
  try { tree = parse(src); } catch (e) {
    out.textContent = '—'; out.dataset.state = 'error';
    status.textContent = e instanceof ExprError ? `The formula can't be read: ${e.message}.` : 'The formula can\'t be read.';
    return;
  }
  const names = [...variablesOf(tree)];
  const shown = [...$('pg-vars').querySelectorAll('input[data-var]')].map((i) => i.dataset.var);
  if (names.join() !== shown.join()) varInputs(names);
  const missing = names.filter((n) => !Number.isFinite(values[n]));
  if (missing.length) {
    out.textContent = '—'; out.dataset.state = 'error';
    status.textContent = `Enter a number for ${missing.join(', ')}.`;
    return;
  }
  let y;
  try { y = calc(src, Object.fromEntries(names.map((n) => [n, values[n]]))); } catch (e) {
    out.textContent = '—'; out.dataset.state = 'error';
    status.textContent = e instanceof ExprError ? `Can't calculate: ${e.message}.` : 'Can\'t calculate this.';
    return;
  }
  if (!Number.isFinite(y)) {
    out.textContent = '—'; out.dataset.state = 'error';
    status.textContent = Number.isNaN(y) ? 'The result is not a number: check for a square root or logarithm of a negative value.' : 'The result is infinite: check for a division by zero.';
    return;
  }
  const unit = src === current.formula ? current.result.unit : '';
  out.textContent = `${fmt(y, 4)}${unit ? ` ${unit}` : ''}`; out.dataset.state = 'ok';
  $('pg-result-label').textContent = src === current.formula ? current.result.label : 'Result of your formula';
  if (src === current.formula && current.liveCheck !== false) {
    const ref = current.check(MODS, values);
    const agree = Math.abs(ref - y) <= 1e-6 * Math.max(1, Math.abs(ref));
    status.textContent = agree ? 'Agrees with the physics code that drives the site\'s visuals.' : `The site's physics code gives ${fmt(ref, 4)} here.`;
  } else if (src !== current.formula) {
    status.textContent = 'Your own formula: units are up to you.';
  } else status.textContent = '';
}

function choose(id, { focus = false } = {}) {
  current = byId(id) ?? FORMULAS[0];
  $('pg-pick').value = current.id;
  for (const k of Object.keys(values)) delete values[k];
  $('pg-formula').value = current.formula;
  clear($('pg-vars')).append(h('legend', {}, 'Values'));
  renderTex($('pg-tex'), current.tex);
  compute();
  if (focus) $('pg-pick').focus({ preventScroll: true });
}

function initPlayground() {
  const pick = $('pg-pick');
  if (!pick) return;
  for (const f of FORMULAS) pick.append(h('option', { value: f.id }, f.title));
  pick.addEventListener('change', () => choose(pick.value));
  $('pg-formula').addEventListener('input', compute);
  $('pg-reset').addEventListener('click', () => choose(current.id));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.to-playground[data-formula]');
    if (a) choose(a.dataset.formula, { focus: true });
  });
  choose(FORMULAS[0].id);
}

// ---------------------------------------------------------------- deep links
// KaTeX renders after the browser has already jumped to #eq-…; jump again once the layout settles.
function settleHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  let tries = 0;
  const wait = () => {
    const pending = document.querySelectorAll('main .tex:not([data-rendered])').length;
    if (pending && tries++ < 40) { setTimeout(wait, 75); return; }
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  };
  wait();
}

drawPlots();
initPlayground();
settleHash();
