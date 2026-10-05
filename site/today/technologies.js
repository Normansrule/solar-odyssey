// Cell technologies today: the cross-section explorer, production-share bars and
// the comparison table (from data/technologies.json, loaded through the signed manifest).
import { h, clear } from '../assets/js/dom.js';
import { loadData, setBadge, is } from '../assets/js/data.js';

const ROLES = {
  metal: 'Metal contact',
  arc: 'Anti-reflection or protective coating',
  pass: 'Passivation layer',
  tco: 'Transparent conductor',
  n: 'n-type (collects electrons)',
  p: 'p-type (collects holes)',
  i: 'Undoped (intrinsic)',
  glass: 'Glass or substrate',
};

// Layers from the sunny side down. `nm` sets drawn height only (log scale); the page states thickness in words.
// fingers: metal drawn as separate lines; local: PERC rear contacts poking through; inter: interleaved rear.
const TECH = [
  {
    id: 'perc', name: 'PERC', full: 'Passivated emitter and rear cell, on a p-type wafer',
    layers: [
      { name: 'Front silver fingers', role: 'metal', nm: 15000, fingers: true, thick: 'thin printed lines, tens of micrometres tall', job: 'Collect the electrons that reach the front and carry them to the module wiring. They are kept narrow because every millimetre of metal shades the cell.' },
      { name: 'Anti-reflection coating (silicon nitride)', role: 'arc', nm: 80, thick: 'about 80 nm', job: 'Cancels reflection: light bouncing off its top and bottom surfaces interferes destructively. It also passivates the front surface. This is the layer that makes cells look dark blue.' },
      { name: 'n-type emitter', role: 'n', nm: 400, thick: 'well under a micrometre', job: 'A thin layer of the wafer doped with phosphorus. Where it meets the p-type wafer it forms the p-n junction, whose built-in field pulls electrons up toward the front fingers.' },
      { name: 'p-type silicon wafer', role: 'p', absorber: true, nm: 140000, thick: 'about 140 µm', job: 'The absorber. Almost all the light is absorbed here, making electron-hole pairs; electrons must wander up to the junction before they recombine.' },
      { name: 'Rear passivation (aluminium oxide and silicon nitride)', role: 'pass', nm: 120, local: true, thick: 'about a hundred nanometres', job: 'The "PR" in PERC. It ties up broken bonds at the back surface so carriers are not lost there, and helps reflect light back into the wafer. Small laser openings let the metal through.' },
      { name: 'Aluminium rear contact', role: 'metal', nm: 20000, thick: 'tens of micrometres', job: 'Collects the holes. It touches the silicon only through the openings in the passivation, so most of the back surface stays passivated.' },
    ],
  },
  {
    id: 'topcon', name: 'TOPCon', full: 'Tunnel oxide passivated contact, on an n-type wafer',
    layers: [
      { name: 'Front silver fingers', role: 'metal', nm: 15000, fingers: true, thick: 'thin printed lines', job: 'Collect the holes from the front emitter.' },
      { name: 'Anti-reflection coating (silicon nitride)', role: 'arc', nm: 80, thick: 'about 80 nm', job: 'Cancels reflection so more light enters, and protects the surface.' },
      { name: 'Front passivation (aluminium oxide)', role: 'pass', nm: 6, thick: 'a few nanometres', job: 'Passivates the boron-doped front surface so holes are not lost there.' },
      { name: 'p-type emitter (boron)', role: 'p', nm: 600, thick: 'under a micrometre', job: 'Forms the p-n junction with the n-type wafer and collects holes.' },
      { name: 'n-type silicon wafer', role: 'n', absorber: true, nm: 140000, thick: 'about 140 µm', job: 'The absorber. n-type wafers do not suffer the boron-oxygen light-induced degradation of p-type ones.' },
      { name: 'Tunnel oxide', role: 'pass', nm: 1.5, thick: 'a nanometre or two', job: 'The "TO" in TOPCon. It passivates the entire back surface, yet it is so thin that electrons pass through it by quantum tunnelling.' },
      { name: 'n-type polysilicon', role: 'n', nm: 150, thick: 'a thin film, well under a micrometre', job: 'Heavily doped silicon that lets electrons through to the metal while turning holes away: a selective, passivated contact.' },
      { name: 'Rear silicon nitride', role: 'arc', nm: 80, thick: 'about 80 nm', job: 'Protects the back and lets in light reflected from the ground, so most TOPCon cells are bifacial.' },
      { name: 'Rear silver fingers', role: 'metal', nm: 15000, fingers: true, thick: 'thin printed lines', job: 'Collect the electrons. Because the polysilicon passivates even under the metal, the contact itself loses little.' },
    ],
  },
  {
    id: 'hjt', name: 'Heterojunction', full: 'Crystal wafer wrapped in amorphous silicon (HJT)',
    layers: [
      { name: 'Front silver fingers', role: 'metal', nm: 15000, fingers: true, thick: 'thin printed lines', job: 'Collect current from the transparent conductor.' },
      { name: 'Transparent conductive oxide', role: 'tco', nm: 80, thick: 'about 80 nm', job: 'Amorphous silicon conducts poorly sideways, so this transparent oxide carries the current to the fingers. Its thickness is chosen to double as the anti-reflection coating.' },
      { name: 'p-type amorphous silicon', role: 'p', nm: 8, thick: 'a few nanometres', job: 'Forms the junction (a heterojunction, between two different forms of silicon) and collects holes.' },
      { name: 'Intrinsic amorphous silicon', role: 'i', nm: 5, thick: 'a few nanometres', job: 'An undoped buffer that passivates the crystal surface extremely well. This is why heterojunction cells reach high voltages.' },
      { name: 'n-type silicon wafer', role: 'n', absorber: true, nm: 140000, thick: 'about 140 µm', job: 'The absorber. The amorphous layers are deposited at low temperature, so the wafer is never strongly heated.' },
      { name: 'Intrinsic amorphous silicon', role: 'i', nm: 5, thick: 'a few nanometres', job: 'Passivates the back surface.' },
      { name: 'n-type amorphous silicon', role: 'n', nm: 8, thick: 'a few nanometres', job: 'The electron-selective contact.' },
      { name: 'Transparent conductive oxide', role: 'tco', nm: 80, thick: 'about 80 nm', job: 'Carries current to the rear fingers and lets light in from the back.' },
      { name: 'Rear silver fingers', role: 'metal', nm: 15000, fingers: true, thick: 'thin printed lines', job: 'Collect the electrons.' },
    ],
  },
  {
    id: 'bc', name: 'Back contact', full: 'All contacts on the back, in interleaved fingers',
    layers: [
      { name: 'Anti-reflection and passivation coating', role: 'arc', nm: 90, thick: 'tens of nanometres', job: 'The front has no metal at all, only coatings that cut reflection and passivate the surface. Nothing shades the cell.' },
      { name: 'n-type silicon wafer', role: 'n', absorber: true, nm: 140000, thick: 'about 140 µm', job: 'The absorber. Carriers made near the front must travel all the way through the wafer to the back, so the silicon has to be very pure.' },
      { name: 'Interleaved p and n contacts', role: 'p', inter: true, nm: 400, thick: 'thin doped or passivated-contact stripes', job: 'Alternating hole-collecting and electron-collecting stripes. Modern versions build them from TOPCon-style or heterojunction-style passivated contacts.' },
      { name: 'Interleaved metal fingers', role: 'metal', nm: 15000, fingers: true, inter: true, thick: 'printed or plated lines', job: 'Two interlocking combs of metal: one collects holes, the other electrons. They can be wide, because they shade nothing.' },
    ],
  },
  {
    id: 'cdte', name: 'CdTe', full: 'Cadmium telluride thin film on glass',
    layers: [
      { name: 'Front glass', role: 'glass', nm: 3.2e6, thick: 'a few millimetres', job: 'The cell is built on the back of this glass, upside down. Light enters through it; it also protects the layers.' },
      { name: 'Transparent front contact', role: 'tco', nm: 300, thick: 'a few hundred nanometres', job: 'A transparent conductive oxide that carries the current out while letting light through.' },
      { name: 'Window layer', role: 'n', nm: 80, thick: 'tens of nanometres', job: 'A thin n-type layer (classically cadmium sulfide) that forms the junction with the p-type CdTe while absorbing as little light as possible.' },
      { name: 'Cadmium telluride absorber', role: 'p', absorber: true, nm: 3000, thick: 'a few micrometres', job: 'CdTe absorbs sunlight so strongly that a few micrometres are enough, dozens of times thinner than a silicon wafer. Its band gap, near 1.5 eV, suits sunlight well.' },
      { name: 'Back contact', role: 'metal', nm: 400, thick: 'under a micrometre', job: 'Collects the holes and carries them out of the cell.' },
      { name: 'Back glass', role: 'glass', nm: 3.2e6, thick: 'a few millimetres', job: 'Seals the module from moisture, glass on glass.' },
    ],
  },
  {
    id: 'cigs', name: 'CIGS', full: 'Copper indium gallium selenide thin film',
    layers: [
      { name: 'Transparent front contact (doped zinc oxide)', role: 'tco', nm: 400, thick: 'a few hundred nanometres', job: 'Lets light in and carries electrons out.' },
      { name: 'Buffer layer (cadmium sulfide)', role: 'n', nm: 50, thick: 'tens of nanometres', job: 'The n-type partner that forms the junction with the CIGS.' },
      { name: 'CIGS absorber', role: 'p', absorber: true, nm: 2000, thick: 'about two micrometres', job: 'The absorber. Swapping some indium for gallium raises the band gap, so it can be tuned.' },
      { name: 'Molybdenum back contact', role: 'metal', nm: 500, thick: 'under a micrometre', job: 'Collects the holes; the CIGS is grown on top of it.' },
      { name: 'Substrate (glass or flexible foil)', role: 'glass', nm: 2e6, thick: 'millimetres of glass, or a thin foil', job: 'CIGS is grown on top of its support, which can be glass, steel or plastic foil.' },
    ],
  },
  {
    id: 'asi', name: 'Amorphous Si', full: 'Amorphous silicon p-i-n thin film',
    layers: [
      { name: 'Front glass', role: 'glass', nm: 3e6, thick: 'a few millimetres', job: 'Light enters through the glass the cell is deposited on.' },
      { name: 'Transparent front contact', role: 'tco', nm: 500, thick: 'under a micrometre', job: 'Carries current out while letting light in.' },
      { name: 'p-type amorphous silicon', role: 'p', nm: 10, thick: 'about ten nanometres', job: 'One side of the built-in field.' },
      { name: 'Intrinsic amorphous silicon absorber', role: 'i', absorber: true, nm: 300, thick: 'a few hundred nanometres', job: 'The absorber is undoped. Carriers move poorly in disordered silicon, so instead of waiting for them to diffuse, the field across this layer sweeps them out.' },
      { name: 'n-type amorphous silicon', role: 'n', nm: 20, thick: 'tens of nanometres', job: 'The other side of the field.' },
      { name: 'Metal back contact', role: 'metal', nm: 400, thick: 'under a micrometre', job: 'Collects electrons and mirrors unabsorbed light back for a second pass.' },
    ],
  },
];

const S = (tag, attrs = {}, ...kids) => h.svg(tag, attrs, ...kids);
const svg = document.getElementById('tech-svg');
const picker = document.getElementById('tech-picker');
const list = document.getElementById('tech-layers');
const detail = document.getElementById('tech-detail');
const summary = document.getElementById('tech-summary');
let current = TECH[1];
let selected = 4;
let facts = {};

function draw() {
  const title = svg.querySelector('title');
  clear(svg); svg.append(title);
  title.textContent = `Cross-section of a ${current.name} cell: ${current.layers.map((l, i) => `${i + 1}, ${l.name}`).join('; ')}.`;
  const x0 = 96; const x1 = 540; const W = x1 - x0;
  const top = 64; const avail = 330;
  const raw = current.layers.map((l) => Math.max(4.5, Math.min(l.nm, l.role === 'glass' ? 6e4 : Infinity) ** 0.3));
  const k = avail / raw.reduce((a, b) => a + b, 0);
  const hs = raw.map((r) => r * k);
  // sunlight
  const sun = S('g', { class: 'tech-sun', 'aria-hidden': 'true' });
  for (let i = 0; i < 6; i++) {
    const x = x0 + 30 + i * (W - 60) / 5;
    sun.append(S('line', { x1: x - 14, y1: 12, x2: x, y2: top - 10 }), S('path', { d: `M${x - 5} ${top - 18} L${x} ${top - 9} L${x + 3} ${top - 19}` }));
  }
  sun.append(S('text', { x: x0 - 4, y: 26, 'text-anchor': 'end', class: 'tech-sun-label' }, 'Sunlight'));
  svg.append(sun);
  let y = top; const centers = [];
  current.layers.forEach((l, i) => {
    const hh = hs[i];
    const g = S('g', { class: `tech-layer r-${l.role}${l.absorber ? ' is-absorber' : ''}${i === selected ? ' is-sel' : ''}`, 'data-i': i });
    if (l.fingers) {
      const n = l.inter ? 10 : 6; const fw = l.inter ? W / n - 6 : 18;
      for (let f = 0; f < n; f++) {
        const fx = l.inter ? x0 + f * (W / n) + 3 : x0 + (f + 0.5) * (W / n) - fw / 2;
        const cls = l.inter ? (f % 2 ? 'r-n-metal' : 'r-p-metal') : '';
        g.append(S('rect', { x: fx, y, width: fw, height: hh, rx: 2, class: `shape ${cls}` }));
      }
      g.append(S('rect', { x: x0, y, width: W, height: hh, class: 'hit' }));
    } else if (l.inter) {
      const n = 10;
      for (let f = 0; f < n; f++) g.append(S('rect', { x: x0 + f * (W / n), y, width: W / n, height: hh, class: `shape ${f % 2 ? 'r-n-fill' : 'r-p-fill'}` }));
    } else {
      g.append(S('rect', { x: x0, y, width: W, height: hh, class: 'shape' }));
      if (l.local) {
        for (let f = 0; f < 5; f++) {
          const fx = x0 + (f + 0.5) * (W / 5) - 5;
          g.append(S('rect', { x: fx, y: y - 1, width: 10, height: hh + 2, class: 'local-contact' }));
        }
      }
    }
    if (l.role === 'glass' && l.nm > 6e4) { // drawn cut short: a break mark
      const bx = x0 + W * 0.78;
      g.append(S('path', { d: `M${bx - 6} ${y + hh + 2} L${bx + 4} ${y - 2} M${bx + 4} ${y + hh + 2} L${bx + 14} ${y - 2}`, class: 'break' }));
    }
    g.addEventListener('click', () => select(i, true));
    svg.append(g);
    if (l.absorber) svg.append(carriers(i, y, hh, x0, W));
    centers.push(y + hh / 2);
    y += hh;
  });
  // number markers with leader lines; push apart when layers are thin
  const pos = []; let last = -Infinity;
  for (const c of centers) { const p = Math.max(c, last + 17); pos.push(p); last = p; }
  const overflow = pos[pos.length - 1] - (top + avail - 6);
  if (overflow > 0) for (let i = pos.length - 1; i >= 0; i--) { pos[i] -= overflow; if (i && pos[i - 1] > pos[i] - 17) continue; }
  for (let i = pos.length - 2; i >= 0; i--) if (pos[i] > pos[i + 1] - 17) pos[i] = pos[i + 1] - 17;
  pos.forEach((p, i) => {
    const sel = i === selected;
    const g = S('g', { class: `tech-num${sel ? ' is-sel' : ''}`, 'data-i': i });
    g.append(S('path', { d: `M${x0 - 34} ${p} L${x0 - 14} ${p} L${x0 - 2} ${centers[i]}`, class: 'leader' }),
      S('circle', { cx: x0 - 46, cy: p, r: 9 }),
      S('text', { x: x0 - 46, y: p + 4, 'text-anchor': 'middle' }, String(i + 1)));
    g.addEventListener('click', () => select(i, true));
    svg.append(g);
  });
  svg.append(S('text', { x: x0 + W, y: top + avail + 22, 'text-anchor': 'end', class: 'tech-foot' }, 'Back of the cell'));
}

// Electron-hole pairs in the absorber, each carrier heading for its own contact.
function carriers(i, y, hh, x0, W) {
  const L = current.layers;
  const side = (role) => {
    const up = L.slice(0, i).some((l) => l.role === role && !l.absorber);
    const down = L.slice(i + 1).some((l) => l.role === role || (role !== 'p' && l.inter));
    return up && !down ? -1 : 1;
  };
  const eDir = side('n'); const hDir = side('p');
  const g = S('g', { class: 'carriers', 'aria-hidden': 'true' });
  const cy = y + hh / 2; const len = Math.max(0, Math.min(hh / 2 - 7, 26));
  for (let k = 0; k < 3; k++) {
    const x = x0 + W * (0.22 + 0.28 * k);
    for (const [dx, dir, cls, sign] of [[-7, eDir, 'e', '−'], [7, hDir, 'h', '+']]) {
      if (len > 6) g.append(S('path', { d: `M${x + dx} ${cy + dir * 6} L${x + dx} ${cy + dir * len} M${x + dx - 3.5} ${cy + dir * (len - 4)} L${x + dx} ${cy + dir * len} L${x + dx + 3.5} ${cy + dir * (len - 4)}`, class: `arrow ${cls}` }));
      g.append(S('circle', { cx: x + dx, cy, r: 5.5, class: cls }), S('text', { x: x + dx, y: cy + 3.5, 'text-anchor': 'middle' }, sign));
    }
  }
  return g;
}

function renderList() {
  clear(list);
  current.layers.forEach((l, i) => {
    list.append(h('li', {},
      h('button', { type: 'button', class: `layer-btn${i === selected ? ' is-sel' : ''}`, 'aria-pressed': String(i === selected), 'data-i': i },
        h('span', { class: `chip r-${l.role}${l.absorber ? ' is-absorber' : ''}`, 'aria-hidden': 'true' }), h('span', { class: 'layer-name' }, l.name))));
  });
}

function renderDetail() {
  const l = current.layers[selected];
  clear(detail).append(
    h('h3', {}, `${selected + 1}. ${l.name}`),
    h('p', { class: 'detail-meta' }, `${ROLES[l.role]}${l.absorber ? ', main absorber' : ''}. Thickness: ${l.thick}.`),
    h('p', {}, l.job));
}

function renderSummary() {
  const f = facts[current.id];
  clear(summary).append(h('strong', {}, current.full), f ? h('span', { class: 'tech-facts' }, f) : null);
}

function select(i, fromSvg) {
  selected = i;
  draw(); renderList(); renderDetail();
  if (fromSvg) list.querySelector(`[data-i="${i}"]`)?.focus({ preventScroll: true });
}

list.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) select(Number(b.dataset.i)); });
list.addEventListener('keydown', (e) => {
  if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const n = current.layers.length; select((selected + (e.key === 'ArrowDown' ? 1 : n - 1)) % n, true);
});

function renderPicker() {
  clear(picker);
  for (const t of TECH) {
    const b = h('button', { type: 'button', class: 'tech-pick', 'aria-pressed': String(t === current) }, t.name);
    b.addEventListener('click', () => {
      current = t; selected = Math.max(0, current.layers.findIndex((l) => l.absorber));
      renderPicker(); renderSummary(); select(selected);
    });
    picker.append(b);
  }
}

function renderLegend() {
  const el = document.getElementById('tech-legend');
  clear(el);
  for (const [k, v] of Object.entries(ROLES)) el.append(h('li', {}, h('span', { class: `swatch r-${k}`, 'aria-hidden': 'true' }), v));
  el.append(h('li', {}, h('span', { class: 'swatch r-n is-absorber', 'aria-hidden': 'true' }), 'Lighter shade: the main absorber'));
}

renderLegend(); renderPicker(); renderSummary(); select(selected);

// ---------- data: shares and comparison ----------
const valid = (d) => is.obj(d?.data) && is.arr(d.data.production_2025?.rows) && is.arr(d.data.cell_architectures_2025?.rows) && is.arr(d.data.comparison)
  && d.data.comparison.every((r) => is.str(r.id) && is.str(r.label));

const pct = (x) => (x < 1 && x > 0 ? x.toFixed(1) : String(Math.round(x * 10) / 10));

function bars(el, rows, label) {
  clear(el);
  const max = Math.max(...rows.map((r) => r.share));
  for (const r of rows) {
    const bar = h('span', { class: 'bar-fill' });
    bar.style.width = `${Math.max(0.6, (100 * r.share) / max)}%`;
    el.append(h('div', { class: 'bar-row' }, h('span', { class: 'bar-label' }, r.label), h('span', { class: 'bar-track' }, bar), h('span', { class: 'bar-value' }, `${pct(r.share)} %`)));
  }
  el.setAttribute('aria-label', `${label}: ${rows.map((r) => `${r.label} ${pct(r.share)} percent`).join(', ')}.`);
}

const SHORT = {
  'pv-tech-itrpv-2026': 'ITRPV 2026', 'first-solar-series-7': 'First Solar', 'jinko-tiger-neo': 'JinkoSolar',
  'paudyal-imenes-2021': 'Paudyal & Imenes 2021', 'jordan-kurtz-2013': 'Jordan & Kurtz 2013',
};
const srcLink = (id) => (id ? h('a', { href: `#ref-${id}` }, SHORT[id] ?? id) : null);

function table(d) {
  const share = Object.fromEntries(d.cell_architectures_2025.rows.map((r) => [r.id, `${pct(r.share)} % of silicon cells`]));
  share.cdte = `${pct(d.production_2025.rows.find((r) => r.id === 'thin').share)} % of all modules (thin film)`;
  const t = h('table', {},
    h('caption', { class: 'visually-hidden' }, 'Comparison of solar cell technologies'),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Technology'), h('th', { scope: 'col', class: 'num' }, 'Module efficiency'),
      h('th', { scope: 'col', class: 'num' }, 'Power temperature coefficient'), h('th', { scope: 'col', class: 'num' }, 'Degradation'),
      h('th', { scope: 'col' }, 'Share of 2025 production'), h('th', { scope: 'col' }, 'Sources'))),
    h('tbody', {}, d.comparison.map((r) => {
      const eff = r.module_eff_range ? `${r.module_eff_range[0]}–${r.module_eff_range[1]} %` : r.module_eff != null ? `${r.module_eff} %` : '—';
      const tc = r.tc_pmax != null ? `${r.tc_pmax.toFixed(2)} %/°C` : '—';
      const srcs = [...new Set([r.eff_source, r.tc_source, r.deg_source].filter(Boolean))];
      return h('tr', {},
        h('th', { scope: 'row' }, r.label),
        h('td', { class: 'num' }, eff),
        h('td', { class: 'num' }, tc, h('small', { class: 'cell-note' }, r.tc_note)),
        h('td', { class: 'num' }, `${r.degradation} %/yr`, h('small', { class: 'cell-note' }, r.deg_note)),
        h('td', {}, share[r.id] ?? '—'),
        h('td', { class: 'src-cell' }, srcs.flatMap((s, k) => (k ? ['; ', srcLink(s)] : [srcLink(s)]))));
    })));
  clear(document.getElementById('compare-table')).append(t);
}

loadData('technologies.json', valid).then(({ data, state }) => {
  const d = data.data;
  setBadge(document.getElementById('shares-badge'), state, 'Fraunhofer ISE, ITRPV');
  bars(document.getElementById('bars-material'), d.production_2025.rows, 'Module production by material, 2025');
  bars(document.getElementById('bars-arch'), d.cell_architectures_2025.rows, 'Crystalline silicon cell production by design, 2025');
  table(d);
  const arch = Object.fromEntries(d.cell_architectures_2025.rows.map((r) => [r.id, r.share]));
  const eff = Object.fromEntries(d.comparison.map((r) => [r.id, r]));
  facts = {
    perc: `About ${arch.perc} % of 2025 silicon cell production, falling; modules about ${eff.perc.module_eff} % efficient.`,
    topcon: `About ${arch.topcon} % of 2025 silicon cell production; modules about ${eff.topcon.module_eff} % efficient.`,
    hjt: `About ${arch.hjt} % of 2025 silicon cell production; modules about ${eff.hjt.module_eff} % efficient.`,
    bc: `About ${Math.round(arch.tbc + arch.hbc)} % of 2025 silicon cell production; modules about ${eff.tbc.module_eff} % efficient.`,
    cdte: `About ${pct(d.production_2025.rows.find((r) => r.id === 'thin').share)} % of all modules made in 2025; modules ${eff.cdte.module_eff_range.join('–')} % efficient.`,
    cigs: 'A small niche next to silicon and CdTe.',
    asi: 'The first thin film; now mainly a coating inside heterojunction cells.',
  };
  renderSummary();
}).catch((e) => {
  console.error(e);
  setBadge(document.getElementById('shares-badge'), 'failed');
  clear(document.getElementById('compare-table')).append(h('p', { class: 'muted' }, 'The comparison data could not be verified, so it is not shown.'));
});

