// What to show beside a photo: your weight trend and fat mass around that date, read from the data Forge
// already has. Nothing here is saved with the photo.
import { weightSeries, myBodyMeasures } from '../derived.js';
import { dailySeries, metricSeries } from '../withings/body.js';
import { pointOnOrBefore, nearestPoint } from './core.js';
import { weightToDisplay, weightUnit } from '../units.js';

/** { trendKg, fatKg } for a day; either may be null. */
export function bodyOn(day) {
  const w = pointOnOrBefore(weightSeries(), day);
  const fat = nearestPoint(dailySeries(metricSeries(myBodyMeasures(), 'fat_mass_kg')), day);
  return { trendKg: w ? w.trend : null, fatKg: fat ? fat.v : null };
}

export const fmtKg = (kg, units) => `${weightToDisplay(kg, units).toFixed(1)} ${weightUnit(units)}`;

/** Object URLs for stored blobs, cached so a screen can redraw without leaking; revokeAll() when leaving. */
const urls = new Map();
export function photoUrl(photo) {
  if (!urls.has(photo.id)) urls.set(photo.id, URL.createObjectURL(photo.blob));
  return urls.get(photo.id);
}
export function revokeAll() {
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
}
