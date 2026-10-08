import { test, eq, near, assert } from './harness.js';
import { bmrMifflin, computeTargets, CALORIE_FLOORS, safetyFlags } from '../js/nutrition/targets.js';

const base = { goal: 'lose', sex: 'male', age: 35, heightCm: 180, weightKg: 100, targetWeightKg: 85, activity: 'moderate' };

test('Mifflin-St Jeor male matches the published formula', () => {
  // 10*100 + 6.25*180 - 5*35 + 5 = 1955
  eq(bmrMifflin(base), 1955);
});

test('Mifflin-St Jeor female and unspecified', () => {
  eq(bmrMifflin({ ...base, sex: 'female' }), 1789);
  eq(bmrMifflin({ ...base, sex: 'unspecified' }), 1872);
});

test('lose 0.5%/wk gives ~550 kcal deficit for 100 kg', () => {
  const t = computeTargets({ ...base, pacePct: 0.5 });
  eq(t.tdee, Math.round(1955 * 1.55));
  near(t.dailyDelta, -550, 6);
  near(t.paceKgPerWeek, -0.5, 0.01);
});

test('loss pace is capped at 1%/wk without override', () => {
  const t = computeTargets({ ...base, pacePct: 2 });
  eq(t.pacePct, 1);
  assert(t.paceCapped);
});

test('override still caps at 1.5%/wk', () => {
  const t = computeTargets({ ...base, pacePct: 3, allowFastPace: true });
  eq(t.pacePct, 1.5);
});

test('calories never go below the floor', () => {
  const t = computeTargets({ goal: 'lose', sex: 'female', age: 40, heightCm: 155, weightKg: 60, activity: 'sedentary', pacePct: 1 });
  eq(t.calories, CALORIE_FLOORS.female);
  assert(t.floorApplied);
});

test('prefer-not-to-say uses the higher floor', () => {
  const t = computeTargets({ goal: 'lose', sex: 'unspecified', age: 40, heightCm: 155, weightKg: 60, activity: 'sedentary', pacePct: 1 });
  eq(t.calories, 1500);
});

test('under 18 gets no deficit', () => {
  const t = computeTargets({ ...base, age: 16, pacePct: 1 });
  eq(t.pacePct, 0);
  assert(t.flags.some((f) => f.code === 'minor'));
  eq(t.calories, Math.round(t.tdee / 10) * 10);
});

test('underweight + lose gets no deficit', () => {
  const t = computeTargets({ ...base, weightKg: 55, heightCm: 180, pacePct: 0.5 });
  assert(t.flags.some((f) => f.code === 'underweight'));
  eq(t.dailyDelta, 0);
});

test('BMI 40+ shows professional note', () => {
  assert(safetyFlags({ ...base, weightKg: 140, heightCm: 180 }).some((f) => f.code === 'bmi40'));
});

test('protein uses target weight when BMI >= 30', () => {
  const t = computeTargets({ ...base, weightKg: 110, targetWeightKg: 90 });
  eq(t.proteinG, 180); // 2.0 * 90
});

test('macros add up to calories within rounding', () => {
  const t = computeTargets({ ...base, pacePct: 0.5 });
  near(t.proteinG * 4 + t.fatG * 9 + t.carbG * 4, t.calories, 10);
});

test('muscle gain surplus is capped at 500 kcal', () => {
  const t = computeTargets({ ...base, goal: 'muscle', weightKg: 150, heightCm: 200, pacePct: 0.5 });
  assert(t.dailyDelta <= 505);
});

test('maintenance goals have no delta beyond rounding', () => {
  const t = computeTargets({ ...base, goal: 'health' });
  near(t.dailyDelta, 0, 5);
});
