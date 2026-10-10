// v0.15.6 fit-and-finish: the Food rules no longer leak into the design system, plus the insight wording.
// Layout can't be measured without a browser, so these pin the CSS and markup rules. Synthetic data only.
import { readFileSync } from 'node:fs';
import { test, eq, assert } from './harness.js';
import { fmtChange } from '../js/health/insights.js';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rules = (css) => [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)].flatMap((m) => m[2].split(',').map((s) => s.trim()));

test('food.css does not redefine global .chips, .chip-btn or .stepper', () => {
  for (const sel of rules(src('css/food.css'))) {
    assert(!/^\.(chips|stepper)(\s|$|\.|:)/.test(sel), `food.css leaks ${sel}`);
    assert(!/^\.chip-btn(\s|$|\.|:)/.test(sel), `food.css leaks ${sel}`);
  }
});

test('Food markup uses its scoped classes; the player keeps .stepper', () => {
  const f = src('js/screens/food.js');
  assert(!f.includes('class="stepper"') && !/class="chips"/.test(f), 'food.js uses .serv-stepper / .meal-chips');
  assert(f.includes('serv-stepper') && f.includes('meal-chips'));
  assert(src('css/player.css').includes('.stepper { display: grid; grid-template-columns: 56px 1fr 56px'));
});

test('one .chip-btn definition: pill radius in app.css only', () => {
  assert(/\.chip-btn \{[^}]*--r-pill/.test(src('css/app.css')));
});

test('chips flow at natural width; wrapped segs and tap targets are 44px', () => {
  const css = src('css/app.css');
  assert(/\.chip \{[^}]*flex: 0 0 auto/.test(css) && css.includes('width: max-content'), 'chip sizes to its text');
  assert(css.includes('.seg.wrap label { flex: 1 0 auto; }'));
  assert(!/\.seg span \{[^}]*min-height: 3\d/.test(css) && !/\.seg\.small span \{[^}]*min-height: 3\d/.test(css), 'segs at least 44px');
  assert(/\.pl-rir \{[^}]*auto repeat\(6, 1fr\)/.test(src('css/player.css')) && /\.pl-rir button \{[^}]*height: 44px/.test(src('css/player.css')));
  assert(/\.rest-ctl \{[^}]*1fr 1\.4fr 1fr/.test(src('css/player.css')));
});

test('tour: Next is focused without a second focus ring', () => {
  assert(src('js/tour/tour.js').includes('focusVisible: false'));
});

test('insight wording: grammar, units and the real change over the window', () => {
  // slopePerWeek is the change in the daily value per week: 630 steps/day more each week = about +2,520/day after 4 weeks.
  eq(fmtChange('steps', 630, 28, 'metric'), '+2,520 steps/day');
  eq(fmtChange('sleep_min', -15, 28, 'metric'), '-60 min/night');
  eq(fmtChange('hrv_sdnn_ms', 1.25, 28, 'metric'), '+5.0 ms');
  const w = fmtChange('weight_kg', -0.28, 28, 'imperial');
  assert(/^-\d\.\d\d lb$/.test(w), w);
  assert(Math.abs(parseFloat(w.slice(1)) - 1.12 * 2.20462) / (1.12 * 2.20462) < 0.05, `weight change within 5%: ${w}`);
  const ins = src('js/health/insights.js');
  assert(ins.includes("'are' : 'is'"), 'plural labels say "are"');
});

test('rings legend: short titles, sets as three rows without separators', () => {
  const r = src('js/workouts/rings.js');
  assert(r.includes("label: 'Calories'") && r.includes("label: 'Protein'") && r.includes('lines: ['));
});

test('Programs badge uses accent tokens only', () => {
  assert(/\.pg-rec \{[^}]*var\(--accent-tint\)/.test(src('css/missions.css')) && !/\.pg-rec \{[^}]*--ember/.test(src('css/missions.css')));
});
