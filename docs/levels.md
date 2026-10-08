# Forge levels (v0.3.2)

30 unique names, no metal tiers repeated. They follow the forge from first spark to finished, unbreakable metal.

## How XP works

| You do | XP |
|---|---|
| A working set | +10, up to 40 sets a workout (+400) |
| An exercise with 2 or more working sets | +25 |
| A PR | +50, up to +200 a workout |
| The workout that hits your planned days for the week | +100 (once a week; logged cardio days count toward the goal) |
| A badge | +100 |

Warm-ups earn nothing, and a finished workout with no working sets earns nothing and isn't a training day. A typical early session (18 sets, 6 exercises, 1 PR) is about 380 XP; three a week with the weekly bonus is about 1,240 XP a week. Records come less often after the first months (about one every three sessions), so later sessions are closer to 345 XP and the levels below take a little longer than stated (top level in roughly 2¼ years rather than 2). If cardio completes your week after your last workout (lift Mon/Wed, run Fri), that last workout gets the +100.

## Levels

XP needed for level *n* is **250 × (n − 1)^1.6 + 3 × (n − 1)³** (`xpForLevel` in `js/workouts/awards.js`). The first part keeps early levels quick; the cubic part slows the top. At three typical sessions a week (about 1,240 XP with the weekly bonus, before badges): level 2 with your first workout, level 5 in about 2 weeks, level 10 in about 8½ weeks, level 20 in about 39 weeks, Unbreakable in about **2 years** (103 weeks).

| # | Name | XP | # | Name | XP | # | Name | XP |
|---|------|---:|---|------|---:|---|------|---:|
| 1 | Spark | 0 | 11 | Hammer Strike | 12,953 | 21 | Forge Master | 54,171 |
| 2 | Kindling | 253 | 12 | Anvil | 15,585 | 22 | Ironclad | 60,404 |
| 3 | Ember | 782 | 13 | Red Heat | 18,508 | 23 | Titanium | 67,085 |
| 4 | Coal Bed | 1,531 | 14 | White Heat | 21,735 | 24 | Tungsten | 74,233 |
| 5 | Bellows | 2,489 | 15 | Quench | 25,283 | 25 | Meteorite | 81,862 |
| 6 | Raw Ore | 3,658 | 16 | Tempered | 29,166 | 26 | Molten Core | 89,992 |
| 7 | Smelter | 5,043 | 17 | Carbon Steel | 33,400 | 27 | Star Forge | 98,637 |
| 8 | Pig Iron | 6,654 | 18 | Spring Steel | 38,002 | 28 | Supernova | 107,816 |
| 9 | Cast Iron | 8,500 | 19 | Damascus | 42,986 | 29 | Adamant | 117,544 |
| 10 | Wrought Iron | 10,596 | 20 | Blade Smith | 48,371 | 30 | Unbreakable | 127,840 |

Arc: **fire** (1–5) → **ore and iron** (6–10) → **working the metal** (11–16) → **steel** (17–21) → **beyond steel** (22–26) → **legend** (27–30).

## Badges

22 badges, each its own SVG medal (`js/ui/badges.js`): the metal is the tier (Ember, Steel, Gold, White heat) and the shape is the family (hexagon: workouts, shield: records, medallion: tonnage, flame: streaks, diamond: everything else).

Once earned, a badge is saved in `settings/main.awards_seen` (`{ badge id: date }`) and never disappears, even if a later change would no longer unlock it (for example 3 → 4 planned days). On the first run after updating, the badges you already have are saved quietly, with no celebrations.

| Badge | How | Tier |
|---|---|---|
| First Spark | Finish your first workout | Ember |
| Ten Strikes · Fifty Heats · Centurion · Forged in Fire | 10 / 50 / 100 / 250 workouts | Ember · Steel · Gold · White heat |
| New Metal · Record Breaker · Hall of Records | 1 / 10 / 50 PRs | Ember · Steel · Gold |
| Triple Strike | 3 PRs in one workout | Steel |
| Ten Tons · Hundred Tons · Mountain Mover | 10 / 100 / 1,000 tonnes lifted | Ember · Gold · White heat |
| Heavy Day | 10 tonnes in one workout | Steel |
| Hot Streak · Heat Treated · Half-Year Forge | Planned days 4 / 12 / 26 weeks running | Ember · Steel · Gold |
| Full House | In one week, 4+ working sets for every major group (chest, back, shoulders, arms, quads, hamstrings, glutes, core) | Steel |
| Recovery Respect | Finish a workout in a deload week | Ember |
| Comeback | Train again after 3+ weeks away | Ember |
| Dawn Patrol · Night Shift | 5 workouts started before 7 am / after 8 pm | Ember · Steel |
| Into the Forge | Reach level 11 (Hammer Strike) | Gold |
