import { test, eq } from './harness.js';
import { planBlocks, planMuscles } from '../js/workouts/preview.js';
import { EXERCISES } from '../js/workouts/exercises.js';

const it = (id, superset = null, sets = 3) => ({ exercise_id: id, superset, target: { sets } });
const byId = (id) => EXERCISES.find((e) => e.id === id);

test('preview blocks: singles, supersets with rounds, circuits, lone group members', () => {
  const b = planBlocks([it('bb_back_squat'), it('db_curl', 'A', 3), it('cable_pushdown', 'A', 4), it('plank', 'B'), it('crunch', 'C'), it('db_lateral_raise', 'C'), it('db_shrug', 'C')]);
  eq(b.length, 4);
  eq(b[0].group, null);
  eq(`${b[1].kind} ${b[1].group} ${b[1].rounds} ${b[1].items.length}`, 'Superset A 4 2');
  eq(b[2].group, null, 'a group of one is a single exercise');
  eq(`${b[3].kind} ${b[3].items.map((x) => x.i).join()}`, 'Circuit 4,5,6');
});

test('preview muscles: distinct primary + secondary, conditioning ignored', () => {
  const sq = byId('bb_back_squat');
  const n = new Set([...sq.primary, ...(sq.secondary || [])]).size;
  eq(planMuscles([it('bb_back_squat'), it('bb_back_squat')], byId), n);
  eq(planMuscles([], byId), 0);
});
