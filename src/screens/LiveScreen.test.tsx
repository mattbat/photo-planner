import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { createShoot, startShoot, updateSettings, updateShot, getSettings } from '../data/repo';
import { clearDb, seedFamily } from '../test/helpers';
import { LiveScreen } from './LiveScreen';

beforeEach(async () => {
  await clearDb();
  window.location.hash = '#/';
});
afterEach(() => vi.restoreAllMocks());

async function open(opts: { start?: boolean } = {}) {
  const seeded = await seedFamily();
  const shoot = await createShoot(seeded.family, { date: '2026-12-05', startTime: '16:00', title: 'Winter' });
  if (opts.start !== false) await startShoot(shoot.id);
  const user = userEvent.setup();
  render(<LiveScreen shootId={shoot.id} lightBanner={<p>LIGHT SLOT</p>} />);
  if (opts.start !== false) await screen.findByRole('button', { name: 'Done ✓' });
  return { ...seeded, shoot, user };
}
const reload = async (id: string) => (await db.shoots.get(id))!;
const card = () => screen.findByRole('region', { name: 'Current shot' });
const currentName = async () => within(await card()).getByRole('heading', { level: 2 }).textContent;

describe('LiveScreen', () => {
  it('says so when the shoot is gone or has not started', async () => {
    render(<LiveScreen shootId="nope" />);
    expect(await screen.findByText(/isn’t on this phone/)).toBeInTheDocument();
    const { shoot } = await open({ start: false });
    expect(await screen.findByText(/hasn’t started/)).toBeInTheDocument();
    expect(shoot.status).toBe('planned');
  });

  it('starts live with everyone here and the first shot current (D1, D5)', async () => {
    const { shoot, gran } = await open();
    const s = await reload(shoot.id);
    expect(s.status).toBe('live');
    expect(s.startedAt).toBeTypeOf('number');
    expect(s.presence[gran.id]).toBe('here');
    expect(s.currentShotId).toBe(s.order[0]);
    expect(await card()).toHaveTextContent(s.shots.find((x) => x.id === s.order[0])!.name);
    expect(screen.getByText('LIGHT SLOT')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Progress' })).toHaveTextContent(/0 of \d+ done/);
  });

  it('groups the people in the shot by branch with big names, and shows extras with emoji', async () => {
    const { shoot } = await open();
    await updateShot(shoot.id, (await reload(shoot.id)).order[0]!, { mustHave: true });
    const c = await card();
    await waitFor(() => expect(c).toHaveTextContent('Must-have'));
    expect(c).toHaveTextContent('Gran');
    expect(c).toHaveTextContent('Max');
    expect(c).toHaveTextContent('Max’s family');
    expect(c).toHaveTextContent('🐶 Biscuit');
  });

  it('Done saves at once and moves to the next shot; Undo reverses it exactly (D3, D10)', async () => {
    const { shoot, user } = await open();
    const first = await currentName();
    await user.click(screen.getByRole('button', { name: 'Done ✓' }));
    await waitFor(async () => expect(await currentName()).not.toBe(first));
    const s = await reload(shoot.id);
    expect(s.shots.filter((x) => x.status === 'done')).toHaveLength(1);
    expect(s.shots.find((x) => x.status === 'done')!.doneAt).toBeTypeOf('number');
    expect(screen.getByRole('region', { name: 'Progress' })).toHaveTextContent(/1 of \d+ done/);
    await user.click(screen.getByRole('button', { name: /^Undo Done/ }));
    await waitFor(async () => expect(await currentName()).toBe(first));
    const back = await reload(shoot.id);
    expect(back.shots.every((x) => x.status === 'todo')).toBe(true);
    expect(back.events).toEqual([]);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('Skip and Needs retake file the shot under Skipped and Retakes', async () => {
    const { shoot, user } = await open();
    const first = await currentName();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(async () => expect(await currentName()).not.toBe(first));
    await user.click(screen.getByRole('button', { name: 'Needs retake' }));
    await waitFor(async () => {
      const s = await reload(shoot.id);
      expect(s.shots.some((x) => x.status === 'skipped')).toBe(true);
      expect(s.shots.some((x) => x.status === 'retake')).toBe(true);
    });
    await user.click(screen.getByRole('radio', { name: /^List/ }));
    expect(screen.getByText(/^Skipped \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/^Retakes \(1\)/)).toBeInTheDocument();
  });

  it('shows who to call in and who can leave for the next shot (D2, O3)', async () => {
    await open();
    const next = await screen.findByRole('region', { name: 'Next shot' });
    expect(next.querySelector('.step.in, .step.out, .hint')).not.toBeNull();
  });

  it('the list has every status section and "Do this now" makes a shot current (D4)', async () => {
    const { shoot, user } = await open();
    await user.click(screen.getByRole('radio', { name: /^List/ }));
    expect(screen.getByText(/^To do \(/)).toBeInTheDocument();
    const target = (await reload(shoot.id)).shots[3]!;
    await user.click(screen.getByRole('button', { name: (n) => n.startsWith(target.name) }));
    await user.click(screen.getByRole('button', { name: 'Do this now' }));
    await waitFor(async () => expect((await reload(shoot.id)).currentShotId).toBe(target.id));
    await waitFor(async () => expect(await currentName()).toBe(target.name));
  });

  const markWho = async (user: ReturnType<typeof userEvent.setup>, who: string, to: string) => {
    if (!screen.queryByRole('dialog', { name: 'Who’s here' })) await user.click(screen.getByRole('button', { name: /^Who’s here/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Who’s here' });
    await user.click(within(within(dialog).getByRole('radiogroup', { name: `${who} is` })).getByRole('radio', { name: to }));
    return dialog;
  };

  it('a person marked left sends their shots to Waiting, and arriving brings them back (D5)', async () => {
    const { shoot, user, max } = await open();
    const dialog = await markWho(user, 'Max Tester', 'Left');
    await waitFor(async () => expect((await reload(shoot.id)).presence[max.id]).toBe('left'));
    expect(await within(dialog).findByText(/Move all of Max’s shots up next/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('radio', { name: /^List/ }));
    expect(await screen.findByText(/^Waiting \(/)).toBeInTheDocument();
    expect(screen.getAllByText('waiting for: Max').length).toBeGreaterThan(0);
    // The current shot never needs Max.
    await waitFor(async () => expect(await db.shoots.get(shoot.id).then((s) => s!.events.length)).toBe(1));
    await markWho(user, 'Max Tester', 'Here');
    await waitFor(() => expect(screen.queryByText(/^Waiting \(/)).not.toBeInTheDocument());
  });

  it('offers to move a leaving person\'s shots up next, and reorders what is left', async () => {
    const { shoot, user, ivy } = await open();
    const before = await reload(shoot.id);
    const dialog = await markWho(user, 'Ivy Tester', 'Left');
    await user.click(await within(dialog).findByRole('button', { name: /Move all of Ivy’s shots up next/ }));
    await waitFor(async () => expect((await reload(shoot.id)).manualOrder).toBe(true));
    const after = await reload(shoot.id);
    expect([...after.order].sort()).toEqual([...before.order].sort());
    const ivyShots = after.order.filter((id) => after.shots.find((x) => x.id === id)!.personIds.includes(ivy.id));
    expect(after.order.slice(1, 1 + ivyShots.length - (after.shots.find((x) => x.id === after.order[0])!.personIds.includes(ivy.id) ? 1 : 0)).every((id) => ivyShots.includes(id))).toBe(true);
  });

  it('"Treat everyone as here" off starts people as expected, so their shots wait (D5)', async () => {
    await updateSettings({ treatEveryoneAsHere: false });
    const { shoot, gran } = await open();
    expect((await reload(shoot.id)).presence[gran.id]).toBe('expected');
    expect(await screen.findByText(/Waiting for people/)).toBeInTheDocument();
    expect((await getSettings()).treatEveryoneAsHere).toBe(false);
  });

  it('adds a shot on the spot, which becomes current, and Undo removes it (D6)', async () => {
    const { shoot, user, ivy } = await open();
    await user.click(screen.getByRole('button', { name: '+ Shot' }));
    const dialog = await screen.findByRole('dialog', { name: 'Custom shot' });
    await user.type(within(dialog).getByLabelText(/Name/), 'Just Ivy');
    await user.click(within(dialog).getByRole('checkbox', { name: /Ivy/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Add shot' }));
    await waitFor(async () => expect(await currentName()).toBe('Just Ivy'));
    const s = await reload(shoot.id);
    expect(s.events.at(-1)).toMatchObject({ type: 'add-shot' });
    expect(s.shots.find((x) => x.name === 'Just Ivy')!.personIds).toEqual([ivy.id]);
    await user.click(screen.getByRole('button', { name: /^Undo Added/ }));
    await waitFor(async () => expect((await reload(shoot.id)).shots.some((x) => x.name === 'Just Ivy')).toBe(false));
  });

  it('shows the tree with the current shot highlighted and presence badges (V7, V8)', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('radio', { name: 'Tree' }));
    const tree = await screen.findByTestId('family-tree');
    expect(tree.querySelectorAll('[data-dimmed]').length).toBeGreaterThan(0);
    expect(tree.querySelector('[aria-label*="arrived"]')).not.toBeNull();
  });

  it('keeps the screen awake while live (D8)', async () => {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release, addEventListener: () => {} }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    await open();
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    delete (navigator as { wakeLock?: unknown }).wakeLock;
  });

  it('finishing shows a summary to share, and the shoot can be reopened (D9)', async () => {
    const { shoot, user } = await open();
    const first = await currentName();
    await user.click(screen.getByRole('button', { name: 'Done ✓' }));
    await waitFor(async () => expect(await currentName()).not.toBe(first));
    await user.click(screen.getByRole('button', { name: 'Needs retake' }));
    await waitFor(async () => expect((await reload(shoot.id)).shots.some((x) => x.status === 'retake')).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Shoot day menu' }));
    await user.click(await screen.findByRole('button', { name: 'Finish shoot' }));
    const sum = await screen.findByRole('region', { name: 'Summary' });
    expect(sum).toHaveTextContent(/1 of \d+ shots done/);
    expect(sum).toHaveTextContent('1 retake still owed');
    expect((await reload(shoot.id)).status).toBe('done');
    const shared = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: shared }, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Share summary as text' }));
    await waitFor(() => expect(shared.mock.calls.length + (document.querySelectorAll('[role=status]').length)).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: 'Reopen shoot' }));
    expect(await screen.findByRole('button', { name: 'Done ✓' })).toBeInTheDocument();
    expect((await reload(shoot.id)).finishedAt).toBeUndefined();
  });

  it('offers Finish shoot when every shot is handled', async () => {
    const { shoot, user } = await open();
    await db.shoots.update(shoot.id, { shots: (await reload(shoot.id)).shots.map((x) => ({ ...x, status: 'done' as const })) });
    await user.click(await screen.findByRole('button', { name: 'Finish shoot' }));
    await waitFor(async () => expect((await reload(shoot.id)).status).toBe('done'));
  });
});
