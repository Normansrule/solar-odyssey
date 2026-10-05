// Flat sun path chart (polar plot): the sky seen from above, zenith in the centre,
// horizon at the edge, north at the top and east to the right, like a map.
import { h, clear } from '../assets/js/dom.js';

const S = (tag, attrs = {}, ...kids) => h.svg(tag, attrs, ...kids);
const rad = (d) => (d * Math.PI) / 180;
const SIZE = 520; const CX = SIZE / 2; const CY = SIZE / 2; const R = 205;

export const project = (el, az) => {
  const r = (R * (90 - el)) / 90;
  return [CX + r * Math.sin(rad(az)), CY - r * Math.cos(rad(az))];
};
const pts = (run) => run.map((p) => project(p.elevation, p.azimuth).map((v) => v.toFixed(1)).join(',')).join(' ');

/** Points along the great circle between two sky directions (elevation/azimuth), for the AOI arc. */
function arcBetween(a, b, n = 24) {
  const v = (el, az) => [Math.cos(rad(el)) * Math.sin(rad(az)), Math.cos(rad(el)) * Math.cos(rad(az)), Math.sin(rad(el))];
  const p = v(a.elevation, a.azimuth); const q = v(b.elevation, b.azimuth);
  const dot = Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
  const om = Math.acos(dot); const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n; const s = Math.sin(om) || 1;
    const k1 = om ? Math.sin((1 - t) * om) / s : 1 - t; const k2 = om ? Math.sin(t * om) / s : t;
    const x = k1 * p[0] + k2 * q[0]; const y = k1 * p[1] + k2 * q[1]; const z = k1 * p[2] + k2 * q[2];
    const el = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI; const az = (Math.atan2(x, y) * 180) / Math.PI;
    out.push(project(el, az));
  }
  return out;
}

export function createFlat(host) {
  const svg = S('svg', { class: 'sp-flat', viewBox: `0 0 ${SIZE} ${SIZE}`, role: 'img', 'aria-label': 'Sun path chart' });
  host.append(svg);

  const grid = S('g', { class: 'spf-grid' });
  grid.append(S('circle', { cx: CX, cy: CY, r: R, class: 'spf-horizon' }));
  for (const e of [30, 60]) grid.append(S('circle', { cx: CX, cy: CY, r: (R * (90 - e)) / 90, class: 'spf-ring' }));
  for (let a = 0; a < 360; a += 30) {
    const [x, y] = project(0, a);
    grid.append(S('line', { x1: CX, y1: CY, x2: x, y2: y, class: 'spf-ring' }));
    if (a % 90) { const [tx, ty] = project(-9, a); grid.append(S('text', { x: tx, y: ty + 4, class: 'spf-tick', 'text-anchor': 'middle' }, `${a}°`)); }
  }
  for (const [t, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    const [x, y] = project(-12, a);
    grid.append(S('text', { x, y: y + 7, class: 'spf-compass', 'text-anchor': 'middle' }, t));
  }
  for (const e of [30, 60]) { const [x, y] = project(e, 0); grid.append(S('text', { x: x + 5, y: y - 4, class: 'spf-tick' }, `${e}°`)); }
  const paths = S('g'); const hours = S('g'); const aoi = S('g'); const marks = S('g');
  svg.append(grid, paths, hours, aoi, marks);

  let lastKey = null;
  function update(st) {
    if (st.pathKey !== lastKey) {
      lastKey = st.pathKey; clear(paths); clear(hours);
      const add = (runs, cls) => { for (const run of runs) if (run.length > 1) paths.append(S('polyline', { points: pts(run), class: `spf-path ${cls}` })); };
      add(st.paths.jun, 'spf-jun'); add(st.paths.eq, 'spf-eq'); add(st.paths.dec, 'spf-dec');
      if (st.showDay) add(st.paths.day, 'spf-day');
      for (const hm of st.hourMarks) {
        const [x, y] = project(hm.elevation, hm.azimuth);
        hours.append(S('circle', { cx: x, cy: y, r: 3.5, class: 'spf-hour' }));
        if (hm.label) {
          const dx = x - CX; const dy = y - CY; const d = Math.hypot(dx, dy) || 1;
          hours.append(S('text', { x: x + (dx / d) * 16, y: y + (dy / d) * 16 + 4, class: 'spf-hour-label', 'text-anchor': 'middle' }, hm.label));
        }
      }
    }
    clear(aoi); clear(marks);
    const n = { elevation: 90 - st.tilt, azimuth: st.az };
    const [nx, ny] = project(n.elevation, n.azimuth);
    const up = st.sun && st.sun.elevation > 0;
    if (up) {
      const arc = arcBetween(n, st.sun);
      aoi.append(S('polyline', { points: arc.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '), class: 'spf-aoi' }));
      const mid = arc[Math.floor(arc.length / 2)];
      if (st.aoi > 6) aoi.append(S('text', { x: mid[0] + 8, y: mid[1] - 8, class: 'spf-aoi-label' }, `θ ${Math.round(st.aoi)}°`));
    }
    marks.append(S('g', { class: 'spf-normal', transform: `translate(${nx.toFixed(1)} ${ny.toFixed(1)})` },
      S('rect', { x: -6, y: -6, width: 12, height: 12, transform: 'rotate(45)' }),
      S('text', { x: 0, y: 22, 'text-anchor': 'middle' }, 'panel faces')));
    if (up) {
      const [sx, sy] = project(st.sun.elevation, st.sun.azimuth);
      marks.append(S('circle', { cx: sx, cy: sy, r: 18, class: 'spf-sun-halo' }), S('circle', { cx: sx, cy: sy, r: 9, class: 'spf-sun' }));
    }
    svg.setAttribute('aria-label', st.label);
  }
  return { el: svg, update };
}
