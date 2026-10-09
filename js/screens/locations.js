// Locations (Addendum 1): named places, each with its own equipment list.
// Weight inventory (dumbbell range, plates) is edited here starting in Checkpoint B, with the plate calculator.
import { state, units as getUnits } from '../state.js';
import { put, patch, softDelete, newRecord } from '../db.js';
import { esc, $, $$, sheet, toast, confirmSheet } from '../ui.js';
import { EQUIPMENT_GROUPS, presetDescription, locationFromPreset, presetPickerRows } from '../workouts/equipment.js';
import { toUnit, fromUnit } from '../workouts/progression.js';
import { openPlateCalculator } from './tools.js';

const INVENTORY = [
  ['dumbbells_kg', 'Dumbbell pairs', 'dumbbells'],
  ['kettlebells_kg', 'Kettlebells', 'kettlebells'],
];

let editingId = null;

export function renderLocations(el) {
  const loc = editingId && state.locations.find((l) => l.id === editingId);
  if (loc) return renderEditor(el, loc);
  editingId = null;

  el.innerHTML = `
    <section class="stack">
      <div class="row between center">
        <a href="#/settings" class="link">‹ Settings</a>
      </div>
      <h1>Locations</h1>
      <p class="muted">Workouts only use the equipment at the place you pick. Bodyweight moves work everywhere.</p>
      <ul class="list">
        ${[...state.locations].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((l) => `
          <li class="tap" data-edit="${esc(l.id)}">
            <div><b>${esc(l.name)}</b>${l.is_default ? ' <span class="pill">Default</span>' : ''}
              <small class="muted">${l.equipment.length ? `${l.equipment.length} items` : 'Bodyweight only'}</small></div>
            <span aria-hidden="true">›</span>
          </li>`).join('')}
      </ul>
      <button class="btn ghost" data-add>+ Add a location</button>
    </section>`;

  $$('[data-edit]', el).forEach((li) =>
    li.addEventListener('click', () => {
      editingId = li.dataset.edit;
      renderLocations(el);
    })
  );
  $('[data-add]', el).onclick = () =>
    sheet('Add a location', (body, close) => {
      const openEditor = (rec) => {
        close();
        editingId = rec.id;
        renderLocations(el);
      };
      const rows = presetPickerRows(state.locations);
      body.innerHTML = `
        <div class="choices">
          ${rows.map(({ preset, addAnother }) => `
            <button class="pick" type="button" data-preset="${esc(preset.key)}">
              <b>${esc(preset.name)}${addAnother ? ' <span class="pill">Add another</span>' : ''}</b>
              <small>${esc(presetDescription(preset))}</small>
            </button>`).join('')}
          <button class="pick" type="button" data-custom>
            <b>Custom (start empty)</b>
            <small>Name it and pick your own equipment.</small>
          </button>
        </div>`;
      $$('[data-preset]', body).forEach((b) =>
        b.addEventListener('click', () => {
          const { preset } = rows.find((r) => r.preset.key === b.dataset.preset);
          openEditor(put('locations', newRecord(locationFromPreset(preset, state.locations.length === 0))));
        })
      );
      $('[data-custom]', body).onclick = () => {
        body.innerHTML = `
          <form class="stack" novalidate>
            <label class="field"><span>Name</span><input name="name" placeholder="e.g. LA Fitness" maxlength="40"></label>
            <button class="btn" type="submit">Create</button>
          </form>`;
        const form = $('form', body);
        form.name.focus();
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const name = form.name.value.trim();
          if (!name) return;
          openEditor(put('locations', newRecord({ name, preset: 'custom', equipment: [], weight_inventory: {}, is_default: state.locations.length === 0 })));
        });
      };
    });
}

function renderEditor(el, loc) {
  const have = new Set(loc.equipment);
  const custom = loc.equipment.filter((k) => k.startsWith('custom:'));
  el.innerHTML = `
    <section class="stack">
      <button class="link" data-back>‹ Locations</button>
      <label class="field"><span>Name</span><input name="name" value="${esc(loc.name)}" maxlength="40"></label>
      <label class="choice check small">
        <input type="checkbox" name="def" ${loc.is_default ? 'checked' : ''}>
        <span>Default location<small>Used when you start a workout, until you pick another.</small></span>
      </label>
      ${inventoryHTML(loc)}
      <p class="muted small">Tap to turn equipment on or off. Changes save instantly.</p>
      ${EQUIPMENT_GROUPS.map((g) => `
        <fieldset class="card">
          <legend class="label">${esc(g.group)}</legend>
          <div class="chips">
            ${g.items.map(([k, label]) => `
              <label class="chip"><input type="checkbox" value="${k}" ${have.has(k) ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}
          </div>
        </fieldset>`).join('')}
      <fieldset class="card">
        <legend class="label">Other equipment</legend>
        <div class="chips">
          ${custom.map((k) => `<label class="chip"><input type="checkbox" value="${esc(k)}" checked><span>${esc(k.slice(7))}</span></label>`).join('')}
        </div>
        <form class="row gap" data-custom>
          <input name="item" class="grow" placeholder="Add an item" maxlength="40">
          <button class="btn small" type="submit">Add</button>
        </form>
      </fieldset>
      <button class="btn danger-ghost" data-remove>Remove this location</button>
    </section>`;

  const save = (changes) => patch('locations', loc.id, changes);

  $('[data-back]', el).onclick = () => {
    editingId = null;
    renderLocations(el);
  };
  $('input[name=name]', el).addEventListener('change', (e) => {
    const name = e.target.value.trim();
    if (name) save({ name });
  });
  $('input[name=def]', el).addEventListener('change', (e) => {
    if (!e.target.checked) return; // there's always one default; pick another to move it
    state.locations.forEach((l) => {
      if (l.id !== loc.id && l.is_default) patch('locations', l.id, { is_default: false });
    });
    save({ is_default: true });
  });
  $$('.chip input', el).forEach((c) =>
    c.addEventListener('change', () => {
      const next = $$('.chip input:checked', el).map((i) => i.value);
      save({ equipment: next });
    })
  );
  bindInventory(el, loc, save);
  $('[data-custom]', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const item = e.target.item.value.trim();
    if (!item) return;
    const key = 'custom:' + item;
    if (!loc.equipment.includes(key)) save({ equipment: [...loc.equipment, key] });
    e.target.item.value = '';
  });
  $('[data-remove]', el).onclick = async () => {
    if (state.locations.length <= 1) {
      toast('Keep at least one location.');
      return;
    }
    const ok = await confirmSheet({ title: `Remove ${loc.name}?`, message: 'Past workouts keep their history.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    softDelete('locations', loc.id);
    if (loc.is_default) {
      const other = state.locations.find((l) => l.id !== loc.id);
      if (other) patch('locations', other.id, { is_default: true });
    }
    editingId = null;
    renderLocations(el);
  };
}

// ---------- weight inventory (stored in kg, shown in your units) ----------
const unitName = () => (getUnits() === 'metric' ? 'kg' : 'lb');
const show = (kg) => Math.round(toUnit(kg, unitName()) * 10) / 10;

function inventoryHTML(loc) {
  const inv = loc.weight_inventory || {};
  const u = unitName();
  return `
    <fieldset class="card">
      <legend class="label">Weights you own here</legend>
      <p class="small muted">Workouts only suggest weights from this list. Leave a list empty to assume a full gym rack (5 ${u} steps).</p>
      ${INVENTORY.map(([key, label, equip]) => `
        <div class="inv" data-inv="${key}">
          <p><b>${label}</b>${!loc.equipment.includes(equip) && !(equip === 'dumbbells' && loc.equipment.includes('adjustable_dumbbells')) ? ' <small class="muted">(turned off below)</small>' : ''}</p>
          <div class="chips">
            ${(inv[key] || []).slice().sort((a, b) => a - b).map((kg) => `<button class="chip-btn" data-rm="${key}:${kg}" aria-label="Remove ${show(kg)} ${u}">${show(kg)} ${u} ✕</button>`).join('') || '<span class="muted small">Full rack assumed</span>'}
          </div>
          <form class="row gap" data-addinv="${key}">
            <input name="w" type="number" inputmode="decimal" step="0.5" min="0.5" placeholder="Weight (${u})" class="grow" aria-label="${label} weight in ${u}">
            <button class="btn small" type="submit">Add</button>
          </form>
        </div>`).join('')}
      <button class="link small" type="button" data-plates>Open plate calculator</button>
    </fieldset>`;
}

function bindInventory(el, loc, save) {
  const inv = () => ({ ...(loc.weight_inventory || {}) });
  el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    const [key, kg] = b.dataset.rm.split(':');
    const next = inv();
    next[key] = (next[key] || []).filter((x) => String(x) !== kg);
    save({ weight_inventory: next });
  }));
  el.querySelectorAll('[data-addinv]').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = f.dataset.addinv;
    const v = Number(f.w.value);
    if (!v || v <= 0 || v > 500) return;
    const kg = Math.round(fromUnit(v, unitName()) * 1000) / 1000;
    const next = inv();
    const list = next[key] || [];
    if (!list.some((x) => Math.abs(x - kg) < 0.01)) next[key] = [...list, kg].sort((a, b) => a - b);
    save({ weight_inventory: next });
    f.w.value = '';
  }));
  const pc = el.querySelector('[data-plates]');
  if (pc) pc.onclick = () => openPlateCalculator();
}
