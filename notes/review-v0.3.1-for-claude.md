v0.3.1 is merged and green (119/119 unit, 13/13 rules). My reviewer found the SW shell complete, CSP/rules/config untouched, the photo script and MIT notice fine, and my approved tweaks in. Put these fixes on a new branch (`fix/v0.3.2`) with a PR. Keep `config.js` and `firestore.rules` unchanged.

**Must-fix**
1. **How-To stalls on a weak gym signal.**
   - `howto.js:26` awaits `loadPhotoIndex()` before opening the sheet.
   - `index.json` is network-first with no timeout (`sw.js:122-126`).
   - On lie-fi the button does nothing until the fetch fails.
   - Fix: serve the index stale-while-revalidate and open the sheet immediately, adding the Photos toggle when the index resolves.
2. **Uncached photo offline shows a white box.**
   - The photo branch at `sw.js:129-132` has no `.catch`, and `.photo-loop` is `background:#fff`. It hits after a mid-workout Replace, or when `cachePhotos` silently failed on Start.
   - Fix: catch and return a 504, and add `onerror` on the imgs to fall back to the muscle chips.
3. **Escape `photoLoop`.** `photos.js:28` puts `alt` (`ex.name`) and `id` into HTML unescaped. It's unreachable by custom names today, but `esc()` both.

**Template fixes** (18 exercises × 4 phases rendered; nothing clips through the body and no props float, but:)
1. **`row_bent` (poses-lib.js:403) barely moves.** The bar only rises from mid-shin to the knee. Pull to the lower ribs, at roughly `b: sh -75…-80, el 95…100`. This affects bb/pendlay/db/kb rows.
2. **`db_one_arm_row` uses the two-arm bent row.** Give it a one-arm template with a hand and knee on a bench.
3. **Bilateral dumbbell moves show only one dumbbell** (`rig.js:341`; only 3 templates set `both`).
   - The lateral raise's far arm rises empty. On `fly` the far arm barely opens and has no bell, so it reads as one-armed.
   - Add `both: true` to lateral_raise, fly, fly_incline and the DB bench/press variants, and make the `fly` far arm open. Near-only was meant for the curl.
4. **`cable_lat_pulldown` is "(kneeling)" but drawn seated** (check `band_lat_pulldown`). Add a kneeling variant.
5. **Minor:** dip bars are low enough that the feet nearly touch the floor; the OHP starts with the bar at the chin, hiding the head (start at the clavicles).

**Nice-to-haves**
- **Budget.** New JS since pre-v0.3 is +86.5 KB gzip (≈66.5 KB without the 20 KB body-map paths), over my 60 KB. v0.3.1 alone is +52.8 KB, not "about 40 KB".
  - Route-lazy loading makes it acceptable. Correct the CHANGELOG number, add a short justification, and reconcile the template count (docs say 114, CHANGELOG 75).
- **§11 preview parity is still missing on Train:** duration chip, "N exercises · N muscles", Warm-up block, Superset/Circuit groups with rounds, ⋯ menu per exercise (Replace / History / Rest timer), and Switch. Do it as its own PR after the fixes.
- **Download all photos:** the toast says "saved" even when every fetch failed, and `photoStatus` counts an exercise as saved with one of two frames cached. Report real counts.
- **Player demo:** re-render when the photo index arrives after boot.

I'll run the photo script and commit `media/ex` myself.
