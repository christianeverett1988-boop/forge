// USDA food search, no network: node --test test/
// The FDC responses below are small recorded-shape fixtures (field names as the real /v1/foods/search returns them,
// numbers made up).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fake-db.js';
import { setSink } from '../src/log.js';
import {
  validateInput, tidyCase, shortBrand, normalizeFood, measuresOf, deleteFoodSearchData, per100Of, rankFoods, dedupe, looksLikeBrandQuery, searchFoods, createCache,
  meterSearch, RATE_PER_HOUR, MAX_RESULTS, FoodSearchError,
} from '../src/usda.js';

const nut = (kcal, p, c, f) => [
  { nutrientId: 1008, nutrientNumber: '208', nutrientName: 'Energy', unitName: 'KCAL', value: kcal },
  { nutrientId: 1003, nutrientNumber: '203', nutrientName: 'Protein', unitName: 'G', value: p },
  { nutrientId: 1005, nutrientNumber: '205', nutrientName: 'Carbohydrate, by difference', unitName: 'G', value: c },
  { nutrientId: 1004, nutrientNumber: '204', nutrientName: 'Total lipid (fat)', unitName: 'G', value: f },
];

const BANANA = { fdcId: 1105073, description: 'Bananas, raw', dataType: 'SR Legacy', foodNutrients: nut(89, 1.09, 22.8, 0.33) };
const CHICKEN = { fdcId: 171477, description: 'Chicken, broilers or fryers, breast, meat only, raw', dataType: 'SR Legacy', foodNutrients: nut(120, 22.5, 0, 2.62) };
const YOGURT = {
  fdcId: 2001, description: 'GREEK YOGURT, VANILLA', dataType: 'Branded', brandOwner: 'CHOBANI, LLC', brandName: 'CHOBANI',
  servingSize: 150, servingSizeUnit: 'g', householdServingFullText: '1 container', foodNutrients: nut(80, 11.3, 8, 0),
};
const BAR = (id, brand, desc) => ({
  fdcId: id, description: desc, dataType: 'Branded', brandOwner: `${brand} NUTRITION`, brandName: brand,
  servingSize: 60, servingSizeUnit: 'g', householdServingFullText: '1 bar', foodNutrients: nut(333, 33, 40, 8),
});
const MILK = {
  fdcId: 3001, description: 'Milk, whole', dataType: 'Foundation', servingSize: 244, servingSizeUnit: 'ml', householdServingFullText: '1 cup',
  foodNutrients: [{ nutrientId: 2047, nutrientNumber: '957', value: 61 }, { nutrientId: 1003, value: 3.2 }, { nutrientId: 1005, value: 4.8 }, { nutrientId: 1004, value: 3.3 }],
};

const resp = (foods, status = 200) => ({ ok: status < 400, status, json: async () => ({ foods }) });
/** A fake fetch: first call is the generic request, second the branded one (they run together). Records every call. */
const fakeFetch = ({ generic = [], branded = [], fail } = {}) => {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const types = JSON.parse(init.body).dataType;
    if (fail === 'all') return resp([], 500);
    if (fail === 'busy') return resp([], 429);
    if (types.includes('Branded')) return fail === 'branded' ? resp([], 500) : resp(branded);
    return resp(generic);
  };
  f.calls = calls;
  return f;
};

const NOW = Date.parse('2026-10-10T12:00:00Z');
const run = (data, over = {}) => searchFoods({ db: over.db || fakeDb(), uid: 'u1', data, apiKey: 'KEY123', fetch: over.fetch || fakeFetch(), now: () => NOW, cache: over.cache || createCache() });

test('validateInput: trims, needs 2–60 characters, page 1–10', () => {
  assert.deepEqual(validateInput({ query: '  chicken   breast ' }), { query: 'chicken breast', page: 1 });
  assert.deepEqual(validateInput({ query: 'oats', page: 3 }), { query: 'oats', page: 3 });
  for (const bad of [null, {}, { query: 5 }, { query: 'a' }, { query: '  b ' }, { query: 'x'.repeat(61) }, { query: 'oats', page: 0 }, { query: 'oats', page: 11 }, { query: 'oats', page: 1.5 }, { query: 'oats', page: '2' }]) {
    assert.throws(() => validateInput(bad), (e) => e instanceof FoodSearchError && e.code === 'invalid');
  }
  assert.equal(validateInput({ query: 'x'.repeat(60) }).query.length, 60);
  assert.equal(validateInput({ query: 'rice\u0000\u0007bowl' }).query, 'rice bowl');
});

test('tidyCase: shouting becomes tidy, mixed case is left alone', () => {
  assert.equal(tidyCase('GREEK YOGURT, VANILLA'), 'Greek Yogurt, Vanilla');
  assert.equal(tidyCase('MAC AND CHEESE WITH BACON'), 'Mac and Cheese with Bacon');
  assert.equal(tidyCase('Chicken, broilers or fryers'), 'Chicken, broilers or fryers');
  assert.equal(tidyCase("KIND PEANUT-BUTTER BAR (12 PK)"), 'Kind Peanut-Butter Bar (12 Pk)');
  assert.equal(tidyCase(''), '');
});

test('normalizeFood: per 100 g, per serving, brand on its own field', () => {
  const y = normalizeFood(YOGURT);
  assert.deepEqual(y, {
    fdcId: 2001, name: 'Greek Yogurt, Vanilla', brand: 'Chobani', dataType: 'Branded',
    serving: { g: 150, text: '1 container (150 g)', real: true }, measures: [],
    per100: { kcal: 80, protein_g: 11.3, carbs_g: 8, fat_g: 0 },
    perServing: { kcal: 120, protein_g: 17, carbs_g: 12, fat_g: 0 }, // 80 × 1.5, 11.3 × 1.5 = 16.95 → 17
  });
  // No serving from USDA → 100 g, and the two sets of numbers agree.
  const b = normalizeFood(BANANA);
  assert.deepEqual(b.serving, { g: 100, text: '100 g', real: false });
  assert.deepEqual(b.perServing, b.per100);
  assert.equal(b.brand, '');
  // ml counts as grams; Atwater energy is used when plain energy is missing.
  const m = normalizeFood(MILK);
  assert.equal(m.per100.kcal, 61);
  assert.deepEqual(m.serving, { g: 244, text: '1 cup (244 g)', real: true });
  assert.equal(m.perServing.kcal, 149); // 61 × 2.44 = 148.8
});

test('normalizeFood: rejects unusable rows and keeps numbers in range', () => {
  assert.equal(normalizeFood(null), null);
  assert.equal(normalizeFood({ description: 'No id', foodNutrients: nut(1, 1, 1, 1) }), null);
  assert.equal(normalizeFood({ fdcId: 5, description: 'No energy', foodNutrients: [{ nutrientId: 1003, value: 4 }] }), null);
  assert.equal(normalizeFood({ fdcId: 6, description: '', foodNutrients: nut(1, 1, 1, 1) }), null);
  const wild = normalizeFood({ fdcId: 7, description: 'Weird', foodNutrients: nut(99999, 9999, -5, NaN) });
  assert.deepEqual(wild.per100, { kcal: 900, protein_g: 100, carbs_g: 0, fat_g: 0 });
  assert.equal(normalizeFood({ fdcId: 8, description: 'x'.repeat(200), foodNutrients: nut(1, 0, 0, 0) }).name.length, 70);
  assert.equal(per100Of({ foodNutrients: [{ nutrientNumber: '208', value: 52 }] }).kcal, 52);
  // A serving of 0 or something absurd falls back to 100 g.
  assert.equal(normalizeFood({ ...YOGURT, servingSize: 0 }).serving.real, false);
  assert.equal(normalizeFood({ ...YOGURT, servingSize: 99999 }).serving.real, false);
  assert.equal(normalizeFood({ ...YOGURT, servingSizeUnit: 'oz' }).serving.real, false);
});

test('ranking: a generic query puts whole foods first, a brand query puts branded first', () => {
  const generic = ['Chicken Breast Strips', 'Oven Roasted Chicken Breast'].map((n, i) => normalizeFood({ ...BAR(10 + i, 'TYSON', n), brandOwner: 'TYSON FOODS' }));
  const whole = [normalizeFood(CHICKEN), normalizeFood({ ...CHICKEN, fdcId: 1, dataType: 'Foundation', description: 'Chicken breast, raw' })];
  const mixed = [...generic, ...whole];
  assert.equal(looksLikeBrandQuery('chicken breast', mixed), false);
  assert.deepEqual(rankFoods('chicken breast', mixed).map((f) => f.dataType), ['Foundation', 'SR Legacy', 'Branded', 'Branded']);

  const quest = [BAR(21, 'QUEST', 'PROTEIN BAR, COOKIES AND CREAM'), BAR(22, 'QUEST', 'PROTEIN BAR, CHOCOLATE'), BAR(23, 'KIND', 'QUEST FOR PEACE BAR')].map(normalizeFood);
  const qmixed = [normalizeFood({ ...CHICKEN, description: 'Quest, generic' }), ...quest];
  assert.equal(looksLikeBrandQuery('quest bar', qmixed), true);
  assert.equal(rankFoods('quest bar', qmixed)[0].dataType, 'Branded');
  assert.equal(rankFoods('quest bar', qmixed)[3].dataType, 'SR Legacy');
  // Names that start with the query lead their group.
  const r = rankFoods('banana', [normalizeFood({ ...BANANA, fdcId: 1, description: 'Babyfood, banana juice' }), normalizeFood(BANANA)]);
  assert.equal(r[0].name, 'Bananas, raw');
});

test('dedupe: same name from the same brand collapses, different brands stay', () => {
  const a = normalizeFood(YOGURT);
  const b = normalizeFood({ ...YOGURT, fdcId: 2002, description: 'Vanilla, Greek Yogurt' }); // same words, other order
  const c = normalizeFood({ ...YOGURT, fdcId: 2003, brandName: 'FAGE', brandOwner: 'FAGE USA' });
  assert.deepEqual(dedupe([a, b, c]).map((f) => f.fdcId), [2001, 2003]);
});

test('searchFoods: merges both calls, ranks, caps at 25, sends the key in a header and never in the URL', async () => {
  const branded = Array.from({ length: 40 }, (_, i) => BAR(100 + i, `BRAND${i}`, `Chicken breast bites ${i}`));
  const f = fakeFetch({ generic: [CHICKEN, BANANA], branded });
  const out = await run({ query: 'chicken breast' }, { fetch: f });
  assert.equal(out.foods.length, MAX_RESULTS);
  assert.equal(out.foods[0].fdcId, 171477, 'whole food first');
  assert.equal(out.more, true);
  assert.equal(f.calls.length, 2);
  for (const c of f.calls) {
    assert.ok(!c.url.includes('KEY123') && !c.url.includes('chicken'), 'nothing secret or typed in the URL');
    assert.equal(c.init.headers['X-Api-Key'], 'KEY123');
  }
  assert.deepEqual(f.calls.map((c) => JSON.parse(c.init.body).dataType).sort(), [['Branded'], ['Foundation', 'SR Legacy', 'Survey (FNDDS)']].sort());
  assert.deepEqual(Object.keys(out.foods[0]).sort(), ['brand', 'dataType', 'fdcId', 'measures', 'name', 'per100', 'perServing', 'serving']);
});

test('searchFoods: identical queries come from the cache for a few minutes', async () => {
  const f = fakeFetch({ generic: [BANANA] });
  const cache = createCache();
  const db = fakeDb();
  await searchFoods({ db, uid: 'u1', data: { query: 'banana' }, apiKey: 'K', fetch: f, now: () => NOW, cache });
  await searchFoods({ db, uid: 'u1', data: { query: ' Banana ' }, apiKey: 'K', fetch: f, now: () => NOW + 60000, cache });
  assert.equal(f.calls.length, 2, 'second search used the cache');
  await searchFoods({ db, uid: 'u1', data: { query: 'banana' }, apiKey: 'K', fetch: f, now: () => NOW + 6 * 60000, cache });
  assert.equal(f.calls.length, 4, 'expired after 5 minutes');
});

test('searchFoods: one failing call still answers; both failing is a friendly error code', async () => {
  const one = await run({ query: 'banana' }, { fetch: fakeFetch({ generic: [BANANA], fail: 'branded' }) });
  assert.equal(one.foods.length, 1);
  await assert.rejects(run({ query: 'banana' }, { fetch: fakeFetch({ fail: 'all' }) }), (e) => e.code === 'down');
  await assert.rejects(run({ query: 'banana' }, { fetch: fakeFetch({ fail: 'busy' }) }), (e) => e.code === 'busy');
  await assert.rejects(run({ query: 'banana' }, { fetch: async () => { throw new Error('socket hang up'); } }), (e) => e.code === 'down');
  await assert.rejects(searchFoods({ db: fakeDb(), uid: 'u1', data: { query: 'banana' }, apiKey: '', fetch: fakeFetch(), now: () => NOW, cache: createCache() }), (e) => e.code === 'down');
});

test('rate limit: 120 searches an hour per person, then the window restarts', async () => {
  const db = fakeDb();
  for (let i = 0; i < RATE_PER_HOUR; i++) assert.equal((await meterSearch({ db, uid: 'u1', now: NOW + i })).limited, false);
  assert.equal((await meterSearch({ db, uid: 'u1', now: NOW + 5000 })).limited, true);
  assert.equal((await meterSearch({ db, uid: 'u2', now: NOW + 5000 })).limited, false, 'another person is not affected');
  assert.equal((await meterSearch({ db, uid: 'u1', now: NOW + 3600001 })).limited, false, 'a new hour');
  // Through the whole search: the 121st is refused before any FDC call.
  const db2 = fakeDb();
  for (let i = 0; i < RATE_PER_HOUR; i++) await meterSearch({ db: db2, uid: 'u1', now: NOW });
  const f = fakeFetch({ generic: [BANANA] });
  await assert.rejects(run({ query: 'banana' }, { db: db2, fetch: f }), (e) => e.code === 'limited');
  assert.equal(f.calls.length, 0);
});

test('privacy: neither the key nor the query ever reaches log.js', async () => {
  const lines = [];
  setSink((l) => lines.push(l));
  try {
    await run({ query: 'secret sandwich' }, { fetch: fakeFetch({ generic: [BANANA], branded: [YOGURT] }) });
    await run({ query: 'secret sandwich' }); // cached path and an empty result
    await assert.rejects(run({ query: 'secret soup' }, { fetch: fakeFetch({ fail: 'all' }) }));
    const db = fakeDb();
    for (let i = 0; i < RATE_PER_HOUR; i++) await meterSearch({ db, uid: 'u1', now: NOW });
    await assert.rejects(run({ query: 'secret salad' }, { db }));
  } finally {
    setSink((l) => console.log(l));
  }
  assert.ok(lines.length >= 3, 'it does log counts and codes');
  const all = lines.join('\n');
  assert.ok(!/KEY123|secret|sandwich|soup|salad|Banana|Chobani/i.test(all), all);
  for (const l of lines) assert.equal(JSON.parse(l).event, 'food_search');
});

test('the source never logs or throws the key, the URL or the query', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/usda.js', import.meta.url), 'utf8');
  assert.ok(!/console\./.test(src), 'no console output in usda.js');
  assert.ok(!/log\([^)]*(query|apiKey|FDC_URL)/.test(src), 'log() never gets the query, key or URL');
});

// A Survey (FNDDS) hit as the search returns it: household measures with gram weights.
const FNDDS = {
  fdcId: 782345, description: 'Rice, white, cooked', dataType: 'Survey (FNDDS)', foodNutrients: nut(130, 2.7, 28.2, 0.3),
  foodMeasures: [
    { disseminationText: 'Quantity not specified', gramWeight: 158, rank: 99 },
    { disseminationText: '1 cup', gramWeight: 158, rank: 1 },
    { disseminationText: '1 tablespoon', gramWeight: 10, rank: 2 },
    { disseminationText: '1 oz', gramWeight: 28.35, rank: 3 },
    { disseminationText: '1 CUP', gramWeight: 158, rank: 4 },
    { disseminationText: '1 serving, restaurant size', gramWeight: 300, rank: 5 },
    { disseminationText: '1 bowl', gramWeight: 0, rank: 6 },
    { disseminationText: '1 large scoop', gramWeight: 90, rank: 7 },
    { disseminationText: '1 small scoop', gramWeight: 45, rank: 8 },
  ],
};

test('household measures: Survey foods get "1 cup (158 g)" as the serving and up to 4 sensible measures', () => {
  const f = normalizeFood(FNDDS);
  assert.deepEqual(f.serving, { g: 158, text: '1 cup (158 g)', real: true });
  assert.deepEqual(f.measures, [
    { text: '1 cup', g: 158 }, { text: '1 tablespoon', g: 10 }, { text: '1 serving, restaurant size', g: 300 }, { text: '1 large scoop', g: 90 },
  ]);
  assert.equal(f.perServing.kcal, 205);
  const b = normalizeFood(BANANA);
  assert.deepEqual(b.serving, { g: 100, text: '100 g', real: false });
  assert.deepEqual(b.measures, []);
  assert.equal(normalizeFood({ ...YOGURT, foodMeasures: FNDDS.foodMeasures }).serving.text, '1 container (150 g)');
  assert.deepEqual(measuresOf({ foodMeasures: 'nope' }), []);
});

test('shortBrand: drops corporate filler, cuts long names at a word with a real ellipsis', () => {
  assert.equal(shortBrand('KRAFT HEINZ FOODS COMPANY INTERNATIONAL DIVISION'), 'Kraft Heinz');
  assert.equal(shortBrand('General Mills Sales Inc.'), 'General Mills');
  assert.equal(shortBrand('PERDUE'), 'Perdue');
  assert.equal(shortBrand(''), '');
  assert.equal(shortBrand('Foods'), 'Foods', 'keeps Foods when nothing else is left');
  const long = shortBrand('Some Extraordinarily Long Brand Name Here');
  assert.ok(long.length <= 23 && long.endsWith('…') && !/\s…$/.test(long), long);
  assert.equal(normalizeFood({ ...YOGURT, brandName: undefined, brandOwner: 'KRAFT HEINZ FOODS COMPANY INTERNATIONAL HOLDINGS' }).brand, 'Kraft Heinz Holdings');
});

test('delete everything removes the food-search counter, and is fine when there is none', async () => {
  const db = fakeDb();
  const { P } = await import('../src/paths.js');
  await meterSearch({ db, uid: 'u1', now: 1000 });
  assert.ok(db.dump(P.foodSearch('u1')));
  await deleteFoodSearchData({ db, uid: 'u1' });
  assert.equal(db.dump(P.foodSearch('u1')), undefined);
  await deleteFoodSearchData({ db, uid: 'u1' }); // already gone
  const { disconnect } = await import('../src/maintenance.js');
  await meterSearch({ db, uid: 'u2', now: 1000 });
  await disconnect({ db, api: {}, uid: 'u2', webhookUrl: 'x', deleteData: true, deleteApple: true });
  assert.equal(db.dump(P.foodSearch('u2')), undefined);
  await meterSearch({ db, uid: 'u3', now: 1000 });
  await disconnect({ db, api: {}, uid: 'u3', webhookUrl: 'x', deleteData: true });
  assert.ok(db.dump(P.foodSearch('u3')), 'the Withings-only dialog leaves it');
});

test('delete during a fresh search window keeps the limit in force; after the window it removes the doc', async () => {
  const db = fakeDb();
  const { P } = await import('../src/paths.js');
  for (let i = 0; i < RATE_PER_HOUR; i++) await meterSearch({ db, uid: 'u1', now: NOW });
  await deleteFoodSearchData({ db, uid: 'u1', now: NOW + 60000 });
  assert.ok(db.dump(P.foodSearch('u1')), 'still there inside the hour');
  assert.equal((await meterSearch({ db, uid: 'u1', now: NOW + 61000 })).limited, true, 'delete did not reset the 120 an hour');
  await deleteFoodSearchData({ db, uid: 'u1', now: NOW + 3600000 + 1 });
  assert.equal(db.dump(P.foodSearch('u1')), undefined, 'gone once the window has passed');
  const { disconnect } = await import('../src/maintenance.js');
  await meterSearch({ db, uid: 'u4', now: NOW });
  await disconnect({ db, api: {}, uid: 'u4', webhookUrl: 'x', deleteData: true, deleteApple: true, now: () => NOW + 1000 });
  assert.ok(db.dump(P.foodSearch('u4')), 'Delete everything inside the window leaves the counter');
});

test('SR Legacy measures: a 33-character "0.5 breast" survives as ½, 0.25 becomes ¼', () => {
  const m = measuresOf({ foodMeasures: [
    { disseminationText: '0.5 breast, bone and skin removed', gramWeight: 86 },
    { disseminationText: '1 cup, chopped or diced', gramWeight: 140 },
    { disseminationText: '0.25 cup, chopped or diced', gramWeight: 35 },
    { disseminationText: '1 unit of a very very long and silly measure name here', gramWeight: 20 },
  ] });
  assert.deepEqual(m.map((x) => x.text), ['½ breast, bone and skin removed', '1 cup, chopped or diced', '¼ cup, chopped or diced']);
});
