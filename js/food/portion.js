// Portion maths for USDA foods. Pure, no DOM, tested. A USDA item carries numbers per 100 g and one serving in
// grams; every portion (½, 1, 1½, 2 servings, or an amount in grams or ounces) is turned into grams first, and
// the macros for that many grams are what gets logged. Limits match firestore.rules (5000 kcal, 500 g macros).
import { LIMITS } from './core.js';

export const OZ_G = 28.349523125;
export const SERVING_CHOICES = [0.5, 1, 1.5, 2];
export const MAX_GRAMS = 5000;

const r1 = (x) => Math.round(x * 10) / 10;

export const gramsToOz = (g) => g / OZ_G;
export const ozToGrams = (oz) => oz * OZ_G;
export const servingsToGrams = (p, n) => n * p.serving.g;
export const gramsToServings = (p, g) => g / p.serving.g;

/** Grams from what was typed: unit 'g' or 'oz'. null for nothing, zero, negative or silly amounts. Accepts "1,250". */
export function gramsFromAmount(text, unit) {
  const n = Number(String(text == null ? '' : text).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  const g = unit === 'oz' ? ozToGrams(n) : n;
  return g > MAX_GRAMS ? null : g;
}

/** Macros for `grams` of a USDA item, clamped to what a log entry may hold. */
export function macrosFor(p, grams) {
  const g = Math.min(MAX_GRAMS, Math.max(0, grams));
  const f = (v, hi) => Math.min(hi, r1((v * g) / 100));
  return {
    kcal: Math.min(LIMITS.kcal, Math.round((p.per100.kcal * g) / 100)),
    protein_g: f(p.per100.protein_g, LIMITS.macro),
    carbs_g: f(p.per100.carbs_g, LIMITS.macro),
    fat_g: f(p.per100.fat_g, LIMITS.macro),
  };
}

/** "½", "1½", "2" … for the serving chips and the summary. */
export function servingsLabel(n) {
  if (Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) return String(Math.round(n * 100) / 100); // 1.3 stays 1.3
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 4) / 4;
  const f = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[frac] || '';
  if (frac === 1) return String(whole + 1);
  if (!whole) return f || '0';
  return `${whole}${f}`;
}

/** "5.3 oz" / "150 g": one decimal for ounces, none for grams. Thousands get a comma. */
export function amountLabel(grams, unit) {
  if (unit === 'oz') return `${(Math.round(gramsToOz(grams) * 10) / 10).toLocaleString('en-US')} oz`;
  return `${Math.round(grams).toLocaleString('en-US')} g`;
}

/**
 * What to write on the log entry: "1 cup (240 g)" for one serving, "1½ × 1 cup (240 g)" for more, and
 * "5.3 oz (150 g)" when the amount was typed by weight. Short enough for the list (40 characters).
 */
export function portionText(p, { mode, servings, grams, unit }) {
  let t;
  if (mode === 'weight') {
    t = unit === 'oz' ? `${amountLabel(grams, 'oz')} (${amountLabel(grams, 'g')})` : amountLabel(grams, 'g');
  } else {
    const label = p.serving.text;
    t = servings === 1 ? label : `${servingsLabel(servings)} × ${label}`;
  }
  return t.length > 40 ? `${t.slice(0, 39).trimEnd()}…` : t;
}

/** A USDA search row from the server → a Log food item. food_id keeps the fdcId so recents work. */
export function usdaItem(row) {
  const name = row.brand ? `${row.name} (${row.brand})` : row.name;
  return {
    key: `usda:${row.fdcId}`, kind: 'usda', name: name.length > 80 ? `${name.slice(0, 79).trimEnd()}…` : name,
    title: row.name, brand: row.brand || '', dataType: row.dataType,
    kcal: row.perServing.kcal, protein_g: row.perServing.protein_g, carbs_g: row.perServing.carbs_g, fat_g: row.perServing.fat_g,
    serving: row.serving.text, food_id: `usda:${row.fdcId}`,
    usda: { per100: row.per100, serving: row.serving },
  };
}

/** The item as it should be logged for a portion: macros for those grams, one "serving", and the portion text. */
export function portionItem(item, portion) {
  const p = item.usda;
  const grams = portion.mode === 'weight' ? portion.grams : servingsToGrams(p, portion.servings);
  return { ...item, ...macrosFor(p, grams), portion: portionText(p, { ...portion, grams }) };
}
