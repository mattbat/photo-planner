/** Time zone helpers (pure; Intl only). */

export interface YMD { y: number; m: number; d: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(date: Date, timeZone: string) {
  const o: Record<string, number> = {};
  for (const p of fmt(timeZone).formatToParts(date)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year!, m: o.month!, d: o.day!, hh: o.hour! % 24, mm: o.minute!, ss: o.second! };
}

/** Offset from UTC in minutes (east positive) of `timeZone` at the instant `date`. */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant at which the wall clock in `timeZone` reads the given time. DST gaps resolve forward. */
export function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let t = naive - tzOffsetMinutes(new Date(naive), timeZone) * 60000;
  t = naive - tzOffsetMinutes(new Date(t), timeZone) * 60000;
  return new Date(t);
}

/** Local calendar date of an instant in a zone. */
export function localYMD(date: Date, timeZone: string): YMD {
  const p = zonedParts(date, timeZone);
  return { y: p.y, m: p.m, d: p.d };
}

/** The device's IANA time zone. */
export function guessTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
