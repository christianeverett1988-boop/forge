// Workout preview helpers (Train, before Start): grouping and counts. Pure, so they're unit-tested.

/**
 * The plan's exercises as display blocks: single exercises, and supersets / circuits (2 / 3+ exercises
 * sharing a group letter) with their rounds.
 */
export function planBlocks(items) {
  const blocks = [];
  items.forEach((it, i) => {
    const last = blocks[blocks.length - 1];
    if (it.superset && last && last.group === it.superset) last.items.push({ it, i });
    else blocks.push({ group: it.superset || null, items: [{ it, i }] });
  });
  return blocks.map((b) => {
    if (b.group && b.items.length < 2) b.group = null; // a lone member is just an exercise
    if (b.group) {
      b.kind = b.items.length > 2 ? 'Circuit' : 'Superset';
      b.rounds = Math.max(...b.items.map(({ it }) => it.target.sets || 1));
    }
    return b;
  });
}

/** Distinct muscles the plan works (primary and secondary), for "N exercises · N muscles". */
export function planMuscles(items, byId) {
  const set = new Set();
  for (const it of items) {
    const ex = byId(it.exercise_id);
    if (!ex || ex.kind === 'conditioning') continue;
    for (const m of [...(ex.primary || []), ...(ex.secondary || [])]) set.add(m);
  }
  return set.size;
}
