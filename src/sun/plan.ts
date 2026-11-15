import { sunTimes, formatLocalTime, type SunTimes, type YMD } from './times';
import { zonedTimeToUtc } from './timezone';

const MIN = 60000;
const minutes = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / MIN);

export interface StartSuggestion { start: Date; end: Date; warning?: string }

export function suggestStart(opts: {
  times: SunTimes;
  shootMinutes: number;
  session: 'evening' | 'morning';
  /** Minutes of must-have / big-group shots to do first, in the best light. */
  mustHaveEarlyMinutes?: number;
}): StartSuggestion {
  const { times, shootMinutes, session, mustHaveEarlyMinutes } = opts;
  const tz = times.timeZone;
  const span = session === 'evening' ? times.goldenEvening : times.goldenMorning;
  const fallbackEnd = session === 'evening' ? times.sunset : times.sunrise;
  const gStart = span.start ?? (session === 'evening' ? times.solarNoon : null);
  const gEnd = span.end ?? fallbackEnd;
  const dur = shootMinutes * MIN;

  if (!gStart || !gEnd || gEnd <= gStart) {
    const start = new Date(times.solarNoon.getTime() - dur / 2);
    const why = times.polar === 'day' ? 'The sun does not set' : times.polar === 'night' ? 'The sun does not rise' : 'There is no golden hour';
    return { start, end: new Date(start.getTime() + dur), warning: `${why} on this date here, so there is no golden hour; the suggestion is centered on solar noon.` };
  }
  const goldenMin = minutes(gStart, gEnd);
  const label = session === 'evening' ? "tonight's" : "this morning's";

  if (shootMinutes <= goldenMin) {
    const start = session === 'evening' ? new Date(gEnd.getTime() - dur) : gStart;
    return { start, end: new Date(start.getTime() + dur) };
  }
  let start: Date;
  if (session === 'evening') {
    // Without must-haves: finish as golden hour ends. With them: begin as it starts so the big groups get the best light.
    start = mustHaveEarlyMinutes ? gStart : new Date(gEnd.getTime() - dur);
  } else {
    start = gStart;
  }
  const end = new Date(start.getTime() + dur);
  const warning = `Your ${shootMinutes}-minute list is longer than ${label} ${goldenMin}-minute golden hour; start at ${formatLocalTime(start, tz)} to get the big groups in the best light.`;
  return { start, end, warning };
}

export interface Countdown {
  state: 'during' | 'before' | 'after';
  /** Minutes until the current golden hour ends (during) or the next one starts (before); 0 after. */
  minutes: number;
  /** The relevant boundary instant (end when during, start when before). */
  until: Date | null;
  session: 'morning' | 'evening' | null;
}

export function goldenHourCountdown(now: Date, times: SunTimes): Countdown {
  const wins = ([['morning', times.goldenMorning], ['evening', times.goldenEvening]] as const)
    .filter(([, s]) => s.start && s.end) as unknown as ['morning' | 'evening', { start: Date; end: Date }][];
  for (const [session, w] of wins) {
    if (now >= w.start && now < w.end) return { state: 'during', minutes: Math.ceil((w.end.getTime() - now.getTime()) / MIN), until: w.end, session };
  }
  for (const [session, w] of wins) {
    if (now < w.start) return { state: 'before', minutes: Math.ceil((w.start.getTime() - now.getTime()) / MIN), until: w.start, session };
  }
  return { state: 'after', minutes: 0, until: null, session: null };
}

export interface DayOverview {
  date: YMD;
  iso: string;
  sunrise: Date | null;
  sunset: Date | null;
  goldenMorning: SunTimes['goldenMorning'];
  goldenEvening: SunTimes['goldenEvening'];
  polar?: 'day' | 'night';
}

export function daysOverview(startYMD: YMD, days: number, lat: number, lng: number, timeZone: string): DayOverview[] {
  const out: DayOverview[] = [];
  for (let i = 0; i < days; i++) {
    const u = new Date(Date.UTC(startYMD.y, startYMD.m - 1, startYMD.d + i));
    const date = { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate() };
    const t = sunTimes(date, lat, lng, timeZone);
    const iso = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    out.push({ date, iso, sunrise: t.sunrise, sunset: t.sunset, goldenMorning: t.goldenMorning, goldenEvening: t.goldenEvening, ...(t.polar ? { polar: t.polar } : {}) });
  }
  return out;
}

/** Convenience: a local wall-clock time on a date as an instant. */
export const localTime = zonedTimeToUtc;
