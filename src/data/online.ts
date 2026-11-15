/**
 * The app's only network calls besides its own update check (T9). Each runs
 * only when the person taps a button; none is needed to use the app. Kept as
 * small functions so tests can mock `fetch`.
 */
import type { ForecastHour } from './types';

export class NeedsConnection extends Error {
  constructor() {
    super('Needs a connection');
    this.name = 'NeedsConnection';
  }
}

export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

async function getJson(url: string, timeoutMs = 10000): Promise<unknown> {
  if (!isOnline()) throw new NeedsConnection();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`The service answered ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e instanceof TypeError || (e instanceof DOMException && e.name === 'AbortError')) throw new NeedsConnection();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface Place {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  timeZone?: string;
}

/** Looks a place name up (L1). */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (!q) return [];
  const json = (await getJson(`${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=8&language=en&format=json`)) as {
    results?: { name: string; latitude: number; longitude: number; timezone?: string; admin1?: string; country?: string }[];
  };
  return (json.results ?? []).map((r) => {
    const address = [r.admin1, r.country].filter(Boolean).join(', ');
    return {
      name: r.name,
      ...(address ? { address } : {}),
      latitude: r.latitude,
      longitude: r.longitude,
      ...(r.timezone ? { timeZone: r.timezone } : {}),
    };
  });
}

/** The IANA time zone at a point, from the forecast service's `timezone=auto` (L1). */
export async function fetchTimeZone(latitude: number, longitude: number): Promise<string | undefined> {
  const json = (await getJson(`${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&timezone=auto&forecast_days=1&daily=sunrise`)) as {
    timezone?: string;
  };
  return json.timezone;
}

/** Hourly forecast for one date at a place (L7). */
export async function fetchForecast(latitude: number, longitude: number, date: string): Promise<{ timeZone?: string; hours: ForecastHour[] }> {
  const url =
    `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&timezone=auto&start_date=${date}&end_date=${date}` +
    '&hourly=cloud_cover,precipitation_probability,wind_speed_10m,temperature_2m';
  const json = (await getJson(url)) as {
    timezone?: string;
    hourly?: {
      time?: string[];
      cloud_cover?: (number | null)[];
      precipitation_probability?: (number | null)[];
      wind_speed_10m?: (number | null)[];
      temperature_2m?: (number | null)[];
    };
  };
  const h = json.hourly;
  const hours: ForecastHour[] = (h?.time ?? []).map((t, i) => ({
    time: t.slice(11, 16),
    cloudPercent: h?.cloud_cover?.[i] ?? null,
    rainPercent: h?.precipitation_probability?.[i] ?? null,
    windKmh: h?.wind_speed_10m?.[i] ?? null,
    tempC: h?.temperature_2m?.[i] ?? null,
  }));
  return { ...(json.timezone ? { timeZone: json.timezone } : {}), hours };
}

/** Where the phone is now (L1). Rejects with a plain-words message. */
export function currentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This phone can’t share its location here.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? 'Location is switched off for this app. Allow it in Settings, or search for the place.'
              : 'Couldn’t get your location. Try again or search for the place.',
          ),
        ),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  });
}
