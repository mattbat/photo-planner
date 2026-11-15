/**
 * Units for what the weather shows (L7), converted when displayed. The saved
 * forecast stays in the metric units Open-Meteo returns, so changing units
 * never needs a new fetch. US (°F, mph, inches) is the default.
 */

export type Units = 'us' | 'metric';

export const UNIT_LABELS: Record<Units, string> = { us: 'US (°F, mph)', metric: 'Metric (°C, km/h)' };

export const toFahrenheit = (c: number) => (c * 9) / 5 + 32;
export const toMph = (kmh: number) => kmh * 0.621371;
export const toInches = (mm: number) => mm / 25.4;

/** "72°F" or "22°C", whole degrees; "–" when there is no reading. */
export function formatTemp(celsius: number | null, units: Units): string {
  if (celsius === null) return '–';
  return units === 'us' ? `${Math.round(toFahrenheit(celsius))}°F` : `${Math.round(celsius)}°C`;
}

/** "12 mph" or "19 km/h", whole numbers. */
export function formatWind(kmh: number | null, units: Units): string {
  if (kmh === null) return '–';
  return units === 'us' ? `${Math.round(toMph(kmh))} mph` : `${Math.round(kmh)} km/h`;
}

/** An amount of rain or snow: "0.1 in" or "2.5 mm". */
export function formatPrecip(mm: number | null, units: Units): string {
  if (mm === null) return '–';
  return units === 'us' ? `${Math.round(toInches(mm) * 100) / 100} in` : `${Math.round(mm * 10) / 10} mm`;
}

/** Older settings have no units, which counts as US. */
export const unitsOf = (value: Units | undefined): Units => (value === 'metric' ? 'metric' : 'us');
