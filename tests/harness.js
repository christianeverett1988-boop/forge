// Tiny test harness that works in Node and in the browser.
export const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function eq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function near(actual, expected, tol, msg = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${msg} expected ${expected} ± ${tol}, got ${actual}`);
}

export async function runAll(log = console.log) {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
      log(`  ✓ ${t.name}`);
    } catch (e) {
      fail++;
      log(`  ✗ ${t.name}\n      ${e.message}`);
    }
  }
  log(`\n${pass} passed, ${fail} failed`);
  return { pass, fail };
}
