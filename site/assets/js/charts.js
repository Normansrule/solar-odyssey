// ECharts loader and theme bridge. ECharts is vendored (site/vendor/echarts) and
// loaded on demand. Charts read colours from CSS custom properties so they follow
// the light/dark theme, and re-render when the theme changes.

import { cssVar, onTheme } from './dom.js';

const ROOT = new URL('../../', import.meta.url);
let loading = null;

export function loadScript(rel) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL(rel, ROOT).href; s.async = true;
    s.onload = resolve; s.onerror = () => reject(new Error(`could not load ${rel}`));
    document.head.append(s);
  });
}

export function loadECharts() {
  loading ??= window.echarts ? Promise.resolve(window.echarts) : loadScript('vendor/echarts/echarts.min.js').then(() => window.echarts);
  return loading;
}

/** Current theme colours for charts. `sun` is --sun-line: the sunlight amber darkened in the
 *  light theme so lines, bars and points reach 3:1 against the page (WCAG 1.4.11). */
export function palette() {
  const v = (n) => cssVar(n);
  return {
    ink: v('--ink'), ink2: v('--ink-2'), rule: v('--rule'), paper: v('--paper'), panel: v('--panel'), sun: v('--sun-line'),
    silicon: v('--silicon'), electron: v('--electron'), hole: v('--hole'),
    tech: { silicon: v('--t-silicon'), thinfilm: v('--t-thinfilm'), perovskite: v('--t-perovskite'), multijunction: v('--t-multijunction'), emerging: v('--t-emerging'), tandem: v('--t-tandem') },
    source: { solar: v('--r-solar'), wind: v('--r-wind'), hydro: v('--r-hydro'), geothermal: v('--r-geothermal'), ocean: v('--r-ocean'), biomass: v('--r-biomass'), csp: v('--r-csp'), storage: v('--r-storage') },
  };
}

/** Axis/grid/tooltip defaults for the current theme. Merge into your option. */
export function baseOption() {
  const c = palette();
  const axis = {
    axisLine: { lineStyle: { color: c.rule } }, axisTick: { lineStyle: { color: c.rule } },
    axisLabel: { color: c.ink2, fontFamily: 'Atkinson Next, system-ui, sans-serif' },
    splitLine: { lineStyle: { color: c.rule, opacity: 0.6 } },
    nameTextStyle: { color: c.ink2, fontFamily: 'Atkinson Next, system-ui, sans-serif' },
  };
  return {
    animationDuration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900,
    textStyle: { fontFamily: 'Atkinson Next, system-ui, sans-serif', color: c.ink },
    grid: { left: 64, right: 24, top: 36, bottom: 56, containLabel: true },
    tooltip: { backgroundColor: c.panel, borderColor: c.rule, textStyle: { color: c.ink }, confine: true },
    legend: { textStyle: { color: c.ink2 } },
    xAxis: axis, yAxis: axis,
    _axis: axis,
  };
}

/**
 * ECharts' built-in tooltip text uses inline style="" attributes for its colour
 * markers, which the site's Content Security Policy blocks. Any tooltip without a
 * custom formatter is switched to ECharts' rich-text renderer, which draws on the
 * canvas instead of injecting HTML. Custom formatters must return plain text or
 * HTML that uses classes only (scripts/check_site.py forbids style attributes).
 * Such HTML is inserted with innerHTML by ECharts, so every string that comes from a
 * dataset (names, labels, institutions) must go through esc() from dom.js.
 */
export function cspSafe(option) {
  const fix = (tt) => {
    if (tt && typeof tt === 'object' && !tt.formatter && !tt.renderMode) tt.renderMode = 'richText';
  };
  if (option) {
    [].concat(option.tooltip ?? []).forEach(fix);
    [].concat(option.series ?? []).forEach((s) => s && s.tooltip && !option.tooltip?.formatter && fix(s.tooltip));
  }
  return option;
}

/**
 * Create a chart in `el` whose option is produced by build(palette, echarts).
 * Handles resize, theme switching and disposal. Returns { chart, refresh }.
 */
export async function makeChart(el, build) {
  const echarts = await loadECharts();
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  const refresh = () => chart.setOption(cspSafe(build(palette(), echarts)), { notMerge: true });
  onTheme(refresh);
  new ResizeObserver(() => chart.resize()).observe(el);
  el.setAttribute('role', el.getAttribute('role') || 'img');
  return { chart, refresh };
}
