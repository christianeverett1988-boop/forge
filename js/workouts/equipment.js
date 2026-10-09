// Equipment catalog and location presets (Addendum 1).
// Bodyweight work needs no equipment entry: it's available at every location.

export const EQUIPMENT_GROUPS = [
  {
    group: 'Free weights',
    items: [
      ['dumbbells', 'Dumbbells'],
      ['adjustable_dumbbells', 'Adjustable dumbbells'],
      ['barbell', 'Olympic barbell + plates'],
      ['ez_bar', 'EZ curl bar'],
      ['trap_bar', 'Trap / hex bar'],
      ['kettlebells', 'Kettlebells'],
      ['medicine_ball', 'Medicine balls'],
      ['weight_vest', 'Weight vest'],
    ],
  },
  {
    group: 'Racks and benches',
    items: [
      ['power_rack', 'Squat / power rack'],
      ['smith_machine', 'Smith machine'],
      ['bench_flat', 'Flat bench'],
      ['bench_adjustable', 'Incline / adjustable bench'],
      ['bench_decline', 'Decline bench'],
      ['pullup_bar', 'Pull-up bar'],
      ['dip_station', 'Dip station / parallel bars'],
      ['back_extension', 'Back extension / GHD'],
    ],
  },
  {
    group: 'Cables and bands',
    items: [
      ['cable_station', 'Cable station / functional trainer'],
      ['resistance_bands', 'Resistance band(s)'],
      ['door_anchor', 'Band door anchor'],
      ['suspension_trainer', 'Suspension trainer (TRX)'],
      ['gymnastic_rings', 'Gymnastic rings'],
    ],
  },
  {
    group: 'Machines',
    items: [
      ['machine_chest_press', 'Chest press machine'],
      ['machine_shoulder_press', 'Shoulder press machine'],
      ['machine_lat_pulldown', 'Lat pulldown'],
      ['machine_seated_row', 'Seated row machine'],
      ['machine_leg_press', 'Leg press'],
      ['machine_leg_extension', 'Leg extension'],
      ['machine_leg_curl', 'Leg curl'],
      ['machine_hip_abductor', 'Hip abductor / adductor'],
      ['machine_pec_deck', 'Pec deck / rear delt'],
      ['machine_assisted_pullup', 'Assisted pull-up / dip'],
    ],
  },
  {
    group: 'Core and accessories',
    items: [
      ['ab_equipment', 'Ab equipment (ab bench, roller, captain’s chair)'],
      ['ab_wheel', 'Ab wheel / roller'],
      ['pushup_handles', 'Push-up handles (rotating)'],
      ['plyo_box', 'Plyo box'],
      ['heavy_bag', 'Heavy bag'],
      ['jump_rope', 'Jump rope'],
      ['parallettes', 'Parallettes'],
    ],
  },
  {
    group: 'Around the house',
    hint: 'Load the backpack with books or water bottles.',
    items: [
      ['towel', 'Bath towel'],
      ['sturdy_table', 'Sturdy table'],
      ['sturdy_chair', 'Sturdy chair or step'],
      ['backpack', 'Backpack'],
      ['stairs', 'Stairs'],
    ],
  },
  {
    group: 'Cardio',
    items: [
      ['treadmill', 'Treadmill'],
      ['bike', 'Bike (upright / spin / Peloton)'],
      ['rower', 'Rower'],
      ['elliptical', 'Elliptical'],
      ['stair_climber', 'Stair climber'],
    ],
  },
];

export const EQUIPMENT_LABELS = Object.fromEntries(
  EQUIPMENT_GROUPS.flatMap((g) => g.items)
);

export const YMCA_PRESET = [
  'machine_chest_press', 'machine_shoulder_press', 'machine_lat_pulldown', 'machine_seated_row',
  'machine_leg_press', 'machine_leg_extension', 'machine_leg_curl', 'machine_hip_abductor',
  'machine_pec_deck', 'machine_assisted_pullup', 'cable_station', 'smith_machine', 'power_rack',
  'bench_flat', 'bench_adjustable', 'bench_decline', 'barbell', 'ez_bar', 'dumbbells', 'kettlebells',
  'pullup_bar', 'dip_station', 'back_extension', 'ab_equipment', 'medicine_ball',
  'treadmill', 'bike', 'rower', 'elliptical', 'stair_climber',
];

// Home gym, from photos (2026-10-07): 5 and 30 lb dumbbell pairs, one 20 lb kettlebell,
// a single tube band with handles (no door anchor), jump rope, ab wheel, push-up handles, Peloton.
export const HOUSEHOLD_ITEMS = ['towel', 'sturdy_table', 'sturdy_chair', 'backpack', 'stairs'];
export const HOME_PRESET = ['dumbbells', 'kettlebells', 'resistance_bands', 'jump_rope', 'ab_wheel', 'pushup_handles', 'bike', ...HOUSEHOLD_ITEMS];
// Hotel room: a towel, a chair and a bag you already packed.
export const TRAVEL_PRESET = ['towel', 'sturdy_chair', 'backpack'];

const lbs = (...lb) => lb.map((x) => Math.round(x * 0.45359237 * 1000) / 1000);

/** Starting locations offered in onboarding. weight_inventory is in kg like all stored data; the UI shows your units. */
export const LOCATION_PRESETS = [
  { key: 'home', name: 'Home gym', equipment: HOME_PRESET, weight_inventory: { dumbbells_kg: lbs(5, 30), kettlebells_kg: lbs(20) } },
  { key: 'ymca', name: 'YMCA', equipment: YMCA_PRESET, weight_inventory: {} },
  { key: 'travel', name: 'Travel / hotel room', equipment: TRAVEL_PRESET, weight_inventory: {} },
];

/** The friendly line under each preset (onboarding and the Locations picker share it). */
export function presetDescription(preset, { inLocations = false } = {}) {
  if (preset.key === 'home') return 'Dumbbells (5 and 30 lb), kettlebells, band, jump rope, ab wheel, push-up handles, Peloton.' + (inLocations ? '' : ' Edit any time in Settings → Locations.');
  if (preset.key === 'ymca') return `Standard gym setup (${preset.equipment.length} items). Turn off anything your branch doesn’t have.`;
  return 'Bodyweight, a towel, a sturdy chair and a backpack.';
}

/** The record fields for a new location made from a preset. Copies, so edits never touch the preset. */
export function locationFromPreset(preset, isDefault) {
  return {
    name: preset.name,
    preset: preset.key,
    equipment: [...preset.equipment],
    weight_inventory: Object.fromEntries(Object.entries(preset.weight_inventory).map(([k, v]) => [k, [...v]])),
    is_default: isDefault,
  };
}

/** Rows for the "+ Add a location" picker: every preset, marked "Add another" if the user already has one. */
export function presetPickerRows(locations) {
  return LOCATION_PRESETS.map((preset) => ({ preset, addAnother: locations.some((l) => l.preset === preset.key) }));
}

// One item can stand in for another (e.g. an adjustable bench works as a flat bench).
export const EQUIPMENT_SATISFIES = {
  adjustable_dumbbells: ['dumbbells'],
  bench_adjustable: ['bench_flat', 'sturdy_chair'],
  bench_flat: ['sturdy_chair'],
  plyo_box: ['sturdy_chair', 'stairs'],
  dumbbells: ['backpack'], // a backpack move can always be done with a dumbbell
  kettlebells: ['backpack'],
  power_rack: ['pullup_bar'],
  machine_assisted_pullup: ['dip_station'],
  gymnastic_rings: ['dip_station'],
  bike: [],
};

/** Expands a location's equipment list with everything it can stand in for. */
export function expandEquipment(list) {
  const out = new Set(list);
  for (const k of list) (EQUIPMENT_SATISFIES[k] || []).forEach((x) => out.add(x));
  return out;
}

/** True if an exercise's equipment options can be met. `equip` is a list of alternatives,
 * each a list of required keys; [] means no equipment. */
export function canDo(exercise, available) {
  return exercise.equip.some((req) => req.every((k) => available.has(k)));
}
