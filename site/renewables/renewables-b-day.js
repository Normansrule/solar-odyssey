// Page-local chart helper shared by storage.html and grid.html: draws one day of the
// dispatch model (physics/grid.js) as stacked hourly bars plus a state-of-charge chart.
import { makeChart, baseOption } from '../assets/js/charts.js';
import { cssVar } from '../assets/js/dom.js';

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
const round = (v) => Math.round(v);

/**
 * mountDayCharts(powerEl, socEl) -> update(result, { parts, energyMWh, showLoad })
 * parts: [{ key, name, share: (i) => fraction of the direct supply in hour i, color: (c) => css colour }]
 */
export async function mountDayCharts(powerEl, socEl) {
  let state = null;
  const tooltip = (b, rows) => ({
    ...b.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' },
    formatter: (ps) => {
      const i = ps[0].dataIndex;
      const lines = rows.map(([k, name, val]) => [k, name, val(i)]).filter(([, , v]) => v != null && Math.abs(v) >= 0.5);
      return `<div class="tt-head">${HOURS[i]}–${String(i + 1).padStart(2, '0')}:00</div>${lines.map(([k, name, v]) => `<div class="tt-row"><span class="tt-name"><span class="tt-k k-${k}"></span>${name}</span><strong>${round(v).toLocaleString('en-US')} ${k === 'store' ? 'MWh' : 'MW'}</strong></div>`).join('')}`;
    },
  });
  const xAxis = (b) => ({ ...b._axis, type: 'category', data: HOURS, axisLabel: { ...b._axis.axisLabel, interval: powerEl.clientWidth < 520 ? 5 : 2 }, splitLine: { show: false } });
  const buildPower = (c) => {
    const b = baseOption(); const r = state.result;
    const direct = state.parts.map((p) => ({
      name: p.name, type: 'bar', stack: 'p', barCategoryGap: '18%', itemStyle: { color: p.color(c) },
      data: r.direct.map((d, i) => +(d * p.share(i)).toFixed(2)),
    }));
    // Pale (translucent) segments get a solid outline in their own colour so each one still
    // stands out at 3:1 from the background and its neighbours (WCAG 1.4.11).
    const tint = (hex, a) => { const n = parseInt(hex.replace('#', ''), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };
    const bar = (name, data, color, opacity = 1, radius = false) => ({ name, type: 'bar', stack: 'p',
      itemStyle: opacity < 1 && /^#[0-9a-f]{6}$/i.test(color) ? { color: tint(color, opacity), borderColor: color, borderWidth: 1, borderRadius: radius ? [3, 3, 0, 0] : 0 } : { color, opacity, borderRadius: radius ? [3, 3, 0, 0] : 0 },
      data: data.map((v) => +v.toFixed(2)) });
    const rows = [
      ...state.parts.map((p) => [p.key, p.name, (i) => r.direct[i] * p.share(i)]),
      ['discharge', 'From storage', (i) => r.discharge[i]],
      ['unmet', 'Still needed', (i) => r.unmet[i]],
      ['charge', 'Into storage', (i) => r.charge[i]],
      ['curtailed', 'Wasted', (i) => r.curtailed[i]],
      ['demand', state.showLoad ? 'Demand after shifting' : 'Demand', (i) => r.load[i]],
    ];
    if (state.showLoad) rows.push(['flex', 'Demand before shifting', (i) => state.demand[i]]);
    const series = [
      ...direct,
      bar('From storage', r.discharge, c.source.storage),
      bar('Still needed', r.unmet, c.ink2, 0.45),
      bar('Into storage', r.charge, c.source.storage, 0.4),
      bar('Wasted', r.curtailed, c.sun, 0.28, true),
      { name: 'Demand', type: 'line', step: 'middle', symbol: 'none', data: r.load.map((v) => +v.toFixed(1)), lineStyle: { color: c.ink, width: 2 }, itemStyle: { color: c.ink }, z: 5 },
    ];
    if (state.showLoad) series.push({ name: 'Demand before shifting', type: 'line', step: 'middle', symbol: 'none', data: state.demand.map((v) => +v.toFixed(1)), lineStyle: { color: cssVar('--good'), width: 1.5, type: [4, 3] }, itemStyle: { color: cssVar('--good') }, z: 4 });
    return {
      ...b, animationDurationUpdate: 250, legend: { show: false }, grid: { left: 8, right: 12, top: 26, bottom: 4, containLabel: true },
      tooltip: tooltip(b, rows), xAxis: xAxis(b),
      yAxis: { ...b._axis, type: 'value', name: 'MW', nameGap: 8, nameTextStyle: { ...b._axis.nameTextStyle, align: 'right' }, axisLabel: { ...b._axis.axisLabel, formatter: (v) => v.toLocaleString('en-US') } },
      series,
    };
  };
  const buildSoc = (c) => {
    const b = baseOption(); const r = state.result;
    return {
      ...b, legend: { show: false }, grid: { left: 8, right: 12, top: 24, bottom: 4, containLabel: true },
      tooltip: tooltip(b, [['store', 'Stored at end of hour', (i) => r.soc[i]]]), xAxis: xAxis(b),
      yAxis: { ...b._axis, type: 'value', min: 0, max: Math.max(1, state.energyMWh), splitNumber: 2, axisLabel: { ...b._axis.axisLabel, formatter: (v) => v.toLocaleString('en-US') }, name: 'MWh', nameGap: 6, nameTextStyle: { ...b._axis.nameTextStyle, align: 'right' } },
      series: [{ name: 'Stored', type: 'line', symbol: 'none', smooth: false, data: r.soc.map((v) => +v.toFixed(1)), lineStyle: { color: c.source.storage, width: 2 }, itemStyle: { color: c.source.storage }, areaStyle: { color: c.source.storage, opacity: 0.14 } }],
    };
  };
  let pc = null; let sc = null;
  return async function update(result, opts) {
    state = { result, ...opts };
    if (!pc) { pc = await makeChart(powerEl, (c) => buildPower(c)); sc = await makeChart(socEl, (c) => buildSoc(c)); }
    else { pc.refresh(); sc.refresh(); }
  };
}
