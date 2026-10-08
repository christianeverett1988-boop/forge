import { test, eq, near } from './harness.js';
import { lbToKg, kgToLb, feetInchesToCm, cmToFeetInches, weightFromInput, formatWeight, formatHeight } from '../js/units.js';

test('lb <-> kg round trip', () => {
  near(kgToLb(lbToKg(200)), 200, 1e-9);
  near(lbToKg(1), 0.45359237, 1e-12);
});

test('5 ft 10 in is 177.8 cm and back', () => {
  near(feetInchesToCm(5, 10), 177.8, 1e-9);
  const { feet, inches } = cmToFeetInches(177.8);
  eq(feet, 5);
  eq(inches, 10);
});

test('input parsing respects units', () => {
  near(weightFromInput('220', 'imperial'), 99.79, 0.01);
  eq(weightFromInput('90', 'metric'), 90);
});

test('formatting', () => {
  eq(formatWeight(lbToKg(185.4), 'imperial'), '185.4 lb');
  eq(formatHeight(177.8, 'imperial'), '5′10″');
  eq(formatWeight(null, 'imperial'), '—');
});
