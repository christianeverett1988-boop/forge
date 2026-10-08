// Withings measure types (getmeas `meastype`), from Withings' public API reference, and how Forge stores
// each one. Values arrive as { value, unit } meaning value × 10^unit, already in SI units (kg, m, %, bpm…).
// Pure; no network.

/** meastype → Forge metric key (body_measures.metrics.<key>). */
export const METRIC_OF_TYPE = {
  1: 'weight_kg',
  4: 'height_m',
  5: 'fat_free_mass_kg',
  6: 'fat_ratio_pct',
  8: 'fat_mass_kg',
  11: 'heart_pulse_bpm',
  54: 'spo2_pct',
  76: 'muscle_mass_kg',
  77: 'hydration_kg',
  88: 'bone_mass_kg',
  91: 'pwv_m_s',
  123: 'vo2max',
  130: 'ecg_afib',
  135: 'ecg_qrs_ms',
  136: 'ecg_pr_ms',
  137: 'ecg_qt_ms',
  138: 'ecg_qtc_ms',
  140: 'vascular_age', // some Withings docs list 140, others 155: we request both
  155: 'vascular_age',
  167: 'nerve_health_score',
  168: 'ecw_kg',
  169: 'icw_kg',
  170: 'visceral_fat',
  196: 'nrs',
  226: 'bmr_kcal',
  227: 'metabolic_age',
  229: 'esc',
};

/** Segmental types: per-limb values come with a `position`. */
export const SEGMENT_TYPES = { 173: 'ffm_kg', 174: 'fat_kg', 175: 'muscle_kg' };

/** Withings `position` → body segment. */
export const POSITION = { 2: 'right_arm', 3: 'left_arm', 10: 'left_leg', 11: 'right_leg', 12: 'torso' };

/** Every type the data check and the sync ask for (addendum §B.6). */
export const ALL_TYPES = [1, 4, 5, 6, 8, 11, 54, 76, 77, 88, 91, 123, 130, 135, 136, 137, 138, 140, 155, 167, 168, 169, 170, 173, 174, 175, 196, 226, 227, 229];

/** value × 10^unit, rounded to the precision Withings sent (no float noise like 82.30000000000001). */
export function decodeValue(value, unit) {
  const v = Number(value) * Math.pow(10, Number(unit));
  const places = Math.max(0, -Number(unit));
  return Number(v.toFixed(Math.min(places, 12)));
}
