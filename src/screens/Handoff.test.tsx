import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { buildHandoff, encodeHandoff, handoffLink, type ShootHandoff } from '../data/handoff';
import { createShoot, markShotOnDay, markSent, startShoot } from '../data/repo';
import { clearDb, seedFamily } from '../test/helpers';
import { LiveScreen } from './LiveScreen';
import { ReceiveScreen } from './ReceiveScreen';
import { ShootScreen } from './ShootScreen';
import { ShootsScreen } from './ShootsScreen';

beforeEach(async () => {
  await clearDb();
  window.location.hash = '#/';
});
afterEach(() => vi.restoreAllMocks());

async function sent(opts: { start?: boolean; done?: number } = {}) {
  const seeded = await seedFamily();
  const shoot = await createShoot(seeded.family, { date: '2026-12-05', title: 'Winter' });
  if (opts.start) await startShoot(shoot.id);
  for (let i = 0; i < (opts.done ?? 0); i++) await markShotOnDay(shoot.id, (await db.shoots.get(shoot.id))!.shots[i]!.id, 'done');
  const handoff = (await buildHandoff(shoot.id))!;
  return { ...seeded, shootId: shoot.id, handoff, data: await encodeHandoff(handoff) };
}
/** The other phone: nothing on it. */
const wipe = clearDb;

describe('ReceiveScreen', () => {
  it('shows the family, date and progress, and opens the shoot here', async () => {
    const { data, shootId } = await sent();
    await wipe();
    const user = userEvent.setup();
    render(<ReceiveScreen data={data} />);
    expect(await screen.findByText('The Testers')).toBeInTheDocument();
    expect(document.querySelector('.hint')).toHaveTextContent('Winter · Sat, Dec 5 · Planned · 7 shots');
    expect(screen.getByRole('button', { name: 'Copy for the app' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open here' }));
    await waitFor(async () => expect(await db.shoots.get(shootId)).toBeTruthy());
    expect(await db.families.count()).toBe(1);
    expect(window.location.hash).toBe(`#/shoots/${shootId}`);
  });

  it('copies the link for the installed app', async () => {
    const { data } = await sent();
    await wipe();
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ReceiveScreen data={data} />);
    await user.click(await screen.findByRole('button', { name: 'Copy for the app' }));
    expect(writeText).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Paste shoot');
  });

  it('says so for a damaged link, and saves nothing', async () => {
    await wipe();
    render(<ReceiveScreen data="zNotReallyData" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/damaged|cut off/);
    expect(await db.shoots.count()).toBe(0);
  });

  it('opens a live shoot on its live screen', async () => {
    const { data, shootId } = await sent({ start: true });
    await wipe();
    const user = userEvent.setup();
    render(<ReceiveScreen data={data} />);
    await user.click(await screen.findByRole('button', { name: 'Open here' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/shoots/${shootId}/live`));
  });

  it('has nothing to do for a copy it already has', async () => {
    const { data, shootId } = await sent();
    await markSent(shootId, 1);
    render(<ReceiveScreen data={data} />);
    expect(await screen.findByText(/already has this shoot/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open your copy' })).toBeInTheDocument();
  });

  it('refuses a copy with fewer done shots unless Replace anyway (SH4)', async () => {
    const { data, shootId } = await sent({ start: true });
    // Hand it over to "the assistant" (this phone becomes the assistant's), who then marks shots done.
    await wipe();
    const user = userEvent.setup();
    const first = render(<ReceiveScreen data={data} />);
    await user.click(await screen.findByRole('button', { name: 'Open here' }));
    first.unmount();
    await waitFor(async () => expect(await db.shoots.get(shootId)).toBeTruthy());
    await markShotOnDay(shootId, (await db.shoots.get(shootId))!.shots[0]!.id, 'done');
    // An older-state copy comes in again with a higher number.
    const older: ShootHandoff = { ...JSON.parse(JSON.stringify(await buildHandoff(shootId))), n: 5, from: 'photographer' };
    older.shoot.shots = older.shoot.shots.map((s) => ({ ...s, status: 'todo' }));
    render(<ReceiveScreen data={await encodeHandoff(older)} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('1 shots done; this copy has 0');
    await user.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect((await db.shoots.get(shootId))!.shots.filter((s) => s.status === 'done')).toHaveLength(1);
  });

  it('replaces anyway on a second tap', async () => {
    const { data, shootId } = await sent({ start: true });
    await wipe();
    const user = userEvent.setup();
    const first = render(<ReceiveScreen data={data} />);
    await user.click(await screen.findByRole('button', { name: 'Open here' }));
    first.unmount();
    await waitFor(async () => expect(await db.shoots.get(shootId)).toBeTruthy());
    await markShotOnDay(shootId, (await db.shoots.get(shootId))!.shots[0]!.id, 'done');
    const older: ShootHandoff = { ...JSON.parse(JSON.stringify(await buildHandoff(shootId))), n: 5, from: 'photographer' };
    older.shoot.shots = older.shoot.shots.map((s) => ({ ...s, status: 'todo' }));
    render(<ReceiveScreen data={await encodeHandoff(older)} />);
    await user.click(await screen.findByRole('button', { name: 'Replace anyway' }));
    await waitFor(async () => expect((await db.shoots.get(shootId))!.shots.filter((s) => s.status === 'done')).toHaveLength(0));
    expect((await db.shoots.get(shootId))!.handoff).toMatchObject({ n: 5, role: 'assistant' });
  });

  it('asks which to keep when both phones changed', async () => {
    const { shootId, handoff } = await sent();
    await db.shoots.update(shootId, { handoff: { n: 2, role: 'photographer', away: false }, updatedAt: 500 });
    const theirs: ShootHandoff = { ...handoff, n: 2, from: 'assistant', shoot: { ...handoff.shoot, updatedAt: 900, title: 'Theirs' } };
    const user = userEvent.setup();
    render(<ReceiveScreen data={await encodeHandoff(theirs)} />);
    expect(await screen.findByText(/Both phones changed this shoot/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use this copy' }));
    await waitFor(async () => expect((await db.shoots.get(shootId))!.title).toBe('Theirs'));
  });
});

describe('Share shoot sheet and the Shared marks', () => {
  it('texts a link, marks the shoot shared, and lets a planned shoot be shared again', async () => {
    const { shootId } = await sent();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const user = userEvent.setup();
    render(<ShootScreen shootId={shootId} />);
    await user.click(await screen.findByRole('button', { name: 'Share shoot' }));
    const sheet = await screen.findByRole('dialog', { name: 'Share shoot' });
    expect(within(sheet).getByText(/You’re the photographer/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Text a link' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0]![0].url).toContain('#/receive/');
    expect(await screen.findByRole('complementary', { name: 'Shared with the other phone' })).toBeInTheDocument();
    expect((await db.shoots.get(shootId))!.handoff).toMatchObject({ n: 1, role: 'photographer', away: true });
    expect(screen.queryByRole('button', { name: 'Take back control' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share again' })).toBeInTheDocument();
    Reflect.deleteProperty(navigator, 'share');
  });

  it('labels shared shoots in the list (SH6)', async () => {
    const { shootId } = await sent();
    await markSent(shootId, 1);
    render(<ShootsScreen />);
    expect(await screen.findByText('Shared')).toBeInTheDocument();
  });

  it('pastes a shoot link from the clipboard, and says if it is not one', async () => {
    const { data } = await sent();
    const user = userEvent.setup();
    const readText = vi.fn().mockResolvedValue(`Our shoot: ${handoffLink(data, { origin: 'https://x.test', pathname: '/p/' })}`);
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
    render(<ShootsScreen />);
    await user.click(await screen.findByRole('button', { name: 'Paste shoot' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/receive/${data}`));
    readText.mockResolvedValue('lunch at one?');
    await user.click(screen.getByRole('button', { name: 'Paste shoot' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t a Photo Planner shoot link');
  });

  it('opens a shoot file, and rejects one that is not', async () => {
    const { handoff } = await sent();
    const user = userEvent.setup({ applyAccept: false });
    render(<ShootsScreen />);
    const input = await screen.findByLabelText('Shoot file');
    await user.upload(input, new File(['nope'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t a Photo Planner shoot');
    await user.upload(input, new File([JSON.stringify(handoff)], 'shoot.json', { type: 'application/json' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/receive\/z/));
  });
});

describe('a live shoot on the other phone is locked (SH5)', () => {
  it('disables Done, Undo and Who’s here until Take back control, after a confirm', async () => {
    const { shootId } = await sent({ start: true, done: 1 });
    await markSent(shootId, 1);
    const user = userEvent.setup();
    render(<LiveScreen shootId={shootId} lightBanner={<p />} />);
    expect(await screen.findByRole('complementary', { name: 'Shared with the other phone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done ✓' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Undo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Who’s here/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Take back control' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Take back control?' });
    await user.click(within(ask).getByRole('button', { name: 'Take back control' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done ✓' })).toBeEnabled());
    expect(screen.queryByRole('complementary', { name: 'Shared with the other phone' })).not.toBeInTheDocument();
    expect((await db.shoots.get(shootId))!.handoff).toMatchObject({ n: 2, away: false });
  });

  it('shares from the live menu', async () => {
    const { shootId } = await sent({ start: true });
    const user = userEvent.setup();
    render(<LiveScreen shootId={shootId} lightBanner={<p />} />);
    await user.click(await screen.findByRole('button', { name: 'Shoot day menu' }));
    await user.click(screen.getByRole('button', { name: 'Share shoot' }));
    expect(await screen.findByRole('dialog', { name: 'Share shoot' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AirDrop a file' })).toBeInTheDocument();
  });

  it('shares a finished shoot from the summary and locks nothing', async () => {
    const { shootId } = await sent({ start: true, done: 1 });
    await db.shoots.update(shootId, { status: 'done', finishedAt: Date.now() });
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockResolvedValue(undefined), configurable: true });
    const user = userEvent.setup();
    render(<LiveScreen shootId={shootId} />);
    await user.click(await screen.findByRole('button', { name: 'Share shoot' }));
    await user.click(await screen.findByRole('button', { name: 'Text a link' }));
    await waitFor(async () => expect((await db.shoots.get(shootId))!.handoff).toMatchObject({ n: 1, away: false }));
    expect(screen.queryByRole('complementary', { name: 'Shared with the other phone' })).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Shoot shared.');
    Reflect.deleteProperty(navigator, 'share');
  });
});
