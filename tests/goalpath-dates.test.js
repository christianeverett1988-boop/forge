// v0.14.2: the goal-path date range shows the year on both dates whenever either one is outside this year, and a goal
// more than 12 months away says so. Covers the Body card (js/health/cards.js) and the coach answer (js/coach/answers.js).
// Synthetic dates only.
import { test, assert } from './harness.js';
import { goalPathHtml } from '../js/health/cards.js';
import { goalAnswer } from '../js/coach/answers.js';

const TODAY = '2026-10-09';
const ok = (etaDay, earlyDay, lateDay) => ({ status: 'ok', etaDay, earlyDay, lateDay, slopePerWeek: -0.3, capKgPerWeek: 0.9, overCap: false, current: 90, remaining: -20, weeks: 60 });
const card = (path) => goalPathHtml(path, null, { series: [], today: TODAY, goalKg: null, units: 'metric' });
const rangeOf = (html) => /Likely between ([^<]*)\./.exec(html)?.[1] ?? '';
const answer = (path) => goalAnswer({ goalPath: path, units: 'metric', goalKg: 70 }, TODAY);
const MORE_THAN_A_YEAR = 'That\'s more than a year at your current pace.';

// The exact words depend on the device's locale; these checks only need the year to be present on each date.
const years = (s) => s.match(/\b20\d\d\b/g) || [];

test('goal path card: a goal more than a year away shows the year on both dates of the range', () => {
  const html = card(ok('2028-02-11', '2027-10-12', '2028-10-09'));
  const range = rangeOf(html);
  assert(range.includes('2027') && range.includes('2028'), `range was "${range}"`);
  assert(years(range).length === 2, `a year on each date: "${range}"`);
  assert(html.includes('Around') && html.includes('2028'), 'the middle estimate keeps its year');
  assert(html.includes(MORE_THAN_A_YEAR), 'says it is more than a year');
});

test('goal path card: the year shows on both dates when only the late one is next year', () => {
  const range = rangeOf(card(ok('2026-12-20', '2026-11-25', '2027-01-15')));
  assert(years(range).length === 2 && range.includes('2026') && range.includes('2027'), range);
});

test('goal path card: the year shows on both dates when only the early one is outside this year', () => {
  const range = rangeOf(card(ok('2026-12-20', '2025-12-30', '2026-12-31')));
  assert(years(range).length === 2, range);
});

test('goal path card: a range inside this year has no years, and no "more than a year" line', () => {
  const html = card(ok('2026-12-01', '2026-11-02', '2026-12-20'));
  assert(years(rangeOf(html)).length === 0, `no year inside this year: "${rangeOf(html)}"`);
  assert(!html.includes(MORE_THAN_A_YEAR), 'not more than a year');
});

test('goal path card: "more than a year" turns on after 12 months, not at exactly 12', () => {
  assert(!card(ok('2027-10-09', '2027-09-01', '2027-11-01')).includes(MORE_THAN_A_YEAR), 'exactly a year (365 days) is not more than a year');
  assert(card(ok('2027-10-10', '2027-09-01', '2027-11-01')).includes(MORE_THAN_A_YEAR), 'a day over is');
});

test('goal path card: "or later" has the year on the early date when it is not this year', () => {
  const html = card(ok('2028-03-01', '2027-06-01', null));
  assert(years(rangeOf(html)).length === 1 && html.includes('the pace is still settling'), rangeOf(html));
  const same = card(ok('2026-12-01', '2026-11-02', null));
  assert(years(rangeOf(same)).length === 0, rangeOf(same));
});

test('coach goal answer: the same range rule — years on both dates when either is outside this year', () => {
  const a = answer(ok('2028-02-11', '2027-10-12', '2028-10-09'));
  const line = a.lines.find((l) => l.startsWith('Likely between'));
  assert(line && years(line).length === 2 && line.includes('2027') && line.includes('2028'), line);
  assert(years(a.headline).length === 1 && a.headline.includes('2028'), a.headline);
  const nye = answer(ok('2026-12-20', '2026-11-25', '2027-01-15')).lines.find((l) => l.startsWith('Likely between'));
  assert(years(nye).length === 2, nye);
});

test('coach goal answer: a range inside this year has no years; "or later" still works', () => {
  const same = answer(ok('2026-12-01', '2026-11-02', '2026-12-20')).lines.find((l) => l.startsWith('Likely between'));
  assert(years(same).length === 0, same);
  const open = answer(ok('2028-03-01', '2027-06-01', null)).lines.find((l) => l.startsWith('Could be as early as'));
  assert(open && years(open).length === 1, open);
});
