// Energy storage: "a day on a solar grid" (dispatch model from physics/grid.js).
import { mountShares, bindRange, segmented, setText } from './renewables-b-common.js';
import { hoursOfDay, solarShape, demandShape, dispatchDay } from '../assets/js/physics/grid.js';
import { mountDayCharts } from './renewables-b-day.js';

mountShares();

const PEAK = 1000; // MW evening peak
const hours = hoursOfDay(24);
const demand = demandShape(hours).map((d) => d * PEAK);
const st = { solar: 2000, power: 500, energy: 2000, rte: 0.85, month: 4 };
let shape = solarShape(hours, { lat: 35, month: st.month });
const updateCharts = await mountDayCharts(document.getElementById('day-chart'), document.getElementById('soc-chart'));
const mwFmt = (v) => `${Math.round(v).toLocaleString('en-US')}`;

function run() {
  const renewable = shape.map((s) => s * st.solar);
  const r = dispatchDay({ demand, renewable, powerMW: st.power, energyMWh: st.energy, rte: st.rte });
  const t = r.totals;
  setText('o-share', `${(100 * t.renewableShare).toFixed(0)} %`);
  setText('o-curt', `${mwFmt(t.curtailedMWh)} MWh`);
  setText('o-unmet', `${mwFmt(t.unmetMWh)} MWh`);
  setText('o-loss', `${mwFmt(t.lossesMWh)} MWh`);
  setText('o-dur', st.power > 0 ? `${(st.energy / st.power).toFixed(1)} h` : '—');
  const peakSoc = Math.max(0, ...r.soc);
  let msg;
  if (st.solar === 0) msg = 'No solar: storage has nothing to store, and every hour must come from other sources.';
  else if (st.power === 0 || st.energy === 0) msg = `No storage: ${mwFmt(t.curtailedMWh)} MWh of midday solar is wasted while ${mwFmt(t.unmetMWh)} MWh of the night and evening must come from elsewhere.`;
  else if (t.unmetMWh < 1 && t.curtailedMWh < 1) msg = 'Balanced: solar plus storage cover the whole day with nothing wasted.';
  else if (peakSoc >= st.energy * 0.999 && t.curtailedMWh > 1) msg = `The store fills up (${mwFmt(st.energy)} MWh) and solar is still wasted: add energy capacity (MWh)${t.unmetMWh > 1 ? ', since the evening is still short' : ''}.`;
  else if (t.curtailedMWh > 1 && Math.max(...r.charge) >= st.power - 0.5) msg = 'The store charges at full power but cannot take the surplus fast enough: add power (MW).';
  else if (t.unmetMWh > 1 && t.curtailedMWh < 1) msg = 'All the surplus is stored and the evening is still short: you need more solar, or another source.';
  else msg = `${(100 * t.renewableShare).toFixed(0)} % of the day's demand is met by solar, directly or through the store.`;
  setText('day-status', msg);
  updateCharts(r, { parts: [{ key: 'solar', name: 'Solar used directly', share: () => 1, color: (c) => c.source.solar }], energyMWh: st.energy, demand, showLoad: false });
}

const ctl = (id, key, fmt, unit) => bindRange(document.getElementById(id), document.getElementById(`${id}-out`), (v) => `${fmt(v)} ${unit}`, (v) => { st[key] = v; run(); });
ctl('d-solar', 'solar', mwFmt, 'MW');
ctl('d-power', 'power', mwFmt, 'MW');
ctl('d-energy', 'energy', mwFmt, 'MWh');
document.getElementById('d-tech').addEventListener('change', (e) => { st.rte = Number(e.target.value); run(); });
segmented(document.getElementById('d-season'), (v) => { st.month = Number(v); shape = solarShape(hours, { lat: 35, month: st.month }); run(); }, { fire: false });
run();
