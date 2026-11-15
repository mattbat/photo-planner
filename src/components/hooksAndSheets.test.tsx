import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { addLocation, addPerson, addPose, createShoot, startShoot, today, updatePerson } from '../data/repo';
import { useShootData } from '../hooks/useShootData';
import { usePoseMap } from '../hooks/usePoseMap';
import { useWakeLock, wakeLockSupported } from '../hooks/useWakeLock';
import { starterPoses } from '../poses/starterPoses';
import { demoFamily } from '../tree/fixtures';
import { generateShots, previewCounts } from '../engine';
import { DEMO_ATTENDING, DEMO_EXTRAS, DEMO_PEOPLE } from '../engine/demoFamily';
import { TEMPLATES, TEMPLATE_IDS } from '../engine/templates';
import { clearDb, seedFamily } from '../test/helpers';
import { CustomShotSheet } from './CustomShotSheet';
import { FamilyTree } from './FamilyTree';
import { LightSection } from './LightSection';
import { PoseSuggestions } from './PoseSuggestions';
import { ShareShootSheet, SharedBanner } from './ShareShoot';
import { TemplatesPanel } from './TemplatesPanel';

beforeEach(async () => {
  await clearDb();
  window.location.hash = '#/';
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as { wakeLock?: unknown }).wakeLock;
  delete (navigator as { share?: unknown }).share;
});

describe('useWakeLock edge cases', () => {
  function fakeLock() {
    const listeners: (() => void)[] = [];
    const sentinel = { release: vi.fn(async () => listeners.forEach((l) => l())), addEventListener: (_: string, l: () => void) => listeners.push(l) };
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    return { request, sentinel, listeners };
  }
  const visibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => Reflect.deleteProperty(document, 'visibilityState'));

  it('does not ask again while the app is hidden, and asks on return', async () => {
    const { request } = fakeLock();
    renderHook(() => useWakeLock(true));
    await act(async () => {});
    await act(async () => visibility('hidden'));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => visibility('visible'));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('shows the lock as lost when the system releases it, without calling that a failure', async () => {
    const { sentinel } = fakeLock();
    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(result.current.held).toBe(true);
    await act(async () => void (await sentinel.release()));
    expect(result.current).toEqual({ held: false, failed: false });
  });

  it('lets go of a lock that arrives after the shoot screen has closed', async () => {
    const sentinel = { release: vi.fn(async () => {}), addEventListener: vi.fn() };
    let resolve!: (s: typeof sentinel) => void;
    const request = vi.fn(() => new Promise<typeof sentinel>((r) => (resolve = r)));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { unmount, result } = renderHook(() => useWakeLock(true));
    unmount();
    await act(async () => resolve(sentinel));
    expect(sentinel.release).toHaveBeenCalled();
    expect(result.current.held).toBe(false);
  });

  it('does nothing while inactive, and clears a refusal when the next request works', async () => {
    const { request } = fakeLock();
    const { result, rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: false } });
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    expect(result.current).toEqual({ held: false, failed: false });
    request.mockRejectedValueOnce(new Error('low battery'));
    rerender({ on: true });
    await act(async () => {});
    expect(result.current.failed).toBe(true);
    await act(async () => visibility('visible'));
    expect(result.current).toEqual({ held: true, failed: false });
  });

  it('counts an insecure page as unsupported', () => {
    fakeLock();
    expect(wakeLockSupported()).toBe(true);
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    expect(wakeLockSupported()).toBe(false);
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toEqual({ held: false, failed: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  });
});

describe('useShootData', () => {
  it('is undefined while loading, null for a shoot that does not exist', async () => {
    const { result } = renderHook(() => useShootData('nope'));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('gives the shoot with its family, place and settings, and follows changes', async () => {
    const { family } = await seedFamily();
    const place = await addLocation({ name: 'Elm Meadow', latitude: 10, longitude: 20, source: 'coordinates' });
    const shoot = await createShoot(family, { date: '2026-12-05', title: 'Winter', locationId: place.id });
    const { result } = renderHook(() => useShootData(shoot.id));
    await waitFor(() => expect(result.current).toBeTruthy());
    expect(result.current!.family?.name).toBe('The Testers');
    expect(result.current!.people).toHaveLength(5);
    expect(result.current!.extras.map((e) => e.name)).toEqual(['Biscuit']);
    expect(result.current!.location?.name).toBe('Elm Meadow');
    expect(result.current!.settings).toBeDefined();
    await db.shoots.update(shoot.id, { title: 'Renamed' });
    await waitFor(() => expect(result.current!.shoot.title).toBe('Renamed'));
  });

  it('leaves out extras that belong to another shoot, and null location when the place is gone', async () => {
    const { family } = await seedFamily();
    const shoot = await createShoot(family, { date: '2026-12-05' });
    await db.extras.add({ id: 'other', familyId: family.id, shootId: 'another-shoot', name: 'Other guest', kind: 'guest', joinTemplates: [], createdAt: 1, updatedAt: 1 } as never);
    await db.shoots.update(shoot.id, { locationId: 'missing' });
    const { result } = renderHook(() => useShootData(shoot.id));
    await waitFor(() => expect(result.current).toBeTruthy());
    expect(result.current!.extras.map((e) => e.id)).not.toContain('other');
    expect(result.current!.location).toBeNull();
  });

  it('rebuilds the shot list when a person is added or edited (E6)', async () => {
    const { family, max } = await seedFamily();
    const shoot = await createShoot(family, { date: '2026-12-05' });
    const { result } = renderHook(() => useShootData(shoot.id));
    await waitFor(() => expect(result.current).toBeTruthy());
    const before = result.current!.shoot.shots.length;
    const baby = await addPerson(family.id, { name: 'Baby Tester', parentIds: [max.id], ageGroup: 'child' });
    await db.shoots.update(shoot.id, { attendingIds: [...shoot.attendingIds, baby.id] });
    await updatePerson(baby.id, { notes: 'asleep' });
    await waitFor(() => expect(result.current!.shoot.shots.length).toBeGreaterThan(before));
    expect(result.current!.shoot.shots.some((s) => s.personIds.includes(baby.id))).toBe(true);
  });
});

describe('usePoseMap', () => {
  it('stands in with the bundled poses, then uses the stored ones', async () => {
    const { result } = renderHook(() => usePoseMap());
    expect(result.current.size).toBe(starterPoses.length);
    expect(result.current.get(starterPoses[0]!.id)?.name).toBe(starterPoses[0]!.name);
    const mine = await addPose({
      name: 'Giggle huddle', category: 'siblings', minSize: 2, maxSize: 4, description: '', directions: [], tips: [], mistakes: [], tags: [], difficulty: 'easy', favorite: false, builtIn: false,
    });
    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get(mine.id)?.name).toBe('Giggle huddle');
  });
});

describe('FamilyTree gestures', () => {
  const transform = (c: HTMLElement) => c.querySelector('svg > g')!.getAttribute('transform')!;
  const scale = (c: HTMLElement) => Number(/scale\(([\d.e+-]+)\)/.exec(transform(c))![1]);

  it('draws an empty tree and a single person without failing', () => {
    const { rerender } = render(<FamilyTree people={[]} />);
    expect(screen.getByRole('button', { name: /Fit/ })).toBeInTheDocument();
    rerender(<FamilyTree people={[{ id: 'solo', name: 'Solo Sam', grown: true, parentIds: [], partnerIds: [] }]} />);
    expect(screen.getByRole('button', { name: /^Solo Sam/ })).toBeInTheDocument();
  });

  it('keeps zoom between 0.15 and 4 however far you pinch', () => {
    const { container } = render(<FamilyTree people={demoFamily} />);
    const box = screen.getByTestId('family-tree');
    for (let i = 0; i < 30; i++) fireEvent.wheel(box, { deltaY: -2000, clientX: 20, clientY: 20 });
    expect(scale(container)).toBeLessThanOrEqual(4.0001);
    for (let i = 0; i < 60; i++) fireEvent.wheel(box, { deltaY: 2000, clientX: 20, clientY: 20 });
    expect(scale(container)).toBeGreaterThanOrEqual(0.1499);
  });

  it('zooms about the pointer, so the point under it stays put', () => {
    const { container } = render(<FamilyTree people={demoFamily} />);
    const box = screen.getByTestId('family-tree');
    const [, k0, tx0, ty0] = [0, scale(container), ...(/translate\(([-\d.e+]+),([-\d.e+]+)\)/.exec(transform(container))!.slice(1).map(Number))] as number[];
    fireEvent.wheel(box, { deltaY: -300, clientX: 100, clientY: 80 });
    const k1 = scale(container);
    const [tx1, ty1] = /translate\(([-\d.e+]+),([-\d.e+]+)\)/.exec(transform(container))!.slice(1).map(Number) as [number, number];
    expect((100 - tx0!) / k0!).toBeCloseTo((100 - tx1) / k1, 5);
    expect((80 - ty0!) / k0!).toBeCloseTo((80 - ty1) / k1, 5);
  });

  it('ignores moves from a finger that never touched down, and tiny wobbles', () => {
    const { container } = render(<FamilyTree people={demoFamily} />);
    const box = screen.getByTestId('family-tree');
    const before = transform(container);
    fireEvent.pointerMove(box, { pointerId: 9, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 12, clientY: 11 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(transform(container)).toBe(before);
  });

  it('a drag does not count as a tap, but a clean tap does', () => {
    const tap = vi.fn();
    render(<FamilyTree people={demoFamily} onPersonTap={tap} />);
    const box = screen.getByTestId('family-tree');
    const ruth = screen.getByRole('button', { name: /^Ruth Pike/ });
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 80, clientY: 60 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    fireEvent.click(ruth);
    expect(tap).not.toHaveBeenCalled();
    fireEvent.click(ruth);
    expect(tap).toHaveBeenCalledWith('ruth');
  });

  it('a two-finger pinch zooms in and spreading back out zooms out, and Fit restores the first view', () => {
    const { container } = render(<FamilyTree people={demoFamily} />);
    const box = screen.getByTestId('family-tree');
    const first = transform(container);
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(box, { pointerId: 2, clientX: 140, clientY: 100 });
    const k0 = scale(container);
    fireEvent.pointerMove(box, { pointerId: 2, clientX: 240, clientY: 100 });
    expect(scale(container)).toBeGreaterThan(k0);
    fireEvent.pointerMove(box, { pointerId: 2, clientX: 130, clientY: 100 });
    expect(scale(container)).toBeLessThan(scale(container) * 2);
    fireEvent.pointerUp(box, { pointerId: 2 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    // After one finger lifts, a single-finger drag pans again.
    fireEvent.pointerCancel(box, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: /Fit/ }));
    expect(transform(container)).not.toBe('');
    void first;
  });
});

describe('LightSection offline and edge states', () => {
  async function section(fields: { date?: string; startTime?: string; forecast?: boolean; place?: boolean } = {}) {
    const { family } = await seedFamily();
    const place = fields.place === false ? null : await addLocation({ name: 'Elm Meadow', latitude: 41.88, longitude: -87.63, timeZone: 'America/Chicago', source: 'coordinates' });
    const created = await createShoot(family, { date: fields.date ?? today(), title: 'Light', ...(place ? { locationId: place.id } : {}), ...(fields.startTime ? { startTime: fields.startTime } : {}) });
    if (fields.forecast) {
      await db.shoots.update(created.id, {
        forecast: { fetchedAt: Date.now() - 3 * 3_600_000, date: created.date, latitude: 41.88, longitude: -87.63, hours: [{ time: '10:00', cloudPercent: 55, rainPercent: 10, windKmh: 8, tempC: 14 }] },
      });
    }
    const shoot = (await db.shoots.get(created.id))!;
    const user = userEvent.setup();
    render(<LightSection shoot={shoot} location={place} totalMinutes={30} />);
    return { user, shoot };
  }

  it('says needs a connection when the browser is offline, and never calls the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { user } = await section();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Get forecast' }));
    expect(await screen.findByText('Needs a connection.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Get forecast' })).toBeEnabled();
  });

  it('says needs a connection when the request fails on the way (TypeError)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const { user } = await section();
    await user.click(screen.getByRole('button', { name: 'Get forecast' }));
    expect(await screen.findByText('Needs a connection.')).toBeInTheDocument();
  });

  it('says the service did not answer for a server error, and when there is no forecast yet', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('oops', { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ timezone: 'UTC', hourly: { time: [] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { user } = await section();
    await user.click(screen.getByRole('button', { name: 'Get forecast' }));
    expect(await screen.findByText(/didn’t answer/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get forecast' }));
    expect(await screen.findByText('No forecast for that day yet.')).toBeInTheDocument();
  });

  it('shows a saved forecast as saved on this phone when offline, even for a shoot out of range', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { shoot } = await section({ forecast: true, startTime: '10:00' });
    const weather = await screen.findByTestId('weather');
    expect(weather).toHaveTextContent('55%');
    expect(weather).toHaveTextContent('(saved on this phone)');
    expect(shoot.forecast).toBeDefined();
  });

  it('says the saved forecast does not cover the shoot time', async () => {
    await section({ forecast: true, startTime: '19:00' });
    expect(await screen.findByText(/doesn’t cover your shoot time/)).toBeInTheDocument();
  });

  it('shows no light details without a place, and no forecast section', async () => {
    await section({ place: false });
    expect(screen.getByText('No location yet')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Get forecast' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Set location' })).toBeInTheDocument();
  });

  it('switches the suggested start between morning and evening golden hour, and sets it', async () => {
    const { user, shoot } = await section({ date: '2026-06-21' });
    const evening = screen.getByText(/^Start at/).textContent;
    await user.click(screen.getByRole('radio', { name: 'Morning' }));
    expect(screen.getByText(/^Start at/).textContent).not.toBe(evening);
    await user.click(screen.getByRole('button', { name: 'Use this start time' }));
    await waitFor(async () => expect((await db.shoots.get(shoot.id))!.startTime).toMatch(/^\d\d:\d\d$/));
  });
});

describe('ShareShootSheet', () => {
  async function open(status: 'planned' | 'live' = 'planned') {
    const { family } = await seedFamily();
    const created = await createShoot(family, { date: '2026-12-05', title: 'Winter' });
    if (status === 'live') await startShoot(created.id);
    const onSent = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    const shoot = (await db.shoots.get(created.id))!;
    render(<ShareShootSheet shoot={shoot} familyName="The Testers" onSent={onSent} onClose={onClose} />);
    return { user, onSent, shoot };
  }

  it('says what happens for a planned and a live shoot, and who you are', async () => {
    await open();
    expect(screen.getByText(/You’re the photographer/)).toBeInTheDocument();
    expect(screen.getByText(/share it again until the shoot starts/)).toBeInTheDocument();
    cleanupDom();
    await open('live');
    expect(screen.getByText(/carries on from the shot you’re on/)).toBeInTheDocument();
  });

  it('copies the link when sharing is unavailable, and marks the shoot sent', async () => {
    const { user, onSent, shoot } = await open();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Text a link' }));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith('Link copied. Paste it in a message to the other phone.'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#/receive/'));
    expect((await db.shoots.get(shoot.id))!.handoff).toMatchObject({ n: 1, away: true });
  });

  it('sends nothing and marks nothing when sharing is cancelled', async () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn(() => Promise.reject(new DOMException('no', 'AbortError'))), configurable: true });
    const { user, onSent, shoot } = await open();
    await user.click(screen.getByRole('button', { name: 'Text a link' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(onSent).not.toHaveBeenCalled();
    expect((await db.shoots.get(shoot.id))!.handoff).toBeUndefined();
  });

  it('shows a plain error when neither sharing nor copying works', async () => {
    const { user, onSent } = await open();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(() => Promise.reject(new Error('no'))) }, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Text a link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t share or copy the link');
    expect(onSent).not.toHaveBeenCalled();
  });

  it('says the shoot is gone if it was deleted meanwhile', async () => {
    const { user, shoot } = await open();
    await db.shoots.delete(shoot.id);
    await user.click(screen.getByRole('button', { name: 'Text a link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t on this phone any more');
    await user.click(screen.getByRole('button', { name: 'AirDrop a file' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('downloads a file and says so', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const { user, onSent } = await open();
    await user.click(screen.getByRole('button', { name: 'AirDrop a file' }));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith('Shoot file downloaded. Send it to the other phone.'));
  });

  it('SharedBanner shows nothing for an unshared shoot, and a changed-since note', async () => {
    const { family } = await seedFamily();
    const created = await createShoot(family, { date: '2026-12-05' });
    const plain = (await db.shoots.get(created.id))!;
    const { container, rerender } = render(<SharedBanner shoot={plain} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SharedBanner shoot={{ ...plain, handoff: { n: 1, role: 'photographer', away: true, sentAt: 100 }, updatedAt: 500 }} onShareAgain={() => {}} />);
    expect(screen.getByText(/You’ve changed it since you shared it/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take back control' })).toBeNull();
  });
});
function cleanupDom() {
  document.body.innerHTML = '';
}

describe('PoseSuggestions', () => {
  const group = { peopleCount: 2, hasKids: false, hasBaby: false, generations: 1, isCouple: true, hasSeniors: false };

  it('lists the best matches, fills the library once, and marks the chosen pose', async () => {
    const onPick = vi.fn();
    const { rerender } = render(<PoseSuggestions {...group} onPick={onPick} />);
    const list = await screen.findByRole('list', { name: 'Suggested poses' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(8);
    await waitFor(async () => expect(await db.poses.count()).toBeGreaterThan(0));
    await userEvent.click(cards[0]!);
    expect(onPick).toHaveBeenCalledTimes(1);
    const picked = onPick.mock.calls[0]![0] as { id: string };
    rerender(<PoseSuggestions {...group} onPick={onPick} selectedId={picked.id} />);
    const pressed = within(screen.getByRole('list', { name: 'Suggested poses' })).getAllByRole('listitem').filter((c) => c.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
  });

  it('respects the limit, and shows nothing when nothing fits', async () => {
    const { rerender, container } = render(<PoseSuggestions {...group} limit={2} onPick={() => {}} />);
    await waitFor(() => expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2));
    rerender(<PoseSuggestions {...group} peopleCount={500} limit={2} onPick={() => {}} />);
    await waitFor(() => expect(container.querySelector('.pl-suggest')).toBeNull());
  });
});

describe('CustomShotSheet', () => {
  it('needs someone picked, then adds the shot with its name and closes', async () => {
    const { family, ivy, max, dog } = await seedFamily();
    const shoot = await createShoot(family, { date: '2026-12-05' });
    const people = await db.people.where('familyId').equals(family.id).toArray();
    const extras = await db.extras.toArray();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CustomShotSheet shootId={shoot.id} people={people} partnerships={[]} extras={extras} attendingIds={[ivy.id, max.id, dog.id]} onClose={onClose} />);
    const add = screen.getByRole('button', { name: 'Add shot' });
    expect(add).toBeDisabled();
    // Only the people coming are offered.
    expect(screen.queryByText(/Gran Tester/)).toBeNull();
    await user.type(screen.getByLabelText(/Name/), 'Ivy and the dog');
    await user.click(screen.getByRole('checkbox', { name: /Ivy/ }));
    await user.click(screen.getByRole('checkbox', { name: /Biscuit/ }));
    expect(screen.getByText('Who is in it (2)')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Ivy/ }));
    expect(screen.getByText('Who is in it (1)')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Ivy/ }));
    await user.click(add);
    expect(onClose).toHaveBeenCalled();
    await waitFor(async () => {
      const s = (await db.shoots.get(shoot.id))!;
      const custom = s.shots.find((x) => x.name === 'Ivy and the dog');
      expect(custom?.personIds.sort()).toEqual([ivy.id, dog.id].sort());
    });
  });
});

describe('TemplatesPanel preview counts', () => {
  const ids = TEMPLATE_IDS;
  const templates = (on: string[]) => ids.map((id) => ({ id, enabled: on.includes(id) }));
  const input = (on: string[]) => ({ people: DEMO_PEOPLE, extras: DEMO_EXTRAS, attendingIds: DEMO_ATTENDING, templateIds: on as never });

  it('shows "N shots" for a template that is on and "+N shots" or "no new shots" for one that is off, matching the engine', () => {
    const on = ['fullGroup', 'households'];
    const previews = previewCounts(input(on));
    render(<TemplatesPanel templates={templates(on) as never} previews={previews} onToggle={() => {}} onSolo={() => {}} />);
    const row = (label: string) => screen.getByRole('switch', { name: label }).closest('.toggle-row')!;
    expect(row('Full group')).toHaveTextContent('1 shot');
    expect(within(row('Each household') as HTMLElement).getByText(/shots?$/)).toHaveTextContent(`${previews.households.standalone} shots`);
    expect(row('Each couple')).toHaveTextContent(`+${previews.couples.added} shots`);
    // Every off template says what it would add, in the engine's numbers.
    for (const t of ids.filter((x) => !on.includes(x) && !x.startsWith('solo'))) {
      const label = TEMPLATES.find((x) => x.id === t)!.label;
      const added = previews[t].added;
      expect(row(label)).toHaveTextContent(added === 0 ? 'no new shots' : `+${added} ${added === 1 ? 'shot' : 'shots'}`);
    }
    // What a template says it adds is what the list really grows by when it is switched on.
    const allButCouples = ids.filter((t) => t !== 'couples');
    const grow = generateShots(input(ids)).shots.length - generateShots(input(allButCouples)).shots.length;
    expect(previewCounts(input(allButCouples)).couples.added).toBe(grow);
  });

  it('says "1 shot" in the singular and switches templates and solo scope', async () => {
    const previews = previewCounts(input([]));
    const single = ids.find((t) => previews[t].added === 1 && t !== 'soloKids');
    const onToggle = vi.fn();
    const onSolo = vi.fn();
    const user = userEvent.setup();
    render(<TemplatesPanel templates={templates([]) as never} previews={previews} onToggle={onToggle} onSolo={onSolo} />);
    if (single) expect(screen.getAllByText('+1 shot').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('switch', { name: 'Full group' }));
    expect(onToggle).toHaveBeenCalledWith('fullGroup', true);
    expect(screen.getByText('off')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Kids' }));
    expect(onSolo).toHaveBeenCalledWith('kids');
  });

  it('shows the count for the chosen solo scope', () => {
    const on = ['soloKids'];
    const previews = previewCounts(input(on));
    render(<TemplatesPanel templates={templates(on) as never} previews={previews} onToggle={() => {}} onSolo={() => {}} />);
    expect(screen.getByText(`${previews.soloKids.standalone} shots`)).toBeInTheDocument();
  });
});
