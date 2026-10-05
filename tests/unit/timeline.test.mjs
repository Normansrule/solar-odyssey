// Timeline dataset: shape, era order, citations, lesson links, and numbers that
// must agree with the other datasets (module prices, electricity mix, records).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { validateTimeline, placeEvents, yearAt, eraAt, arcPoint, ERAS, ERA_IDS, TODAY_T } from '../../site/sun-arc.js';

const site = new URL('../../site/', import.meta.url);
const read = (rel) => JSON.parse(readFileSync(new URL(rel, site), 'utf8'));
const tl = read('data/timeline.json');
const sources = read('data/sources.json');
const glossary = read('data/glossary.json');
const sitemap = readFileSync(new URL('assets/js/sitemap.js', site), 'utf8');
const sitemapPaths = new Set([...sitemap.matchAll(/path: '([^']+)'/g)].map((m) => m[1]));

test('timeline dataset has the documented shape and passes the page validator', () => {
  assert.equal(validateTimeline(tl), true);
  assert.equal(tl.meta.license, 'CC BY 4.0 (Solar Odyssey text)');
  assert.match(tl.meta.last_verified, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(tl.data.length >= 30, `only ${tl.data.length} events`);
  for (const e of tl.data) {
    if (e.date) assert.match(e.date, /^(\d{4}(-\d{2}(-\d{2})?)?|\d{4}–\d{2})$/, `${e.id} date`);
    if (/^\d{4}-/.test(e.date || '')) assert.equal(Number(e.date.slice(0, 4)), e.year, `${e.id} date and year disagree`);
    assert.ok(e.text.split(/(?<=[.!?])\s+/).length >= 2 && e.text.split(/(?<=[.!?])\s+/).length <= 4, `${e.id}: 2–4 sentences`);
  }
});

test('validator rejects broken data', () => {
  const bad = structuredClone(tl); bad.data[0].era = 'dusk';
  assert.throws(() => validateTimeline(bad));
  const swapped = structuredClone(tl); swapped.data.reverse();
  assert.throws(() => validateTimeline(swapped), /out of order/);
  const noSrc = structuredClone(tl); noSrc.data[3].sources = [];
  assert.throws(() => validateTimeline(noSrc));
  const evil = structuredClone(tl); evil.data[1].lesson = 'javascript:alert(1)';
  assert.throws(() => validateTimeline(evil));
});

test('eras run dawn, morning, midday, afternoon and years never go backwards', () => {
  const order = tl.data.map((e) => ERA_IDS.indexOf(e.era));
  for (let i = 1; i < order.length; i++) assert.ok(order[i] >= order[i - 1], `${tl.data[i].id} is out of era order`);
  for (let i = 1; i < tl.data.length; i++) assert.ok(tl.data[i].year >= tl.data[i - 1].year, `${tl.data[i].id} is out of year order`);
  for (const id of ERA_IDS) assert.ok(tl.data.some((e) => e.era === id), `no events in ${id}`);
  for (const e of tl.data) {
    const era = ERAS.find((x) => x.id === e.era);
    if (e.era !== 'afternoon') assert.ok(e.year >= era.y0 - 1 && e.year <= era.y1, `${e.id} (${e.year}) does not fit ${e.era}`);
  }
});

test('every event cites known sources, and the meta sources exist', () => {
  for (const s of tl.meta.sources) assert.ok(sources[s], `meta cites unknown ${s}`);
  for (const e of tl.data) for (const s of e.sources) assert.ok(sources[s], `${e.id} cites unknown source ${s}`);
  for (const [id, s] of Object.entries(sources)) {
    if (!tl.data.some((e) => e.sources.includes(id))) continue;
    assert.ok(s.doi || s.url, `${id} has no DOI or URL`);
    assert.match(s.verified, /^\d{4}-\d{2}-\d{2}$/, `${id} verified date`);
  }
});

test('lesson links point at real pages listed in the sitemap', () => {
  for (const e of tl.data) {
    if (!e.lesson) continue;
    assert.ok(existsSync(new URL(e.lesson, site)), `${e.id}: ${e.lesson} does not exist`);
    assert.ok(sitemapPaths.has(e.lesson), `${e.id}: ${e.lesson} is not in sitemap.js`);
  }
  const want = { 'becquerel-1839': 'learn/photovoltaic-effect.html', 'ohl-1940': 'learn/pn-junction.html', 'bell-labs-1954': 'learn/iv-curve.html' };
  for (const [id, path] of Object.entries(want)) assert.equal(tl.data.find((e) => e.id === id)?.lesson, path);
  assert.ok(tl.data.some((e) => e.lesson === 'today/cost-decline.html'));
  assert.ok(tl.data.some((e) => e.lesson === 'today/efficiency-records.html'));
  assert.ok(tl.data.some((e) => e.lesson === 'frontier.html'));
});

test('both tracks are present so the "Solar only" filter means something', () => {
  const ren = tl.data.filter((e) => e.track === 'renewables');
  assert.ok(ren.length >= 5);
  for (const tech of ['hydro', 'wind', 'geothermal', 'ocean', 'storage']) assert.ok(ren.some((e) => e.tech === tech), `no ${tech} event`);
});

test('the required milestones are there with the right years', () => {
  const years = { 'becquerel-1839': 1839, 'smith-1873': 1873, 'adams-day-1877': 1877, 'fritts-1883': 1883, 'hertz-1887': 1887,
    'einstein-1905': 1905, 'czochralski-1918': 1918, 'ohl-1940': 1940, 'bell-labs-1954': 1954, 'vanguard-1958': 1958,
    'shockley-queisser-1961': 1961, 'seri-1977': 1977, 'arco-1982': 1982, 'eeg-2000': 2000, 'perovskite-2009': 2009,
    'appleton-1882': 1882, 'larderello-1904': 1904, 'la-rance-1966': 1966, 'vindeby-1991': 1991, 'hornsdale-2017': 2017 };
  for (const [id, y] of Object.entries(years)) assert.equal(tl.data.find((e) => e.id === id)?.year, y, id);
});

test('numbers quoted in the text agree with the datasets they come from', () => {
  const prices = new Map(read('data/module-prices.json').data);
  const mix = read('data/electricity-mix.json').data;
  const records = existsSync(new URL('data/efficiency-records.json', site)) ? read('data/efficiency-records.json').data : null;
  let n = 0;
  for (const e of tl.data) {
    for (const c of e.checks || []) {
      let got;
      if (c.dataset === 'module-prices.json') got = c.ratio ? prices.get(c.ratio[0]) / prices.get(c.ratio[1]) : prices.get(c.year);
      else if (c.dataset === 'electricity-mix.json') { const ent = mix[c.entity]; got = ent[c.field][ent.years.indexOf(c.year)]; }
      else if (c.dataset === 'efficiency-records.json') {
        if (!records) continue;
        got = Math.max(...records.points.filter((p) => p.tech === c.tech && p.year === c.year).map((p) => p.efficiency));
      } else assert.fail(`${e.id}: unknown dataset ${c.dataset}`);
      assert.ok(Math.abs(got - c.expect) <= c.tol, `${e.id}: ${c.dataset} gives ${got}, text assumes ${c.expect}`);
      n++;
    }
  }
  assert.ok(n >= 6);
  // the solar-share event must quote the latest World year
  const w = mix.World; const latest = w.solar_share_elec[w.years.length - 1];
  const ev = tl.data.find((e) => e.id === 'solar-share-2025');
  assert.equal(ev.year, w.years[w.years.length - 1]);
  assert.ok(ev.text.includes(`${latest.toFixed(1)} percent`), 'solar share text is stale');
  // the tandem event quotes the latest perovskite-silicon record
  if (records) {
    const best = records.points.filter((p) => p.tech === 'perovskite-si').sort((a, b) => b.year - a.year || b.efficiency - a.efficiency)[0];
    assert.ok(tl.data.find((e) => e.id === 'tandem-record-2026').text.includes(`${best.efficiency} percent`), 'tandem record is stale');
  }
});

test('arc geometry: positions are ordered, inside their era, and the sun maps back to years', () => {
  const pos = placeEvents(tl.data);
  let last = -1;
  for (const e of tl.data) {
    const t = pos.get(e.id); const era = ERAS.find((x) => x.id === e.era);
    assert.ok(t >= era.from - 1e-9 && t <= era.to + 1e-9, `${e.id} outside its era on the arc`);
    assert.ok(t >= last - 1e-9, `${e.id} goes backwards on the arc`); last = t;
  }
  assert.equal(yearAt(ERAS[0].from), 1839);
  assert.equal(yearAt(ERAS[1].from), 1900);
  assert.equal(yearAt(TODAY_T), 2026);
  assert.equal(eraAt(0.1), 'dawn'); assert.equal(eraAt(0.6), 'midday'); assert.equal(eraAt(0.8), 'afternoon');
  const box = { x0: 0, x1: 100, horizon: 50, rise: 40 };
  assert.deepEqual(arcPoint(0.5, box), { x: 50, y: 10 });
  assert.ok(Math.abs(arcPoint(0, box).y - 50) < 1e-9 && Math.abs(arcPoint(1, box).y - 50) < 1e-9);
});

test('timeline glossary terms are defined', () => {
  for (const t of ['photovoltaic-effect', 'photoconductivity', 'photoelectric-effect', 'czochralski-process', 'feed-in-tariff']) assert.ok(glossary[t], t);
});
