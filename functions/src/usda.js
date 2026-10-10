// USDA FoodData Central search for Log food. The key stays on the server (a Secret Manager secret), the app only
// ever sees a small normalised list. Nothing here logs the query, the request or the key: the only logger is
// log.js and we hand it counts and durations. No network in tests: `fetch` is injected.
import { P } from './paths.js';
import { log } from './log.js';

export const FDC_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
export const RATE_PER_HOUR = 120;
export const MAX_RESULTS = 25;
export const CACHE_MS = 5 * 60 * 1000;
export const TIMEOUT_MS = 6000;
const PAGE_SIZE = 40;
const GENERIC_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
const TYPE_ORDER = { Foundation: 0, 'SR Legacy': 1, 'Survey (FNDDS)': 2, Branded: 3 };

/** Carries a short code the wiring maps to an HttpsError: 'invalid' | 'limited' | 'busy' | 'down'. */
export class FoodSearchError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** The trimmed query (2–60 chars, no control characters) and page (1–10). Throws FoodSearchError('invalid'). */
export function validateInput(data) {
  const d = data && typeof data === 'object' ? data : {};
  if (typeof d.query !== 'string') throw new FoodSearchError('invalid');
  const query = d.query.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (query.length < 2 || query.length > 60) throw new FoodSearchError('invalid');
  let page = 1;
  if (d.page !== undefined && d.page !== null) {
    page = d.page;
    if (!Number.isInteger(page) || page < 1 || page > 10) throw new FoodSearchError('invalid');
  }
  return { query, page };
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const r1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, hi) => Math.min(hi, Math.max(0, x));

const SMALL = new Set(['and', 'or', 'of', 'with', 'in', 'on', 'the', 'a', 'to', 'for', 'without']);
/** "CHOBANI GREEK YOGURT" → "Chobani Greek Yogurt"; text that is already mixed case is left alone. */
export function tidyCase(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return t;
  return t.toLowerCase().split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/(^|[-/(])([a-z])/g, (m, a, b) => a + b.toUpperCase())))
    .join(' ');
}

function nutrient(food, ids, numbers) {
  const list = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  for (const n of list) {
    if (!n || typeof n.value !== 'number' || !Number.isFinite(n.value)) continue;
    const id = n.nutrientId ?? (n.nutrient && n.nutrient.id);
    const num = String(n.nutrientNumber ?? (n.nutrient && n.nutrient.number) ?? '');
    if (ids.includes(id) || numbers.includes(num)) return n.value;
  }
  return null;
}

/** Per 100 g {kcal, protein_g, carbs_g, fat_g} from a search hit, or null when USDA has no energy for it. */
export function per100Of(food) {
  // 1008 / 208 is Energy in kcal. Foundation foods often carry only the Atwater energies (2047 general, 2048 specific).
  const kcal = nutrient(food, [1008], ['208']) ?? nutrient(food, [2047, 2048], ['957', '958']);
  if (kcal === null) return null;
  return {
    kcal: Math.round(clamp(kcal, 900)),
    protein_g: r1(clamp(nutrient(food, [1003], ['203']) ?? 0, 100)),
    carbs_g: r1(clamp(nutrient(food, [1005], ['205']) ?? 0, 100)),
    fat_g: r1(clamp(nutrient(food, [1004], ['204']) ?? 0, 100)),
  };
}

const scale = (p, g) => ({
  kcal: Math.round((p.kcal * g) / 100), protein_g: r1((p.protein_g * g) / 100), carbs_g: r1((p.carbs_g * g) / 100), fat_g: r1((p.fat_g * g) / 100),
});

/** USDA's own household words ("1 cup") with the grams after them: "1 cup (240 g)". '' when there are none. */
function householdText(food, grams) {
  const h = String(food.householdServingFullText || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!h || h.length > 30) return '';
  return /\bg\b|gram/.test(h) ? h : `${h} (${Math.round(grams)} g)`;
}

/**
 * USDA's household measures for a hit (Survey/FNDDS foods carry `foodMeasures`): up to 4 of { text: "1 cup", g: 140 },
 * in USDA's own order, without "Quantity not specified", bare gram/ounce measures, repeats or silly weights.
 */
export function measuresOf(food) {
  const list = Array.isArray(food.foodMeasures) ? food.foodMeasures : [];
  const seen = new Set();
  const out = [];
  const ranked = list.filter((m) => m && typeof m === 'object').map((m, i) => ({ m, i }))
    .sort((a, b) => (Number.isFinite(a.m.rank) && Number.isFinite(b.m.rank) ? a.m.rank - b.m.rank : 0) || a.i - b.i);
  for (const { m } of ranked) {
    const text = String(m.disseminationText || '').replace(/\s+/g, ' ').trim().toLowerCase()
      .replace(/^(0?\.5|0?\.25)(?= )/, (n) => (n.endsWith('25') ? '¼' : '½'));
    const g = m.gramWeight;
    if (!text || text.length > 40 || typeof g !== 'number' || !(g > 0) || g > 2000) continue;
    if (/not specified|^n\/?a$/.test(text) || /^(1 )?(g|gram|grams|oz|ounce|ounces)$/.test(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ text, g: r1(g) });
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * One FDC hit → { fdcId, name, brand, dataType, serving: {g, text, real}, measures, per100, perServing }.
 * Serving: USDA's grams (or ml, treated as grams) when it has them; else the first household measure ("1 cup (140 g)");
 * otherwise 100 g and real: false.
 * null for anything unusable (no id, no name, no energy).
 */
export function normalizeFood(food) {
  if (!food || !Number.isInteger(food.fdcId) || typeof food.description !== 'string') return null;
  const per100 = per100Of(food);
  if (!per100) return null;
  let name = tidyCase(food.description);
  if (!name) return null;
  if (name.length > 70) name = `${name.slice(0, 69).trimEnd()}…`;
  let brand = tidyCase(food.brandName || food.brandOwner || '');
  if (brand.length > 40) brand = `${brand.slice(0, 39).trimEnd()}…`;
  const unit = String(food.servingSizeUnit || '').toLowerCase();
  const size = food.servingSize;
  const real = typeof size === 'number' && size > 0 && size <= 2000 && ['g', 'grm', 'ml', 'mlt'].includes(unit);
  const measures = measuresOf(food);
  let serving;
  if (real) {
    const g = r1(size);
    serving = { g, text: householdText(food, g) || `${Math.round(g)} ${unit.startsWith('m') ? 'ml' : 'g'}`, real: true };
  } else if (measures.length) {
    serving = { g: measures[0].g, text: `${measures[0].text} (${Math.round(measures[0].g)} g)`, real: true };
  } else {
    serving = { g: 100, text: '100 g', real: false };
  }
  return { fdcId: food.fdcId, name, brand, dataType: String(food.dataType || ''), serving, measures, per100, perServing: scale(per100, serving.g) };
}

/** Does the query name a brand? Two or more branded hits whose brand has a query word (3+ letters, whole word). */
export function looksLikeBrandQuery(query, foods) {
  const words = norm(query).split(' ').filter((w) => w.length >= 3);
  if (!words.length) return false;
  let hits = 0;
  for (const f of foods) {
    if (f.dataType !== 'Branded') continue;
    const b = ` ${norm(f.brand)} `;
    if (words.some((w) => b.includes(` ${w} `))) hits++;
  }
  return hits >= 2;
}

/** Generic query: whole foods first (Foundation, SR Legacy, Survey, then Branded). Brand query: branded first.
 *  Inside a group names that start with the query come first; otherwise USDA's own relevance order stays. */
export function rankFoods(query, foods) {
  const brandy = looksLikeBrandQuery(query, foods);
  const q = norm(query);
  const group = (f) => (brandy ? (f.dataType === 'Branded' ? 0 : 1) : (TYPE_ORDER[f.dataType] ?? 3));
  const starts = (f) => (norm(f.name).startsWith(q) || norm(`${f.brand} ${f.name}`).startsWith(q) ? 0 : 1);
  return foods.map((f, i) => ({ f, i })).sort((a, b) => group(a.f) - group(b.f) || starts(a.f) - starts(b.f) || a.i - b.i).map((x) => x.f);
}

/** Drops near-identical rows: same words (any order) from the same brand. The first (best ranked) wins. */
export function dedupe(foods) {
  const seen = new Set();
  return foods.filter((f) => {
    const key = `${norm(f.name).split(' ').sort().join(' ')}|${norm(f.brand)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * "Delete everything": the search counter ({ hour_start, hour_n }) is the one thing foodSearch keeps. It goes once its
 * hour window has passed; while the window is open it stays, so deleting can't reset the 120 an hour limit (the next
 * search overwrites it). Already gone is fine.
 */
export async function deleteFoodSearchData({ db, uid, now = Date.now() }) {
  try {
    const ref = db.doc(P.foodSearch(uid));
    const snap = await ref.get();
    if (!snap.exists) return;
    const start = snap.data().hour_start;
    if (typeof start === 'number' && now >= start && now - start < 3600000) return;
    await ref.delete();
  } catch (e) { if (e && (e.code === 5 || e.code === 'not-found')) return; throw e; }
}

export function createCache({ ttl = CACHE_MS, max = 200 } = {}) {
  const m = new Map();
  return {
    get(k, now) { const e = m.get(k); if (!e) return null; if (now - e.at > ttl) { m.delete(k); return null; } return e.v; },
    set(k, v, now) { if (m.size >= max) m.delete(m.keys().next().value); m.set(k, { at: now, v }); },
    size: () => m.size,
  };
}
const sharedCache = createCache();

/** Counts this search for the user: 120 an hour (a window that starts at the first search). */
export async function meterSearch({ db, uid, now }) {
  const ref = db.doc(P.foodSearch(uid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : {};
    const fresh = d.hour_start && now - d.hour_start < 3600000 && now >= d.hour_start;
    const n = fresh ? d.hour_n || 0 : 0;
    if (n >= RATE_PER_HOUR) return { limited: true };
    tx.set(ref, { hour_start: fresh ? d.hour_start : now, hour_n: n + 1 });
    return { limited: false };
  });
}

async function fdc({ fetch, apiKey, query, page, types }) {
  // POST with the key in a header: it never appears in a URL, so it can't end up in a log line.
  const res = await fetch(FDC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ query, dataType: types, pageSize: PAGE_SIZE, pageNumber: page }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 429) throw new FoodSearchError('busy');
  if (!res.ok) throw new FoodSearchError('down');
  const body = await res.json();
  return Array.isArray(body && body.foods) ? body.foods : [];
}

/**
 * The whole search. Two parallel FDC calls (whole foods, then branded) so branded rows never crowd the generic
 * ones out of the first page. If one fails the other still answers; if both fail → FoodSearchError.
 * Returns { foods: [...up to 25], more: boolean }.
 */
export async function searchFoods({ db, uid, data, apiKey, fetch, now = () => Date.now(), cache = sharedCache }) {
  const { query, page } = validateInput(data);
  const t = now();
  const meter = await meterSearch({ db, uid, now: t });
  if (meter.limited) { log('food_search', { status: 429 }); throw new FoodSearchError('limited'); }
  const ck = `${page}|${query.toLowerCase()}`;
  const hit = cache.get(ck, t);
  if (hit) { log('food_search', { status: 200, count: hit.foods.length, reason: 'cache' }); return hit; }
  if (!apiKey) throw new FoodSearchError('down');

  const runs = await Promise.allSettled([
    fdc({ fetch, apiKey, query, page, types: GENERIC_TYPES }),
    fdc({ fetch, apiKey, query, page, types: ['Branded'] }),
  ]);
  if (runs.every((r) => r.status === 'rejected')) {
    const busy = runs.some((r) => r.reason && r.reason.code === 'busy');
    log('food_search', { status: busy ? 429 : 502 });
    throw new FoodSearchError(busy ? 'busy' : 'down');
  }
  const raw = runs.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const foods = dedupe(rankFoods(query, raw.map(normalizeFood).filter(Boolean))).slice(0, MAX_RESULTS);
  const out = { foods, more: runs.some((r) => r.status === 'fulfilled' && r.value.length >= PAGE_SIZE) };
  cache.set(ck, out, t);
  log('food_search', { status: 200, count: foods.length, ms: now() - t });
  return out;
}
