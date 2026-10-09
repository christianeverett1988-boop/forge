// v0.5.2 app shell: route depth / transition kind, per-tab scroll memory, sheet drag maths, swipe-back,
// count-up formatting, and a CSS guard so form fields can't drop below 16px (iOS zooms into smaller ones).
import { readFileSync, readdirSync } from 'node:fs';
import { test, eq, assert } from './harness.js';
import { routeDepth, transitionKind, backTarget, backLabel, tabOf, createScrollMemory } from '../js/nav.js';
import { shouldDismiss, rubberBand, dragProgress, velocityOf, shouldPop, scrimOpacity } from '../js/ui/gesture.js';
import { parseCountText, formatCount } from '../js/ui/motion.js';

const p = (hash) => hash.replace(/^#\/?/, '').split('/');

test('route depth: tab roots are 0, detail screens 1, deeper screens 2', () => {
  for (const r of ['today', 'train', 'body', 'weight', 'score', 'trends', 'weekly', 'settings', 'progress']) eq(routeDepth([r]), 0, r);
  for (const r of ['session', 'library', 'timer', 'locations', 'withings', 'apple', 'metric', 'profile', 'history', 'awards']) eq(routeDepth([r]), 1, r);
  eq(routeDepth(p('#/play')), 2);
  eq(routeDepth(p('#/summary/abc')), 2);
  eq(routeDepth(p('#/withings/check')), 2, 'Data check sits on Withings');
  eq(routeDepth([]), 0, 'empty hash is Today');
});

test('transition kind: deeper = push, shallower = pop, tab to tab = crossfade', () => {
  eq(transitionKind(p('#/settings'), p('#/locations')), 'push');
  eq(transitionKind(p('#/locations'), p('#/settings')), 'pop');
  eq(transitionKind(p('#/train'), p('#/session')), 'push');
  eq(transitionKind(p('#/session'), p('#/play')), 'push');
  eq(transitionKind(p('#/play'), p('#/summary/x')), 'fade', 'same depth between detail screens');
  eq(transitionKind(p('#/summary/x'), p('#/today')), 'pop');
  eq(transitionKind(p('#/today'), p('#/settings')), 'tab');
  eq(transitionKind(p('#/settings'), p('#/today')), 'tab');
  eq(transitionKind(p('#/weight'), p('#/trends')), 'tab', 'Progress siblings crossfade');
  eq(transitionKind(p('#/weight'), p('#/history')), 'push', 'History is a row under Weight');
  eq(transitionKind(p('#/withings'), p('#/withings/check')), 'push');
  eq(transitionKind(p('#/withings/check'), p('#/withings')), 'pop');
});

test('back target: roots have none; detail screens go to their parent', () => {
  eq(backTarget(p('#/today')), null);
  eq(backTarget(p('#/weight')), null);
  eq(backTarget(p('#/locations')), '#/settings');
  eq(backTarget(p('#/withings')), '#/settings');
  eq(backTarget(p('#/withings/check')), '#/withings');
  eq(backTarget(p('#/library')), '#/train');
  eq(backTarget(p('#/timer')), '#/train');
  eq(backTarget(p('#/metric/weight_kg')), '#/body');
  eq(tabOf('metric'), 'body');
  eq(tabOf('awards'), 'weight');
  eq(tabOf('trends'), 'weight');
  eq(tabOf('weekly'), 'weight');
  eq(backTarget(p('#/history')), '#/weight');
  eq(backLabel(p('#/awards')), 'Progress');
  eq(backTarget(p('#/trends')), null);
  eq(backTarget(p('#/weekly')), null);
});

test('scroll memory: each tab root keeps its own position; detail screens always start at the top', () => {
  const m = createScrollMemory();
  m.save('today', 420);
  m.save('train', 90.4);
  m.save('locations', 300); // detail screen: never remembered
  eq(m.restore('today'), 420);
  eq(m.restore('train'), 90);
  eq(m.restore('body'), 0, 'never visited');
  eq(m.restore('locations'), 0);
  m.save('today', 10);
  eq(m.restore('today'), 10, 'latest wins');
  m.save('today', -50);
  eq(m.restore('today'), 0, 'never negative');
  m.forget('train');
  eq(m.restore('train'), 0, 'tapping the active tab clears it');
});

test('sheet release: a long drag or a quick flick down closes; a short drag or a flick up stays', () => {
  const size = 400;
  eq(shouldDismiss({ offset: 200, velocity: 0, size }), true, 'past 35%');
  eq(shouldDismiss({ offset: 100, velocity: 0.1, size }), false, 'short, slow');
  eq(shouldDismiss({ offset: 40, velocity: 0.9, size }), true, 'quick flick down');
  eq(shouldDismiss({ offset: 300, velocity: -0.9, size }), false, 'flick up wins');
  eq(shouldDismiss({ offset: 0, velocity: 0.9, size }), false, 'a tap is not a flick');
  eq(shouldDismiss({ offset: -30, velocity: 0, size }), false, 'pulled past the top');
});

test('sheet drag maths: rubber band, backdrop progress, velocity', () => {
  eq(rubberBand(50), 50, 'down is 1:1');
  assert(rubberBand(-40) < 0 && rubberBand(-40) > -40, 'up is damped');
  assert(rubberBand(-1000) > -80, 'never past the limit');
  eq(dragProgress(100, 400), 0.25);
  eq(dragProgress(-5, 400), 0);
  eq(dragProgress(999, 400), 1);
  eq(velocityOf([{ t: 0, v: 0 }]), 0);
  eq(velocityOf([{ t: 0, v: 0 }, { t: 100, v: 50 }]), 0.5);
  // only the last 100ms count: the slow start is ignored
  eq(velocityOf([{ t: 0, v: 0 }, { t: 400, v: 10 }, { t: 450, v: 40 }, { t: 500, v: 90 }]), 0.8);
});

test('edge swipe-back: past 40% of the width or a quick flick right pops', () => {
  eq(shouldPop({ dx: 200, velocity: 0, width: 390 }), true);
  eq(shouldPop({ dx: 100, velocity: 0.1, width: 390 }), false);
  eq(shouldPop({ dx: 60, velocity: 0.8, width: 390 }), true);
  eq(shouldPop({ dx: -50, velocity: 0.9, width: 390 }), false, 'leftwards never pops');
});

test('swipe-back scrim: full dim at the edge, lighter as you drag, gone at the far side', () => {
  eq(scrimOpacity(0, 390), 0.5);
  eq(scrimOpacity(195, 390), 0.25);
  eq(scrimOpacity(390, 390), 0);
  eq(scrimOpacity(-40, 390), 0.5, 'dragging left clamps');
  eq(scrimOpacity(900, 390), 0, 'overshoot clamps');
  eq(scrimOpacity(10, 0), 0.5, 'no width yet');
});

test('backLabel names the parent screen like iOS', () => {
  eq(backLabel(p('#/locations')), 'Settings');
  eq(backLabel(p('#/withings')), 'Settings');
  eq(backLabel(p('#/withings/check')), 'Withings');
  eq(backLabel(p('#/timer')), 'Train');
  eq(backLabel(p('#/library')), 'Train');
  eq(backLabel(p('#/metric/weight')), 'Body');
  eq(backLabel(p('#/apple')), 'Settings');
  eq(backLabel(p('#/today')), null);
});

test('count-up formatting keeps decimals, grouping, prefix and unit', () => {
  const fmt = (text, v) => formatCount(parseCountText(text), v);
  eq(fmt('182.4 lb', 0), '0.0 lb');
  eq(fmt('182.4 lb', 91.2), '91.2 lb');
  eq(fmt('+1.2', 0.6), '+0.6');
  eq(fmt('-0.50', 0.25), '-0.25');
  eq(fmt('2,150', 1075.4), '1,075');
  eq(fmt('2,150', 2150), '2,150');
  eq(fmt('3 of 14 days', 1), '1 of 14 days');
  eq(fmt('84', 83.6), '84');
  eq(parseCountText('—'), null);
  eq(parseCountText(''), null, 'empty text has no number');
  eq(parseCountText('2,150').value, 2150);
  eq(parseCountText('182.4 lb').decimals, 1);
});

// ---- CSS guard: inputs must stay >= 16px or iOS Safari zooms the page when one is focused ----
test('every input / select / textarea font size in the CSS is at least 16px', () => {
  const dir = new URL('../css/', import.meta.url);
  let checked = 0;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
    const css = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const hits = sel.split(',').some((s) => /(^|[\s>+~])(input|select|textarea)(\[[^\]]*\]|:[\w-]+(\([^)]*\))?|\.[\w-]+)*\s*$/.test(s.trim()));
      if (!hits) continue;
      const m = body.match(/font-size:\s*([\d.]+)px/) || body.match(/(?:^|[;\s])font:\s*(?:[\w-]+\s+)*([\d.]+)px/);
      if (!m) continue;
      checked++;
      assert(parseFloat(m[1]) >= 16, `${f}: "${sel.trim()}" uses ${m[1]}px`);
    }
  }
  assert(checked >= 1, 'found no input font sizes to check');
});

test('CSS: a global [hidden] rule beats class rules that set display', () => {
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(/(^|\n)\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css), 'css/app.css needs [hidden] { display: none !important }');
});

test('shell: no spinner, no floating sync pill, manifest has id and a maskable icon', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert(!/class="loading"/.test(html), 'spinner markup left in index.html');
  assert(!/class="topbar"/.test(html), 'floating sync pill container left in index.html');
  assert(/media="\(prefers-color-scheme: dark\)"/.test(html) && /media="\(prefers-color-scheme: light\)"/.test(html), 'theme-color variants');
  const mf = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  eq(mf.id, './');
  assert(mf.icons.some((i) => i.purpose === 'maskable'), 'maskable icon');
  eq(mf.theme_color, mf.background_color);
});
