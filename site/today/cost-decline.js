// The cost collapse: module price on a log axis (drawn once, the first time it scrolls into view),
// price against cumulative capacity with a fitted learning curve, and the LCOE decline.
import { h, clear, fmt, reducedMotion } from '../assets/js/dom.js';
import { loadData, setBadge, is } from '../assets/js/data.js';
import { makeChart, baseOption } from '../assets/js/charts.js';
import { wrightsLaw } from '../assets/js/physics/econ.js';
import { fitLearningCurve, joinByYear } from '../assets/js/physics/learning.js';

const $ = (id) => document.getElementById(id);
const pairs = (a) => is.arr(a) && a.every((p) => is.arr(p) && is.year(p[0]) && is.num(p[1]) && p[1] > 0);
const validPrices = (d) => is.obj(d) && pairs(d.data);
const validDeploy = (d) => is.obj(d) && is.obj(d.data) && pairs(d.data.capacity_gw) && pairs(d.data.lcoe_pv);
const usd = (v) => (v >= 10 ? `$${v.toFixed(0)}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`);

const EVENTS = [
  { year: 1975, label: 'Oil-shock research money' },
  { year: 2000, label: 'Germany’s feed-in law' },
  { year: 2008, label: 'Steepest fall begins' },
  { year: 2011, label: 'China scales up' },
];

init();

async function init() {
  let prices; let deploy;
  try {
    const r = await loadData('module-prices.json', validPrices);
    prices = r.data.data; setBadge($('cd-badge'), r.state, 'Our World in Data');
  } catch (e) { console.error(e); setBadge($('cd-badge'), 'failed'); }
  try {
    const r = await loadData('solar-deployment.json', validDeploy);
    deploy = r.data.data;
    setBadge($('cd-badge2'), r.state, 'OWID / IRENA'); setBadge($('cd-badge3'), r.state, 'OWID / IRENA');
  } catch (e) { console.error(e); setBadge($('cd-badge2'), 'failed'); setBadge($('cd-badge3'), 'failed'); }
  if (prices) priceChart(prices);
  if (prices && deploy) curveChart(prices, deploy.capacity_gw);
  if (deploy) lcoeChart(deploy.lcoe_pv);
}

// ---------- 1. price on a log axis: the page's one orchestrated moment ----------
async function priceChart(prices) {
  const el = $('cd-price');
  const byYear = new Map(prices);
  let shown = reducedMotion(); // reduced motion: start with the finished frame
  let animateNext = false;
  const narrow = () => el.clientWidth < 560;
  const { chart, refresh } = await makeChart(el, (c) => {
    const base = baseOption();
    const evPoints = EVENTS.map((e, i) => ({
      value: [e.year, byYear.get(e.year)],
      label: { show: true, formatter: String(i + 1), color: c.ink, fontSize: 11, fontWeight: 700, position: 'inside' },
      name: e.label,
    }));
    const dur = animateNext ? 2600 : 0;
    return {
      ...base,
      animation: animateNext,
      grid: { left: 8, right: narrow() ? 64 : 96, top: 28, bottom: 8, containLabel: true },
      tooltip: { ...base.tooltip, trigger: 'axis', formatter: (ps) => { const p = ps.find((q) => q.seriesId === 'price'); return p ? `${p.value[0]}: ${usd(p.value[1])} per watt` : ''; } },
      xAxis: { ...base._axis, type: 'value', min: 1975, max: 2025, interval: narrow() ? 10 : 5, axisLabel: { ...base._axis.axisLabel, formatter: String }, splitLine: { show: false } },
      yAxis: {
        ...base._axis, type: 'log', min: 0.1, max: 200, logBase: 10, name: 'US$ per watt (2025 dollars)', nameLocation: 'end', nameGap: 10,
        nameTextStyle: { ...base._axis.nameTextStyle, align: 'left' },
        axisLabel: { ...base._axis.axisLabel, formatter: (v) => (v >= 1 ? `$${v}` : `$${v.toFixed(1)}`) },
      },
      series: [
        {
          id: 'price', type: 'line', data: shown ? prices : [], showSymbol: false, smooth: false,
          lineStyle: { width: 2.5, color: c.sun }, itemStyle: { color: c.sun },
          areaStyle: { color: c.sun, opacity: 0.08 },
          animationDuration: dur, animationEasing: 'linear',
          endLabel: { show: shown, formatter: (p) => `${usd(p.value[1])}`, color: c.ink, fontWeight: 600, distance: 6 },
        },
        {
          id: 'events', type: 'scatter', data: shown ? evPoints : [], symbolSize: 20, z: 3,
          itemStyle: { color: c.panel, borderColor: c.ink, borderWidth: 2 },
          animationDelay: animateNext ? (idx) => 600 + idx * 500 : 0, animationDuration: animateNext ? 400 : 0,
          tooltip: { show: false },
        },
        {
          id: 'start', type: 'scatter', data: shown ? [prices[0]] : [], symbolSize: 0,
          label: { show: shown, position: 'right', distance: 16, formatter: () => `${usd(prices[0][1])} per watt`, color: c.ink, fontWeight: 600 },
          animationDuration: 0,
        },
      ],
    };
  });
  // clear() first so ECharts creates the line afresh and plays its draw-on (clip) animation;
  // updating an existing empty series would only morph it into place instantly.
  const play = () => { shown = true; animateNext = !reducedMotion(); if (animateNext) chart.clear(); refresh(); animateNext = false; };
  if (!shown) {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); play(); } }, { threshold: 0.35 });
    io.observe(el);
  }
  $('cd-replay').addEventListener('click', () => { shown = false; refresh(); requestAnimationFrame(play); });
  new ResizeObserver(() => refresh()).observe(el);

  const rows = [...prices].reverse();
  clear($('cd-price-table')).append(h('table', {},
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Year'), h('th', { scope: 'col', class: 'num' }, 'US$ per watt (2025 dollars)'))),
    h('tbody', {}, rows.map(([y, v]) => h('tr', {}, h('td', { class: 'num' }, String(y)), h('td', { class: 'num' }, v.toFixed(3)))))));
}

// ---------- 2. learning curve on log-log axes ----------
async function curveChart(prices, capacity) {
  const el = $('cd-curve');
  const pts = joinByYear(capacity, prices); // [GW, $/W, year]
  const fit = fitLearningCurve(pts.map(([q, c]) => [q, c]));
  const first = pts[0]; const last = pts[pts.length - 1];
  const slider = $('cd-lr'); const out = $('cd-lr-out');
  $('cd-fit-lr').textContent = `${(fit.learningRate * 100).toFixed(1)} %`;
  $('cd-r2').textContent = fit.r2.toFixed(3);
  $('cd-actual').textContent = `${usd(last[1])}/W`;
  const qs = [first[0], last[0] * 1.6];
  const userLine = (lr) => qs.map((q) => [q, wrightsLaw(first[1], lr, Math.log2(q / first[0]))]);
  const fitLine = qs.map((q) => [q, fit.a * q ** -fit.b]);
  const narrow = () => el.clientWidth < 420;

  const { refresh } = await makeChart(el, (c) => {
    const base = baseOption();
    const lr = Number(slider.value) / 100;
    const labelled = new Set([2000, 2005, 2010, 2015, 2020, 2024]);
    return {
      ...base,
      animation: false,
      grid: { left: 8, right: narrow() ? 16 : 64, top: 28, bottom: 8, containLabel: true },
      tooltip: { ...base.tooltip, trigger: 'item', formatter: (p) => (p.seriesId === 'data' ? `${p.value[2]}: ${fmt(p.value[0], 3)} GW installed, ${usd(p.value[1])} per watt` : p.seriesName) },
      xAxis: { ...base._axis, type: 'log', min: 1, max: 4000, name: narrow() ? 'GW installed' : 'Cumulative capacity installed (GW)', nameLocation: 'middle', nameGap: 28, axisLabel: { ...base._axis.axisLabel, formatter: (v) => fmt(v, 2) } },
      yAxis: { ...base._axis, type: 'log', min: 0.1, max: 10, name: 'US$ per watt', nameLocation: 'end', nameGap: 10, nameTextStyle: { ...base._axis.nameTextStyle, align: 'left' }, axisLabel: { ...base._axis.axisLabel, formatter: (v) => `$${v}` } },
      series: [
        {
          id: 'data', name: 'Module price', type: 'scatter', data: pts, symbolSize: 8,
          itemStyle: { color: c.sun, borderColor: c.panel, borderWidth: 2 },
          label: { show: true, position: 'bottom', distance: 6, color: c.ink, fontSize: 11, formatter: (p) => (labelled.has(p.value[2]) ? String(p.value[2]) : '') },
        },
        {
          id: 'fit', name: `Fitted: ${(fit.learningRate * 100).toFixed(1)} % per doubling`, type: 'line', data: fitLine, showSymbol: false,
          lineStyle: { color: c.silicon, width: 2 },
          endLabel: { show: !narrow(), formatter: `fit ${(fit.learningRate * 100).toFixed(0)} %`, color: c.ink, fontSize: 12 },
        },
        {
          id: 'user', name: `Your line: ${(lr * 100).toFixed(0)} % per doubling`, type: 'line', data: userLine(lr), showSymbol: false,
          lineStyle: { color: c.hole, width: 2, type: [6, 4] },
          endLabel: { show: !narrow(), formatter: `you ${(lr * 100).toFixed(0)} %`, color: c.ink, fontSize: 12 },
        },
      ],
    };
  });
  const update = () => {
    const lr = Number(slider.value) / 100;
    out.textContent = `${slider.value} %`;
    $('cd-pred').textContent = `${usd(wrightsLaw(first[1], lr, Math.log2(last[0] / first[0])))}/W`;
    refresh();
  };
  slider.addEventListener('input', update);
  $('cd-fit').addEventListener('click', () => { slider.value = String(Math.round(fit.learningRate * 100)); update(); });
  new ResizeObserver(() => refresh()).observe(el);
  update();
}

// ---------- 3. LCOE ----------
async function lcoeChart(lcoe) {
  const el = $('cd-lcoe');
  const { refresh } = await makeChart(el, (c) => {
    const base = baseOption();
    return {
      ...base,
      grid: { left: 8, right: 70, top: 28, bottom: 8, containLabel: true },
      tooltip: { ...base.tooltip, trigger: 'axis', formatter: (ps) => `${ps[0].value[0]}: $${ps[0].value[1].toFixed(3)} per kWh` },
      xAxis: { ...base._axis, type: 'value', min: 2010, max: 2025, interval: 5, axisLabel: { ...base._axis.axisLabel, formatter: String }, splitLine: { show: false } },
      yAxis: { ...base._axis, type: 'value', min: 0, max: 0.45, interval: 0.1, name: 'US$ per kWh', nameLocation: 'end', nameGap: 10, nameTextStyle: { ...base._axis.nameTextStyle, align: 'left' }, axisLabel: { ...base._axis.axisLabel, formatter: (v) => `$${v.toFixed(2)}` } },
      series: [{
        type: 'line', data: lcoe, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2, color: c.sun }, itemStyle: { color: c.sun, borderColor: c.panel, borderWidth: 2 },
        endLabel: { show: true, formatter: (p) => `$${p.value[1].toFixed(3)}`, color: c.ink, fontWeight: 600 },
        label: { show: true, formatter: (p) => (p.value[0] === 2010 ? `$${p.value[1].toFixed(2)}` : ''), position: 'right', color: c.ink, fontWeight: 600 },
      }],
    };
  });
  new ResizeObserver(() => refresh()).observe(el);
}
