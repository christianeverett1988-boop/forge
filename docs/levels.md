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

Warm-ups earn nothing, and a finished workout with no working sets earns nothing and isn't a training day. A typical session (18 sets, 6 exercises, 1 PR) is about 380 XP; three a week with the weekly bonus is about 1,240 XP a week.

## Levels

XP needed for level *n* is **250 × (n − 1)^1.6** (`xpForLevel` in `js/workouts/awards.js`). At three typical sessions a week (before badges): level 2 with your first workout, level 10 after about 7 weeks, level 20 after about 22 weeks, Unbreakable after about 44 weeks.

| # | Name | XP | # | Name | XP | # | Name | XP |
|---|------|---:|---|------|---:|---|------|---:|
| 1 | Spark | 0 | 11 | Hammer Strike | 9,953 | 21 | Forge Master | 30,171 |
| 2 | Kindling | 250 | 12 | Anvil | 11,592 | 22 | Ironclad | 32,621 |
| 3 | Ember | 758 | 13 | Red Heat | 13,324 | 23 | Titanium | 35,141 |
| 4 | Coal Bed | 1,450 | 14 | White Heat | 15,144 | 24 | Tungsten | 37,732 |
| 5 | Bellows | 2,297 | 15 | Quench | 17,051 | 25 | Meteorite | 40,390 |
| 6 | Raw Ore | 3,283 | 16 | Tempered | 19,041 | 26 | Molten Core | 43,117 |
| 7 | Smelter | 4,395 | 17 | Carbon Steel | 21,112 | 27 | Star Forge | 45,909 |
| 8 | Pig Iron | 5,625 | 18 | Spring Steel | 23,263 | 28 | Supernova | 48,767 |
| 9 | Cast Iron | 6,964 | 19 | Damascus | 25,490 | 29 | Adamant | 51,688 |
| 10 | Wrought Iron | 8,409 | 20 | Blade Smith | 27,794 | 30 | Unbreakable | 54,673 |

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
