// I-V lab: I-V and P-V curves of the illustrative silicon cell with live sliders,
// a ghost curve at standard test conditions, and the fill-factor rectangles.
import { makeChart, baseOption } from '../assets/js/charts.js';
import { ivCurve, diodeCurrent } from '../assets/js/physics/pv.js';
import { cellAt, cellSummary } from '../assets/js/physics/junction.js';

const $ = (id) => document.getElementById(id);
const el = $('iv-chart');
if (el) init();

async function init() {
  const ui = {
    g: $('iv-g'), t: $('iv-t'), rs: $('iv-rs'), rsh: $('iv-rsh'), n: $('iv-n'),
    gOut: $('iv-g-out'), tOut: $('iv-t-out'), rsOut: $('iv-rs-out'), rshOut: $('iv-rsh-out'), nOut: $('iv-n-out'),
    isc: $('iv-isc'), voc: $('iv-voc'), imp: $('iv-imp'), vmp: $('iv-vmp'), pmax: $('iv-pmax'), ff: $('iv-ff'), eta: $('iv-eta'),
    summary: $('iv-summary'), reset: $('iv-reset'), hot: $('iv-hot'),
  };
  const RSH_DEFAULT = Math.log10(5000);
  const STC = { irradiance: 1000, tempC: 25, RsOhmCm2: 0.5, RshOhmCm2: 5000, n: 1 };
  const ref = { opts: STC, curve: ivCurve(cellAt(STC), 120), sum: cellSummary(STC) };
  let cur = null;

  const readOpts = () => {
    const v = Number(ui.rsh.value);
    return {
      irradiance: Number(ui.g.value), tempC: Number(ui.t.value), RsOhmCm2: Number(ui.rs.value),
      RshOhmCm2: Math.abs(v - RSH_DEFAULT) < 0.006 ? 5000 : Math.round(10 ** v), n: Number(ui.n.value),
    };
  };

  function compute() {
    const opts = readOpts();
    const sum = cellSummary(opts);
    const curve = opts.irradiance > 0 ? ivCurve(cellAt(opts), 120) : [];
    cur = { opts, sum, curve, cell: cellAt(opts) };
  }

  const delta = (now, then, unit, digits, scale = 1) => {
    const d = (now - then) * scale;
    if (Math.abs(d) < 0.5 * 10 ** -digits) return '';
    return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(digits)} ${unit}`;
  };
  function setReadout(dd, value, diff) {
    dd.replaceChildren(value, ...(diff ? [' ', Object.assign(document.createElement('small'), { textContent: diff })] : []));
  }

  function writeText() {
    const { opts, sum } = cur; const r = ref.sum;
    ui.gOut.textContent = `${opts.irradiance} W/m²`;
    ui.tOut.textContent = `${opts.tempC} °C`;
    ui.rsOut.textContent = `${opts.RsOhmCm2.toFixed(2)} Ω·cm²`;
    ui.rshOut.textContent = `${opts.RshOhmCm2.toLocaleString('en-US')} Ω·cm²`;
    ui.nOut.textContent = opts.n.toFixed(2);
    setReadout(ui.isc, `${sum.Isc.toFixed(2)} A`, delta(sum.Isc, r.Isc, 'A', 2));
    setReadout(ui.voc, `${sum.Voc.toFixed(3)} V`, delta(sum.Voc, r.Voc, 'mV', 0, 1000));
    setReadout(ui.imp, `${sum.Imp.toFixed(2)} A`, delta(sum.Imp, r.Imp, 'A', 2));
    setReadout(ui.vmp, `${sum.Vmp.toFixed(3)} V`, delta(sum.Vmp, r.Vmp, 'mV', 0, 1000));
    setReadout(ui.pmax, `${sum.Pmax.toFixed(2)} W`, delta(sum.Pmax, r.Pmax, 'W', 2));
    setReadout(ui.ff, sum.FF.toFixed(3), delta(sum.FF, r.FF, '', 3).trim());
    setReadout(ui.eta, `${(100 * sum.eta).toFixed(1)} %`, delta(sum.eta, r.eta, 'points', 1, 100));
    const text = opts.irradiance <= 0
      ? 'In the dark the cell makes no current and no power.'
      : `At ${opts.irradiance} W/m² and ${opts.tempC} °C the cell gives Isc ${sum.Isc.toFixed(2)} A and Voc ${sum.Voc.toFixed(3)} V. Its maximum power is ${sum.Pmax.toFixed(2)} W at ${sum.Vmp.toFixed(3)} V and ${sum.Imp.toFixed(2)} A, a fill factor of ${sum.FF.toFixed(3)} and an efficiency of ${(100 * sum.eta).toFixed(1)} % (standard test conditions: ${r.Pmax.toFixed(2)} W, ${(100 * r.eta).toFixed(1)} %).`;
    ui.summary.textContent = text;
    el.setAttribute('aria-label', `Current against voltage (top) and power against voltage (bottom). ${text}`);
  }

  const V_MAX = 0.85; const I_MAX = 12.5; const P_MAX = 8;
  const build = (c) => {
    const b = baseOption();
    const axis = b._axis;
    const narrow = el.clientWidth < 520;
    const { sum, curve } = cur; const g = ref.curve;
    const lit = curve.length > 0;
    const ivPts = curve.map((p) => [p.V, p.I]); const pvPts = curve.map((p) => [p.V, p.P]);
    const label = (txt, pos = 'right') => ({ show: true, formatter: txt, position: pos, color: c.ink, fontSize: 12, fontWeight: 600, distance: 8 });
    const xAxis = (gi, named) => ({
      ...axis, type: 'value', gridIndex: gi, min: 0, max: V_MAX, interval: 0.1,
      name: named ? 'Voltage (V)' : '', nameLocation: 'middle', nameGap: 28,
      axisLabel: { ...axis.axisLabel, show: named, formatter: (v) => v.toFixed(1) },
      splitLine: { ...axis.splitLine, show: false },
    });
    const yAxis = (gi, name, max, interval) => ({
      ...axis, type: 'value', gridIndex: gi, min: 0, max, interval, name, nameLocation: 'end', nameGap: 10,
      nameTextStyle: { ...axis.nameTextStyle, align: 'left', padding: [0, 0, 0, -36] },
    });
    return {
      ...b,
      animation: false,
      legend: { show: false },
      grid: [
        { left: narrow ? 44 : 56, right: narrow ? 14 : 28, top: 30, height: '50%', containLabel: false },
        { left: narrow ? 44 : 56, right: narrow ? 14 : 28, top: '67%', bottom: 46, containLabel: false },
      ],
      xAxis: [xAxis(0, false), xAxis(1, true)],
      yAxis: [yAxis(0, 'Current (A)', I_MAX, 2), yAxis(1, 'Power (W)', P_MAX, 2)],
      axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: c.ink2 }, label: { show: false } },
      tooltip: {
        ...b.tooltip, trigger: 'axis', axisPointer: { type: 'line' },
        formatter: (params) => {
          const V = params[0]?.axisValue ?? 0;
          if (!lit || V > sum.Voc) return `V = ${V.toFixed(3)} V<br>beyond open circuit`;
          const I = Math.max(0, diodeCurrent(V, cur.cell));
          return `V = ${V.toFixed(3)} V<br>I = ${I.toFixed(2)} A<br>P = ${(V * I).toFixed(2)} W`;
        },
      },
      series: [
        // standard-test-condition ghost
        { name: 'At standard test conditions', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: g.map((p) => [p.V, p.I]), showSymbol: false, silent: true,
          lineStyle: { color: c.ink2, width: 1.5, opacity: 0.45 }, z: 1 },
        { name: 'At standard test conditions (power)', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: g.map((p) => [p.V, p.P]), showSymbol: false, silent: true,
          lineStyle: { color: c.ink2, width: 1.5, opacity: 0.45 }, z: 1 },
        // fill-factor rectangles
        ...(lit ? [
          { name: 'Vmp × Imp', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: [[0, sum.Imp], [sum.Vmp, sum.Imp], [sum.Vmp, 0]], showSymbol: false, silent: true,
            lineStyle: { width: 0 }, areaStyle: { color: c.sun, opacity: 0.28 }, z: 2 },
          { name: 'Voc × Isc', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: [[0, sum.Isc], [sum.Voc, sum.Isc], [sum.Voc, 0]], showSymbol: false, silent: true,
            lineStyle: { color: c.ink2, width: 1.2, type: [5, 4] }, z: 3 },
        ] : []),
        // this cell now
        { name: 'This cell', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ivPts, showSymbol: false, lineStyle: { color: c.silicon, width: 2.5 }, z: 5 },
        { name: 'This cell (power)', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: pvPts, showSymbol: false, lineStyle: { color: c.silicon, width: 2.5 },
          areaStyle: { color: c.silicon, opacity: 0.08 }, z: 5 },
        ...(lit ? [
          { name: 'MPP', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0, data: [[sum.Vmp, sum.Imp]], symbolSize: 11, z: 6,
            itemStyle: { color: c.sun, borderColor: c.panel, borderWidth: 2 }, label: label('MPP', 'top') },
          { name: 'Ends', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0, data: [[0, sum.Isc], [sum.Voc, 0]], symbolSize: 9, z: 6,
            itemStyle: { color: c.silicon, borderColor: c.panel, borderWidth: 2 },
            label: { show: true, color: c.ink, fontSize: 11, fontWeight: 600,
              formatter: (p) => (p.dataIndex === 0 ? `Isc ${sum.Isc.toFixed(2)} A` : `Voc ${sum.Voc.toFixed(3)} V`),
              position: 'top', distance: 7 },
            labelLayout: (p) => (p.dataIndex === 0 ? { dx: 46, dy: 22 } : { dx: narrow ? -30 : -6, dy: -2 }) },
          { name: 'Pmax', type: 'scatter', xAxisIndex: 1, yAxisIndex: 1, data: [[sum.Vmp, sum.Pmax]], symbolSize: 11, z: 6,
            itemStyle: { color: c.sun, borderColor: c.panel, borderWidth: 2 }, label: label(`Pmax ${sum.Pmax.toFixed(2)} W`, sum.Vmp > 0.45 ? 'left' : 'right') },
        ] : []),
      ],
    };
  };

  compute();
  writeText();
  const { refresh } = await makeChart(el, build);

  let queued = false;
  const update = () => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; compute(); writeText(); refresh(); });
  };
  for (const inp of [ui.g, ui.t, ui.rs, ui.rsh, ui.n]) inp.addEventListener('input', update);
  const set = (o) => { ui.g.value = o.g; ui.t.value = o.t; ui.rs.value = o.rs; ui.rsh.value = o.rsh; ui.n.value = o.n; update(); };
  ui.reset.addEventListener('click', () => set({ g: 1000, t: 25, rs: 0.5, rsh: RSH_DEFAULT, n: 1 }));
  ui.hot.addEventListener('click', () => set({ g: 900, t: 65, rs: ui.rs.value, rsh: ui.rsh.value, n: ui.n.value }));
  ui.rsh.value = String(RSH_DEFAULT);
}
