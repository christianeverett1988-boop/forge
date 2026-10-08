// Program templates. A day is a list of slots; each slot names movement patterns in order of preference
// and a role (main / secondary / accessory). The generator fills each slot with the best exercise you
// can do at the active location. `ids` pins specific exercises (used by 5x5).

const S = (patterns, role = 'accessory', extra = {}) => ({ patterns: [].concat(patterns), role, ...extra });

export const DAY_TYPES = {
  full_a: {
    label: 'Full body A',
    slots: [S('squat', 'main'), S('horizontal_push', 'main'), S(['horizontal_pull'], 'secondary'), S(['hinge', 'hip_thrust'], 'secondary'),
      S(['lateral_raise', 'vertical_push']), S(['core_anti_extension', 'core_flexion'])],
  },
  full_b: {
    label: 'Full body B',
    slots: [S('hinge', 'main'), S('vertical_push', 'main'), S(['vertical_pull', 'horizontal_pull'], 'secondary'), S(['lunge'], 'secondary'),
      S(['biceps']), S(['triceps']), S(['core_rotation', 'core_lateral'])],
  },
  full_c: {
    label: 'Full body C',
    slots: [S(['lunge', 'squat'], 'main'), S(['horizontal_push'], 'main'), S(['horizontal_pull', 'vertical_pull'], 'secondary'),
      S(['hip_thrust', 'knee_flexion'], 'secondary'), S(['rear_delt']), S(['carry', 'core_anti_extension'])],
  },
  upper: {
    label: 'Upper',
    slots: [S('horizontal_push', 'main'), S(['horizontal_pull'], 'main'), S('vertical_push', 'secondary'), S(['vertical_pull', 'horizontal_pull'], 'secondary'),
      S('lateral_raise'), S('biceps'), S('triceps')],
  },
  lower: {
    label: 'Lower',
    slots: [S('squat', 'main'), S('hinge', 'main'), S(['lunge'], 'secondary'), S(['knee_flexion', 'hip_thrust']), S(['knee_extension', 'lunge']), S('calf'),
      S(['core_anti_extension', 'core_flexion'])],
  },
  push: {
    label: 'Push',
    slots: [S('horizontal_push', 'main'), S('vertical_push', 'secondary'), S(['chest_fly', 'horizontal_push']), S('lateral_raise'), S('triceps'),
      S(['core_anti_extension'])],
  },
  pull: {
    label: 'Pull',
    slots: [S(['vertical_pull', 'horizontal_pull'], 'main'), S('horizontal_pull', 'secondary'), S('rear_delt'), S('biceps'), S(['shrug', 'carry']),
      S(['core_flexion', 'core_rotation'])],
  },
  legs: {
    label: 'Legs',
    slots: [S('squat', 'main'), S('hinge', 'secondary'), S('lunge', 'secondary'), S(['knee_extension', 'lunge']), S(['knee_flexion', 'hip_thrust']), S('calf')],
  },
  boxing: {
    label: 'Boxing conditioning',
    slots: [
      S(['conditioning'], 'main', { ids: ['heavy_bag_rounds', 'shadowboxing'], sets: 6 }),
      S(['conditioning'], 'secondary', { ids: ['jump_rope', 'boxing_footwork'], sets: 3 }),
      S(['conditioning'], 'accessory', { ids: ['slip_and_roll', 'mountain_climber'], sets: 3 }),
      S(['core_rotation', 'core_anti_extension']),
      S(['core_flexion', 'core_lateral']),
    ],
  },
  sl5x5_a: {
    label: '5×5 A',
    slots: [S('squat', 'main', { ids: ['bb_back_squat'], sets: 5, reps: [5, 5] }), S('horizontal_push', 'main', { ids: ['bb_bench_press'], sets: 5, reps: [5, 5] }),
      S('horizontal_pull', 'main', { ids: ['bb_bent_row', 'bb_pendlay_row'], sets: 5, reps: [5, 5] })],
  },
  sl5x5_b: {
    label: '5×5 B',
    slots: [S('squat', 'main', { ids: ['bb_back_squat'], sets: 5, reps: [5, 5] }), S('vertical_push', 'main', { ids: ['bb_overhead_press'], sets: 5, reps: [5, 5] }),
      S('hinge', 'main', { ids: ['bb_deadlift'], sets: 1, reps: [5, 5] })],
  },
  home_a: {
    label: 'Home full body A',
    prefer: ['dumbbell', 'kettlebell', 'bodyweight', 'band'],
    slots: [S(['squat', 'lunge'], 'main'), S('horizontal_push', 'main'), S('horizontal_pull', 'secondary'), S(['hinge'], 'secondary'),
      S(['lateral_raise', 'vertical_push']), S(['core_anti_extension'])],
  },
  home_b: {
    label: 'Home full body B',
    prefer: ['dumbbell', 'kettlebell', 'bodyweight', 'band'],
    slots: [S(['hinge'], 'main'), S('vertical_push', 'main'), S('horizontal_pull', 'secondary'), S('lunge', 'secondary'), S('biceps'), S('triceps'),
      S(['core_rotation', 'core_flexion'])],
  },
};

export const PROGRAMS = {
  smart: {
    name: 'Smart (adapts to recovery)',
    description: 'Picks today’s focus from which muscles are most recovered, like Fitbod. Best default.',
    smart: true,
  },
  full_body_3x: { name: 'Full body, 3× a week', description: 'Three rotating full-body days. Great for beginners and busy weeks.', days: ['full_a', 'full_b', 'full_c'] },
  upper_lower: { name: 'Upper / lower', description: 'Four days: upper, lower, upper, lower.', days: ['upper', 'lower'] },
  ppl: { name: 'Push / pull / legs', description: 'Three day types on rotation. Run it 3 or 6 days a week.', days: ['push', 'pull', 'legs'] },
  five_by_five: {
    name: '5×5 strength',
    description: 'Barbell basics: five sets of five, adding weight each session. Needs a barbell and rack (YMCA).',
    days: ['sl5x5_a', 'sl5x5_b'],
    requires: ['barbell', 'power_rack'],
  },
  hypertrophy: { name: 'Hypertrophy', description: 'Upper/lower with more sets and higher reps for muscle growth.', days: ['upper', 'lower'], volume: 1.34, repBias: 'high' },
  home_dumbbells: { name: 'Home dumbbells', description: 'Full body using dumbbells, kettlebell, band and bodyweight.', days: ['home_a', 'home_b'] },
  boxing: { name: 'Boxing conditioning', description: 'Rounds, footwork and core. Shadowboxing when there’s no heavy bag.', days: ['boxing'] },
  custom: { name: 'Build my own', description: 'Pick your own exercises for each day.', custom: true },
};

/** Which day types "smart" mode chooses between, based on training days per week. */
export function smartDayTypes(daysPerWeek) {
  if (daysPerWeek <= 3) return ['full_a', 'full_b', 'full_c'];
  if (daysPerWeek === 4) return ['upper', 'lower'];
  return ['push', 'pull', 'legs'];
}

/** Muscles a day type mainly trains (for recovery-based choice). */
export const DAY_MUSCLES = {
  full_a: ['quads', 'chest', 'upper_back', 'hamstrings', 'glutes'],
  full_b: ['hamstrings', 'glutes', 'front_delts', 'lats', 'quads'],
  full_c: ['quads', 'glutes', 'chest', 'lats', 'hamstrings'],
  upper: ['chest', 'lats', 'upper_back', 'front_delts', 'side_delts', 'biceps', 'triceps'],
  lower: ['quads', 'hamstrings', 'glutes', 'calves', 'lower_back'],
  push: ['chest', 'front_delts', 'side_delts', 'triceps'],
  pull: ['lats', 'upper_back', 'rear_delts', 'biceps', 'traps'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
};
