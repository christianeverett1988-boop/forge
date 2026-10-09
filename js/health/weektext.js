// The weekly report as plain text for Share. It repeats only what is on the report cards (Score, workouts, weight
// trend change, the one suggestion) plus a short footer. Pure, so it is tested with synthetic data.
import { weightToDisplay, weightUnit } from '../units.js';
import { fmtDelta } from './delta.js';

const day = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

export function reportText(r, units) {
  const bits = [`Forge weekly report · ${day(r.days[0])} – ${day(r.days[6])}`];
  if (r.score.now != null) {
    const d = r.score.delta == null ? null : fmtDelta(r.score.delta);
    bits.push(`Forge Score ${Math.round(r.score.now)}${d && !d.same ? ` (${d.text})` : ''}`);
  }
  bits.push(`Workouts ${r.training.workouts}/${r.training.planned}${r.training.prs ? ` · ${r.training.prs} PR${r.training.prs === 1 ? '' : 's'}` : ''}`);
  if (r.weight.change != null) {
    const d = fmtDelta(weightToDisplay(r.weight.change, units), { digits: 1, unit: weightUnit(units) });
    bits.push(`Weight trend ${d.same ? 'steady' : d.text}`);
  }
  bits.push(`Next week: ${r.suggestion.text}`, '', 'Shared from Forge');
  return bits.join('\n');
}
