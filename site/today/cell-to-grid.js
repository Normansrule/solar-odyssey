// From cell to grid: the bypass-diode module and the MPPT tracker.
// All electrical numbers come from physics/system.js (single-diode cells, bypass groups).
import { h, clear, fmt, reducedMotion, animate } from '../assets/js/dom.js';
import { stringCurve, groupAt, powerAtV, powerPeaks, perturbObserve, globalScan } from '../assets/js/physics/system.js';

const S = (tag, attrs = {}, ...kids) => h.svg(tag, attrs, ...kids);
const GROUPS = 3; const PER = 24;
const VD = 0.5;

// ---------------------------------------------------------------- bypass widget
const bp = {
  svg: document.getElementById('bp-svg'),
  shaded: new Set([30]),
  shade: 0.75,
  diodes: true,
};
const counts = () => Array.from({ length: GROUPS }, (_, g) => [...bp.shaded].filter((c) => Math.floor(c / PER) === g).length);
const groupsFor = (cnt, shade) => cnt.map((n) => ({ cells: PER, shaded: n, shade: n ? shade : 0 }));
let baseline = null;

function solveModule(cnt, shade, diodes) {
  const vD = diodes ? VD : 1e6;
  const curve = stringCurve(groupsFor(cnt, shade), { vD, N: 220 });
  const mpp = curve.reduce((a, b) => (b.P > a.P ? b : a), { P: -1 });
  const groups = groupsFor(cnt, shade).map((g) => groupAt(mpp.I, { ...g, vD }));
  return { curve, mpp, groups };
}

const inputs = [];
function buildBypassControls() {
  const host = document.getElementById('bp-group-inputs');
  for (let g = 0; g < GROUPS; g++) {
    const id = `bp-g${g}`;
    const inp = h('input', { type: 'number', id, min: 0, max: PER, step: 1, value: 0, inputmode: 'numeric' });
    inp.addEventListener('change', () => {
      const n = Math.max(0, Math.min(PER, Math.round(Number(inp.value) || 0)));
      for (let c = g * PER; c < (g + 1) * PER; c++) bp.shaded.delete(c);
      for (let c = 0; c < n; c++) bp.shaded.add(g * PER + c);
      renderBypass();
    });
    inputs.push(inp);
    host.append(h('div', { class: 'control' }, h('label', { for: id }, `Group ${g + 1}`), inp));
  }
  const shade = document.getElementById('bp-shade');
  shade.addEventListener('input', () => { bp.shade = Number(shade.value) / 100; document.getElementById('bp-shade-out').textContent = `${shade.value} %`; renderBypass(); });
  document.getElementById('bp-diodes').addEventListener('change', (e) => { bp.diodes = e.target.checked; renderBypass(); });
}

function renderBypass() {
  const cnt = counts();
  inputs.forEach((inp, g) => { inp.value = cnt[g]; });
  baseline ??= solveModule([0, 0, 0], 0, true);
  const r = solveModule(cnt, bp.shade, bp.diodes);
  const svg = bp.svg; const title = svg.querySelector('title');
  clear(svg); svg.append(title);
  const cw = 44; const ch = 34; const gap = 4; const x0 = 96; const y0 = 26; const bandH = 2 * ch + gap + 26;
  const iMax = baseline.mpp.I * 1.05;
  const wFor = (i) => (i <= 1e-3 ? 0 : 1.5 + 9 * Math.min(1, i / iMax));
  // junction box with the diodes
  svg.append(S('rect', { x: 8, y: y0 - 10, width: 52, height: GROUPS * bandH - 6, rx: 6, class: 'bp-box' }),
    S('text', { x: 8, y: y0 + GROUPS * bandH + 12, class: 'bp-small' }, 'Junction box with three bypass diodes'));
  let heat = 0;
  for (let g = 0; g < GROUPS; g++) {
    const gy = y0 + g * bandH; const res = r.groups[g];
    const rowY = [gy + ch / 2, gy + ch + gap + ch / 2];
    // current path through the cells: along row 1, back along row 2
    const left = x0 - 14; const right = x0 + 12 * (cw + gap) - gap + 10;
    const path = `M${left} ${rowY[0]} H${right} V${rowY[1]} H${left}`;
    const wc = wFor(res.Icells);
    if (wc) svg.append(S('path', { d: path, class: 'bp-flow', 'stroke-width': wc }));
    // cells
    for (let k = 0; k < PER; k++) {
      const idx = g * PER + k; const row = Math.floor(k / 12); const col = row ? 11 - (k % 12) : k % 12;
      const x = x0 + col * (cw + gap); const y = gy + row * (ch + gap);
      const isShaded = bp.shaded.has(idx);
      const cell = S('rect', { x, y, width: cw, height: ch, rx: 3, class: `bp-cell${isShaded ? ' is-shaded' : ''}`, 'data-c': idx });
      if (isShaded) cell.style.opacity = String(1 - 0.75 * bp.shade);
      cell.addEventListener('click', () => { if (bp.shaded.has(idx)) bp.shaded.delete(idx); else bp.shaded.add(idx); renderBypass(); });
      svg.append(cell);
      if (isShaded && res.Vshaded < -0.05) {
        const p = -res.Vshaded * res.Icells;
        heat = Math.max(heat, p);
        if (p > 0.5) svg.append(S('rect', { x: x - 3, y: y - 3, width: cw + 6, height: ch + 6, rx: 5, class: 'bp-hot' }));
      }
    }
    // diode branch from the group's start node to its end node
    const dx = 34; const wd = wFor(res.Idiode);
    svg.append(S('path', { d: `M${left} ${rowY[0]} H${dx} V${rowY[1]} H${left}`, class: `bp-wire${wd ? ' is-on' : ''}`, 'stroke-width': wd || 1.5 }));
    const my = (rowY[0] + rowY[1]) / 2;
    if (bp.diodes) {
      svg.append(S('path', { d: `M${dx - 9} ${my + 6} L${dx + 9} ${my + 6} L${dx} ${my - 7} Z M${dx - 9} ${my - 7} H${dx + 9}`, class: `bp-diode${res.bypassed ? ' is-on' : ''}` }));
    } else {
      svg.append(S('path', { d: `M${dx - 7} ${my - 7} L${dx + 7} ${my + 7} M${dx + 7} ${my - 7} L${dx - 7} ${my + 7}`, class: 'bp-nodiode' }));
    }
    if (g < GROUPS - 1) svg.append(S('path', { d: `M${left} ${rowY[1]} V${rowY[1] + ch / 2 + 15}`, class: 'bp-wire is-on', 'stroke-width': wFor(r.mpp.I) }));
    svg.append(S('text', { x: right + 6, y: my + 4, class: 'bp-small' }, `${fmt(res.Icells, 2)} A`));
  }
  title.textContent = `Module with three groups of 24 cells. ${counts().map((n, g) => `Group ${g + 1}: ${n} shaded`).join('; ')}. Module power ${fmt(r.mpp.P, 3)} W.`;
  const rd = document.getElementById('bp-readout');
  const bypassed = r.groups.filter((x) => x.bypassed).length;
  clear(rd).append(
    h('div', {}, h('dt', {}, 'Module power now'), h('dd', {}, fmt(r.mpp.P, 3), h('small', {}, ' W'))),
    h('div', {}, h('dt', {}, 'Without any shade'), h('dd', {}, fmt(baseline.mpp.P, 3), h('small', {}, ' W'))),
    h('div', {}, h('dt', {}, 'String current'), h('dd', {}, fmt(r.mpp.I, 3), h('small', {}, ' A'))),
    h('div', {}, h('dt', {}, 'Heat in worst shaded cell'), h('dd', {}, fmt(heat, 2), h('small', {}, ' W'))));
  const lost = 100 * (1 - r.mpp.P / baseline.mpp.P);
  const nShaded = bp.shaded.size;
  let msg;
  if (!nShaded || bp.shade === 0) msg = 'No shade: all 72 cells carry the same current and the diodes stay off.';
  else if (!bp.diodes) msg = `Without diodes the whole chain is throttled to what the shaded cell${nShaded > 1 ? 's' : ''} can pass: ${fmt(lost, 2)} % of the power is gone from ${nShaded} shaded cell${nShaded > 1 ? 's' : ''} out of 72. In a long string the other modules would instead force their full current through the shaded cell, which is how hot spots form.`;
  else if (bypassed) msg = `${bypassed} group${bypassed > 1 ? 's are' : ' is'} bypassed: the string current flows round ${bypassed > 1 ? 'them' : 'it'} through the diode, and the module keeps ${fmt(100 - lost, 2)} % of its power. The shaded cell is reverse-biased by its neighbours and still warms.`;
  else msg = `The shade is light enough that the best operating point keeps every group in the circuit; the module gives ${fmt(100 - lost, 2)} % of its unshaded power.`;
  document.getElementById('bp-explain').textContent = msg;
}

buildBypassControls();
renderBypass();

// ---------------------------------------------------------------- MPPT widget
const mp = {
  svg: document.getElementById('mppt-svg'),
  shade: false, depth: 0.75, dV: 0.6,
  curve: null, vmax: 0, peaks: [],
  state: null, trail: [], scan: null, loop: null, running: false,
};
const AX = { l: 58, r: 620, t: 18, b: 312, vMax: 55, pMax: 600 };
const sx = (v) => AX.l + ((AX.r - AX.l) * v) / AX.vMax;
const sy = (p) => AX.b - ((AX.b - AX.t) * p) / AX.pMax;
const pAt = (V) => powerAtV(mp.curve, V);

function buildCurve() {
  mp.curve = stringCurve(mp.shade ? [{}, {}, { shaded: 1, shade: mp.depth }] : [{}, {}, {}], { N: 260 });
  mp.vmax = mp.curve[mp.curve.length - 1].V;
  mp.peaks = powerPeaks(mp.curve);
  if (mp.state) mp.state = { ...mp.state, P: pAt(mp.state.V) };
}

function reset() {
  const V = 0.97 * mp.vmax;
  mp.state = { V, P: pAt(V), dir: -1 };
  mp.trail = [mp.state]; mp.scan = null;
}

function step() {
  mp.state = perturbObserve(mp.state, pAt, mp.dV);
  mp.state.V = Math.max(0.5, Math.min(mp.vmax, mp.state.V));
  mp.trail.push(mp.state); if (mp.trail.length > 14) mp.trail.shift();
}

function drawMppt() {
  const svg = mp.svg; const title = svg.querySelector('title');
  clear(svg); svg.append(title);
  const g = S('g', { class: 'mppt-axes' });
  for (let p = 0; p <= AX.pMax; p += 100) {
    g.append(S('line', { x1: AX.l, x2: AX.r, y1: sy(p), y2: sy(p), class: 'grid' }), S('text', { x: AX.l - 8, y: sy(p) + 4, 'text-anchor': 'end' }, String(p)));
  }
  for (let v = 0; v <= AX.vMax; v += 10) g.append(S('text', { x: sx(v), y: AX.b + 18, 'text-anchor': 'middle' }, String(v)));
  g.append(S('line', { x1: AX.l, x2: AX.r, y1: AX.b, y2: AX.b, class: 'axis' }),
    S('text', { x: (AX.l + AX.r) / 2, y: AX.b + 40, 'text-anchor': 'middle', class: 'title' }, 'Module voltage (V)'),
    S('text', { x: 14, y: (AX.t + AX.b) / 2, 'text-anchor': 'middle', class: 'title', transform: `rotate(-90 14 ${(AX.t + AX.b) / 2})` }, 'Power (W)'));
  svg.append(g);
  const d = mp.curve.map((pt, i) => `${i ? 'L' : 'M'}${sx(pt.V).toFixed(1)} ${sy(pt.P).toFixed(1)}`).join(' ');
  svg.append(S('path', { d: `${d} L${sx(mp.vmax)} ${AX.b} L${sx(0)} ${AX.b} Z`, class: 'mppt-area' }), S('path', { d, class: 'mppt-curve' }));
  // peaks
  const [gp, ...locals] = mp.peaks;
  for (const lp of locals) {
    svg.append(S('circle', { cx: sx(lp.V), cy: sy(lp.P), r: 5, class: 'mppt-local' }),
      S('text', { x: sx(lp.V), y: sy(lp.P) - 12, 'text-anchor': 'middle', class: 'mppt-label' }, `local peak ${fmt(lp.P, 3)} W`));
  }
  if (gp) {
    svg.append(S('circle', { cx: sx(gp.V), cy: sy(gp.P), r: 8, class: 'mppt-global' }),
      S('text', { x: sx(gp.V), y: sy(gp.P) - 15, 'text-anchor': 'middle', class: 'mppt-label' }, `${locals.length ? 'global peak ' : 'peak '}${fmt(gp.P, 3)} W`));
  }
  // scan
  if (mp.scan) {
    for (const s of mp.scan.samples.slice(0, mp.scan.shown)) svg.append(S('circle', { cx: sx(s.V), cy: sy(s.P), r: 2.5, class: 'mppt-sample' }));
    if (mp.scan.shown < mp.scan.samples.length) {
      const v = mp.scan.samples[Math.max(0, mp.scan.shown - 1)].V;
      svg.append(S('line', { x1: sx(v), x2: sx(v), y1: AX.t, y2: AX.b, class: 'mppt-sweep' }));
    }
  }
  // trail and operating point
  mp.trail.slice(0, -1).forEach((s, i, a) => {
    const c = S('circle', { cx: sx(s.V), cy: sy(s.P), r: 3.5, class: 'mppt-trail' });
    c.style.opacity = String(0.25 + (0.6 * (i + 1)) / a.length);
    svg.append(c);
  });
  const op = mp.state;
  svg.append(S('line', { x1: sx(op.V), x2: sx(op.V), y1: sy(op.P), y2: AX.b, class: 'mppt-drop' }),
    S('circle', { cx: sx(op.V), cy: sy(op.P), r: 7, class: 'mppt-op' }));
  title.textContent = `Power against voltage for one 72-cell module${mp.shade ? ' with one shaded cell' : ''}. Highest peak ${fmt(gp?.P ?? 0, 3)} W at ${fmt(gp?.V ?? 0, 3)} V. Tracker at ${fmt(op.V, 3)} V, ${fmt(op.P, 3)} W.`;

  const best = gp?.P ?? 1;
  clear(document.getElementById('mppt-readout')).append(
    h('div', {}, h('dt', {}, 'Tracker voltage'), h('dd', {}, fmt(op.V, 3), h('small', {}, ' V'))),
    h('div', {}, h('dt', {}, 'Power collected'), h('dd', {}, fmt(op.P, 3), h('small', {}, ' W'))),
    h('div', {}, h('dt', {}, 'Highest available'), h('dd', {}, fmt(best, 3), h('small', {}, ' W'))),
    h('div', {}, h('dt', {}, 'Share captured'), h('dd', {}, fmt((100 * op.P) / best, 3), h('small', {}, ' %'))));
  const recent = mp.trail.slice(-6).map((s) => s.V);
  const settled = mp.trail.length >= 6 && Math.max(...recent) - Math.min(...recent) <= 2.01 * mp.dV;
  const nearGlobal = gp && Math.abs(op.V - gp.V) < 2 * mp.dV + 0.6;
  let msg;
  if (mp.scan && mp.scan.shown < mp.scan.samples.length) msg = 'Global scan: sweeping the whole voltage range and remembering the best point…';
  else if (settled && !nearGlobal && locals.length) msg = `Stuck on a lower hump: collecting ${fmt(op.P, 3)} W while ${fmt(best, 3)} W is available. Every small step from here lowers the power, so perturb and observe never leaves. Try a global scan.`;
  else if (settled) msg = `Holding the peak, stepping back and forth by ${fmt(mp.dV, 2)} V around it.`;
  else msg = 'Climbing: each step raised the power, so the tracker keeps going the same way.';
  document.getElementById('mppt-status').textContent = msg;
}

function tick(n = 1) { for (let k = 0; k < n; k++) step(); drawMppt(); }

function setRunning(on) {
  mp.running = on;
  const b = document.getElementById('mppt-run');
  b.textContent = on ? 'Pause tracker' : 'Run tracker';
  if (on && !mp.loop) {
    let acc = 0;
    mp.loop = animate(mp.svg, (dt) => {
      if (!mp.running) return;
      acc += dt;
      if (mp.scan && mp.scan.shown < mp.scan.samples.length) {
        if (acc > 0.03) { acc = 0; mp.scan.shown++; if (mp.scan.shown >= mp.scan.samples.length) finishScan(); drawMppt(); }
        return;
      }
      if (acc > 0.14) { acc = 0; tick(); }
    });
  } else if (!on && mp.loop) { mp.loop.stop(); mp.loop = null; }
}

function startScan() {
  const N = 40; const samples = [];
  for (let k = 1; k < N; k++) { const V = (mp.vmax * k) / N; samples.push({ V, P: pAt(V) }); }
  mp.scan = { samples, shown: 0, best: globalScan(pAt, mp.vmax, N) };
  if (reducedMotion()) { mp.scan.shown = samples.length; finishScan(); drawMppt(); return; }
  setRunning(true);
}
function finishScan() {
  const b = mp.scan.best;
  mp.state = { V: b.V, P: b.P, dir: -1 };
  mp.trail = [mp.state];
}

document.getElementById('mppt-run').addEventListener('click', () => {
  if (reducedMotion()) { tick(10); return; }
  setRunning(!mp.running);
});
document.getElementById('mppt-step').addEventListener('click', () => { setRunning(false); mp.scan = null; tick(); });
document.getElementById('mppt-scan').addEventListener('click', startScan);
document.getElementById('mppt-reset').addEventListener('click', () => { reset(); drawMppt(); });
document.getElementById('mppt-shade').addEventListener('change', (e) => { mp.shade = e.target.checked; mp.scan = null; buildCurve(); drawMppt(); });
const depth = document.getElementById('mppt-depth');
depth.addEventListener('input', () => { mp.depth = Number(depth.value) / 100; document.getElementById('mppt-depth-out').textContent = `${depth.value} %`; buildCurve(); drawMppt(); });
const dv = document.getElementById('mppt-dv');
dv.addEventListener('input', () => { mp.dV = Number(dv.value); document.getElementById('mppt-dv-out').textContent = `${Number(dv.value).toFixed(1)} V`; });
if (reducedMotion()) document.getElementById('mppt-run').textContent = 'Run 10 steps';

buildCurve(); reset(); drawMppt();
