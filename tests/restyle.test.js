// v0.6.0 visual restyle: tokens are the only place colours live, controls and pull-to-refresh maths.
import { readFileSync, readdirSync } from 'node:fs';
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

test('pull to refresh: resistance, threshold and cap', () => {
  eq(pullState(-20).offset, 0);
  eq(pullState(0).ready, false);
  assert(pullState(40).offset === 20 && !pullState(40).ready);
  assert(pullState(PULL_THRESHOLD * 2).ready, 'a long pull arms the refresh');
  assert(!pullState(PULL_THRESHOLD * 2 - 4).ready);
  eq(pullState(10000).offset, 110, 'capped');
  eq(pullState(10000).progress, 1);
});
