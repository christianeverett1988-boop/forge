// Body measurements as CSV rows (pure, so it's unit-tested). Used by export.js.
// One row per Withings measurement group, one column per metric (SI units, as stored).
export const BODY_COLUMNS = ['weight_kg', 'fat_ratio_pct', 'fat_mass_kg', 'fat_free_mass_kg', 'muscle_mass_kg', 'hydration_kg', 'bone_mass_kg',
  'heart_pulse_bpm', 'visceral_fat', 'bmr_kcal', 'metabolic_age', 'vascular_age', 'nerve_health_score', 'pwv_m_s', 'ecw_kg', 'icw_kg', 'esc', 'nrs', 'vo2max', 'spo2_pct', 'height_m'];

export function bodyRows(docs) {
  return docs.filter((r) => !r.deleted)
    .sort((a, b) => (a.measured_at < b.measured_at ? -1 : 1))
    .map((r) => ({
      day: r.day, measured_at: r.measured_at, ...Object.fromEntries(BODY_COLUMNS.map((k) => [k, r.metrics && r.metrics[k] != null ? r.metrics[k] : ''])),
      needs_review: r.needs_review ? 'yes' : '', model: r.model || '', source: r.source, grpid: r.grpid ?? '', id: r.id,
    }));
}

