# W1 live findings (Oct 8, 2026, first real connect) + follow-up PR scope

W1 is deployed (8 functions, us-east1) and Christian connected his real account at 2:54 PM ET.
Open ONE PR against `main` (not stacked) titled "v0.4.1: W1 live fixes + follow-ups".

## 1. MUST FIX: history import stops at Jan 7, 2025 (top priority, Nov 1 deadline)
- Withings card shows `History: ✓ 422 measurements since Jan 7, 2025`. Data check: Forge has 362 weigh-ins vs weight.csv 1,084 rows.
- His Withings export has weigh-ins back to Dec 31, 2009. The export has exactly 363 weigh-ins on/after 2025-01-07, so Forge got essentially everything since Jan 7, 2025 and nothing before it.
- Jan 2025 is when his current Body Comp scale was paired, but the older weigh-ins are on his account (they're in the official export), so the API should return them.
- Suspect: `backfillPage` (functions/src/sync.js:138) and the data check (datacheck.js:30) pass `startdate: 0`. Withings may treat 0 as "not set" and fall back to a default window, or cap the range. Fix it so the backfill really walks the whole account:
  - Try omitting startdate/enddate entirely, and/or walk explicit windows (e.g. one year at a time from 2009-01-01, or from the account's oldest data) with offset paging inside each window.
  - Pin `enddate` per run (already on the follow-up list).
  - Mark the backfill done only after the oldest window returns nothing; record the real oldest date in `backfill.from`.
  - Add a unit test with a fake API that only returns pre-2025 data when startdate is a real timestamp.
  - The data check's "Withings has" count must use the same full-history walk, or the verdict compares the wrong numbers.
- Re-running the backfill on an existing connection must be possible without disconnecting (e.g. maintenance or a "Re-import history" button), and must be idempotent (doc ids are w_<grpid>).

## 2. MUST FIX: "Last weigh-in" shows "—" after a full backfill
- `last_weigh_in_at` is only written by incrementalSync (sync.js:129). After connect, the backfill imported hundreds of weigh-ins but the card still shows "—" for Last weigh-in and Arrived in.
- Backfill pages should also update `last_weigh_in_at` (max of weight groups seen). "Arrived in" can stay "—" until a webhook weigh-in, but say "waiting for your next weigh-in" instead of a bare dash.

## 3. Other people's weigh-ins on his account
- About 9% of his export's weigh-ins (95 of 1,084) are clearly his wife and daughter (under 170 lb; he's around 200 lb), mostly 2017–2020, a few in 2024. Once item 1 lands, these will flood in.
- Make sure the "Is this you?" queue catches them (weight far from his rolling trend, e.g. >15% off the median of the nearest 10 weigh-ins), and add **bulk actions**: "Not me: all under X lb" with a preview count, plus "Not me" on a whole day. Tapping 95 rows one at a time is not acceptable.
- Not-me items count as accounted for in the data check (this is re-review item A1 below).

## 4. Previous follow-ups still open (see notes/review-v0.4.0-w1-for-claude.md)
- Re-review A1: count user tombstones (`deleted_by !== 'withings'`) as present in datacheck.js:92-93.
- Re-review A2: "That's me" only updates weights/w_* when the group has a weight (js/db.js:85-88).
- Status 522 = temporary; invalid token -> one forced refresh, then needs_reconnect; expire old oauth_states; drop or remember-rejected meastype 140; maintenance steps isolated; label by the group's own model; backfill counter not inflated by retries; re-check lease_id when saving tokens; commit functions/package-lock.json.
- UI: verdict wording "Waiting for N more weigh-ins" instead of "things to fix"; time of day in weight history; show VO2max; ESC/NRS in Body CSV; .card.row chevron.
- Docs (docs/withings.md): Secret Manager / Cloud Resource Manager can fail with "Failed to make request ... Connect Timeout" on networks that block googleapis.com from Terminal; fix is another network (phone hotspot). Mention `npm --prefix functions install` before deploy, and that a sudo npm install can leave ~/.npm owned by root (`sudo chown -R $(whoami) ~/.npm`).

## 5. v0.3.2 follow-ups (separate tiny PR is fine): see notes/review-v0.3.2-followups-for-claude.md. None are done yet.

Acceptance for this PR: after deploy + "Re-import history", Withings card shows history back to Dec 2009, data check "Withings has" ≈ weight.csv rows, and the not-me bulk action clears the family weigh-ins in a couple of taps. All tests green; add tests for 1–3.
