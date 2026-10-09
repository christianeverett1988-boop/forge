// Food (v0.11.0): today's totals against your targets, the day's meals, and the Log food sheet.
// It lives under the Today tab (#/food, reached from the Food card on Today) so the tab bar stays at five.
// Everything here is local: My foods and your recent entries. USDA search arrives in part 2 through js/food/search.js.
import { state } from '../state.js';
import { put, patch, softDelete, newRecord } from '../db.js';
import { esc, $, $$, sheet, toast, confirmSheet, todayKey, formatDay } from '../ui.js';
import { currentTargets } from '../derived.js';
import { icon, emptyState } from '../ui/icons.js';
import { MEAL_LABEL, MEALS, cleanFood, copyMealFields, dayBefore, dayTotals, groupByMeal, progress, stepServings } from '../food/core.js';
import { createFlow } from '../food/flow.js';
import { search } from '../food/search.js';

let viewDay = null; // the day shown; null = today
const dayShown = () => (viewDay && viewDay <= todayKey() ? viewDay : todayKey());
const fmtNum = (n) => Math.round(n * 100) / 100;
const grams = (n) => `${Math.round(n)} g`;

function itemLine(it) {
  const bits = [`${Math.round(it.kcal)} kcal`];
  if (it.protein_g) bits.push(`${Math.round(it.protein_g)} g protein`);
  if (it.serving) bits.push(it.serving);
  return bits.join(' · ');
}

function meter(label, value, target, unit, { big = false } = {}) {
  const p = progress(value, target);
  const pct = p ? Math.min(100, Math.max(0, p.pct)) : 0;
  const over = p && p.pct > 110;
  return `<div class="meter-row ${big ? 'big' : ''}">
    <div class="row between"><span class="label">${label}</span>
      <span class="${big ? 'meter-val' : 'small'}"><b>${unit === 'kcal' ? Math.round(value).toLocaleString() : grams(value)}</b>${target ? ` <span class="muted">of ${unit === 'kcal' ? target.toLocaleString() + ' kcal' : grams(target)}</span>` : ''}</span></div>
    <div class="meter ${over ? 'over' : ''}" role="img" aria-label="${esc(label)}: ${p ? `${p.pct}% of your target` : 'no target'}"><i style="width:${pct}%"></i></div>
  </div>`;
}

export function renderFood(el) {
  const day = dayShown();
  const isToday = day === todayKey();
  const t = currentTargets();
  const tot = dayTotals(state.food_logs, day);
  const groups = groupByMeal(state.food_logs, day);
  const yesterday = dayBefore(day);
  const yGroups = groupByMeal(state.food_logs, yesterday);
  const anything = groups.some((g) => g.entries.length);

  el.innerHTML = `
    <section class="stack food">
      <h1>Food</h1>
      ${state.foodError ? `<div class="card" data-food-error><p class="label">Food isn’t switched on yet</p>
        <p class="small muted">The database said no (${esc(state.foodError)}). Food needs the new security rules published: run <code>firebase deploy --only firestore:rules</code> (DEPLOY.md, “If an update changes firestore.rules”). Nothing else in the app is affected.</p></div>` : ''}
      <div class="row between center week-nav">
        <button class="btn ghost" data-prev aria-label="Previous day">${icon('back')}</button>
        <div style="text-align:center"><b>${isToday ? 'Today' : formatDay(day, { weekday: 'short', month: 'short', day: 'numeric' })}</b></div>
        <button class="btn ghost" data-next aria-label="Next day" ${isToday ? 'disabled' : ''}>${icon('chev')}</button>
      </div>
      <div class="card stack" data-food-totals>
        ${meter('Calories', tot.kcal, t && t.calories, 'kcal', { big: true })}
        ${meter('Protein', tot.protein_g, t && t.proteinG, 'g', { big: true })}
        <div class="food-minor">
          ${meter('Carbs', tot.carbs_g, t && t.carbG, 'g')}
          ${meter('Fat', tot.fat_g, t && t.fatG, 'g')}
        </div>
      </div>
      <button class="btn bigbtn" data-log-food>${icon('plus')}Log food</button>
      ${anything ? '' : emptyState({ icon: 'food', title: isToday ? 'Nothing logged yet today' : 'Nothing logged this day', text: 'Tap Log food. If you don’t know the numbers, “Quick add” takes just calories.' })}
      ${groups.map((g) => {
        const canCopy = !g.entries.length && yGroups.find((y) => y.meal === g.meal).entries.length;
        return `<div class="food-meal" data-meal="${g.meal}">
          <div class="row between center food-meal-head">
            <h2>${g.label}</h2>
            <span class="row gap center"><span class="small muted">${g.entries.length ? `${g.totals.kcal.toLocaleString()} kcal` : ''}</span>
              ${canCopy ? `<button class="btn ghost small-btn" data-copy="${g.meal}">Copy yesterday</button>` : ''}</span>
          </div>
          ${g.entries.length ? `<ul class="list">${g.entries.map((e) => `
            <li class="tap" data-entry="${esc(e.id)}"><div><b>${esc(e.name)}</b>
              <small class="muted">${fmtNum(e.servings)} × ${esc(itemLine(e))}</small></div>
              <b>${Math.round(e.kcal * e.servings).toLocaleString()}</b></li>`).join('')}</ul>` : ''}
        </div>`;
      }).join('')}
      <div class="group"><button class="g-row" data-my-foods><span class="g-ic">${icon('list')}</span><span class="g-text"><span>My foods</span><small>${state.foods.length ? `${state.foods.length} saved` : 'Save the things you eat often'}</small></span><span class="chev" aria-hidden="true">${icon('chev')}</span></button></div>
      <p class="disclaimer">General fitness information, not medical advice.</p>
    </section>`;

  $('[data-prev]', el).onclick = () => { viewDay = dayBefore(day); renderFood(el); };
  $('[data-next]', el).onclick = () => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    viewDay = d.toISOString().slice(0, 10);
    renderFood(el);
  };
  $('[data-log-food]', el).onclick = () => openLogFood({ day });
  $('[data-my-foods]', el).onclick = () => openMyFoods();
  $$('[data-copy]', el).forEach((b) => {
    b.onclick = () => {
      const fields = copyMealFields(state.food_logs, yesterday, day, b.dataset.copy);
      for (const f of fields) put('food_logs', newRecord(f));
      toast(`Copied ${fields.length} ${fields.length === 1 ? 'item' : 'items'} to ${MEAL_LABEL[b.dataset.copy].toLowerCase()}`);
    };
  });
  $$('[data-entry]', el).forEach((li) => {
    li.onclick = () => {
      const e = state.food_logs.find((x) => x.id === li.dataset.entry);
      if (e) openEditEntry(e);
    };
  });
}

/** The Log food sheet. Tap 1 opens it (caller), tap 2 picks a food, tap 3 adds it. */
export function openLogFood({ day = todayKey() } = {}) {
  const now = new Date();
  const flow = createFlow({ foods: state.foods, logs: state.food_logs, hour: now.getHours() + now.getMinutes() / 60, day });
  sheet('Log food', (body, close) => {
    body.innerHTML = `
      <div class="stack food-log">
        <label class="field">
          <input type="search" name="q" placeholder="Search your foods" autocomplete="off" autocapitalize="off" enterkeyhint="search" aria-label="Search your foods"></label>
        <ul class="list food-results" data-results></ul>
        <button class="btn ghost" data-quick-toggle>Quick add: just calories</button>
        <form class="stack" data-quick hidden novalidate>
          <div class="field-grid">
            <label class="field"><span>Calories</span><input name="kcal" type="number" inputmode="numeric" min="1" max="5000" placeholder="600"></label>
            <label class="field"><span>Protein (g, optional)</span><input name="p" type="number" inputmode="decimal" min="0" max="500"></label>
          </div>
          <p class="error" aria-live="polite"></p>
          <button class="btn" type="submit">Add</button>
        </form>
        <div class="food-dock" data-dock hidden>
          <div class="row between center"><b data-sel-name></b>
            <span class="stepper"><button type="button" class="icon-btn" data-minus aria-label="Fewer servings">−</button><output data-serv aria-live="polite">1</output><button type="button" class="icon-btn" data-plus aria-label="More servings">+</button></span></div>
          <p class="small muted" data-sel-line></p>
          <div class="chips" role="radiogroup" aria-label="Meal">${MEALS.map((m) => `<button type="button" class="chip-btn" role="radio" data-meal="${m}">${MEAL_LABEL[m]}</button>`).join('')}</div>
          <button class="btn" data-add></button>
        </div>
      </div>`;
    const results = $('[data-results]', body);
    const dock = $('[data-dock]', body);
    let items = [];

    const paintMeal = () => {
      $$('[data-meal]', dock).forEach((b) => { const on = b.dataset.meal === flow.f.meal; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
      $('[data-add]', dock).textContent = `Add to ${MEAL_LABEL[flow.f.meal].toLowerCase()}`;
    };
    const paintDock = () => {
      const s = flow.f.selected;
      dock.hidden = !s;
      if (!s) return;
      $('[data-sel-name]', dock).textContent = s.name;
      $('[data-serv]', dock).textContent = `${fmtNum(flow.f.servings)} ${flow.f.servings === 1 ? 'serving' : 'servings'}`;
      $('[data-sel-line]', dock).textContent = `${Math.round(s.kcal * flow.f.servings)} kcal · ${Math.round(s.protein_g * flow.f.servings)} g protein${s.serving ? ` · ${s.serving} each` : ''}`;
      paintMeal();
    };
    const paintResults = async () => {
      items = await search(flow.f.query, { foods: state.foods, logs: state.food_logs });
      results.innerHTML = items.length ? items.map((it, i) => `
        <li class="tap ${flow.f.selected && flow.f.selected.key === it.key ? 'picked' : ''}" data-i="${i}" role="button" tabindex="0">
          <div><b>${esc(it.name)}</b><small class="muted">${esc(itemLine(it))}</small></div>
          <span class="muted">${it.kind === 'mine' ? 'My food' : ''}</span></li>`).join('')
        : `<li class="food-none"><div><b>${flow.f.query ? 'No match in your foods' : 'Nothing saved yet'}</b><small class="muted">${flow.f.query ? 'Try Quick add, or save it in My foods.' : 'Use Quick add, or save foods in My foods. Search of a big food database comes next.'}</small></div></li>`;
    };
    const pick = (li) => {
      const it = items[Number(li.dataset.i)];
      if (!it) return;
      flow.select(it);
      paintDock();
      $$('[data-i]', results).forEach((x) => x.classList.toggle('picked', x === li));
    };

    results.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) pick(li); });
    results.addEventListener('keydown', (e) => { const li = e.target.closest('[data-i]'); if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(li); } });
    $('[name=q]', body).addEventListener('input', (e) => { flow.search(e.target.value); paintResults(); });
    $('[data-minus]', dock).onclick = () => { flow.f.servings = stepServings(flow.f.servings, -1); paintDock(); };
    $('[data-plus]', dock).onclick = () => { flow.f.servings = stepServings(flow.f.servings, 1); paintDock(); };
    $$('[data-meal]', dock).forEach((b) => { b.onclick = () => { flow.setMeal(b.dataset.meal); paintMeal(); }; });
    $('[data-add]', dock).onclick = () => {
      const fields = flow.commit();
      if (!fields) return;
      put('food_logs', newRecord(fields));
      close();
      toast(`Added ${fields.name} to ${MEAL_LABEL[fields.meal].toLowerCase()}`);
    };

    const quick = $('[data-quick]', body);
    $('[data-quick-toggle]', body).onclick = () => {
      quick.hidden = !quick.hidden;
      if (!quick.hidden) quick.kcal.focus();
    };
    quick.addEventListener('submit', (e) => {
      e.preventDefault();
      const fields = flow.quick(quick.kcal.value, quick.p.value);
      if (!fields) { $('.error', quick).textContent = 'Enter the calories (1 to 5000).'; return; }
      put('food_logs', newRecord(fields));
      close();
      toast(`Added ${fields.kcal} kcal to ${MEAL_LABEL[fields.meal].toLowerCase()}`);
    });
    paintResults();
  });
}

/** Change servings or meal on an entry you already logged, or delete it. */
function openEditEntry(e) {
  let servings = e.servings;
  let meal = e.meal;
  sheet(e.name, (body, close) => {
    body.innerHTML = `
      <div class="stack">
        <p class="small muted" data-line></p>
        <div class="row between center"><b>Servings</b>
          <span class="stepper"><button type="button" class="icon-btn" data-minus aria-label="Fewer servings">−</button><output data-serv aria-live="polite"></output><button type="button" class="icon-btn" data-plus aria-label="More servings">+</button></span></div>
        <div class="chips" role="radiogroup" aria-label="Meal">${MEALS.map((m) => `<button type="button" class="chip-btn" role="radio" data-meal="${m}">${MEAL_LABEL[m]}</button>`).join('')}</div>
        <button class="btn" data-save>Save</button>
        <button class="btn danger-ghost" data-del>Delete this entry</button>
      </div>`;
    const paint = () => {
      $('[data-serv]', body).textContent = fmtNum(servings);
      $('[data-line]', body).textContent = `${Math.round(e.kcal * servings)} kcal · ${Math.round(e.protein_g * servings)} g protein · ${Math.round(e.carbs_g * servings)} g carbs · ${Math.round(e.fat_g * servings)} g fat`;
      $$('[data-meal]', body).forEach((b) => { const on = b.dataset.meal === meal; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    };
    $('[data-minus]', body).onclick = () => { servings = stepServings(servings, -1); paint(); };
    $('[data-plus]', body).onclick = () => { servings = stepServings(servings, 1); paint(); };
    $$('[data-meal]', body).forEach((b) => { b.onclick = () => { meal = b.dataset.meal; paint(); }; });
    $('[data-save]', body).onclick = () => { patch('food_logs', e.id, { servings, meal }); close(); };
    $('[data-del]', body).onclick = () => { softDelete('food_logs', e.id); close(); toast('Removed'); };
    paint();
  });
}

/** My foods: the list, and a form to create or edit one. Editing a food never changes entries you logged. */
export function openMyFoods() {
  sheet('My foods', (body, close) => {
    const list = () => {
      const foods = [...state.foods].sort((a, b) => a.name.localeCompare(b.name));
      body.innerHTML = `
        <div class="stack">
          ${foods.length ? `<ul class="list">${foods.map((f) => `
            <li class="tap" data-id="${esc(f.id)}"><div><b>${esc(f.name)}</b><small class="muted">${esc(itemLine(f))}</small></div>
              <span class="chev" aria-hidden="true">${icon('chev')}</span></li>`).join('')}</ul>`
            : '<p class="muted">Nothing saved yet. Add the foods you eat often and they’ll be one tap away in Log food.</p>'}
          <button class="btn" data-new>${icon('plus')}New food</button>
        </div>`;
      $$('[data-id]', body).forEach((li) => { li.onclick = () => form(state.foods.find((f) => f.id === li.dataset.id)); });
      $('[data-new]', body).onclick = () => form(null);
    };
    const form = (food) => {
      const v = food || { name: '', serving: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '' };
      body.innerHTML = `
        <form class="stack" novalidate>
          <label class="field"><span>Name</span><input name="name" maxlength="80" value="${esc(v.name)}" autocomplete="off" placeholder="Greek yoghurt"></label>
          <label class="field"><span>Serving</span><input name="serving" maxlength="40" value="${esc(v.serving)}" autocomplete="off" placeholder="1 cup, 100 g…"></label>
          <p class="small muted">Numbers are for one serving.</p>
          <div class="field-grid">
            <label class="field"><span>Calories</span><input name="kcal" type="number" inputmode="numeric" min="0" max="5000" value="${v.kcal}"></label>
            <label class="field"><span>Protein (g)</span><input name="protein_g" type="number" inputmode="decimal" min="0" max="500" value="${v.protein_g}"></label>
            <label class="field"><span>Carbs (g)</span><input name="carbs_g" type="number" inputmode="decimal" min="0" max="500" value="${v.carbs_g}"></label>
            <label class="field"><span>Fat (g)</span><input name="fat_g" type="number" inputmode="decimal" min="0" max="500" value="${v.fat_g}"></label>
          </div>
          <p class="error" aria-live="polite"></p>
          <button class="btn" type="submit">Save</button>
          <button class="btn ghost" type="button" data-back>Back to the list</button>
          ${food ? '<button class="btn danger-ghost" type="button" data-del>Delete this food</button>' : ''}
        </form>`;
      const f = $('form', body);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const r = cleanFood(Object.fromEntries(new FormData(f)));
        if (!r.ok) { $('.error', body).textContent = r.error; return; }
        if (food) patch('foods', food.id, r.food);
        else put('foods', newRecord(r.food));
        toast(food ? 'Saved' : `Saved ${r.food.name}`);
        close();
      });
      $('[data-back]', body).onclick = list;
      const del = $('[data-del]', body);
      if (del) del.onclick = async () => {
        if (!(await confirmSheet({ title: 'Delete this food?', message: 'Entries you already logged keep their numbers.', confirmLabel: 'Delete', danger: true }))) return;
        softDelete('foods', food.id);
        close();
        toast('Deleted');
      };
    };
    list();
  });
}
