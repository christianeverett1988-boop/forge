// Progress tab: Weight | History | Score | Awards. Each part keeps its own route so links still work.
let last = 'weight';

export function progressTabs(active) {
  last = active;
  return `
    <div class="seg progress-seg" role="tablist" aria-label="Progress">
      <a role="tab" href="#/weight" class="${active === 'weight' ? 'on' : ''}" aria-selected="${active === 'weight'}">Weight</a>
      <a role="tab" href="#/history" class="${active === 'history' ? 'on' : ''}" aria-selected="${active === 'history'}">History</a>
      <a role="tab" href="#/score" class="${active === 'score' ? 'on' : ''}" aria-selected="${active === 'score'}">Score</a>
      <a role="tab" href="#/awards" class="${active === 'awards' ? 'on' : ''}" aria-selected="${active === 'awards'}">Awards</a>
    </div>`;
}

export const lastProgressRoute = () => last;
