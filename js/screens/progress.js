// Progress tab: Weight | History (Awards joins in v0.3.2). Each part keeps its own route so links still work.
let last = 'weight';

export function progressTabs(active) {
  last = active;
  return `
    <div class="seg progress-seg" role="tablist" aria-label="Progress">
      <a role="tab" href="#/weight" class="${active === 'weight' ? 'on' : ''}" aria-selected="${active === 'weight'}">Weight</a>
      <a role="tab" href="#/history" class="${active === 'history' ? 'on' : ''}" aria-selected="${active === 'history'}">History</a>
    </div>`;
}

export const lastProgressRoute = () => last;
