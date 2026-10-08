Thanks for the W1 PR. I had it reviewed properly. The backend's careful and the security checks out:
- secrets are all defineSecret;
- the public endpoints are cheap without the key;
- maxInstances is 2 and the region is us-east1 everywhere;
- logs are allow-listed;
- the OAuth state is one-time;
- requesttoken is on /v2/oauth2;
- the queue and scheduler config look right.

The nonce change doesn't apply to us either, since we subscribe with a Bearer token. Tests all pass (154 unit, 36 functions, 19 rules) and CI is green.

I'm not merging yet, though. Please fix these first:

**Must-fix before merge**

1. **"That's me" is denied by the rules in production.**
   - `applyGroups` writes `deleted_at: null` / `deleted_by: null` into both `body_measures/w_*` and `weights/w_*`. Both `tombstoneOrReview()` and `hasStandardFields()` require `deleted_at` to be missing or a string, so the review update is rejected.
   - The weights one is swallowed by `.catch(()=>{})`, and with offline persistence it looks like it worked and then reverts.
   - The rules tests seed docs without those null fields, which is why they pass.
   - Either stop writing the nulls (omit them, or use `FieldValue.delete()` when restoring) or allow `== null` in both helpers.
   - Add a rules test seeded with exactly what `applyGroups` writes.
2. **The webhook proof counts syncs that weren't webhooks.**
   - `incrementalSync` adds to `latencies_s` for every reason. So if I weigh in and tap Sync now a minute later, that counts as "arrived on its own in 1 min".
   - Only record latency when `reason === 'notify'` and the group has a weight (meastype 1). Add a test.
3. **PWV is missing from the Body Comp capabilities.**
   - `MODEL_MEASURES['body comp']` lacks `pwv`, so the data check says my scale doesn't measure it. My Withings export shows my scale does record it. Add it, so it shows ⛔/✅ and lands in the "decide before cancelling" list.
   - The nerve scores are the same story: my export shows my scale measured them. If the API doesn't return a type my scale measures, show ⛔, not ⏳ "not measured yet".
4. **The CSV row check compares against the wrong number.**
   - `stored_groups` counts every body_measures doc: HR-only, PWV-only and nerve-only groups, and tombstones.
   - Compare my weight.csv rows with weight groups instead: Withings `types['1'].count`, and Forge's non-deleted docs with `weight_kg`. Show both numbers.
   - Also tell me to count rows without the header. I'll type the number myself.
5. **Reconcile removals aren't really reversible.**
   - A doc tombstoned with `deleted_by:'withings'` only comes back if Withings re-sends the group, and a `lastupdate` sync won't re-send an unchanged one.
   - Make `reconcile90` restore any `deleted_by:'withings'` doc in the window whose grpid is back in the list. Add a test.
   - Also, the guard is really max(3, 20%). That's fine, but say so in the comment and the docs. Show the last reconcile (aborted, or how many removed) in the data check.
6. **Body tiles need an "as of" date.**
   - My export shows body composition is often missing, so some weigh-ins are weight-only (the bioimpedance reading failed).
   - So the tiles could show months-old fat/muscle next to this week's weight as if both were current.
   - Add an "as of <date>" on any tile older than the latest weigh-in, plus a nudge: "Your last N weigh-ins had no body composition — stand barefoot with dry feet on the electrodes."

**Follow-ups (after merge is fine)**

- **Backend**
  - Treat Withings JSON status 522 (timeout) as transient. Right now it can mark a type "rejected" in the data check.
  - An invalid access token during getmeas should force a refresh, then set `needs_reconnect`, instead of retrying 5×.
  - Clean up expired `oauth_states`, either in maintenance or with a TTL Timestamp field.
  - Meastype 140 isn't in Withings' reference. Drop it, or remember a rejection so each sync doesn't make two calls.
  - Run each maintenance step on its own, so a reconcile error doesn't skip the backfill resume.
  - Prefer the group's `model` over the current device's when labelling readings.
  - Stop the backfill `groups` counter inflating on retries.
  - Pin `enddate` per backfill run.
  - Re-check `lease_id` when saving tokens.
  - Commit `functions/package-lock.json`.
  - Optional: an owner-uid allow-list on the callables, so we're not relying only on sign-up being closed.
  - Later: window the `body_measures` listener, since a cold open re-reads the whole history.
- **UI polish** (I want this to feel like Withings+/Fitbod)
  - `.card` sets `flex-direction: column`, so on nav cards (Settings→Withings, Body's connect card and the old Locations card) the chevron sits under the text. Fix with `.card.row { flex-direction: row; align-items: center }`.
  - **Charts:**
    - make the "previous period" legend swatch match the grey line;
    - give the training-set bars a scale and stop them overlapping the axis;
    - add y-axis units;
    - add tap/scrub to read a value;
    - use consistent decimals.
  - **Data check:**
    - when the only blocker is webhook proof, say "Waiting for N more weigh-ins", not "1 thing to fix";
    - don't show raw codes like "(permission-denied)";
    - fix the double-boxed saved-report chips.
  - Show the time of day in weight history. I often weigh in more than once a day, and the "earliest counts" rule is invisible without times.
  - Show VO₂max (it's stored but not displayed), and add ESC/NRS/VO₂max to the Body CSV.
- **Docs**
  - `docs/levels.md` title still says v0.3.2. The table and formula are right.
  - In `docs/withings.md` "Your steps":
    - say "rows minus the header";
    - warn that Homebrew may pop up the Xcode Command Line Tools installer;
    - say that `firebase deploy` may ask for `FORGE_APP_URL` (press Enter for the default);
    - add "if the first deploy fails on permissions, wait 2 minutes and run it again";
    - on the screenshot step, add "crop anything you don't want to share".

Once 1–6 are in and tested, I'll merge and deploy.

---

## Re-review of 7967719 (Oct 8): approved to merge. Two more for the follow-up PR

1. **My own deletions count as missing weigh-ins.** The verdict and the weight.csv check exclude every deleted record, including ones I deleted myself or marked "Not me". Withings still returns those, so the verdict shows a permanent false blocker (e.g. "Forge has 1082 of 1084"). Count `deleted_by !== 'withings'` tombstones as present (or show them separately and add them into the comparison), and update the functions test that currently asserts the old behaviour. My earlier note asking for "non-deleted only" caused this; sorry.
2. **"That's me" on a review item with no weight** (an HR-only or PWV-only group) tries to update a `weights/w_*` doc that doesn't exist, and now that failures aren't hidden I'd see "Couldn't save to the cloud: not-found". Only update the weights mirror when the group has a weight.

Put these two first in the follow-up PR off main, then the earlier follow-up list above. One PR against main, not stacked.
