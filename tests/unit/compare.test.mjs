// Comparison dashboard: dataset shape and ranges, the LCOE-lab helpers, and a
// reconciliation of the lab's presets with IRENA's published 2024 LCOEs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ec from '../../site/assets/js/physics/econ.js';
import * as lv from '../../site/assets/js/physics/levelized.js';
import { calc, parse, variablesOf, ExprError } from '../../site/assets/js/safe-expr.js';

const ds = JSON.parse(readFileSync(new URL('../../site/data/renewables-compare.json', import.meta.url), 'utf8'));
const sources = JSON.parse(readFileSync(new URL('../../site/data/sources.json', import.meta.url), 'utf8'));
const techs = ds.data.techs;
const byId = Object.fromEntries(techs.map((t) => [t.id, t]));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, want ${b} ± ${tol}`);

/** Every value object in the dataset: anything with a numeric value, low or high. */
function valueObjects(node, path = 'data', out = []) {
  if (Array.isArray(node)) node.forEach((x, i) => valueObjects(x, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') {
    if ('value' in node || 'low' in node || 'high' in node) out.push({ path, v: node });
    for (const [k, x] of Object.entries(node)) if (x && typeof x === 'object') valueObjects(x, `${path}.${k}`, out);
  }
  return out;
}
const values = valueObjects(ds.data);

const preset = (t) => ({ capex: t.lab.capex.value, fixedOM: t.lab.fixedOM.value, varOM: t.lab.varOM.value, fuel: t.lab.fuel.value, cf: t.lab.cf.value, n: t.lab.life.value });

test('dataset covers the brief: renewables plus nuclear, gas and coal for context', () => {
  for (const id of ['solar-utility', 'solar-commercial', 'wind-onshore', 'wind-offshore', 'hydro', 'geothermal', 'bioenergy', 'csp', 'nuclear', 'gas-cc', 'coal']) assert.ok(byId[id], id);
  for (const k of ['cf', 'capex', 'lcoe', 'land', 'ghg', 'growth']) assert.ok(ds.meta.definitions[k], `definition of ${k}`);
  assert.ok(ds.meta.caveats.length >= 3);
  assert.ok(values.length > 150);
});

test('every value has a unit, a year and a source (or is flagged as this page’s assumption)', () => {
  for (const { path, v } of values) {
    assert.equal(typeof v.unit, 'string', `${path} unit`);
    assert.ok(Number.isInteger(v.year) && v.year >= 2010 && v.year <= 2026, `${path} year ${v.year}`);
    if (v.assumption) assert.equal(v.source, null, `${path} assumption has no source`);
    else assert.ok(sources[v.source], `${path} source ${v.source}`);
    assert.equal(typeof v.note, 'string', `${path} note`);
    for (const k of ['value', 'low', 'high']) if (k in v) assert.ok(Number.isFinite(v[k]), `${path}.${k} finite`);
    assert.ok('value' in v || ('low' in v && 'high' in v), `${path} has a value or a full range`);
  }
});

test('low ≤ value ≤ high wherever given, and ranges are not reversed', () => {
  for (const { path, v } of values) {
    if ('low' in v && 'high' in v) assert.ok(v.low < v.high, `${path}: ${v.low} < ${v.high}`);
    if ('low' in v && 'value' in v) assert.ok(v.low <= v.value, `${path}: low ${v.low} ≤ ${v.value}`);
    if ('high' in v && 'value' in v) assert.ok(v.value <= v.high, `${path}: ${v.value} ≤ high ${v.high}`);
  }
});

test('capacity factors are fractions in 0–1; other quantities are positive and plausible', () => {
  for (const { path, v } of values) {
    const nums = ['value', 'low', 'high'].filter((k) => k in v).map((k) => v[k]);
    if (v.unit === 'fraction') nums.forEach((x) => assert.ok(x > 0 && x < 1, `${path} = ${x}`));
    if (v.unit === 'US$/kWh') nums.forEach((x) => assert.ok(x > 0.01 && x < 0.5, `${path} = ${x}`));
    if (v.unit === 'US$/kW') nums.forEach((x) => assert.ok(x > 300 && x < 20000, `${path} = ${x}`));
    if (v.unit === 'gCO2e/kWh') nums.forEach((x) => assert.ok(x > 0 && x < 3000, `${path} = ${x}`));
    if (v.unit === 'm² per MWh/yr') nums.forEach((x) => assert.ok(x > 0 && x < 1000, `${path} = ${x}`));
  }
});

test('headline numbers match the cited sources', () => {
  // IRENA (2025) Table S1, 2024 column.
  const irena = { 'solar-utility': [691, 0.17, 0.043], 'wind-onshore': [1041, 0.34, 0.034], 'wind-offshore': [2852, 0.42, 0.079], hydro: [2267, 0.48, 0.057], geothermal: [4015, 0.88, 0.060], bioenergy: [3242, 0.73, 0.087], csp: [3677, 0.41, 0.092] };
  for (const [id, [capex, cf, lcoe]] of Object.entries(irena)) {
    assert.equal(byId[id].capex.central.value, capex, id); assert.equal(byId[id].cf.central.value, cf, id); assert.equal(byId[id].lcoe.central.value, lcoe, id);
  }
  // Lovering et al. (2022) Table 1, converted from ha/TWh/y (× 0.01).
  close(byId.nuclear.land.central.value, 0.071, 1e-9); close(byId['solar-utility'].land.central.value, 20, 1e-9);
  close(byId['wind-onshore'].land.direct.value, 1.3, 1e-9); close(byId['wind-onshore'].land.central.value, 120, 1e-9);
  // IPCC AR5 Annex III, Table A.III.2.
  assert.deepEqual([byId.coal.ghg.low, byId.coal.ghg.value, byId.coal.ghg.high], [740, 820, 910]);
  assert.deepEqual([byId['wind-onshore'].ghg.low, byId['wind-onshore'].ghg.value, byId['wind-onshore'].ghg.high], [7, 11, 56]);
});

test('growth figures are recomputed from electricity-mix.json', () => {
  const mix = JSON.parse(readFileSync(new URL('../../site/data/electricity-mix.json', import.meta.url), 'utf8')).data.World;
  const i25 = mix.years.indexOf(2025); const i15 = mix.years.indexOf(2015);
  for (const t of techs) {
    const f = t.mix;
    close(t.growth.twh.value, mix[f][i25], 0.06, `${t.id} TWh`);
    close(t.growth.share.value, (100 * mix[f][i25]) / mix.electricity_generation[i25], 0.006, `${t.id} share`);
    close(t.growth.cagr.value, 100 * ((mix[f][i25] / mix[f][i15]) ** 0.1 - 1), 0.06, `${t.id} growth`);
  }
});

test('LCOE breakdown parts add up to econ.lcoe, and full-load hours', () => {
  for (const t of techs) {
    const p = { ...preset(t), r: 0.06 };
    const b = lv.lcoeBreakdown(p);
    close(b.capital + b.fixedOM + b.varOM + b.fuel, ec.lcoe(p), 1e-9, t.id);
    close(b.total, ec.lcoe(p), 1e-12);
  }
  close(lv.fullLoadHours(0.17), 1489.2, 1e-9);
  close(ec.capacityFactor(148920, 100), 0.17, 1e-12);
});

test('impliedDiscountRate inverts econ.lcoe', () => {
  const p = { capex: 1000, fixedOM: 20, cf: 0.3, n: 25 };
  for (const r of [0.01, 0.05, 0.1]) close(lv.impliedDiscountRate(p, ec.lcoe({ ...p, r })), r, 1e-9);
  assert.ok(Number.isNaN(lv.impliedDiscountRate(p, 1)), 'target below the zero-rate LCOE');
});

// IRENA computes LCOE project by project, with country-specific real costs of capital
// (3.8 % in Europe to 12 % in Africa for 2024) and project O&M, and then weights the results.
// The lab uses IRENA's averaged installed cost and capacity factor, Lazard/EIA US O&M, and one
// discount rate (6 %). Averaging inputs is not the same as averaging LCOEs, so we expect
// agreement within 10 %, and the discount rate that reproduces IRENA exactly must fall inside
// IRENA's own range.
test('LCOE lab presets reproduce IRENA’s published 2024 LCOE within 10 % at a 6 % real rate', () => {
  for (const id of ['solar-utility', 'wind-onshore', 'wind-offshore', 'hydro', 'geothermal']) {
    const t = byId[id]; const published = t.lcoe.central.value * 1000;
    const lab = ec.lcoe({ ...preset(t), r: 0.06 });
    assert.ok(Math.abs(lab / published - 1) <= 0.10, `${id}: lab ${lab.toFixed(1)} vs IRENA ${published} $/MWh`);
    const r = lv.impliedDiscountRate(preset(t), published);
    assert.ok(r >= 0.038 && r <= 0.12, `${id}: implied rate ${(r * 100).toFixed(2)} % outside IRENA's 3.8–12 %`);
  }
  // Utility solar specifically: IRENA 0.043 $/kWh; the lab gives 40.4 $/MWh, 6 % low.
  close(ec.lcoe({ ...preset(byId['solar-utility']), r: 0.06 }), 40.4, 0.05);
});

test('known, explained gaps: bioenergy preset omits feedstock; gas uses a US fuel price', () => {
  const bio = byId.bioenergy;
  assert.equal(bio.lab.fuel.value, 0); assert.ok(bio.lab.fuel.assumption);
  assert.ok(ec.lcoe({ ...preset(bio), r: 0.06 }) < bio.lcoe.central.value * 1000, 'without feedstock the lab is below IRENA');
  const gas = byId['gas-cc'];
  const lab = ec.lcoe({ ...preset(gas), r: 0.06 });
  assert.ok(lab >= gas.lcoe.range.low * 1000 * 0.95 && lab <= gas.lcoe.range.high * 1000, `gas lab ${lab} inside Lazard's US range`);
  assert.ok(lab < gas.lcoe.central.value * 1000, 'below IRENA’s global gas figure');
});

test('custom-metric examples evaluate with the safe evaluator, and bad input fails safely', () => {
  const t = byId['solar-utility'];
  const vars = { cf: t.lab.cf.value, capex: t.lab.capex.value, lcoe: t.lcoe.central.value, land: t.land.central.value, twh: t.growth.twh.value, ghg: t.ghg.value };
  close(calc('cf * 8760', vars), 1489.2, 1e-9);
  close(calc('lcoe * 1000', vars), 43, 1e-9);
  close(calc('capex / (cf * 8.76)', vars), 691 / (0.17 * 8.76), 1e-9);
  assert.deepEqual([...variablesOf(parse('land * twh + sqrt(ghg)'))].sort(), ['ghg', 'land', 'twh']);
  for (const bad of ['alert(1)', 'constructor', 'cf; capex', 'x'.repeat(600), '__proto__ * 2', 'cf * ']) {
    assert.throws(() => calc(bad, vars), ExprError, bad.slice(0, 20));
  }
});

test('the page uses the dataset, the evaluator and limits formula length', () => {
  const js = readFileSync(new URL('../../site/renewables/compare.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../site/renewables/compare.html', import.meta.url), 'utf8');
  assert.match(js, /loadData\('renewables-compare\.json'/);
  assert.match(js, /from '\.\.\/assets\/js\/safe-expr\.js'/);
  assert.match(html, /id="formula" maxlength="200"/);
  assert.doesNotMatch(js, /\beval\s*\(|new Function/);
});
