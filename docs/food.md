# Food logging (v0.11.0, part 1)

Part 1 of Checkpoint C worked from your own data on the phone. **v0.15.5 adds USDA FoodData Central search** (see "USDA search" at the end).

## Where it lives

A **Food screen at `#/food`, under the Today tab**, reached from the Food card on Today ("Log food" opens the sheet straight away, "See meals" opens the screen). Why there and not a sixth tab or a Progress segment: the tab bar stays at five, Progress already has four segments at phone width, and food is something you do every day, like Today's workout and weigh-in. The Today rings are untouched; the card is small and sits under Daily targets.

## Data (`users/{uid}/…`, standard fields on both)

| Collection | Fields |
|---|---|
| `foods` ("My foods") | `name` 1–80 chars, `kcal` 0–5000, `protein_g` / `carbs_g` / `fat_g` 0–500, `serving` ≤ 40 chars. Numbers are per serving. |
| `food_logs` | `day` (YYYY-MM-DD), `meal` (`breakfast`/`lunch`/`dinner`/`snack`), `name`, `kcal`, `protein_g`, `carbs_g`, `fat_g` (per serving, **copied** from the food), `servings` > 0 and ≤ 20, optional `food_id`. Entry total = per-serving × `servings`. |

Copying the macros into the entry means editing or deleting a food never rewrites history. A quick add is a log entry named "Quick add" with only calories (and protein) and no `food_id`. Deleting is a tombstone (`deleted: true`). Both are in the JSON export, "Export food log (CSV)" in Settings, and Delete everything.

`firestore.rules` checks types and ranges for both (same numbers as above), plus the date shape and the meal list; `created_at` and `user_id` are immutable like everywhere else. Rules tests are in `tests/rules/rules.test.js`.

**Rules must be published before this version goes live** (`firebase deploy --only firestore:rules`). If they aren't, the app still opens; the Food screen says food isn't switched on yet, export and Delete everything skip the two new collections instead of failing.

## Screens

- **Food:** calories and protein (large) and carbs and fat (small) against today's targets, a big **Log food** button, then Breakfast / Lunch / Dinner / Snacks. Arrows move between days. Tap an entry to change servings or meal, or delete it. A meal with nothing in it shows **Copy yesterday** when the day before had that meal.
- **Log food sheet:** search over My foods + recent entries (local only; no query shows your recent foods first), **Quick add** (calories, protein optional), a servings stepper (quarters up to 1, halves after), and the meal, pre-selected by time of day (before 10:30 breakfast, to 14:30 lunch, to 17:00 snack, to 21:30 dinner, then snack). **A recent food takes 3 taps:** Log food, the food, Add.
- **My foods:** create, edit, delete from the Food screen.

## Code

- `js/food/core.js`: totals, grouping by meal, validation, copy-a-meal, stepper. Pure.
- `js/food/search.js`: the one search interface. `search()` is the instant local part; `searchRemote()` and `createOnlineSearch()` run the `remote: true` providers (USDA), debounced.
- `js/food/portion.js`: servings ↔ grams ↔ oz maths for USDA foods.
- `js/food/flow.js`: the Log sheet as a state machine (counts the taps; tested).
- `js/screens/food.js`: the screen and sheets. Tests: `tests/food.test.js`.

## Forge Score and the weekly report

Nutrition (15%) is documented in `docs/forge-score.md`. It lights up after **3 logged days in the last 7**; until then it stays "not tracked yet" and its weight is shared out. The weekly report gets a Nutrition card (days logged, average calories and protein over the logged days, against target) and one line in the shared text.

## TODO (not in this PR)

- **Adaptive TDEE** from logged intake and the weight trend (Withings+ replacement). It needs about 2–3 weeks of real logs to test, so it waits. Plan: compare average logged kcal with the trend's energy change (7,700 kcal per kg, as in `js/nutrition/targets.js`) over a rolling 14–21 days that has at least 10 logged days, shrink toward the formula TDEE until there's enough data, and show it as a suggestion the user accepts, never a silent change.
- Barcode scan, meals/recipes.

## USDA search (v0.15.5)

**Server:** callable `foodSearch` (`functions/index.js` → `functions/src/usda.js`), secret `USDA_API_KEY` (a free api.data.gov key). Deploy: `firebase deploy --only functions:foodSearch`.

- Input `{ query, page? }`: the query is trimmed to 2–60 characters (control characters dropped), page 1–10. Needs sign-in.
- Rate limit: 120 an hour per user, counted in `users/{uid}/private/food_search` (server-only; the rules close `private` to clients). The hour starts at the first search. Over it: "That’s a lot of searches. Try again in a little while."
- Two FDC `/v1/foods/search` calls in parallel (Foundation + SR Legacy + Survey (FNDDS), and Branded), POST with the key in `X-Api-Key`, 6 s timeout, 40 rows each, so branded rows never crowd out whole foods. If one fails the other still answers. That is two FDC calls per search; the free key allows 1,000 an hour.
- Returns `{ foods: [{ fdcId, name, brand, dataType, serving: { g, text, real }, per100, perServing }], more }`, at most 25. `per100` and `perServing` are `{ kcal, protein_g, carbs_g, fat_g }`; `perServing = per100 × serving.g / 100`. USDA's serving (grams, or ml treated as grams) is used when it has one; otherwise 100 g with `real: false`. Rows with no energy are dropped. Energy is nutrient 208 (kcal), or the Atwater energies (957/958) for Foundation foods.
- Ranking: a generic query lists Foundation, SR Legacy, Survey, then Branded. If two or more branded hits have a whole query word (3+ letters) in their brand, it's a brand query and branded rows go first. Names that start with the query lead within a group. Near-identical rows (same words, same brand) are dropped.
- Cache: identical queries (same page, case-insensitive) for 5 minutes, in memory per instance. Cached answers still count toward the rate limit.
- Never logged: the key, the request and the query (`log.js` only gets a status, a count and milliseconds). Tested.

**Client:** USDA rows appear under My foods and recents. Typing re-runs the local search at once and the online one 300 ms after the last key (under 2 letters: nothing). A picked USDA food opens the portion picker: ½ / 1 / 1½ / 2 servings, or an amount in servings, oz or g (oz first for lb/ft users). The entry is a normal `food_logs` doc for that portion: macros for those grams, `servings: 1`, `food_id: "usda:<fdcId>"` and a `portion` text like "4 oz (113 g)". Why `servings: 1`: entries have a 0.25-serving floor, so 20 g of oil would otherwise be wrong. Recents show the portion as their serving line. No rules change: `food_id` is any string and the rules don't restrict extra fields.

Offline or a failed call: one quiet line, "Online search needs a connection" or "Online search isn’t available right now". Your own foods are never affected.

### Measures, brand and messages (rounds 1–2)

- **Household measures:** Survey (FNDDS) and SR Legacy hits carry `foodMeasures`. The server returns up to 4 as `measures: [{ text, g }]` (USDA's order; no "Quantity not specified", bare g/oz, repeats, 0 g or over 2 kg; text up to 40 characters; "0.5" and "0.25" shown as "½" and "¼"). With no USDA serving size, the first measure is the serving ("1 cup (158 g)"); 100 g is the fallback. In the portion picker, 2 or more measures show under a "Serving size" caption as one scrolling row of one-line pills, below the ½ 1 1½ 2 row. Picking one changes what "1 serving" means; the logged portion text and macros follow.
- **Brand:** a log entry stores the clean title in `name` and the brand in its own `brand` field (40 characters at most, `logFields`). The rules don't restrict extra string fields. The dock, meal rows, results and Recents show the title (two lines) with the brand first on the one-line grey line. The meal row's grey line is brand · protein · portion; its calories are the number on the right.
- **Messages:** the server's "That’s a lot of searches…" (`resource-exhausted`) and "Food search is busy. Try again in a minute." (`unavailable`, USDA answered 429) are shown as written. Only real outages say "Online search isn’t available right now".
- **Delete everything and the counter:** `private/food_search` ({ hour_start, hour_n }) is deleted by `withingsDisconnect` with `deleteApple`, but only once its hour has passed. Inside the hour it stays, so deleting can't reset the 120 an hour limit on the shared USDA key; the next search overwrites it. It holds no health or search data.
