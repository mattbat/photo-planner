import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { goldenHourCountdown, sunTimes } from '../sun';
import {
  countdownText,
  defaultSession,
  formatRange,
  hourTicks,
  lightHeadline,
  sessionWindow,
  shootFit,
  windowPosition,
  zoneCity,
  dayTimeline,
  daysBetween,
  durationText,
  forecastForShoot,
  formatSpan,
  goldenHourStart,
  headingFromEvent,
  inForecastRange,
  lightRows,
  parseCoordinates,
  shootSpan,
  toHHmm,
  fetchedText,
} from './light';

const chicago = sunTimes({ y: 2026, m: 6, d: 21 }, 41.88, -87.63, 'America/Chicago');
const tromsoSummer = sunTimes({ y: 2026, m: 6, d: 21 }, 69.65, 18.96, 'Europe/Oslo');
const tromsoWinter = sunTimes({ y: 2026, m: 12, d: 21 }, 69.65, 18.96, 'Europe/Oslo');

describe('dayTimeline', () => {
  it('covers the whole day in order, night to night, with golden and blue hours', () => {
    const segs = dayTimeline(chicago);
    expect(segs[0]!.from).toBe(0);
    expect(segs.at(-1)!.to).toBe(1);
    segs.forEach((s, i) => {
      if (i > 0) expect(s.from).toBeCloseTo(segs[i - 1]!.to, 9);
      if (i > 0) expect(s.kind).not.toBe(segs[i - 1]!.kind);
    });
    const kinds = segs.map((s) => s.kind);
    expect(kinds[0]).toBe('night');
    expect(kinds).toContain('golden');
    expect(kinds).toContain('blue');
    expect(kinds).toContain('day');
    expect(kinds.filter((k) => k === 'golden')).toHaveLength(2);
  });

  it('is one color on a polar day and a polar night', () => {
    expect(dayTimeline(tromsoSummer).every((s) => s.kind === 'day' || s.kind === 'golden')).toBe(true);
    expect(dayTimeline(tromsoWinter).some((s) => s.kind === 'day')).toBe(false);
  });
});

describe('shootSpan', () => {
  it('puts the shoot on the day from its start time and length', () => {
    const s = shootSpan(chicago, '18:00', 90)!;
    expect(s.to - s.from).toBeCloseTo(90 / 1440, 3);
    expect(s.from).toBeCloseTo(0.75, 3);
    expect(toHHmm(s.end, 'America/Chicago')).toBe('19:30');
  });
  it('clips at midnight, and has none without a start time', () => {
    expect(shootSpan(chicago, '23:30', 120)!.to).toBe(1);
    expect(shootSpan(chicago, undefined, 60)).toBeNull();
    expect(shootSpan(chicago, 'soon', 60)).toBeNull();
  });
});

describe('formatting', () => {
  it('lists the times in order, with every row filled on an ordinary day', () => {
    const rows = lightRows(chicago);
    expect(rows.map((r) => r.key)).toEqual(['blue-am', 'sunrise', 'golden-am', 'noon', 'golden-pm', 'sunset', 'blue-pm']);
    expect(rows.every((r) => !r.missing)).toBe(true);
    expect(rows.find((r) => r.key === 'sunset')!.text).toMatch(/^\d{1,2}:\d{2} PM$/);
    expect(rows.find((r) => r.key === 'golden-pm')!.text).toMatch(/PM to .* PM/);
  });
  it('says why on polar days, and handles half-missing spans', () => {
    const night = lightRows(tromsoWinter);
    expect(night.find((r) => r.key === 'sunrise')).toMatchObject({ missing: true, text: 'Sun doesn’t rise' });
    expect(lightRows(tromsoSummer).find((r) => r.key === 'sunset')).toMatchObject({ missing: true, text: 'Sun doesn’t set' });
    const d = new Date('2026-06-21T20:00:00Z');
    expect(formatSpan({ start: d, end: null }, 'UTC')).toBe('from 8:00 PM');
    expect(formatSpan({ start: null, end: d }, 'UTC')).toBe('until 8:00 PM');
    expect(formatSpan({ start: null, end: null }, 'UTC')).toBeNull();
  });
  it('gives the golden hour start for lists, and null when there is none', () => {
    expect(goldenHourStart(chicago)).toMatch(/PM$/);
    expect(goldenHourStart(tromsoWinter)).not.toBe('');
  });
  it('writes durations and the countdown banner', () => {
    expect(durationText(34)).toBe('34 min');
    expect(durationText(70)).toBe('1 h 10 min');
    expect(durationText(120)).toBe('2 h');
    const w = chicago.goldenEvening;
    const minus = (m: number) => new Date(w.end!.getTime() - m * 60000);
    expect(countdownText(goldenHourCountdown(minus(34), chicago))).toBe('Golden hour: 34 min left');
    expect(countdownText(goldenHourCountdown(new Date(w.start!.getTime() - 70 * 60000), chicago))).toBe('Golden hour starts in 1 h 10 min');
    expect(countdownText(goldenHourCountdown(new Date(w.end!.getTime() + 60000), chicago))).toBe('Golden hour is over');
  });
});

describe('small helpers', () => {
  it('counts days and the forecast window', () => {
    expect(daysBetween('2026-11-15', '2026-11-20')).toBe(5);
    expect(inForecastRange('2026-11-29', '2026-11-15')).toBe(true);
    expect(inForecastRange('2026-11-30', '2026-11-15')).toBe(false);
    expect(inForecastRange('2026-11-14', '2026-11-15')).toBe(false);
  });
  it('validates typed coordinates', () => {
    expect(parseCoordinates('41.88', '-87,63')).toEqual({ latitude: 41.88, longitude: -87.63 });
    expect(parseCoordinates('', '1')).toHaveProperty('error');
    expect(parseCoordinates('91', '1')).toHaveProperty('error');
    expect(parseCoordinates('1', '181')).toHaveProperty('error');
    expect(parseCoordinates('x', '1')).toHaveProperty('error');
  });
  it('reads a compass heading from iOS and Android events', () => {
    expect(headingFromEvent({ webkitCompassHeading: 90 })).toBe(90);
    expect(headingFromEvent({ alpha: 90, absolute: true })).toBe(270);
    expect(headingFromEvent({ alpha: 90, absolute: false })).toBeNull();
    expect(headingFromEvent({})).toBeNull();
  });
  it('says how old a forecast is', () => {
    const now = 10_000_000_000;
    expect(fetchedText(now - 10_000, now)).toBe('just now');
    expect(fetchedText(now - 5 * 60000, now)).toBe('5 min ago');
    expect(fetchedText(now - 3 * 3600000, now)).toBe('3 h ago');
    expect(fetchedText(now - 2 * 86400000, now)).toBe('2 days ago');
  });
});

describe('forecastForShoot', () => {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    time: `${String(h).padStart(2, '0')}:00`,
    cloudPercent: h * 2,
    rainPercent: h === 17 ? 60 : 10,
    windKmh: 10 + h,
    tempC: 10,
  }));
  const f = { fetchedAt: 1, date: '2026-11-20', latitude: 1, longitude: 1, hours };
  it('summarizes the hours the shoot touches', () => {
    const s = forecastForShoot(f, '16:30', 100);
    expect(s.hours.map((h) => h.time)).toEqual(['16:00', '17:00', '18:00']);
    expect(s.rainPercent).toBe(60);
    expect(s.windKmh).toBe(28);
    expect(s.cloudPercent).toBe(34);
  });
  it('falls back to the daytime with no start time, and copes with missing numbers', () => {
    expect(forecastForShoot(f, undefined, 60).hours).toHaveLength(12);
    const empty = forecastForShoot({ ...f, hours: [{ time: '09:00', cloudPercent: null, rainPercent: null, windKmh: null, tempC: null }] }, '09:00', 30);
    expect(empty.cloudPercent).toBeNull();
    expect(empty.windKmh).toBeNull();
  });
});

describe('the session window (L2)', () => {
  const MIN = 60000;
  it('defaults to the evening, and the morning for a start before noon', () => {
    expect(defaultSession(undefined)).toBe('evening');
    expect(defaultSession('09:30')).toBe('morning');
    expect(defaultSession('11:59')).toBe('morning');
    expect(defaultSession('12:00')).toBe('evening');
    expect(defaultSession('nonsense')).toBe('evening');
  });

  it('runs from about 2.5 hours before golden hour to 30 minutes after it (evening)', () => {
    const w = sessionWindow(chicago, 'evening');
    const g = chicago.goldenEvening;
    expect(w.golden).toEqual({ start: g.start, end: g.end });
    expect((g.start!.getTime() - w.start.getTime()) / MIN).toBeCloseTo(150, 0);
    expect((w.end.getTime() - g.end!.getTime()) / MIN).toBeCloseTo(30, 0);
    expect(w.sunEvent).toEqual(chicago.sunset);
    expect(w.segments.map((s) => s.kind)).toEqual(['day', 'golden', 'dark']);
    expect(w.segments[0]!.from).toBe(0);
    expect(w.segments.at(-1)!.to).toBe(1);
  });

  it('mirrors it for the morning: dark, then golden, then daylight', () => {
    const w = sessionWindow(chicago, 'morning');
    expect((chicago.goldenMorning.start!.getTime() - w.start.getTime()) / MIN).toBeCloseTo(30, 0);
    expect(w.segments.map((s) => s.kind)).toEqual(['dark', 'golden', 'day']);
    expect(w.sunEvent).toEqual(chicago.sunrise);
  });

  it('widens to hold a shoot that is longer or earlier than the window', () => {
    const base = sessionWindow(chicago, 'evening');
    const early = { start: new Date(base.start.getTime() - 90 * MIN), end: new Date(base.start.getTime() + 20 * MIN) };
    const w = sessionWindow(chicago, 'evening', early);
    expect(w.start.getTime()).toBeLessThan(base.start.getTime());
    expect(windowPosition(w, early.start)).toBeGreaterThan(0);
    expect(windowPosition(w, early.end)).toBeLessThan(1);
    const late = sessionWindow(chicago, 'evening', { start: base.end, end: new Date(base.end.getTime() + 60 * MIN) });
    expect(late.end.getTime()).toBeGreaterThan(base.end.getTime());
  });

  it('copes with no golden hour: midnight sun, polar night and an ordinary window around the event', () => {
    const summer = sessionWindow(tromsoSummer, 'evening');
    expect(summer.segments.length).toBeGreaterThan(0);
    expect(summer.segments.every((s) => s.kind !== 'dark')).toBe(true);
    const winter = sessionWindow(tromsoWinter, 'evening');
    expect(winter.golden).toBeNull();
    expect(winter.sunEvent).toBeNull();
    expect(winter.segments.every((s) => s.kind !== 'day')).toBe(true);
    expect(lightHeadline(tromsoWinter, 'evening')).toBe('The sun doesn’t rise today');
    expect(lightHeadline(tromsoSummer, 'morning')).toMatch(/doesn’t set/);
  });

  it('property: segments tile the window from 0 to 1 in order, for any date and place', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }), fc.double({ min: -66, max: 66, noNaN: true }), fc.constantFrom('evening', 'morning' as const), fc.integer({ min: 0, max: 600 }), (m, d, lat, session, off) => {
        const t = sunTimes({ y: 2026, m, d }, lat, 10, 'Europe/Berlin');
        const shoot = { start: new Date(t.solarNoon.getTime() + off * MIN), end: new Date(t.solarNoon.getTime() + (off + 45) * MIN) };
        const w = sessionWindow(t, session, off % 2 ? shoot : null);
        expect(w.end.getTime()).toBeGreaterThan(w.start.getTime());
        let at = 0;
        for (const s of w.segments) {
          expect(s.from).toBeCloseTo(at, 9);
          expect(s.to).toBeGreaterThan(s.from);
          at = s.to;
        }
        expect(at).toBeCloseTo(1, 9);
      }),
    );
  });

  it('marks whole hours in the local zone', () => {
    const w = sessionWindow(chicago, 'evening');
    const ticks = hourTicks(w, 'America/Chicago');
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.every((t) => /^\d{1,2} [AP]M$/.test(t.label) && t.at >= 0 && t.at <= 1)).toBe(true);
    expect(ticks.map((t) => t.label)).toContain('7 PM');
    const long = hourTicks({ start: new Date('2026-06-21T12:00:00Z'), end: new Date('2026-06-21T22:00:00Z') }, 'America/Chicago');
    expect(long.length).toBeLessThanOrEqual(6);
    expect(windowPosition(w, new Date(w.end.getTime() + 1))).toBeNull();
    expect(windowPosition(w, w.start)).toBe(0);
  });

  it('formats ranges and the headline', () => {
    const a = new Date('2026-06-21T21:56:00Z'), b = new Date('2026-06-21T22:48:00Z'), c = new Date('2026-06-21T17:40:00Z');
    expect(formatRange(a, b, 'America/Chicago')).toBe('4:56–5:48 PM');
    expect(formatRange(c, b, 'America/Chicago')).toBe('12:40–5:48 PM');
    expect(formatRange(new Date('2026-06-21T14:40:00Z'), c, 'America/Chicago')).toBe('9:40 AM–12:40 PM');
    expect(lightHeadline(chicago, 'evening')).toMatch(/^Golden hour \d{1,2}:\d\d–\d{1,2}:\d\d PM · sunset \d{1,2}:\d\d PM$/);
    expect(lightHeadline(chicago, 'morning')).toMatch(/sunrise \d{1,2}:\d\d AM$/);
    expect(lightHeadline(tromsoSummer, 'evening')).toBe('The sun doesn’t set today');
    expect(zoneCity('America/Chicago')).toBe('Chicago');
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
  });

  it('says how the shoot fits golden hour', () => {
    const at = (m: number) => new Date(Date.UTC(2026, 5, 21, 20, 0) + m * MIN);
    const g = { start: at(60), end: at(120) };
    const fit = (s: number, e: number) => shootFit(g, { start: at(s), end: at(e) });
    expect(fit(70, 110)).toBe('✓ All of your shoot is in golden hour');
    expect(fit(0, 40)).toBe('Your shoot ends 20 min before golden hour starts');
    expect(fit(130, 170)).toBe('Your shoot starts 10 min after golden hour ends');
    expect(fit(49, 100)).toBe('Your shoot starts 11 min before golden hour and ends during it');
    expect(fit(90, 140)).toBe('Your shoot starts during golden hour and ends 20 min after it');
    expect(fit(50, 130)).toBe('Your shoot starts 10 min before golden hour and ends 10 min after it');
    expect(shootFit(null, { start: at(0), end: at(10) })).toBeNull();
    expect(shootFit(g, null)).toBeNull();
  });
});
