// v0.15.4: the doctor summary PDF for the iPhone app, drawn from the structured summary. Synthetic data only.
import { test, eq, assert } from './harness.js';
import { summaryPdf, pdfSafe } from '../js/health/pdf.js';

const day = (i) => new Date(Date.UTC(2025, 9, 11 + i)).toISOString().slice(0, 10);
const fullSummary = (n = 365) => ({
  range: n, from: day(0), to: day(n - 1), sources: { withings: true, apple: true },
  header: { age: 41, sex: 'male', heightCm: 183 },
  weight: { weighIns: n, startKg: 92.1, endKg: 89.5, changeKg: -2.6, perWeekKg: -0.2, spanDays: n - 1, fatPct: 18.2, fatFreeKg: 73.1, visceral: 7, ffmi: 21.8, ffmiBand: { label: 'Average' }, points: Array.from({ length: n }, (_, i) => ({ day: day(i), v: 92 - i * 0.007 })) },
  heart: { rhr: { avg: 58, direction: 'flat' }, hrv: { avg: 43, usual: { now: 43, usual: 43 } }, vo2max: { latest: 44.2, band: 'Good' }, walkingHr: { avg: 96 }, spo2: { avg: 97.2 } },
  sleep: { nights: 90, avgMin: 440, shortNights: 0, shortPct: 0, bedtime: { avgMin: 1400, spreadMin: 20 } },
  activity: { steps: 8532, activeKcal: 540, exerciseMin: 32, workoutsPerWeek: 3.2, sessions: 160, cardioMinPerWeek: 75 },
  score: { avg: 72, weeks: 52, pillars: [{ label: 'Recovery', avg: 70 }, { label: 'Training', avg: 75 }, { label: 'Nutrition', avg: 68 }] },
  notes: ['Resting heart rate was 6 bpm above usual for 5 days in March.', 'Sleep averaged under 6 h in two weeks of June.'],
});
const pageCount = (t) => Number(/\/Count (\d+)/.exec(t)[1]);
const make = (s) => summaryPdf(s, 'imperial', '2026-10-10').text();

test('doctor summary PDF: letter size, boxed sections, right-aligned bold values, sub-lines, explainers', async () => {
  const pdf = summaryPdf(fullSummary(90), 'imperial', '2026-10-10');
  eq(pdf.type, 'application/pdf');
  const t = await pdf.text();
  assert(t.startsWith('%PDF-1.4') && /%%EOF\n$/.test(t));
  assert(t.includes('/MediaBox [0 0 612 792]'));
  assert(t.includes('(Forge health summary)') && t.includes('(Weight and body composition)') && t.includes('(Steps)'));
  assert(t.includes('/Helvetica-Bold') && / re S/.test(t), 'bold values and boxes');
  assert(t.includes('Last 7 days 43 ms, usual 43 ms') && t.includes('90 nights recorded') && t.includes('(0 of 90)'), 'sub-lines');
  assert(t.includes('HRV \\(heart'), 'HRV explainer');
  assert(t.includes('0\\226100 score') || t.includes('own 0') , 'Forge Score note');
  const val = /BT \/F2 10\.5 Tf [\d.]+ g ([\d.]+) [\d.]+ Td \(8,532 a day\)/.exec(t);
  assert(val && Number(val[1]) > 400, 'value is bold and sits at the right edge');
  const label = /BT \/F1 10\.5 Tf [\d.]+ g ([\d.]+) [\d.]+ Td \(Steps\)/.exec(t);
  assert(label && Number(label[1]) < 100, 'label sits at the left');
});

test('doctor summary PDF: the weight trend is a vector polyline, only with enough weight data', async () => {
  const t = await make(fullSummary(90));
  assert(/ 1\.2 w 1 j 1 J [\d.]+ [\d.]+ m (?:[\d.]+ [\d.]+ l ){10,}S/.test(t), 'path operators (m, l, S)');
  const s = fullSummary(90);
  s.weight.points = [{ day: day(0), v: 92 }];
  assert(!/ 1\.2 w /.test(await make(s)), 'no polyline for a single point');
});

test('doctor summary PDF: footer with page numbers on every page; a year with every section is 2 pages or fewer', async () => {
  const t = await make(fullSummary(365));
  const n = pageCount(t);
  assert(n >= 1 && n <= 2, `pages: ${n}`);
  for (let i = 1; i <= n; i++) assert(t.includes(`Page ${i} of ${n} \\267 Not a medical record`), `footer ${i}`);
});

test('doctor summary PDF: a section moves whole to the next page rather than splitting', async () => {
  const s = fullSummary(90);
  s.notes = Array.from({ length: 14 }, (_, i) => `Note ${i}: ${'long observation '.repeat(8)}`);
  const t = await make(s);
  assert(pageCount(t) >= 2);
  const streams = t.split('stream\n').filter((p, i) => i % 2 === 1);
  const withHeading = streams.filter((p) => p.includes('(Notes for the doctor)'));
  eq(withHeading.length, 1);
  assert(withHeading[0].includes('(Note 13:'), 'the notes box is whole on one page');
});

test('doctor summary PDF: prime and minus marks survive, unknown characters are dropped', async () => {
  eq(pdfSafe('6′0″ (183 cm)'), '6\'0" (183 cm)');
  eq(pdfSafe('−0.5 lb'), '–0.5 lb');
  eq(pdfSafe('a → b'), 'a to b');
  eq(pdfSafe('go 💪 now 日本'), 'go  now ');
  eq(pdfSafe('VO₂max'), 'VO2max');
  const t = await make(fullSummary(90));
  assert(t.includes('Height 6\'0\\" (183 cm)') || t.includes('6\'0'), 'height reads 6\'0"');
  assert(!t.includes('?'), 'no question marks');
  assert(t.includes('\\226'), 'en dash for the minus sign');
});
