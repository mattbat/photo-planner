/**
 * Light helpers for the shoot screens (§10): timeline segments, the shoot's
 * span on the day, time formatting and forecast summaries. Pure: the sun maths
 * is in `src/sun`.
 */
import type { ForecastHour, ShootForecast } from '../data/types';
import { formatLocalTime, localDayBounds, sunPosition, sunTimes, zonedTimeToUtc, type Countdown, type Span, type SunTimes, type YMD } from '../sun';

export function parseYMD(iso: string): YMD {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return { y, m, d };
}

/** Whole days from `from` to `to` (both yyyy-mm-dd). */
export function daysBetween(from: string, to: string): number {
  const a = parseYMD(from), b = parseYMD(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

/** Forecasts only reach about two weeks ahead (L7). */
export function inForecastRange(date: string, today: string, days = 14): boolean {
  const n = daysBetween(today, date);
  return n >= 0 && n <= days;
}

// --- Timeline (L2) ---------------------------------------------------------

export type LightKind = 'night' | 'blue' | 'golden' | 'day';

export interface TimelineSegment {
  kind: LightKind;
  start: Date;
  end: Date;
  /** Position along the day, 0 to 1. */
  from: number;
  to: number;
}

/** What the light is at a sun altitude: golden is -4° to 6°, blue -6° to -4° (L3). */
export function kindAtAltitude(altDeg: number): LightKind {
  if (altDeg > 6) return 'day';
  if (altDeg >= -4) return 'golden';
  if (altDeg >= -6) return 'blue';
  return 'night';
}

/**
 * The local day as consecutive coloured segments. Boundaries are the exact
 * golden and blue hour times; the colour of each stretch comes from the sun's
 * height at its middle, so polar days and nights come out right.
 */
export function dayTimeline(times: SunTimes): TimelineSegment[] {
  const { start, end } = localDayBounds(times.date, times.timeZone);
  const t0 = start.getTime(), t1 = end.getTime();
  const marks = [
    times.blueMorning.start, times.goldenMorning.start, times.goldenMorning.end,
    times.goldenEvening.start, times.goldenEvening.end, times.blueEvening.end,
    times.blueMorning.end, times.blueEvening.start,
  ]
    .filter((d): d is Date => d !== null && d.getTime() > t0 && d.getTime() < t1)
    .map((d) => d.getTime());
  const cuts = [t0, ...[...new Set(marks)].sort((a, b) => a - b), t1];
  const out: TimelineSegment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i]!, b = cuts[i + 1]!;
    const kind = kindAtAltitude(sunPosition(new Date((a + b) / 2), times.lat, times.lng).altitudeDeg);
    const last = out[out.length - 1];
    if (last && last.kind === kind) {
      last.end = new Date(b);
      last.to = (b - t0) / (t1 - t0);
    } else {
      out.push({ kind, start: new Date(a), end: new Date(b), from: (a - t0) / (t1 - t0), to: (b - t0) / (t1 - t0) });
    }
  }
  return out;
}

export interface ShootSpan {
  start: Date;
  end: Date;
  from: number;
  to: number;
}

/** The planned shoot (start time plus estimated minutes) as a stretch of the day, clipped to it. */
export function shootSpan(times: SunTimes, startTime: string | undefined, minutes: number): ShootSpan | null {
  if (!startTime || !/^\d{1,2}:\d{2}$/.test(startTime)) return null;
  const { start: d0, end: d1 } = localDayBounds(times.date, times.timeZone);
  const [h = 0, m = 0] = startTime.split(':').map(Number);
  const start = zonedTimeToUtc(times.date.y, times.date.m, times.date.d, h, m, times.timeZone);
  const end = new Date(start.getTime() + Math.max(minutes, 5) * 60000);
  const len = d1.getTime() - d0.getTime();
  const from = Math.max(0, (start.getTime() - d0.getTime()) / len);
  const to = Math.min(1, (end.getTime() - d0.getTime()) / len);
  return to > from ? { start, end, from, to } : null;
}

/** Local clock time (HH:mm) of an instant in a zone, for the start time field. */
export function toHHmm(date: Date, timeZone: string): string {
  const t = formatLocalTime(date, timeZone);
  const [clock = '12:00', ap = 'AM'] = t.split(' ');
  const [h = 12, m = '00'] = clock.split(':');
  const h24 = (Number(h) % 12) + (ap === 'PM' ? 12 : 0);
  return `${String(h24).padStart(2, '0')}:${m}`;
}

// --- The session that matters (L2, L3) --------------------------------------

export type LightSession = 'evening' | 'morning';

/** Evening by default; morning when the planned start is before noon (L2). */
export function defaultSession(startTime: string | undefined): LightSession {
  const m = startTime && /^\d{1,2}:\d{2}$/.test(startTime) ? Number(startTime.split(':')[0]) : 18;
  return m < 12 ? 'morning' : 'evening';
}

const MIN = 60000;

export type WindowKind = 'day' | 'golden' | 'dark';

export interface WindowSegment {
  kind: WindowKind;
  start: Date;
  end: Date;
  /** Position along the window, 0 to 1. */
  from: number;
  to: number;
}

export interface SessionWindow {
  start: Date;
  end: Date;
  /** The session's golden hour, or null when the sun has none on this date. */
  golden: { start: Date; end: Date } | null;
  /** Sunset (evening) or sunrise (morning), or null when the sun doesn't do it. */
  sunEvent: Date | null;
  segments: WindowSegment[];
}

/**
 * The stretch of the day worth drawing (L2): about 2.5 hours before golden
 * hour starts to 30 minutes after it ends (the other way round for the
 * morning), widened to hold the planned shoot. With no golden hour it is
 * built round the sunset or sunrise, or solar noon. Segments are daylight,
 * golden hour, and "dark" (anything lower than golden hour): blue hour is not
 * shown separately.
 */
export function sessionWindow(times: SunTimes, session: LightSession, shoot?: { start: Date; end: Date } | null): SessionWindow {
  const g = session === 'evening' ? times.goldenEvening : times.goldenMorning;
  const golden = g.start && g.end && g.end > g.start ? { start: g.start, end: g.end } : null;
  const sunEvent = session === 'evening' ? times.sunset : times.sunrise;
  const anchor = golden ? null : (sunEvent ?? times.solarNoon);
  const [before, after] = session === 'evening' ? [150, 30] : [30, 150];
  let start = golden ? golden.start.getTime() - before * MIN : anchor!.getTime() - before * MIN;
  let end = golden ? golden.end.getTime() + after * MIN : anchor!.getTime() + after * MIN;
  if (shoot) {
    start = Math.min(start, shoot.start.getTime() - 10 * MIN);
    end = Math.max(end, shoot.end.getTime() + 10 * MIN);
  }
  // Stay inside the local day.
  const day = localDayBounds(times.date, times.timeZone);
  start = Math.max(start, day.start.getTime());
  end = Math.min(end, day.end.getTime());
  const cuts = [start, ...[golden?.start, golden?.end].filter((d): d is Date => !!d).map((d) => d.getTime()).filter((t) => t > start && t < end), end].sort((a, b) => a - b);
  const len = end - start;
  const segments: WindowSegment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i]!, b = cuts[i + 1]!;
    const alt = sunPosition(new Date((a + b) / 2), times.lat, times.lng).altitudeDeg;
    const kind: WindowKind = alt > 6 ? 'day' : alt >= -4 ? 'golden' : 'dark';
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) {
      last.end = new Date(b);
      last.to = (b - start) / len;
    } else segments.push({ kind, start: new Date(a), end: new Date(b), from: (a - start) / len, to: (b - start) / len });
  }
  return { start: new Date(start), end: new Date(end), golden, sunEvent, segments };
}

/** Where an instant sits along a window, 0 to 1, or null outside it. */
export function windowPosition(w: Pick<SessionWindow, 'start' | 'end'>, at: Date): number | null {
  const t = at.getTime(), a = w.start.getTime(), b = w.end.getTime();
  return t < a || t > b ? null : (t - a) / (b - a);
}

/** Whole-hour tick marks along a window, labelled in the zone ("4 PM"). Every other hour when there are many. */
export function hourTicks(w: Pick<SessionWindow, 'start' | 'end'>, timeZone: string): { at: number; label: string }[] {
  const a = w.start.getTime(), b = w.end.getTime();
  const mm = Number(formatLocalTime(w.start, timeZone).split(':')[1]!.slice(0, 2));
  const secs = w.start.getUTCSeconds();
  let t = a + (((60 - mm) % 60) * 60 - secs) * 1000;
  if (t < a - 1000) t += 60 * MIN;
  const all: { at: number; label: string }[] = [];
  for (; t <= b; t += 60 * MIN) all.push({ at: Math.min(1, Math.max(0, (t - a) / (b - a))), label: formatLocalTime(new Date(t), timeZone).replace(':00 ', ' ') });
  return all.length > 6 ? all.filter((_, i) => i % 2 === 0) : all;
}

/** "4:56–5:48 PM", or "11:40 AM–12:30 PM" when the two sit either side of noon. */
export function formatRange(start: Date, end: Date, timeZone: string): string {
  const [a, ap = ''] = formatLocalTime(start, timeZone).split(' ');
  const [b, bp = ''] = formatLocalTime(end, timeZone).split(' ');
  return ap === bp ? `${a}–${b} ${bp}` : `${a} ${ap}–${b} ${bp}`;
}

/** The headline: "Golden hour 4:56–5:48 PM · sunset 5:32 PM" (L2). */
export function lightHeadline(times: SunTimes, session: LightSession): string {
  const tz = times.timeZone;
  const g = session === 'evening' ? times.goldenEvening : times.goldenMorning;
  const event = session === 'evening' ? times.sunset : times.sunrise;
  const word = session === 'evening' ? 'sunset' : 'sunrise';
  const parts: string[] = [];
  if (g.start && g.end && g.end > g.start) parts.push(`Golden hour ${formatRange(g.start, g.end, tz)}`);
  else parts.push(times.polar === 'day' ? 'The sun doesn’t set today' : times.polar === 'night' ? 'The sun doesn’t rise today' : 'No golden hour on this date');
  if (event) parts.push(`${word} ${formatLocalTime(event, tz)}`);
  return parts.join(' · ');
}

const mins = (ms: number) => Math.max(1, Math.round(ms / MIN));

/** How the shoot sits against golden hour, in one sentence, or null when there is nothing to compare. */
export function shootFit(golden: { start: Date; end: Date } | null, shoot: { start: Date; end: Date } | null): string | null {
  if (!golden || !shoot) return null;
  const gs = golden.start.getTime(), ge = golden.end.getTime(), ss = shoot.start.getTime(), se = shoot.end.getTime();
  if (ss >= gs && se <= ge) return '✓ All of your shoot is in golden hour';
  if (se <= gs) return `Your shoot ends ${mins(gs - se)} min before golden hour starts`;
  if (ss >= ge) return `Your shoot starts ${mins(ss - ge)} min after golden hour ends`;
  if (ss < gs && se > ge) return `Your shoot starts ${mins(gs - ss)} min before golden hour and ends ${mins(se - ge)} min after it`;
  if (ss < gs) return `Your shoot starts ${mins(gs - ss)} min before golden hour and ends during it`;
  return `Your shoot starts during golden hour and ends ${mins(se - ge)} min after it`;
}

/** "Chicago" for "America/Chicago"; used in "Times are local to Chicago". */
export const zoneCity = (timeZone: string): string => (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ');

// --- Times list (L2) -------------------------------------------------------

export interface LightRow {
  key: string;
  label: string;
  text: string;
  /** True when the sun does not do this on this date. */
  missing: boolean;
}

const at = (d: Date | null, tz: string) => (d ? formatLocalTime(d, tz) : null);

/** "5:02 PM to 5:40 PM", "until 7:10 AM", "from 5:02 PM", or null when it doesn't happen. */
export function formatSpan(span: Span, timeZone: string): string | null {
  const a = at(span.start, timeZone), b = at(span.end, timeZone);
  if (a && b) return `${a} to ${b}`;
  if (a) return `from ${a}`;
  if (b) return `until ${b}`;
  return null;
}

/** Everything in time order, with a plain reason where the sun doesn't do it (polar days and nights). */
export function lightRows(times: SunTimes): LightRow[] {
  const tz = times.timeZone;
  const none = times.polar === 'day' ? 'Sun doesn’t set' : times.polar === 'night' ? 'Sun doesn’t rise' : 'None on this date';
  const span = (key: string, label: string, s: Span): LightRow => {
    const text = formatSpan(s, tz);
    return { key, label, text: text ?? none, missing: text === null };
  };
  const point = (key: string, label: string, d: Date | null): LightRow => {
    const text = at(d, tz);
    return { key, label, text: text ?? none, missing: text === null };
  };
  return [
    span('blue-am', 'Blue hour (morning)', times.blueMorning),
    point('sunrise', 'Sunrise', times.sunrise),
    span('golden-am', 'Golden hour (morning)', times.goldenMorning),
    { key: 'noon', label: 'Solar noon', text: formatLocalTime(times.solarNoon, tz), missing: false },
    span('golden-pm', 'Golden hour (evening)', times.goldenEvening),
    point('sunset', 'Sunset', times.sunset),
    span('blue-pm', 'Blue hour (evening)', times.blueEvening),
  ];
}

/** The golden hour to show in a list row or header: this evening's, else the morning's, as "5:02 PM". */
export function goldenHourStart(times: SunTimes): string | null {
  const s = times.goldenEvening.start ?? times.goldenMorning.start;
  return s ? formatLocalTime(s, times.timeZone) : null;
}

// --- Countdown (L8) --------------------------------------------------------

export function durationText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function countdownText(c: Countdown): string {
  if (c.state === 'during') return `Golden hour: ${durationText(c.minutes)} left`;
  if (c.state === 'before') return `Golden hour starts in ${durationText(c.minutes)}`;
  return 'Golden hour is over';
}

// --- Sun direction (L5) ----------------------------------------------------

export function normalizeDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** Compass heading from a device orientation event, or null when it has none. */
export function headingFromEvent(e: { webkitCompassHeading?: number | null; alpha?: number | null; absolute?: boolean }): number | null {
  if (typeof e.webkitCompassHeading === 'number') return normalizeDeg(e.webkitCompassHeading);
  if (e.absolute && typeof e.alpha === 'number') return normalizeDeg(360 - e.alpha);
  return null;
}

// --- Coordinates (L1) ------------------------------------------------------

export function parseCoordinates(lat: string, lon: string): { latitude: number; longitude: number } | { error: string } {
  const la = Number(lat.trim().replace(',', '.')), lo = Number(lon.trim().replace(',', '.'));
  if (!lat.trim() || !lon.trim() || Number.isNaN(la) || Number.isNaN(lo)) return { error: 'Enter both numbers, like 41.88 and -87.63.' };
  if (Math.abs(la) > 90) return { error: 'Latitude is between -90 and 90.' };
  if (Math.abs(lo) > 180) return { error: 'Longitude is between -180 and 180.' };
  return { latitude: la, longitude: lo };
}

export const roundCoord = (n: number) => Math.round(n * 10000) / 10000;

// --- Forecast (L7) ---------------------------------------------------------

export interface ForecastSummary {
  hours: ForecastHour[];
  cloudPercent: number | null;
  rainPercent: number | null;
  windKmh: number | null;
  tempC: number | null;
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
const max = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round(Math.max(...v)) : null;
};
const minutesOf = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
};

/** The forecast hours the shoot touches (the hour it starts in to the hour it ends in); with no start time, 8:00 to 20:00. */
export function forecastForShoot(f: ShootForecast, startTime: string | undefined, minutes: number): ForecastSummary {
  const from = startTime ? Math.floor(minutesOf(startTime) / 60) * 60 : 8 * 60;
  const to = startTime ? minutesOf(startTime) + Math.max(minutes, 1) : 20 * 60;
  const hours = f.hours.filter((h) => {
    const t = minutesOf(h.time);
    return t >= from && t < Math.max(to, from + 60);
  });
  return {
    hours,
    cloudPercent: avg(hours.map((h) => h.cloudPercent)),
    rainPercent: max(hours.map((h) => h.rainPercent)),
    windKmh: max(hours.map((h) => h.windKmh)),
    tempC: avg(hours.map((h) => h.tempC)),
  };
}

export function fetchedText(fetchedAt: number, now: number = Date.now()): string {
  const mins = Math.round((now - fetchedAt) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

/** "Golden hour 5:02 PM" for a shoot's date and place, for list rows and headers (null when the sun has none). */
export function goldenHourLabel(date: string, place: { latitude: number; longitude: number; timeZone?: string | undefined }, fallbackZone: string): string | null {
  const t = sunTimes(parseYMD(date), place.latitude, place.longitude, place.timeZone ?? fallbackZone);
  const g = goldenHourStart(t);
  return g ? `Golden hour ${g}` : null;
}
