# v0.3.2 follow-ups for Claude

I merged #5, #6 and #7, but because they were stacked, only #5 reached main. #6 went into fix/v0.3.2 and #7 into feat/preview-parity. Production is still 0.3.1.1. My reviewer re-checked the v0.3.2 code (feat/preview-parity merged onto main, simulated locally). The merge is clean, unit tests pass 143/143, rules tests pass 13/13, config.js/rules/CSP are unchanged and the SW shell is complete. The XP plan, the zero-set exclusion, awards_seen persistence, the 22 badges, the share wrap and every #6 follow-up/nice-to-have all check out. Please don't touch config.js.

## 1. Land it (first)
Your PR #8 does exactly this, and its code matches what was reviewed. I'm merging it. Do the fixes below on a new branch off main after #8 lands, as their own PR, and keep them separate from the Withings work. Please don't stack PRs again.

## 2. Small fixes
- **Weekly goal XP lost with cardio** (js/workouts/awards.js:202-213). If cardio completes the week's goal (e.g. lift Mon/Wed, run Fri), no workout gets the +100, even though docs/levels.md says cardio counts toward the goal. Give the +100 to the first workout finished in a week where the goal is met (or the next one), and add a test.
- **Share card orphan unit** (js/ui/sharecard.js:102). "→ 212" is glued but "lb" wraps onto its own line. Also glue the final number+unit (e.g. a no-break space before `lb|kg|reps|s`).
- **Escape the badge aria-label** (js/ui/badges.js:108). Today the names are static, but `label` goes in raw. Run it through `esc()`.
- **Rules test for badge persistence** (tests/rules/rules.test.js). Add a test for an `updateDoc` of settings/main with an `awards_seen` map that keeps the standard fields, so a future rules change can't silently stop badges saving.

## 3. Optional
- **Comeback** (awards.js:234): count logged cardio as activity, so three weeks of running followed by a lift isn't a "comeback".
- **Share card space**: with 4+ PRs only 2 fit before "+N more". Single-line names plus a slightly smaller font would fit 3.
- **docs/levels.md:15-19**: "typical session … 1 PR" is optimistic after the first months. With about 0.3 PR a session, top level takes ~50 weeks, not 44. Either reword the doc or leave the pace as it is (I'm happy with the pace).
