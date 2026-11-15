import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LightBanner } from '../components/LightBanner';
import { db } from '../data/db';
import { addLocation, createShoot, today } from '../data/repo';
import { goldenHourCountdown, sunTimes } from '../sun';
import { clearDb, seedFamily } from '../test/helpers';
import { ShootScreen } from './ShootScreen';

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

async function open(fields: { date?: string; startTime?: string; withPlace?: boolean } = {}) {
  const seeded = await seedFamily();
  const loc = fields.withPlace
    ? await addLocation({ name: 'Riverside Park', latitude: 41.88, longitude: -87.63, timeZone: 'America/Chicago', source: 'coordinates' })
    : null;
  const shoot = await createShoot(seeded.family, {
    date: fields.date ?? '2026-06-21',
    title: 'Portraits',
    ...(fields.startTime ? { startTime: fields.startTime } : {}),
    ...(loc ? { locationId: loc.id } : {}),
  });
  const user = userEvent.setup();
  render(<ShootScreen shootId={shoot.id} />);
  await screen.findByRole('heading', { name: 'Portraits' });
  return { shoot, user, loc };
}

const lightSection = () => screen.getByRole('heading', { name: 'Light', level: 2 }).closest('section')!;

beforeEach(async () => {
  await clearDb();
  window.location.hash = '#/';
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Light section', () => {
  it('asks for a location first, and works with typed coordinates offline (L1)', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('offline')));
    vi.stubGlobal('fetch', fetchMock);
    const { user, shoot } = await open({ startTime: '18:30' });
    expect(within(lightSection()).getByText('No location yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set location' }));
    const dlg = screen.getByRole('dialog', { name: 'Shoot location' });
    await user.type(within(dlg).getByLabelText(/Name for a new place/), 'Home garden');
    await user.type(within(dlg).getByLabelText('Latitude'), '41.88');
    await user.type(within(dlg).getByLabelText('Longitude'), '-87.63');
    await user.click(within(dlg).getByRole('button', { name: 'Use these coordinates' }));
    await waitFor(async () => expect((await db.shoots.get(shoot.id))!.locationId).toBeTruthy());
    const loc = (await db.locations.toArray())[0]!;
    expect(loc).toMatchObject({ name: 'Home garden', latitude: 41.88, longitude: -87.63, source: 'coordinates' });
    expect(loc.timeZone).toBeTruthy();
    await screen.findByTestId('timeline');
    expect(screen.getByTestId('shoot-span')).toBeInTheDocument();
    expect(screen.getByLabelText('Light times')).toHaveTextContent('Sunset');
    expect(screen.getByRole('region', { name: 'Shoot' })).toHaveTextContent(/Home garden · Golden hour \d/);
  });

  it('rejects bad coordinates in plain words', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Set location' }));
    const dlg = screen.getByRole('dialog', { name: 'Shoot location' });
    await user.type(within(dlg).getByLabelText('Latitude'), '95');
    await user.type(within(dlg).getByLabelText('Longitude'), '10');
    await user.click(within(dlg).getByRole('button', { name: 'Use these coordinates' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Latitude is between -90 and 90');
    expect(await db.locations.count()).toBe(0);
  });

  it('searches for a place and takes its time zone from the geocoder (L1)', async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(url).toContain('geocoding-api.open-meteo.com/v1/search?name=Springfield&count=8');
      return json({ results: [{ name: 'Springfield', latitude: 39.8, longitude: -89.64, timezone: 'America/Chicago', admin1: 'Illinois', country: 'United States' }] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { user, shoot } = await open();
    await user.click(screen.getByRole('button', { name: 'Set location' }));
    const dlg = screen.getByRole('dialog', { name: 'Shoot location' });
    await user.type(within(dlg).getByLabelText('Search for a place or address'), 'Springfield');
    await user.click(within(dlg).getByRole('button', { name: 'Search' }));
    await user.click(await within(dlg).findByRole('button', { name: /Springfield.*Illinois/ }));
    await waitFor(async () => expect((await db.shoots.get(shoot.id))!.locationId).toBeTruthy());
    expect((await db.locations.toArray())[0]).toMatchObject({ name: 'Springfield', timeZone: 'America/Chicago', source: 'search', address: 'Illinois, United States' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('says "Needs a connection" and never blocks when offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Set location' }));
    const dlg = screen.getByRole('dialog', { name: 'Shoot location' });
    expect(within(dlg).getAllByText(/Needs a connection/).length).toBeGreaterThan(0);
    await user.type(within(dlg).getByLabelText('Search for a place or address'), 'Anywhere');
    await user.click(within(dlg).getByRole('button', { name: 'Search' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Needs a connection');
    // Typed coordinates still work, with no network call.
    await user.type(within(dlg).getByLabelText('Latitude'), '10');
    await user.type(within(dlg).getByLabelText('Longitude'), '20');
    await user.click(within(dlg).getByRole('button', { name: 'Use these coordinates' }));
    await waitFor(async () => expect(await db.locations.count()).toBe(1));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the phone location and looks up its time zone (L1)', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 48.85, longitude: 2.35 } } as GeolocationPosition) },
    });
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      expect(url).toContain('timezone=auto');
      return json({ timezone: 'Europe/Paris' });
    }));
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Set location' }));
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(async () => expect(await db.locations.count()).toBe(1));
    expect((await db.locations.toArray())[0]).toMatchObject({ name: 'My location', timeZone: 'Europe/Paris', source: 'gps' });
  });

  it('shows saved places and reuses one (L1)', async () => {
    const { user, shoot } = await open();
    const other = await addLocation({ name: 'Old Mill', latitude: 52.2, longitude: 0.1, timeZone: 'Europe/London', source: 'pin' });
    await user.click(screen.getByRole('button', { name: 'Set location' }));
    await user.click(await screen.findByRole('button', { name: /^Old Mill/ }));
    await waitFor(async () => expect((await db.shoots.get(shoot.id))!.locationId).toBe(other.id));
    expect(await screen.findByText('Old Mill', { selector: '.light-place-name' })).toBeInTheDocument();
  });

  it('suggests a start, warns when the list is long, and sets the start time (L4)', async () => {
    const { user, shoot } = await open({ withPlace: true, startTime: '10:00' });
    const btn = await screen.findByRole('button', { name: 'Use this start time' });
    await user.click(screen.getByRole('radio', { name: 'Evening' }));
    await user.click(btn);
    await waitFor(async () => expect((await db.shoots.get(shoot.id))!.startTime).not.toBe('10:00'));
    const start = (await db.shoots.get(shoot.id))!.startTime!;
    expect(Number(start.slice(0, 2))).toBeGreaterThanOrEqual(17);
    expect(await screen.findByRole('button', { name: 'Start time is set' })).toBeDisabled();
    // A 7-hour list: switch on everything the family has and shorten golden hour by using the winter date.
    await user.click(screen.getByRole('radio', { name: 'Morning' }));
    expect(screen.getByText(/Start at/)).toBeInTheDocument();
  });

  it('shows the sun direction with a compass label, and turns the rose with the compass (L5)', async () => {
    vi.stubGlobal('DeviceOrientationEvent', class {});
    const { user } = await open({ withPlace: true, startTime: '19:00' });
    expect(await screen.findByText(/the sun is in the/)).toHaveTextContent(/WNW|W|NW|WSW/);
    await user.click(screen.getByRole('button', { name: 'Use compass' }));
    expect(screen.getByRole('button', { name: 'Stop compass' })).toBeInTheDocument();
    act(() => {
      const e = new Event('deviceorientation') as Event & { webkitCompassHeading: number };
      e.webkitCompassHeading = 90;
      window.dispatchEvent(e);
    });
    await waitFor(() => expect(screen.getByTestId('rose')).toHaveAttribute('data-rotation', '-90'));
  });

  it('asks iOS for compass permission on the tap, and copes with "no"', async () => {
    const requestPermission = vi.fn(() => Promise.resolve('denied'));
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(class {}, { requestPermission }));
    const { user } = await open({ withPlace: true, startTime: '19:00' });
    await user.click(await screen.findByRole('button', { name: 'Use compass' }));
    expect(requestPermission).toHaveBeenCalled();
    expect(await screen.findByText(/compass is switched off/)).toBeInTheDocument();
  });

  it('offers no compass button when the phone has none', async () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    await open({ withPlace: true, startTime: '19:00' });
    await screen.findByText(/the sun is in the/);
    expect(screen.queryByRole('button', { name: 'Use compass' })).toBeNull();
  });

  it('lists the next 21 days and sets the shoot date from one (L6)', async () => {
    const { user, shoot } = await open({ withPlace: true });
    await user.click(await screen.findByText(/Pick a date/));
    const list = await screen.findByRole('list', { name: 'Golden hour by day' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(21);
    expect(list).toHaveTextContent(/Evening .* PM/);
    await user.click(within(list).getAllByRole('button')[3]!);
    await waitFor(async () => expect((await db.shoots.get(shoot.id))!.date).not.toBe('2026-06-21'));
  });

  it('gets the forecast on demand, caches it, and shows it with its fetch time (L7)', async () => {
    const date = today();
    const hours = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
    const fetchMock = vi.fn((url: string) => {
      expect(url).toContain('hourly=cloud_cover,precipitation_probability,wind_speed_10m,temperature_2m');
      return json({
        timezone: 'America/Chicago',
        hourly: {
          time: hours,
          cloud_cover: hours.map(() => 40),
          precipitation_probability: hours.map(() => 20),
          wind_speed_10m: hours.map(() => 12),
          temperature_2m: hours.map(() => 9),
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { user, shoot } = await open({ withPlace: true, date, startTime: '16:00' });
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Get forecast' }));
    const weather = await screen.findByTestId('weather');
    expect(weather).toHaveTextContent('40%');
    expect(weather).toHaveTextContent('12 km/h');
    expect(weather).toHaveTextContent(/Fetched just now/);
    expect((await db.shoots.get(shoot.id))!.forecast!.hours).toHaveLength(24);
    // Offline later: the cached forecast is still shown, and the button says so instead of failing.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Refresh forecast' }));
    expect(await screen.findByText('Needs a connection.')).toBeInTheDocument();
    expect(screen.getByTestId('weather')).toHaveTextContent('40%');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not offer a forecast for a shoot far in the future', async () => {
    await open({ withPlace: true, date: '2099-01-01' });
    expect(await screen.findByText(/next 14 days/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get forecast' })).toBeNull();
  });
});

describe('LightBanner (L8)', () => {
  const loc = { id: 'l', name: 'P', latitude: 41.88, longitude: -87.63, timeZone: 'America/Chicago', source: 'pin' as const, createdAt: 0, updatedAt: 0 };
  const times = sunTimes({ y: 2026, m: 6, d: 21 }, loc.latitude, loc.longitude, 'America/Chicago');
  const g = times.goldenEvening;
  const banner = (now: Date) => render(<LightBanner shoot={{ date: '2026-06-21' }} location={loc} now={now} />);

  it('counts down to the end of golden hour, before it, and after it', () => {
    expect(goldenHourCountdown(g.start!, times).state).toBe('during');
    banner(new Date(g.end!.getTime() - 34 * 60000));
    expect(screen.getByRole('status')).toHaveTextContent('Golden hour: 34 min left');
  });
  it('says when it starts', () => {
    banner(new Date(g.start!.getTime() - 70 * 60000));
    expect(screen.getByRole('status')).toHaveTextContent('Golden hour starts in 1 h 10 min');
  });
  it('says when it is over, and shows nothing without a place', () => {
    const { unmount } = banner(new Date(g.end!.getTime() + 60000));
    expect(screen.getByRole('status')).toHaveTextContent('Golden hour is over');
    unmount();
    const { container } = render(<LightBanner shoot={{ date: '2026-06-21' }} location={null} now={new Date()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
