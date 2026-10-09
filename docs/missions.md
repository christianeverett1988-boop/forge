# Daily missions (v0.12.0)

Small real actions, judged each local day from data Forge already has. They feed XP and the level. Nothing new is
stored except a few values in `settings/main`. Code: `js/missions/` (`core.js` and `badges.js` are pure; `store.js`
reads state; `ui.js` draws the cards). Tests: `tests/missions.test.js`.

## The missions

Up to **4 a day**, in this order of priority. Each is done or not.

| Mission | Done when | Hidden when |
|---|---|---|
| **Weigh in** | Any weight or body measurement today that isn't deleted or waiting in "Is this you?". A Withings weigh-in completes it by itself. | never |
| **Train or move** | A finished workout today, **or** one cardio session of 20 min or more. On a rest day the row reads "Rest day: a 20-min walk counts". | never |
| **Protein hit** | Protein logged today reaches your protein target. | there are no food logs (`state.food_logs` empty or missing) |
| **Steps** | Today's `health_daily.steps` reaches the target (default 8,000; Settings → Missions). Until today's row syncs it stays unchecked and says "Updates when Apple Health syncs". | no Apple Health days at all |
| **In bed on time** | Last night's `sleep.in_bed_start` is at or before your bedtime (default 23:00; Settings → Missions). After midnight counts as late. | no Apple Health days, or no sleep start time in the day's data (never guessed) |

Notes
- **Rest day** means your planned training days for the week are already done and nothing is logged yet today.
  There is no fixed weekly schedule in Forge, so this is the closest honest reading of "rest day from the plan".
- **Day boundaries** are the phone's local day (`YYYY-MM-DD`), the same as the rest of the app.
- **Cap of 4:** with food logging on, all five could apply. Protein ranks above Steps and Bed, so **In bed on time** drops out of the list on those days.
- **Protein** ships hidden: the slot turns on by itself when `state.food_logs` has data, whichever order the food
  work and this merge in. Food logs are read as `{ day, protein_g }`; the target is `currentTargets().proteinG`.
- Missions are judged with today's targets, including for past days.

## XP

- **+20 per mission** done, **+30 bonus** when every mission of the day is done (so four of four is +110).
- Counted only from `missions_started`, the local day missions first ran (saved once, in `settings/main`). Days before it earn nothing, so upgrading never hands out a pile of retroactive XP.
- `awardsFor(..., { bonusXP })` adds it to the total, so it counts toward the level. The text is in `XP_RULES`.
- Mission badges earn the usual +100 XP only when they are earned on or after `missions_started`.

## Badges

Same rules as the other badges: derived from history, kept in `settings/main.awards_seen` once seen, and the first sync
seeds what you already have without any celebration.

- **Weigh-in streaks:** 7, 30 and 100 days in a row (a weigh-in on each local day; a missed day starts the count over).
- **Body-comp milestones** (need `body_measures`): body fat down **1, 2 and 5 points** (percentage points, not percent of body fat) and **lean mass +1 kg**.
  The baseline is the average of your first 14 days of readings. A badge is earned on the first day the 7-day average is that far from the baseline, and only after the baseline window is over.

## Stored state (`settings/main`)

| Field | Meaning |
|---|---|
| `missions_started` | `YYYY-MM-DD`, first day missions counted |
| `mission_steps` | step target (2,000 to 30,000, steps of 500) |
| `mission_bed` | bedtime target, `HH:MM` |
| `missions_seen` | `{ day: [mission ids] }` for the last 14 days, so a check springs once when it completes |

## Screens

- **Today:** "Today's missions" under the workout card. When all are done it collapses to one line ("All missions done, +110 XP").
- **Awards:** a "Daily missions" card with the last seven days as dots.
- **Settings → Missions:** steps stepper and bedtime.
- The check springs when a mission completes; with reduced motion it fades instead.
