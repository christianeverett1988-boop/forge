// How-To sheet (Lyfta-style exercise detail):
//   the looping demo across the top (Figure | Photos), then Favourite · Watch on YouTube · Share,
//   Instructions | Target tabs (Target = the front/back muscle map), and your history and PRs.
// YouTube is a link out to a search (no embed), so the CSP's frame-src stays 'none'.
import { state } from '../state.js';
import { esc, $, $$, sheet, toast } from '../ui.js';
import { patch } from '../db.js';
import { exerciseById, loadInstructions } from '../workouts/library.js';
import { equipmentText } from './picker.js';
import { MUSCLE_LABELS } from '../workouts/recovery.js';
import { historyIndex, unit } from '../workouts/plan.js';
import { exerciseRecords } from '../workouts/history.js';
import { mountFigure, hasFigure } from '../ui/figure.js';
import { photoLoop, hasPhotos, loadPhotoIndex } from '../ui/photos.js';
import { bodyMap, exerciseValues } from '../ui/bodymap.js';

const fmtDate = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

/**
 * Open the How-To sheet for an exercise. `extra(body, close)` lets a caller add its own controls at the
 * bottom (the library adds "Never suggest this" and custom-exercise delete).
 */
export async function openHowTo(id, { extra } = {}) {
  const ex = exerciseById(id);
  if (!ex) return;
  await loadPhotoIndex();
  const fig = hasFigure(id);
  const pics = hasPhotos(id);
  let view = fig ? 'figure' : pics ? 'photos' : 'map';
  const favs = () => (state.settings && state.settings.favorites) || [];
  const u = unit();
  const sessions = historyIndex().historyFor(id);
  const rec = exerciseRecords(sessions, ex);
  const works = `${ex.primary.map((m) => MUSCLE_LABELS[m] || m).join(', ')}`;
  const also = ex.secondary.map((m) => MUSCLE_LABELS[m] || m).join(', ');

  sheet(ex.name, (body, close) => {
    body.innerHTML = `
      <div class="stack howto">
        <div class="ht-demo" data-demo></div>
        ${fig && pics ? `
        <div class="seg ht-seg" role="tablist" aria-label="Demo">
          <button role="tab" data-view="figure">Figure</button><button role="tab" data-view="photos">Photos</button>
        </div>` : ''}
        <div class="ht-actions">
          <button class="ht-act" data-fav aria-pressed="false"><span aria-hidden="true" data-favicon>☆</span><small>Favourite</small></button>
          <a class="ht-act" href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex.name} exercise form`)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">▶</span><small>Watch on YouTube</small></a>
          <button class="ht-act" data-share><span aria-hidden="true">⤴</span><small>Share</small></button>
        </div>
        <div class="seg ht-seg" role="tablist" aria-label="Details">
          <button role="tab" data-tab="steps" class="on" aria-selected="true">Instructions</button><button role="tab" data-tab="target" aria-selected="false">Target</button>
        </div>
        <div data-panel="steps" class="stack">
          <p class="small muted">${esc(equipmentText(ex))}</p>
          <div><p class="label">Form cues</p><ul class="reasons">${ex.cues.map((c) => `<li>${esc(c)}</li>`).join('') || '<li class="muted">No cues yet</li>'}</ul></div>
          <div data-steps><p class="small muted">Loading steps…</p></div>
        </div>
        <div data-panel="target" class="stack" hidden>
          ${bodyMap(exerciseValues(ex), { size: 'small' })}
          <p><b>Works:</b> ${esc(works)}${also ? `<span class="muted"> · also ${esc(also)}</span>` : ''}</p>
        </div>
        <div class="ht-history">
          <p class="label">Your history</p>
          ${sessions.length ? `
          <div class="ht-prs">
            ${ex.timed
              ? `<div><span>Longest hold</span><b>${rec.hold ? `${rec.hold.value} s` : '—'}</b></div>`
              : `${rec.e1rm ? `<div><span>Est. 1-rep max</span><b>${rec.e1rm.value} ${u}</b></div>` : ''}
                 ${rec.heaviest ? `<div><span>Heaviest</span><b>${rec.heaviest.value} ${u}</b></div>` : ''}
                 <div><span>Most reps</span><b>${rec.reps ? rec.reps.value : '—'}</b></div>`}
          </div>
          <ul class="list ht-sessions">
            ${sessions.slice(0, 4).map((s) => `<li><span class="muted">${fmtDate(s.date)}${s.deload ? ' · deload' : ''}</span><span>${s.sets.map((x) => `${x.weight ? `${x.weight}×` : ''}${x.reps}${ex.timed ? 's' : ''}`).join(' · ')}</span></li>`).join('')}
          </ul>` : '<p class="small muted">Not done yet. Your best sets show up here.</p>'}
        </div>
        <div data-extra></div>
      </div>`;

    const demo = $('[data-demo]', body);
    const showView = () => {
      $$('[data-view]', body).forEach((b) => {
        b.classList.toggle('on', b.dataset.view === view);
        b.setAttribute('aria-selected', String(b.dataset.view === view));
      });
      if (view === 'figure') {
        demo.innerHTML = '<div class="fig-wrap"></div>';
        mountFigure(demo.firstChild, ex);
      } else if (view === 'photos') {
        demo.innerHTML = photoLoop(id, ex.name);
      } else {
        demo.innerHTML = bodyMap(exerciseValues(ex), { size: 'small' });
      }
    };
    showView();
    $$('[data-view]', body).forEach((b) => (b.onclick = () => { view = b.dataset.view; showView(); }));

    // Favourite
    const favBtn = $('[data-fav]', body);
    const paintFav = () => {
      const on = favs().includes(id);
      favBtn.setAttribute('aria-pressed', String(on));
      favBtn.classList.toggle('on', on);
      $('[data-favicon]', favBtn).textContent = on ? '★' : '☆';
    };
    paintFav();
    favBtn.onclick = () => {
      const set = new Set(favs());
      const on = !set.has(id);
      on ? set.add(id) : set.delete(id);
      patch('settings', 'main', { favorites: [...set] });
      if (state.settings) state.settings.favorites = [...set];
      paintFav();
      toast(on ? 'Added to favourites' : 'Removed from favourites');
    };

    // Share: the system share sheet where there is one, otherwise copy the cues.
    $('[data-share]', body).onclick = async () => {
      const text = `${ex.name}\n${ex.cues.map((c) => `• ${c}`).join('\n')}`;
      try {
        if (navigator.share) await navigator.share({ title: ex.name, text });
        else {
          await navigator.clipboard.writeText(text);
          toast('Copied');
        }
      } catch { /* cancelled */ }
    };

    // Tabs
    $$('[data-tab]', body).forEach((b) => (b.onclick = () => {
      $$('[data-tab]', body).forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-selected', String(x === b));
      });
      $$('[data-panel]', body).forEach((p) => (p.hidden = p.dataset.panel !== b.dataset.tab));
    }));

    if (extra) extra($('[data-extra]', body), close);

    loadInstructions().then((all) => {
      const steps = all[id];
      $('[data-steps]', body).innerHTML = steps
        ? `<p class="label">Step by step</p><ol class="reasons">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
           <p class="small muted">Steps${pics ? ' and photos' : ''} from free-exercise-db (public domain).</p>`
        : '';
    }).catch(() => { $('[data-steps]', body).innerHTML = ''; });
  });
}
