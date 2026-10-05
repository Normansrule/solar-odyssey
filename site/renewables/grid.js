// The smart grid: frequency after a trip, an illustrative duck curve, and the balancing game.
import { mountShares, bindRange, segmented, setText } from './renewables-b-common.js';
import { hoursOfDay, solarShape, demandShape, windShape, dispatchDay, frequencyAfterTrip } from '../assets/js/physics/grid.js';
import { makeChart, baseOption } from '../assets/js/charts.js';
import { mountDayCharts } from './renewables-b-day.js';

mountShares();
const n0 = (v) => Math.round(v).toLocaleString('en-US');

// ---------- frequency after a trip ----------
const trip = { loss: 1000, H: 4, ramp: 10 };
let tripRes = null; let tripChart = null;
const buildTrip = (c) => {
  const b = baseOption(); const r = tripRes;
  const step = 10; // plot every 0.1 s
  const data = r.t.filter((_, i) => i % step === 0).map((t, j) => [+t.toFixed(2), +r.f[j * step].toFixed(4)]);
  return {
    ...b, legend: { show: false }, grid: { left: 8, right: 16, top: 26, bottom: 26, containLabel: true },
    tooltip: { ...b.tooltip, trigger: 'axis', formatter: (ps) => `<div class="tt-head">${ps[0].value[0].toFixed(1)} s after the trip</div><div class="tt-row"><span class="tt-name"><span class="tt-k k-freq"></span>Frequency</span><strong>${ps[0].value[1].toFixed(3)} Hz</strong></div>` },
    xAxis: { ...b._axis, type: 'value', min: 0, max: 30, name: 'seconds after the trip', nameLocation: 'middle', nameGap: 28 },
    yAxis: { ...b._axis, type: 'value', min: (v) => Math.min(49, Math.floor(v.min * 10) / 10), max: 50.1, name: 'Hz', nameGap: 8, nameTextStyle: { ...b._axis.nameTextStyle, align: 'right' }, axisLabel: { ...b._axis.axisLabel, formatter: (v) => v.toFixed(1) } },
    series: [{
      type: 'line', name: 'Frequency', symbol: 'none', data, lineStyle: { color: c.silicon, width: 2 }, itemStyle: { color: c.silicon },
      markPoint: { symbol: 'circle', symbolSize: 9, itemStyle: { color: c.hole, borderColor: c.panel, borderWidth: 2 }, label: { show: true, position: 'bottom', color: c.ink, formatter: () => `lowest ${r.nadir.toFixed(2)} Hz` }, data: [{ coord: [+r.tNadir.toFixed(2), +r.nadir.toFixed(4)] }] },
    }],
  };
};
async function runTrip() {
  tripRes = frequencyAfterTrip({ deltaPMW: trip.loss, H: trip.H, S: 50000, f0: 50, rampS: trip.ramp });
  setText('t-rocof', `${Math.abs(tripRes.rocof0).toFixed(3)} Hz/s`);
  setText('t-nadir', `${tripRes.nadir.toFixed(2)} Hz`);
  setText('t-when', `${tripRes.tNadir.toFixed(1)} s`);
  if (!tripChart) tripChart = await makeChart(document.getElementById('trip-chart'), (c) => buildTrip(c));
  else tripChart.refresh();
}
bindRange(document.getElementById('t-loss'), document.getElementById('t-loss-out'), (v) => `${n0(v)} MW`, (v) => { trip.loss = v; runTrip(); });
bindRange(document.getElementById('t-h'), document.getElementById('t-h-out'), (v) => `${v.toFixed(1)} s`, (v) => { trip.H = v; runTrip(); });
bindRange(document.getElementById('t-ramp'), document.getElementById('t-ramp-out'), (v) => `${v} s`, (v) => { trip.ramp = v; runTrip(); });

// ---------- illustrative duck curve ----------
const hours = hoursOfDay(24);
const HL = hours.map((_, i) => `${String(i).padStart(2, '0')}:00`);
const demand = demandShape(hours).map((d) => d * 1000);
const springSun = solarShape(hours, { lat: 35, month: 4 });
const LEVELS = [0, 1000, 2000, 3000];
makeChart(document.getElementById('duck-chart'), (c) => {
  const b = baseOption();
  const cols = [c.ink2, c.sun, c.source.csp, c.hole];
  return {
    ...b, legend: { show: false }, grid: { left: 8, right: 16, top: 26, bottom: 4, containLabel: true },
    tooltip: { ...b.tooltip, trigger: 'axis', formatter: (ps) => `<div class="tt-head">${ps[0].axisValue}</div>${ps.map((p) => `<div class="tt-row"><span class="tt-name">${p.seriesName}</span><strong>${n0(typeof p.value === 'object' ? p.value.value : p.value)} MW</strong></div>`).join('')}` },
    xAxis: { ...b._axis, type: 'category', data: HL, axisLabel: { ...b._axis.axisLabel, interval: document.getElementById('duck-chart').clientWidth < 520 ? 5 : 2 }, splitLine: { show: false } },
    yAxis: { ...b._axis, type: 'value', name: 'MW', nameGap: 8, nameTextStyle: { ...b._axis.nameTextStyle, align: 'right' }, axisLabel: { ...b._axis.axisLabel, formatter: (v) => v.toLocaleString('en-US') } },
    series: LEVELS.map((S, k) => {
      const net = demand.map((d, i) => +(d - S * springSun[i]).toFixed(1));
      // label each curve once, at its midday low (or above the line for no solar), not at the converging ends
      const at = S ? net.indexOf(Math.min(...net)) + 1 : 9;
      const name = S ? `${n0(S)} MW of solar` : 'No solar';
      return {
        name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 0, showSymbol: true, data: net.map((v, i) => (i === at ? { value: v, symbolSize: 7, label: { show: true, position: S ? 'right' : 'top', formatter: name, color: c.ink, fontWeight: 600, distance: 8 } } : v)),
        lineStyle: { width: k ? 2 : 2.5, color: cols[k] }, itemStyle: { color: cols[k] },
        markLine: k === 0 ? { silent: true, symbol: 'none', lineStyle: { color: c.rule, width: 1, type: 'solid' }, label: { show: false }, data: [{ yAxis: 0 }] } : undefined,
      };
    }),
  };
});
// ---------- balancing game ----------
const DAYS = {
  sunny: { month: 6, solar: 1, wind: 0.35 },
  mixed: { month: 4, solar: 0.75, wind: 1 },
  windy: { month: 12, solar: 0.4, wind: 1.8 },
};
const g = { day: 'mixed', solar: 1200, wind: 300, power: 200, energy: 800, flex: 0 };
const wShape = windShape(hours);
const update = await mountDayCharts(document.getElementById('game-chart'), document.getElementById('game-soc'));
function runGame() {
  const d = DAYS[g.day];
  const sol = solarShape(hours, { lat: 35, month: d.month }).map((s) => s * g.solar * d.solar);
  const win = wShape.map((w) => w * g.wind * d.wind);
  const ren = sol.map((s, i) => s + win[i]);
  const r = dispatchDay({ demand, renewable: ren, powerMW: g.power, energyMWh: g.energy, rte: 0.85, flexMW: g.flex });
  const t = r.totals;
  setText('g-share', `${(100 * t.renewableShare).toFixed(0)} %`);
  setText('g-curt', `${(100 * t.curtailedShare).toFixed(0)} %`);
  setText('g-unmet', `${n0(t.unmetMWh)} MWh`);
  setText('g-peak', `${n0(t.peakUnmetMW)} MW`);
  setText('g-moved', `${n0(t.shiftedMWh)} MWh`);
  const shareOk = t.renewableShare >= 0.9; const wasteOk = t.curtailedShare < 0.15;
  const el = document.getElementById('g-verdict');
  el.dataset.ok = String(shareOk && wasteOk);
  el.textContent = shareOk && wasteOk
    ? `Goal reached on this day: ${(100 * t.renewableShare).toFixed(0)} % renewable, ${(100 * t.curtailedShare).toFixed(0)} % wasted. Now try the other weather: does the same mix still work?`
    : !shareOk && !wasteOk ? 'Not yet: you waste a lot at some hours and still fall short at others. That is a job for storage or flexible demand, not more generation.'
      : !shareOk ? `Not yet: ${(100 * t.renewableShare).toFixed(0)} % renewable. Find the hours where other supply is needed, and fill them with more wind, more storage or shifted demand.`
        : `Close: ${(100 * t.renewableShare).toFixed(0)} % renewable, but ${(100 * t.curtailedShare).toFixed(0)} % of renewable output is wasted. Store or shift the surplus instead of overbuilding.`;
  update(r, {
    parts: [
      { key: 'solar', name: 'Solar used directly', share: (i) => (ren[i] > 0 ? sol[i] / ren[i] : 0), color: (c) => c.source.solar },
      { key: 'wind', name: 'Wind used directly', share: (i) => (ren[i] > 0 ? win[i] / ren[i] : 0), color: (c) => c.source.wind },
    ],
    energyMWh: g.energy, demand, showLoad: g.flex > 0,
  });
}
const ctl = (id, key, unit) => bindRange(document.getElementById(id), document.getElementById(`${id}-out`), (v) => `${n0(v)} ${unit}`, (v) => { g[key] = v; runGame(); });
ctl('g-solar', 'solar', 'MW'); ctl('g-wind', 'wind', 'MW'); ctl('g-power', 'power', 'MW'); ctl('g-energy', 'energy', 'MWh'); ctl('g-flex', 'flex', 'MW');
segmented(document.getElementById('g-day'), (v) => { g.day = v; runGame(); }, { fire: false });
runGame();
