# Food logging (v0.11.0, part 1)

Part 1 of Checkpoint C. Everything works from your own data on the phone; USDA FoodData Central search is part 2 and needs a key from Christian.

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
- `js/food/search.js`: the one search interface, `search(query, ctx)`. Only the local provider exists. **Part 2:** push a USDA provider onto `PROVIDERS` (items have `kind: 'usda'`; the sheet needs no other change).
- `js/food/flow.js`: the Log sheet as a state machine (counts the taps; tested).
- `js/screens/food.js`: the screen and sheets. Tests: `tests/food.test.js`.

## Forge Score and the weekly report

Nutrition (15%) is documented in `docs/forge-score.md`. It lights up after **3 logged days in the last 7**; until then it stays "not tracked yet" and its weight is shared out. The weekly report gets a Nutrition card (days logged, average calories and protein over the logged days, against target) and one line in the shared text.

## TODO (not in this PR)

- **Adaptive TDEE** from logged intake and the weight trend (Withings+ replacement). It needs about 2–3 weeks of real logs to test, so it waits. Plan: compare average logged kcal with the trend's energy change (7,700 kcal per kg, as in `js/nutrition/targets.js`) over a rolling 14–21 days that has at least 10 logged days, shrink toward the formula TDEE until there's enough data, and show it as a suggestion the user accepts, never a silent change.
- USDA FoodData Central search (needs the key), barcode scan, meals/recipes, a macro ring on Today.
