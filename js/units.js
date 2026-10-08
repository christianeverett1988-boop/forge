// Everything is stored in metric (kg, cm). These helpers convert for display and input.

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const lbToKg = (lb) => lb * KG_PER_LB;
export const kgToLb = (kg) => kg / KG_PER_LB;
export const inToCm = (inches) => inches * CM_PER_IN;
export const cmToIn = (cm) => cm / CM_PER_IN;

export function feetInchesToCm(feet, inches) {
  return inToCm((Number(feet) || 0) * 12 + (Number(inches) || 0));
}

export function cmToFeetInches(cm) {
  const totalIn = Math.round(cmToIn(cm));
  return { feet: Math.floor(totalIn / 12), inches: totalIn % 12 };
}

/** Weight in kg -> number in the user's unit (not rounded). */
export function weightToDisplay(kg, units) {
  return units === 'metric' ? kg : kgToLb(kg);
}

/** Number typed by the user in their unit -> kg. */
export function weightFromInput(value, units) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return units === 'metric' ? n : lbToKg(n);
}

export function weightUnit(units) {
  return units === 'metric' ? 'kg' : 'lb';
}

export function formatWeight(kg, units, digits = 1) {
  if (kg == null || !Number.isFinite(kg)) return '—';
  return `${weightToDisplay(kg, units).toFixed(digits)} ${weightUnit(units)}`;
}

export function formatHeight(cm, units) {
  if (!cm) return '—';
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}′${inches}″`;
}
