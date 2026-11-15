import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  sunPosition, sunTimes, sunBearingAt, compassLabel, formatLocalTime, suggestStart, goldenHourCountdown,
  daysOverview, tzOffsetMinutes, zonedTimeToUtc, localYMD, guessTimeZone, localTime,
} from '.';
import { localDayBounds } from './times';

/** Minutes since local midnight of an instant in tz. */
const hm = (d: Date | null, tz: string) => (d ? formatLocalTime(d, tz) : null);
function minOfDay(d: Date, tz: string) {
  const s = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(d);
  const [h, m] = s.split(':').map(Number);
  return h! * 60 + m!;
}
const near = (d: Date | null, tz: string, hhmm: string, tol = 2) => {
  expect(d).not.toBeNull();
  const [h, m] = hhmm.split(':').map(Number);
  expect(Math.abs(minOfDay(d!, tz) - (h! * 60 + m!))).toBeLessThanOrEqual(tol);
};

// Reference values: NOAA-algorithm implementation (astral) cross-checked with published almanac values.
const CASES = [
  { n: 'London solstice', lat: 51.5074, lng: -0.1278, tz: 'Europe/London', d: { y: 2026, m: 6, d: 21 }, rise: '04:43', noon: '13:02', set: '21:21' },
  { n: 'New York winter solstice', lat: 40.7128, lng: -74.006, tz: 'America/New_York', d: { y: 2026, m: 12, d: 21 }, rise: '07:16', noon: '11:53', set: '16:31' },
  { n: 'Sydney autumn', lat: -33.8688, lng: 151.2093, tz: 'Australia/Sydney', d: { y: 2026, m: 3, d: 15 }, rise: '06:54', noon: '13:04', set: '19:13' },
  { n: 'Denver DST start', lat: 39.7392, lng: -104.9903, tz: 'America/Denver', d: { y: 2026, m: 3, d: 8 }, rise: '07:22', noon: '13:10', set: '18:59' },
  { n: 'Denver DST end', lat: 39.7392, lng: -104.9903, tz: 'America/Denver', d: { y: 2026, m: 11, d: 1 }, rise: '06:28', noon: '11:43', set: '16:57' },
  { n: 'Equator equinox', lat: 0, lng: -78.5, tz: 'America/Guayaquil', d: { y: 2026, m: 3, d: 20 }, rise: '06:18', noon: '12:21', set: '18:24' },
];

describe('reference times', () => {
  for (const c of CASES) {
    it(c.n, () => {
      const t = sunTimes(c.d, c.lat, c.lng, c.tz);
      near(t.sunrise, c.tz, c.rise);
      near(t.solarNoon, c.tz, c.noon);
      near(t.sunset, c.tz, c.set);
      expect(t.polar).toBeUndefined();
      const alt = (d: Date | null) => sunPosition(d!, c.lat, c.lng).altitudeDeg;
      expect(alt(t.sunrise)).toBeCloseTo(-0.833, 1);
      expect(alt(t.sunset)).toBeCloseTo(-0.833, 1);
      expect(alt(t.goldenMorning.end)).toBeCloseTo(6, 1);
      expect(alt(t.goldenMorning.start)).toBeCloseTo(-4, 1);
      expect(alt(t.goldenEvening.start)).toBeCloseTo(6, 1);
      expect(alt(t.goldenEvening.end)).toBeCloseTo(-4, 1);
      expect(alt(t.blueEvening.end)).toBeCloseTo(-6, 1);
      expect(alt(t.blueMorning.start)).toBeCloseTo(-6, 1);
      expect(t.civilDawn).toEqual(t.blueMorning.start);
      expect(t.civilDusk).toEqual(t.blueEvening.end);
    });
  }
  it('London civil twilight matches reference', () => {
    const t = sunTimes({ y: 2026, m: 6, d: 21 }, 51.5074, -0.1278, 'Europe/London');
    near(t.civilDawn, 'Europe/London', '03:54');
    near(t.civilDusk, 'Europe/London', '22:09');
  });
});

describe('DST days', () => {
  it('day lengths are 23 and 25 hours', () => {
    const a = localDayBounds({ y: 2026, m: 3, d: 8 }, 'America/Denver');
    const b = localDayBounds({ y: 2026, m: 11, d: 1 }, 'America/Denver');
    expect((a.end.getTime() - a.start.getTime()) / 3600000).toBe(23);
    expect((b.end.getTime() - b.start.getTime()) / 3600000).toBe(25);
  });
  it('offsets differ across the change', () => {
    expect(tzOffsetMinutes(new Date('2026-03-08T08:00:00Z'), 'America/Denver')).toBe(-420);
    expect(tzOffsetMinutes(new Date('2026-03-08T10:00:00Z'), 'America/Denver')).toBe(-360);
    expect(tzOffsetMinutes(new Date('2026-06-01T00:00:00Z'), 'Asia/Kolkata')).toBe(330);
  });
});

describe('polar and edge', () => {
  it('Tromso June: midnight sun', () => {
    const t = sunTimes({ y: 2026, m: 6, d: 21 }, 69.6492, 18.9553, 'Europe/Oslo');
    expect(t.polar).toBe('day');
    expect(t.sunrise).toBeNull();
    expect(t.sunset).toBeNull();
    expect(t.goldenEvening.start).not.toBeNull(); // sun still dips below 6 deg
    expect(t.goldenEvening.end).toBeNull(); // but never reaches -4
  });
  it('Tromso December: polar night, brief civil twilight', () => {
    const t = sunTimes({ y: 2026, m: 12, d: 21 }, 69.6492, 18.9553, 'Europe/Oslo');
    expect(t.polar).toBe('night');
    expect(t.sunrise).toBeNull();
    expect(t.goldenMorning.end).toBeNull();
    expect(t.civilDawn).not.toBeNull();
  });
  it('Tromso suggestStart gives warning', () => {
    const t = sunTimes({ y: 2026, m: 6, d: 21 }, 69.6492, 18.9553, 'Europe/Oslo');
    expect(suggestStart({ times: t, shootMinutes: 60, session: 'evening' }).warning).toMatch(/does not set/);
    const n = sunTimes({ y: 2026, m: 12, d: 21 }, 69.6492, 18.9553, 'Europe/Oslo');
    expect(suggestStart({ times: n, shootMinutes: 60, session: 'morning' }).warning).toMatch(/does not rise/);
  });
  it('very far-east zone still finds noon', () => {
    const t = sunTimes({ y: 2026, m: 6, d: 1 }, -36.85, 174.76, 'Pacific/Auckland');
    expect(t.sunrise).not.toBeNull();
    expect(t.solarNoon.getTime()).toBeGreaterThan(t.sunrise!.getTime());
  });
  it('no-golden but no polar flag (sun grazes)', () => {
    const t = sunTimes({ y: 2026, m: 6, d: 21 }, 58, 0, 'Europe/London');
    expect(t.polar).toBeUndefined();
    expect(t.sunset).not.toBeNull();
  });
});

describe('position and compass', () => {
  it('equator equinox noon is overhead; sunset is west', () => {
    const t = sunTimes({ y: 2026, m: 3, d: 20 }, 0, -78.5, 'America/Guayaquil');
    expect(sunPosition(t.solarNoon, 0, -78.5).altitudeDeg).toBeGreaterThan(88);
    const b = sunBearingAt(t.sunset!, 0, -78.5);
    expect(b.label).toBe('W');
    expect(b.altitudeDeg).toBeLessThan(0.1);
  });
  it('London midsummer evening bearing is WNW-ish; labels cover the 16 points', () => {
    const t = sunTimes({ y: 2026, m: 6, d: 21 }, 51.5074, -0.1278, 'Europe/London');
    expect(['NW', 'WNW']).toContain(sunBearingAt(t.sunset!, 51.5074, -0.1278).label);
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(-10)).toBe('N');
    expect(compassLabel(247.5)).toBe('WSW');
    expect(compassLabel(359)).toBe('N');
    expect(compassLabel(180)).toBe('S');
  });
  it('southern hemisphere noon sun is north', () => {
    const t = sunTimes({ y: 2026, m: 3, d: 15 }, -33.8688, 151.2093, 'Australia/Sydney');
    expect(['N', 'NNE', 'NNW']).toContain(sunBearingAt(t.solarNoon, -33.8688, 151.2093).label);
  });
});

describe('format and tz', () => {
  it('formats times', () => {
    expect(formatLocalTime(new Date('2026-06-21T18:42:00Z'), 'America/New_York')).toBe('2:42 PM');
    expect(formatLocalTime(new Date('2026-06-21T04:05:00Z'), 'UTC')).toBe('4:05 AM');
    expect(formatLocalTime(new Date('2026-06-21T00:30:00Z'), 'UTC')).toBe('12:30 AM');
    expect(formatLocalTime(new Date('2026-06-21T12:00:00Z'), 'UTC')).toBe('12:00 PM');
  });
  it('tz helpers', () => {
    expect(guessTimeZone()).toBeTruthy();
    expect(localYMD(new Date('2026-06-21T02:00:00Z'), 'America/New_York')).toEqual({ y: 2026, m: 6, d: 20 });
    expect(localTime(2026, 6, 21, 12, 0, 'UTC').toISOString()).toBe('2026-06-21T12:00:00.000Z');
  });
});

describe('plan', () => {
  const tz = 'America/New_York';
  const times = sunTimes({ y: 2026, m: 6, d: 20 }, 40.7128, -74.006, tz);
  const gMin = Math.round((times.goldenEvening.end!.getTime() - times.goldenEvening.start!.getTime()) / 60000);
  it('evening short shoot ends at golden end', () => {
    const s = suggestStart({ times, shootMinutes: 30, session: 'evening' });
    expect(s.end).toEqual(times.goldenEvening.end);
    expect(s.warning).toBeUndefined();
  });
  it('morning short shoot starts at golden start', () => {
    const s = suggestStart({ times, shootMinutes: 30, session: 'morning' });
    expect(s.start).toEqual(times.goldenMorning.start);
    expect(s.end.getTime() - s.start.getTime()).toBe(30 * 60000);
  });
  it('long shoot warns', () => {
    const long = gMin + 25;
    const s = suggestStart({ times, shootMinutes: long, session: 'evening' });
    expect(s.warning).toContain(`${long}-minute list is longer than tonight's ${gMin}-minute golden hour`);
    expect(s.end).toEqual(times.goldenEvening.end);
    const m = suggestStart({ times, shootMinutes: long, session: 'evening', mustHaveEarlyMinutes: 20 });
    expect(m.start).toEqual(times.goldenEvening.start);
    const mo = suggestStart({ times, shootMinutes: long, session: 'morning' });
    expect(mo.warning).toContain("this morning's");
    expect(mo.start).toEqual(times.goldenMorning.start);
  });
  it('countdown', () => {
    const ge = times.goldenEvening, gm = times.goldenMorning;
    const min = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
    const during = goldenHourCountdown(min(ge.start!, 10), times);
    expect(during).toMatchObject({ state: 'during', session: 'evening', minutes: gMin - 10 });
    expect(goldenHourCountdown(min(gm.start!, -30), times)).toMatchObject({ state: 'before', session: 'morning', minutes: 30 });
    expect(goldenHourCountdown(min(gm.end!, 5), times)).toMatchObject({ state: 'before', session: 'evening' });
    expect(goldenHourCountdown(min(ge.end!, 1), times)).toEqual({ state: 'after', minutes: 0, until: null, session: null });
  });
  it('daysOverview', () => {
    const days = daysOverview({ y: 2026, m: 11, d: 1 }, 3, 39.7392, -104.9903, 'America/Denver');
    expect(days.map((d) => d.iso)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(days[0]!.goldenEvening.end).not.toBeNull();
    const p = daysOverview({ y: 2026, m: 6, d: 30 }, 3, 69.6492, 18.9553, 'Europe/Oslo');
    expect(p[2]!.date).toEqual({ y: 2026, m: 7, d: 2 });
    expect(p[0]!.polar).toBe('day');
    expect(hm(days[0]!.sunset, 'America/Denver')).toBe('4:58 PM');
  });
});

describe('properties', () => {
  it('ordering of events for mid latitudes', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -60, max: 60, noNaN: true }),
        fc.integer({ min: -180, max: 180 }),
        fc.integer({ min: 0, max: 364 }),
        (lat, lngI, doy) => {
          const lng = lngI;
          const off = Math.round(lng / 15);
          const tz = off === 0 ? 'UTC' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`;
          const u = new Date(Date.UTC(2026, 0, 1 + doy));
          // pick tz-less day aligned to the longitude by using a fixed-offset-ish zone: UTC; shift date so noon is inside the day
          const t = sunTimes({ y: 2026, m: u.getUTCMonth() + 1, d: u.getUTCDate() }, lat, lng, tz);
          const ms = (d: Date | null) => d!.getTime();
          if (Math.abs(lat) > 58) return; // near-polar twilight can be partial
          expect(ms(t.civilDawn)).toBeLessThan(ms(t.goldenMorning.start));
          expect(ms(t.goldenMorning.start)).toBeLessThan(ms(t.sunrise));
          expect(ms(t.sunrise)).toBeLessThan(ms(t.goldenMorning.end));
          expect(ms(t.goldenMorning.end)).toBeLessThan(ms(t.solarNoon));
          expect(ms(t.solarNoon)).toBeLessThan(ms(t.goldenEvening.start));
          expect(ms(t.goldenEvening.start)).toBeLessThan(ms(t.sunset));
          expect(ms(t.sunset)).toBeLessThan(ms(t.goldenEvening.end));
          expect(ms(t.goldenEvening.end)).toBeLessThan(ms(t.blueEvening.end));
          expect(ms(t.blueEvening.start)).toBe(ms(t.goldenEvening.end));
        },
      ),
      { numRuns: 300 },
    );
  });
  it('azimuth in [0,360) and altitude in [-90,90]', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2035-01-01'), noInvalidDate: true }), fc.double({ min: -89, max: 89, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }), (d, la, lo) => {
        const p = sunPosition(d, la, lo);
        return p.azimuthDeg >= 0 && p.azimuthDeg < 360 && Math.abs(p.altitudeDeg) <= 90;
      }),
    );
  });
  it('zonedTimeToUtc round-trips', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 28 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 3, max: 23 }), (d, m, h) => {
      const u = zonedTimeToUtc(2026, m, d, h, 30, 'Europe/London');
      return minOfDay(u, 'Europe/London') === h * 60 + 30;
    }));
  });
});
