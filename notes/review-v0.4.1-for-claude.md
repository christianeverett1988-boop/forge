# Review of PR #10 (v0.4.1) — for Claude

I had it reviewed against `notes/w1-live-findings-for-claude.md` and the earlier follow-ups. **Approve with follow-ups.** I'll merge and deploy so I can run Data check → By year. Please do M1 and M2 in a small follow-up PR off `main` before I use **Import weight.csv**.

**Tests:**
- unit 164/164;
- functions 49/49;
- rules 20/20;
- CI green on `d0d652f` (Unit, Functions, Security rules).

`config.js`, `firestore.rules` and the CSP are unchanged. The SW version is 0.4.1, and `review.js` is in the shell.

## What checks out

- **History walk:**
  - calendar-year windows, newest first, with a real startdate and an enddate pinned per run;
  - offset paging inside each year;
  - per-(year, page) counts, so retries can't inflate them;
  - stops only after 3 empty years at or before 2009, hard floor 2005;
  - bounded by offset-must-advance, MAX_PAGES and task-id dedupe, so it can't loop;
  - gap years above 2009 can't stop it.
- **Data check:** walks the same windows. Re-import is idempotent, keeps my deletions and "Not me", and refuses a double start.
- **Last weigh-in** is set by the backfill (never moves backwards). "Arrived in" says "waiting for your next weigh-in" until a webhook weigh-in arrives.
- **Family classifier, run on my real export** (aggregates only):
  - flags **all 95** family readings plus **1** of mine (the known Jan 2010 reading); no misses, no other false positives;
  - the suggested cutoff shows as **170 lb**, and "Not me: everything under 170 lb" covers exactly the 95 and none of mine;
  - suspects stay out of the trend and the Body tiles;
  - Not me / deletions count as accounted for in the data check (A1) for API weigh-ins;
  - A2 fixed.
- **weight.csv import:**
  - parsed locally; BOM and quoted header handled; lb → kg;
  - malformed rows skipped;
  - against my file and the 363 API weigh-ins since 2025-01-07: the first import adds 721 and matches 363; the second import adds 0;
  - tolerates small weight and second differences and whole-hour TZ shifts;
  - deleted readings aren't revived.
- **The §4 follow-ups are done:**
  - 522 is transient;
  - forced refresh then needs_reconnect, in tasks;
  - oauth_states are expired nightly;
  - 140 is dropped from the requests;
  - maintenance steps are isolated;
  - readings are labelled per group's model;
  - the backfill counter isn't inflated, and enddate is pinned;
  - the token save re-checks the lease;
  - the verdict says "Waiting for N more weigh-ins";
  - time of day in weight history, VO₂max, ESC/NRS/VO₂max in the Body CSV;
  - the chevron fix and the docs.
  - `functions/package-lock.json` is absent on purpose; I'll commit the generated one.
- **Security is unchanged:**
  - client writes to server collections and un-deletes are still denied (also checked with extra emulator writes: bulk Not me, That's me, a CSV record);
  - no tokens in the client;
  - new logs carry codes and counts only.

## Must-fix before I use Import weight.csv (M1, M2)

**M1. A false "not safe" blocker after Not me on CSV-imported readings.**
- `renderCheck` computes `csvImported` from `state.weights`, which excludes deleted docs.
- If the API doesn't return my pre-2025 history, all 95 family readings (all pre-2025) come in via the CSV. After I mark them Not me, the count drops by 95.
- With my numbers, `verdict()` goes from SAFE to **"Your weight.csv has 1084 rows; Forge has 989 weigh-ins (626 from the weight.csv import)"**.
- **Fix:** count `withings_csv` docs including deleted ones (they're accounted for, like A1). Add a test with Not me on CSV readings.

**M2. Import CSV first, then Re-import or reconnect → duplicates.**
- Dedupe only happens inside the importer. If a later backfill brings the same readings as `w_<grpid>`, the earlier `c_` docs stay.
- **Effect:**
  - weight history shows both;
  - the bulk count doubles;
  - `wF + csvImported` double-counts in the verdict.
- **Fix (either):**
  - tombstone or hide `withings_csv` docs that `near`-match a `withings` doc (same rule as `planCsvImport`), e.g. after a backfill finishes; or
  - enable Import only once the backfill is done, and dedupe on later runs.
- Add a test.

## Follow-ups (non-blocking)

1. **Validate task payloads in `runTask`.** A backfill task without a numeric `year`/`end` (e.g. one queued by v0.4.0) gives `yearWindow(NaN)`. `walkDone` never returns true, so it chains empty tasks up to MAX_PAGES. Return `{ skipped: 'bad_task' }`.
2. **Classifier seed.** It's the newest 10 non-review readings, so if the most recent readings were mostly someone else's, mine would be flagged. Seed from confirmed, manual or profile weight when available, and soften the CHANGELOG claim until then.
3. **Show the parse-skipped count** in the import toast.
4. **Withings Sync now and data check callables:** do the same forced refresh → needs_reconnect as `withToken` does.
5. **Remove 140** from `CHECK_METRICS.vascular_age.types` and `KEY_OF_TYPE` (cosmetic: the row says "asked 155, 140").
6. **Year windows are UTC.** A reading exactly at a year boundary could be counted in two windows if `enddate` is inclusive. Harmless for the docs, but it can make a per-year count off by one.
7. **Still open:**
   - chart polish (legend swatch colour, set-bar scale, y-axis units, tap/scrub, decimals);
   - the raw "(permission-denied)" text;
   - double-boxed report chips;
   - windowing the `body_measures` listener;
   - the `docs/levels.md` title;
   - the optional owner allow-list on the callables.

---

## Next PR after #10 merges: v0.4.3 = M1 + M2 + first-run how-to tour

Do M1 and M2 above (with tests) and the small follow-ups if cheap. Then rebase #11 onto main.

### First-run how-to tour (new, for my wife's account and anyone new)
My wife is creating her own Forge account (separate data, same app). When a brand-new account finishes onboarding, show a short guided tour so she knows how to operate the app without me.
- 6–8 steps max, one idea per step, with a spotlight on the real UI element (dim the rest) and Next / Back / Skip. Big tap targets, works one-handed on iPhone, respects reduced motion.
- Cover: Today (rings, today's workout card, how to start it), Train (start a workout, pick location, guided player: Done set, pause, swap exercise, how-to demo), logging weight by hand (Body → add weigh-in) since the scale is linked to my account, Progress (history, PRs, badges/XP), Settings (profile & targets, locations/equipment, units, coach audio).
- Plain friendly words; no jargon (explain RIR in one line if shown).
- Mark it seen per account (in her profile doc, not just localStorage, so it doesn't reappear on a new phone), and add **Settings → "Show the how-to tour again"**.
- Existing accounts (mine) should NOT get it automatically, but I can replay it from Settings.
- Withings card for an account that isn't connected should say the scale can only link to one Forge account for now and she can log weight by hand.
- Tests: tour shows once after onboarding for a new account, not for an existing profile, replay works, skip marks it seen. Rules test if a new profile field is added.
