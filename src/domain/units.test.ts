import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatPrecip, formatTemp, formatWind, toFahrenheit, toInches, toMph, unitsOf } from './units';

describe('units', () => {
  it('converts temperature, wind and rain', () => {
    expect(toFahrenheit(0)).toBe(32);
    expect(toFahrenheit(100)).toBe(212);
    expect(toFahrenheit(-40)).toBe(-40);
    expect(toMph(100)).toBeCloseTo(62.1371, 4);
    expect(toInches(25.4)).toBe(1);
  });

  it('rounds to whole degrees and whole mph', () => {
    expect(formatTemp(22, 'us')).toBe('72°F');
    expect(formatTemp(21.6, 'us')).toBe('71°F');
    expect(formatTemp(21.6, 'metric')).toBe('22°C');
    expect(formatTemp(-3.4, 'us')).toBe('26°F');
    expect(formatTemp(null, 'us')).toBe('–');
    expect(formatWind(19, 'us')).toBe('12 mph');
    expect(formatWind(19, 'metric')).toBe('19 km/h');
    expect(formatWind(0, 'us')).toBe('0 mph');
    expect(formatWind(null, 'metric')).toBe('–');
  });

  it('formats rain amounts', () => {
    expect(formatPrecip(2.54, 'us')).toBe('0.1 in');
    expect(formatPrecip(2.54, 'metric')).toBe('2.5 mm');
    expect(formatPrecip(null, 'us')).toBe('–');
  });

  it('treats a missing setting as US', () => {
    expect(unitsOf(undefined)).toBe('us');
    expect(unitsOf('us')).toBe('us');
    expect(unitsOf('metric')).toBe('metric');
  });

  it('property: warmer is never shown cooler, and the shown value is within half a degree', () => {
    fc.assert(
      fc.property(fc.double({ min: -60, max: 60, noNaN: true }), fc.double({ min: 0, max: 5, noNaN: true }), (c, d) => {
        const a = Number.parseInt(formatTemp(c, 'us'), 10);
        const b = Number.parseInt(formatTemp(c + d, 'us'), 10);
        expect(b).toBeGreaterThanOrEqual(a);
        expect(Math.abs(a - toFahrenheit(c))).toBeLessThanOrEqual(0.5 + 1e-9);
      }),
    );
  });
});
