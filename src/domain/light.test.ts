import { describe, expect, it } from 'vitest';
import { goldenHourCountdown, sunTimes } from '../sun';
import {
  countdownText,
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

  it('is one colour on a polar day and a polar night', () => {
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
  it('summarises the hours the shoot touches', () => {
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
