import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentPosition, fetchForecast, fetchTimeZone, NeedsConnection, searchPlaces } from './online';

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('online helpers', () => {
  it('searches places and tidies the results', async () => {
    vi.stubGlobal('fetch', vi.fn(() => ok({ results: [{ name: 'Kew', latitude: 51.48, longitude: -0.29, timezone: 'Europe/London', country: 'United Kingdom' }] })));
    expect(await searchPlaces('Kew')).toEqual([{ name: 'Kew', address: 'United Kingdom', latitude: 51.48, longitude: -0.29, timeZone: 'Europe/London' }]);
    expect(await searchPlaces('  ')).toEqual([]);
  });
  it('returns no results when the service has none', async () => {
    vi.stubGlobal('fetch', vi.fn(() => ok({})));
    expect(await searchPlaces('zzzz')).toEqual([]);
  });
  it('reads the time zone', async () => {
    vi.stubGlobal('fetch', vi.fn(() => ok({ timezone: 'Asia/Tokyo' })));
    expect(await fetchTimeZone(35, 139)).toBe('Asia/Tokyo');
  });
  it('maps the hourly forecast', async () => {
    vi.stubGlobal('fetch', vi.fn(() => ok({ timezone: 'UTC', hourly: { time: ['2026-11-20T09:00'], cloud_cover: [50], precipitation_probability: [null], wind_speed_10m: [8], temperature_2m: [3.5] } })));
    expect(await fetchForecast(1, 2, '2026-11-20')).toEqual({
      timeZone: 'UTC',
      hours: [{ time: '09:00', cloudPercent: 50, rainPercent: null, windKmh: 8, tempC: 3.5 }],
    });
  });
  it('turns network failure and being offline into NeedsConnection, and other failures into errors', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(searchPlaces('x')).rejects.toBeInstanceOf(NeedsConnection);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('no', { status: 500 }))));
    await expect(searchPlaces('x')).rejects.toThrow('answered 500');
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(fetchTimeZone(1, 1)).rejects.toBeInstanceOf(NeedsConnection);
    expect(spy).not.toHaveBeenCalled();
  });
  it('reads the phone position, and explains refusals', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition) },
    });
    expect(await currentPosition()).toEqual({ latitude: 1, longitude: 2 });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_: PositionCallback, bad: PositionErrorCallback) => bad({ code: 1 } as GeolocationPositionError) },
    });
    await expect(currentPosition()).rejects.toThrow('switched off');
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    await expect(currentPosition()).rejects.toThrow('can’t share');
  });
});
