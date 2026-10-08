import { test, eq } from './harness.js';
import { csvCell, toCSV } from '../js/csv.js';

test('CSV: formulas are neutralised', () => {
  eq(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  eq(csvCell('+1+2'), "'+1+2");
  eq(csvCell('@SUM(A1)'), "'@SUM(A1)");
  eq(csvCell('-cmd'), "'-cmd");
});

test('CSV: numbers, negatives and plain text untouched', () => {
  eq(csvCell(-2.5), '-2.5');
  eq(csvCell('-3'), '-3');
  eq(csvCell(135), '135');
  eq(csvCell('Bench press'), 'Bench press');
  eq(csvCell(null), '');
});

test('CSV: quoting and rows', () => {
  eq(csvCell('a,b'), '"a,b"');
  eq(toCSV([{ a: 1, b: 'x' }], ['a', 'b']), 'a,b\n1,x');
});
