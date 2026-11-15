import { sunPosition } from './position';
import { type YMD, zonedParts, zonedTimeToUtc } from './timezone';

export type { YMD };
export interface Span { start: Date | null; end: Date | null }
export interface SunTimes {
  date: YMD;
  timeZone: string;
  lat: number;
  lng: number;
  solarNoon: Date;
  sunrise: Date | null;
  sunset: Date | null;
  goldenMorning: Span;
  goldenEvening: Span;
  blueMorning: Span;
  blueEvening: Span;
  civilDawn: Date | null;
  civilDusk: Date | null;
  /** 'day' = sun never sets (midnight sun); 'night' = sun never rises. */
  polar?: 'day' | 'night';
}

export const SUNRISE_ALT = -0.833;
export const GOLDEN_TOP = 6;
export const GOLDEN_BOTTOM = -4;
export const BLUE_BOTTOM = -6;

const STEP_MS = 10 * 60000;

/** Local-midnight to next local-midnight (23/24/25 h on DST days) for a calendar date in a zone. */
export function localDayBounds(date: YMD, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(date.y, date.m, date.d, 0, 0, timeZone),
    end: zonedTimeToUtc(date.y, date.m, date.d + 1, 0, 0, timeZone),
  };
}

export function sunTimes(date: YMD, lat: number, lng: number, timeZone: string): SunTimes {
  const { start, end } = localDayBounds(date, timeZone);
  const t0 = start.getTime(), t1 = end.getTime();
  const alt = (t: number) => sunPosition(new Date(t), lat, lng).altitudeDeg;

  const ts: number[] = [];
  for (let t = t0; t < t1; t += STEP_MS) ts.push(t);
  ts.push(t1);
  const as = ts.map(alt);

  // Solar noon = altitude maximum; refine by ternary search around the best sample.
  let bi = 0;
  as.forEach((a, i) => { if (a > as[bi]!) bi = i; });
  let lo = ts[Math.max(0, bi - 1)]!, hi = ts[Math.min(ts.length - 1, bi + 1)]!;
  for (let i = 0; i < 40; i++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (alt(a) < alt(b)) lo = a; else hi = b;
  }
  const noonT = Math.round((lo + hi) / 2);
  const maxAlt = alt(noonT);

  const cross = (from: number, to: number, h: number, rising: boolean): Date | null => {
    for (let i = from; i < to; i++) {
      const a = as[i]! - h, b = as[i + 1]! - h;
      if (rising ? a < 0 && b >= 0 : a >= 0 && b < 0) {
        let l = ts[i]!, r = ts[i + 1]!;
        while (r - l > 500) {
          const m = (l + r) / 2;
          const above = alt(m) - h >= 0;
          if (above === rising) r = m; else l = m;
        }
        return new Date(Math.round((l + r) / 2));
      }
    }
    return null;
  };
  let ni = ts.findIndex((t) => t >= noonT);
  if (ni < 0) ni = ts.length - 1;
  const rise = (h: number) => cross(0, ni, h, true);
  const set = (h: number) => cross(ni, ts.length - 1, h, false);

  const sunrise = rise(SUNRISE_ALT), sunset = set(SUNRISE_ALT);
  const res: SunTimes = {
    date, timeZone, lat, lng,
    solarNoon: new Date(noonT),
    sunrise, sunset,
    goldenMorning: { start: rise(GOLDEN_BOTTOM), end: rise(GOLDEN_TOP) },
    goldenEvening: { start: set(GOLDEN_TOP), end: set(GOLDEN_BOTTOM) },
    blueMorning: { start: rise(BLUE_BOTTOM), end: rise(GOLDEN_BOTTOM) },
    blueEvening: { start: set(GOLDEN_BOTTOM), end: set(BLUE_BOTTOM) },
    civilDawn: rise(BLUE_BOTTOM),
    civilDusk: set(BLUE_BOTTOM),
  };
  if (!sunrise && !sunset) res.polar = maxAlt > SUNRISE_ALT ? 'day' : 'night';
  return res;
}

/** The one clock format of the app, US style: "7:42 PM" for 19 hours 42 minutes. Every time shown goes through here. */
export function formatClock(hh: number, mm: number): string {
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

/** "7:42 PM" in the given zone. */
export function formatLocalTime(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return formatClock(p.hh, p.mm);
}

export { sunBearingAt, compassLabel } from './position';
