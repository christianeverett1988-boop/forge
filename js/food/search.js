// One interface for finding foods: search(query, ctx) → Promise<item[]>. Today it only looks at your own data
// (My foods and your recent entries, on this phone, no network). Part 2 adds a USDA FoodData Central provider
// by pushing it onto PROVIDERS; nothing else has to change.
//
// An item: { key, kind: 'mine' | 'recent' | 'usda', name, kcal, protein_g, carbs_g, fat_g, serving, food_id? }
// kcal and macros are per serving.

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Your recent entries, newest first, one per food (by food_id, else by name). */
export function recentItems(logs, limit = 30) {
  const seen = new Set();
  const out = [];
  const sorted = logs.filter((l) => l && !l.deleted && l.name).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  for (const l of sorted) {
    const id = l.food_id ? `f:${l.food_id}` : `n:${norm(l.name)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      key: `recent:${id}`, kind: 'recent', name: l.name, kcal: l.kcal, protein_g: l.protein_g, carbs_g: l.carbs_g, fat_g: l.fat_g,
      serving: '', ...(l.food_id ? { food_id: l.food_id } : {}),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function foodItems(foods) {
  return foods.filter((f) => f && !f.deleted).sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({
    key: `mine:${f.id}`, kind: 'mine', name: f.name, kcal: f.kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g,
    serving: f.serving || '', food_id: f.id,
  }));
}

/**
 * Local provider. No query: foods you logged lately first (what you eat most is one tap away), then the rest
 * of My foods. With a query: every word must appear in the name; names that start with it come first; a recent
 * entry that is just a logged copy of one of My foods is hidden (the food itself shows instead).
 */
export function searchLocal(query, { foods = [], logs = [], limit = 40 } = {}) {
  const mine = foodItems(foods);
  const byId = new Map(mine.map((m) => [m.food_id, m]));
  const recents = recentItems(logs);
  const q = norm(query);
  if (!q) {
    const lately = recents.map((r) => (r.food_id && byId.has(r.food_id) ? byId.get(r.food_id) : r.food_id ? null : r)).filter(Boolean);
    const rest = mine.filter((m) => !lately.includes(m));
    return [...lately, ...rest].slice(0, limit);
  }
  const words = q.split(' ');
  const hit = (it) => { const n = norm(it.name); return words.every((w) => n.includes(w)); };
  const rank = (it) => (norm(it.name).startsWith(q) ? 0 : 1);
  const extra = recents.filter((r) => !r.food_id);
  return [...mine.filter(hit), ...extra.filter(hit)].sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

export const PROVIDERS = [{ id: 'local', search: async (query, ctx) => searchLocal(query, ctx) }];

export async function search(query, ctx) {
  const lists = await Promise.all(PROVIDERS.map((p) => p.search(query, ctx).catch(() => [])));
  return lists.flat();
}
