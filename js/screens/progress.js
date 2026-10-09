// Progress tab: Weight | Trends | Score | Week. Four segments fit at phone width; History and Awards are
// rows at the bottom of Weight. Each part keeps its own route so links still work.
let last = 'weight';

const TABS = [['weight', 'Weight'], ['trends', 'Trends'], ['score', 'Score'], ['weekly', 'Week']];

export function progressTabs(active) {
  last = active;
  return `
    <div class="seg progress-seg" role="tablist" aria-label="Progress">
      ${TABS.map(([k, l]) => `<a role="tab" href="#/${k}" class="${active === k ? 'on' : ''}" aria-selected="${active === k}">${l}</a>`).join('')}
    </div>`;
}

export const lastProgressRoute = () => last;
