// Run all unit tests:   node tests/run.js
import { readFileSync } from 'node:fs';
import { test, eq, runAll } from './harness.js';
import './units.test.js';
import './targets.test.js';
import './smoothing.test.js';
import './workouts.test.js';
import './csv.test.js';
import './session.test.js';
import './figure.test.js';
import { VERSION } from '../js/version.js';

test('sw.js VERSION matches js/version.js', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const m = sw.match(/const VERSION = '([^']+)'/);
  eq(m && m[1], VERSION);
});

const { fail } = await runAll();
process.exit(fail ? 1 : 0);
