// v0.6.0 visual restyle: tokens are the only place colours live, controls and pull-to-refresh maths.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, eq, assert } from './harness.js';
import { segThumb } from '../js/ui/controls.js';
import { pullState, PULL_THRESHOLD } from '../js/ui/pull.js';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const files = (dir, ext) => readdirSync(new URL(`../${dir}`, import.meta.url)).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`);

test('no hard-coded hex colours in css/ outside tokens.css', () => {
  for (const f of files('css', '.css').filter((x) => !x.endsWith('tokens.css'))) {
    const hits = read(f).match(/#[0-9a-fA-F]{3,8}\b/g);
    assert(!hits, `${f} has ${hits && hits.join(', ')}; use a token from css/tokens.css`);
  }
});

test('no hard-coded hex colours in js/screens (colours come from tokens)', () => {
  const ALLOW = new Set([]); // the share card canvas lives in js/ui/sharecard.js, not a screen
  for (const f of files('js/screens', '.js')) {
    if (ALLOW.has(f)) continue;
    const src = read(f).replace(/href="#[^"]*"|`#\/|'#\/|"#\/|#main/g, '');
    const hits = src.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g);
    assert(!hits, `${f} has ${hits && hits.join(', ')}`);
  }
});

test('tokens: dark and light define the same colour names, one --ember, 8pt spacing, radii', () => {
  const css = read('css/tokens.css');
  const light = css.slice(css.indexOf('prefers-color-scheme: light'), css.indexOf('Old names kept'));
  for (const name of ['--bg', '--surface-1', '--surface-2', '--surface-3', '--separator', '--text-1', '--text-2', '--text-3', '--accent', '--accent-gradient', '--good', '--warn', '--danger', '--ember', '--gold']) {
    assert(css.includes(`${name}:`), `${name} missing`);
    assert(light.includes(`${name}:`), `${name} missing in light mode`);
  }
  eq((css.match(/--ember:/g) || []).length, 2, 'one dark and one light value, defined only here');
  for (const f of files('css', '.css').filter((x) => !x.endsWith('tokens.css'))) assert(!/--ember\s*:/.test(read(f)), `${f} redefines --ember`);
  const want = [['--s-1', 4], ['--s-2', 8], ['--s-3', 12], ['--s-4', 16], ['--s-5', 24], ['--s-6', 32], ['--s-7', 48], ['--r-sm', 10], ['--r-md', 14], ['--r-lg', 20], ['--r-xl', 24]];
  for (const [n, v] of want) assert(css.includes(`${n}: ${v}px`), `${n} should be ${v}px`);
  assert(css.includes('--r-pill: 999px'));
  assert(read('index.html').includes('color-scheme" content="dark light"'));
});

test('segmented thumb: position and width follow the chosen segment', () => {
  eq(JSON.stringify(segThumb(0, 2)), JSON.stringify({ x: 0, w: 50, i: 0, n: 2 }));
  eq(JSON.stringify(segThumb(2, 3)), JSON.stringify({ x: (2 * 100) / 3, w: 100 / 3, i: 2, n: 3 }));
  eq(segThumb(9, 3).i, 2, 'clamped to the last segment');
  eq(segThumb(-1, 3).i, 0, 'clamped to the first');
  eq(segThumb(0, 0).n, 1, 'never divides by zero');
});

test('swipe-back parallax: parent starts 30% left and settles at 0 as the screen leaves', async () => {
  const { parallaxOffset } = await import('../js/ui/gesture.js');
  eq(parallaxOffset(0, 390), -30);
  eq(parallaxOffset(390, 390), 0);
  eq(parallaxOffset(195, 390), -15);
  eq(parallaxOffset(9999, 390), 0, 'clamped');
  eq(parallaxOffset(10, 0), 0, 'no width, no movement');
});

test('pull to refresh: resistance, threshold and cap', () => {
  eq(pullState(-20).offset, 0);
  eq(pullState(0).ready, false);
  assert(pullState(40).offset === 20 && !pullState(40).ready);
  assert(pullState(PULL_THRESHOLD * 2).ready, 'a long pull arms the refresh');
  assert(!pullState(PULL_THRESHOLD * 2 - 4).ready);
  eq(pullState(10000).offset, 110, 'capped');
  eq(pullState(10000).progress, 1);
});

test('pull sync cooldown: one Withings sync per pull window, spinner wait is capped', async () => {
  const { canPullSync, waitAtMost, PULL_SYNC_COOLDOWN_MS, PULL_WAIT_MS } = await import('../js/ui/pull.js');
  assert(canPullSync(1000, 0), 'first pull syncs');
  assert(!canPullSync(1000 + 30000, 1000), 'a second pull 30 s later does not');
  assert(!canPullSync(1000 + PULL_SYNC_COOLDOWN_MS - 1, 1000));
  assert(canPullSync(1000 + PULL_SYNC_COOLDOWN_MS, 1000), 'after the cooldown it may');
  assert(canPullSync(500, 1000), 'a clock that went backwards does not lock it out');
  assert(PULL_WAIT_MS <= 10000);
  eq(await waitAtMost(Promise.resolve('ok'), 50), 'ok');
  eq(await waitAtMost(new Promise(() => {}), 10), 'timeout');
});

test('metric weight falls back to hand-logged weigh-ins; empty state leads with Log weight', async () => {
  const { metricPoints, metricEmptyChoice } = await import('../js/withings/body.js');
  const weights = [
    { id: 'a', kg: 90, day: '2026-01-02', measured_at: '2026-01-02T08:00:00.000Z' },
    { id: 'b', kg: 91, day: '2026-01-01', measured_at: '2026-01-01T08:00:00.000Z' },
    { id: 'c', kg: 70, day: '2026-01-03', deleted: true },
    { id: 'd', kg: 50, day: '2026-01-04', review: true },
  ];
  const pts = metricPoints([], 'weight_kg', { weights });
  eq(pts.map((p) => p.v).join(), '91,90');
  eq(metricPoints([], 'fat_ratio_pct', { weights }).length, 0, 'only weight falls back');
  const scale = [{ day: '2026-02-01', measured_at: '2026-02-01T07:00:00.000Z', metrics: { weight_kg: 80 } }];
  eq(metricPoints(scale, 'weight_kg', { weights }).map((p) => p.v).join(), '80', 'scale readings win');
  eq(metricEmptyChoice('weight_kg', false).primary.label, 'Log weight');
  eq(metricEmptyChoice('weight_kg', false).secondary.label, 'Connect Withings');
  eq(metricEmptyChoice('fat_ratio_pct', false).primary.label, 'Connect Withings');
  eq(metricEmptyChoice('fat_ratio_pct', true).primary.label, 'Open data check');
});

test('no emoji or text glyphs used as icons in js/screens (SVG icons from js/ui/icons.js instead)', () => {
  const GLYPH = /\p{Extended_Pictographic}|[☰❚✕›‹★☆⇄⏱✓✗▶⤴⋯]/u;
  const ALLOW = new Set([]); // the share card canvas is js/ui/sharecard.js and may keep emoji
  for (const f of files('js/screens', '.js')) {
    if (ALLOW.has(f)) continue;
    read(f).split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments are not UI
      assert(!GLYPH.test(line), `${f}:${i + 1} has an emoji or glyph used as an icon`);
    });
  }
});

test('icons: every name renders decorative currentColor SVG; unknown names render nothing', async () => {
  const { icon, ICON_NAMES, emptyState } = await import('../js/ui/icons.js');
  for (const n of ICON_NAMES) {
    const svg = icon(n);
    assert(svg.includes('aria-hidden="true"') && svg.includes('currentColor') && svg.includes('viewBox="0 0 24 24"'), n);
  }
  eq(icon('nope'), '');
  assert(icon('trophy', { filled: true }).includes('fill="currentColor"'));
  const es = emptyState({ icon: 'chart', title: 'No workouts yet', text: 'Finish one and it shows up here.', action: { href: '#/train', label: 'Start a workout' } });
  assert(es.includes('<h3>No workouts yet</h3>') && es.includes('href="#/train"') && es.includes('es-icon'));
});

test('every js/**/*.js module parses (catches duplicate imports no other test would load)', () => {
  const walk = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : d.name.endsWith('.js') ? [`${dir}/${d.name}`] : []));
  for (const f of walk('js')) {
    try {
      execFileSync(process.execPath, ['--check', fileURLToPath(new URL(`../${f}`, import.meta.url))], { stdio: 'pipe' });
    } catch (e) {
      assert(false, `${f} fails to parse: ${String(e.stderr || e.message).split('\n').slice(0, 4).join(' ')}`);
    }
  }
});

test('v0.10.1: Trends shows the smoothed weight trend, the same number as the Weight tab', async () => {
  const { trendRowValue } = await import('../js/health/trends.js');
  const { smooth, dailyWeights } = await import('../js/weight/smoothing.js');
  const weights = smooth(dailyWeights([
    { day: '2026-10-01', kg: 95, source: 'manual', measured_at: '2026-10-01T08:00:00.000Z' },
    { day: '2026-10-02', kg: 94, source: 'manual', measured_at: '2026-10-02T08:00:00.000Z' },
    { day: '2026-10-03', kg: 92, source: 'manual', measured_at: '2026-10-03T08:00:00.000Z' },
  ]));
  const last = weights[weights.length - 1];
  const t = { key: 'weight_kg', last: { v: last.kg } };
  eq(trendRowValue(t, weights), last.trend);
  assert(last.trend !== last.kg, 'fixture must differ between raw and trend');
  eq(trendRowValue({ key: 'fat_ratio_pct', last: { v: 20 } }, weights), 20, 'other metrics keep their last reading');
  eq(trendRowValue(t, []), last.kg, 'no weight series: fall back to the last reading');
});
