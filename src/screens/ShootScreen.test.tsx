import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { createDemoFamily, createShoot, updateShoot } from '../data/repo';
import { clearDb, seedFamily } from '../test/helpers';
import { ShootScreen } from './ShootScreen';

beforeEach(async () => {
  await clearDb();
  window.location.hash = '#/';
});
afterEach(() => vi.restoreAllMocks());

async function open() {
  const seeded = await seedFamily();
  const shoot = await createShoot(seeded.family, { date: '2026-12-05', startTime: '16:00', title: 'Winter' });
  const user = userEvent.setup();
  render(<ShootScreen shootId={shoot.id} />);
  await screen.findByRole('heading', { name: 'Winter' });
  return { ...seeded, shoot, user };
}

const rows = () => screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-label')?.startsWith('Shot '));
const shotNames = () => rows().map((li) => within(li).getAllByRole('button')[1]!.textContent);
const reload = async (id: string) => (await db.shoots.get(id))!;

describe('ShootScreen', () => {
  it('says so when the shoot is gone', async () => {
    render(<ShootScreen shootId="nope" />);
    expect(await screen.findByText(/isn’t on this phone/)).toBeInTheDocument();
  });

  it('shows the header: date, start time, family, attendees and time estimate (P3)', async () => {
    await open();
    const head = screen.getByRole('region', { name: 'Shoot' });
    expect(head).toHaveTextContent('4:00 PM');
    expect(head).toHaveTextContent('The Testers');
    expect(head).toHaveTextContent('6 attending');
    expect(head).toHaveTextContent(/about \d+ min/);
    expect(head).toHaveTextContent(/\d+ shots/);
  });

  it('shows the generated shots with people chips, clock times and must-have stars (E1, O5)', async () => {
    const { user, shoot } = await open();
    expect(shotNames()).toContain('Everyone');
    const first = rows()[0]!;
    expect(first).toHaveTextContent(/4:0\d PM/);
    expect(first).toHaveTextContent(/\d min/);
    expect(within(first).getByText('Gran')).toBeInTheDocument();
    const star = within(first).getByRole('button', { name: /^Must-have:/ });
    expect(star).toHaveAttribute('aria-pressed', 'false');
    await user.click(star);
    await waitFor(async () => expect((await reload(shoot.id)).shots.filter((s) => s.mustHave)).toHaveLength(1));
    await waitFor(() => expect(within(rows()[0]!).getByRole('button', { name: /^Must-have:/ })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('shows how many shots a template makes before you switch it on, then adds them (E2, E5)', async () => {
    const { user, shoot } = await open();
    const before = shotNames().length;
    const toggle = screen.getByRole('switch', { name: 'Each parent + each child' });
    expect(toggle).not.toBeChecked();
    expect(toggle.closest('label')).toHaveTextContent(/\+\d+ shots/);
    await user.click(toggle);
    await waitFor(() => expect(shotNames().length).toBeGreaterThan(before));
    expect(screen.getByRole('switch', { name: 'Each parent + each child' })).toBeChecked();
    expect((await reload(shoot.id)).templates.find((t) => t.id === 'parentChild')!.enabled).toBe(true);
    expect(screen.getByRole('switch', { name: 'Each parent + each child' }).closest('label')).toHaveTextContent(/\d+ shots?/);
    await user.click(screen.getByRole('switch', { name: 'Each parent + each child' }));
    await waitFor(() => expect(shotNames().length).toBe(before));
  });

  it('picks who gets a solo portrait', async () => {
    const { user, shoot } = await open();
    const solos = async () => (await reload(shoot.id)).shots.filter((s) => s.source.startsWith('solo')).length;
    expect(await solos()).toBe(1);
    await user.click(screen.getByRole('radio', { name: 'Everyone' }));
    await waitFor(async () => expect(await solos()).toBe(5));
    await user.click(screen.getByRole('radio', { name: 'Off' }));
    await waitFor(async () => expect(await solos()).toBe(0));
  });

  it('follows who is coming (E3)', async () => {
    const { user, shoot, ivy } = await open();
    await user.click(screen.getByRole('button', { name: '6 attending' }));
    const sheet = await screen.findByRole('dialog', { name: 'Who is coming' });
    await user.click(within(sheet).getByRole('checkbox', { name: /Ivy Tester/ }));
    await waitFor(async () => expect((await reload(shoot.id)).attendingIds).not.toContain(ivy.id));
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: '5 attending' })).toBeInTheDocument();
    expect(rows().every((li) => !within(li).queryByText('Ivy'))).toBe(true);
  });

  it('adds a custom shot picked from a list or from the tree (E4)', async () => {
    const { user, shoot, ivy, dog } = await open();
    await user.click(screen.getByRole('button', { name: '+ Custom shot' }));
    const sheet = await screen.findByRole('dialog', { name: 'Custom shot' });
    const add = within(sheet).getByRole('button', { name: 'Add shot' });
    expect(add).toBeDisabled();
    await user.type(within(sheet).getByLabelText(/Name/), 'Ivy and Biscuit');
    await user.click(within(sheet).getByRole('checkbox', { name: /Ivy Tester/ }));
    await user.click(within(sheet).getByRole('checkbox', { name: /Biscuit/ }));
    await user.click(within(sheet).getByRole('radio', { name: 'Tree' }));
    expect(within(sheet).getByTestId('family-tree')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /^Max Tester,/ }));
    await user.click(within(sheet).getByRole('button', { name: /^Max Tester,/ }));
    expect(within(sheet).getByRole('heading', { name: 'Who is in it (2)' })).toBeInTheDocument();
    await user.click(add);
    await waitFor(async () => {
      const saved = (await reload(shoot.id)).shots.find((s) => s.source === 'custom');
      expect(saved).toMatchObject({ name: 'Ivy and Biscuit', personIds: [ivy.id, dog.id] });
    });
    expect(await screen.findByRole('button', { name: 'Ivy and Biscuit' })).toBeInTheDocument();
  });

  it('opens a shot on the tree, with notes, a new name and removal that can be undone (V7, E6)', async () => {
    const { user, shoot } = await open();
    await user.click(within(rows()[0]!).getByRole('button', { name: 'Everyone' }));
    const sheet = await screen.findByRole('dialog', { name: 'Everyone' });
    expect(within(sheet).getByTestId('family-tree')).toBeInTheDocument();
    expect(within(sheet).getByText(/Made by: Full group/)).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText('Notes'), 'Smile');
    await user.click(within(sheet).getByRole('switch', { name: 'Must-have' }));
    const name = within(sheet).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'The whole gang{Enter}');
    await waitFor(async () =>
      expect((await reload(shoot.id)).shots.find((s) => s.source === 'fullGroup')).toMatchObject({ name: 'The whole gang', nameEdited: true, notes: 'Smile', mustHave: true }),
    );
    await user.click(within(sheet).getByRole('button', { name: 'Remove this shot' }));
    await waitFor(() => expect(shotNames()).not.toContain('The whole gang'));
    expect((await reload(shoot.id)).removedKeys).toHaveLength(1);
    expect(await screen.findByText('Removed shots (1)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore Everyone' }));
    await waitFor(() => expect(screen.queryByText(/Removed shots/)).not.toBeInTheDocument());
    // It comes back as the generated shot, with its own name.
    expect(shotNames()).toContain('Everyone');
  });

  it('starts the shoot and opens shoot day (§8)', async () => {
    const { user, shoot } = await open();
    await user.click(screen.getByRole('button', { name: 'Start shoot' }));
    await waitFor(async () => expect((await reload(shoot.id)).status).toBe('live'));
    expect(window.location.hash).toBe(`#/shoots/${shoot.id}/live`);
    expect(await screen.findByRole('link', { name: 'Continue shoot day' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish shoot' }));
    await waitFor(async () => expect((await reload(shoot.id)).status).toBe('done'));
    await user.click(await screen.findByRole('button', { name: 'Reopen shoot' }));
    await waitFor(async () => expect((await reload(shoot.id)).status).toBe('live'));
  });

  it('attaches a suggested pose to a shot (PL5) and lists it on the pose sheet (PL7)', async () => {
    const { user, shoot } = await open();
    await user.click(screen.getByRole('button', { name: /^Pose sheet/ }));
    expect(await screen.findByText(/No poses yet/)).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog', { name: 'Pose sheet' })).getByRole('button', { name: 'Done' }));
    await user.click(within(rows()[0]!).getByRole('button', { name: 'Everyone' }));
    const sheet = await screen.findByRole('dialog', { name: 'Everyone' });
    const pick = await within(sheet).findAllByRole('listitem');
    await user.click(pick[0]!);
    await waitFor(async () => expect((await reload(shoot.id)).shots.find((s) => s.name === 'Everyone')!.poseIds).toHaveLength(1));
    expect(await within(sheet).findByRole('button', { name: 'Clear poses' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: /^Pose sheet \(1\)/ }));
    const poseList = await screen.findByRole('list', { name: 'Shots with poses' });
    expect(poseList).toHaveTextContent('Everyone');
    await user.click(within(screen.getByRole('dialog', { name: 'Pose sheet' })).getByRole('button', { name: 'Done' }));
    await user.click(within(rows()[0]!).getByRole('button', { name: 'Everyone' }));
    await user.click(await screen.findByRole('button', { name: 'Clear poses' }, { timeout: 3000 }));
    await waitFor(async () => expect((await reload(shoot.id)).shots.find((s) => s.name === 'Everyone')!.poseIds).toBeUndefined());
  });

  it('attaches several poses to a shot, counts them, reorders them and lists all of them (PL5, PL7)', async () => {
    const { user, shoot } = await open();
    await user.click(within(rows()[0]!).getByRole('button', { name: 'Everyone' }));
    const sheet = await screen.findByRole('dialog', { name: 'Everyone' });
    const cards = async () => within(await within(sheet).findByRole('list', { name: 'Suggested poses' })).getAllByRole('listitem');
    await waitFor(async () => expect(await db.poses.count()).toBeGreaterThan(0)); // the starter poses are seeded
    const names = (await cards()).slice(0, 3).map((c) => c.textContent);
    for (const text of names) await user.click((await cards()).find((c) => c.textContent === text)!);
    const shotNow = async () => (await reload(shoot.id)).shots.find((s) => s.name === 'Everyone')!;
    await waitFor(async () => expect((await shotNow()).poseIds).toHaveLength(3));
    expect(await within(sheet).findByText('3 poses')).toBeInTheDocument();
    const [a, b, c] = (await shotNow()).poseIds!;
    // Tapping a chosen one again takes it off.
    await user.click((await cards()).find((x) => x.textContent === names[1])!);
    await waitFor(async () => expect((await shotNow()).poseIds).toEqual([a, c]));
    // Reorder with the arrows.
    const chosen = within(sheet).getByRole('list', { name: 'Poses for this shot, in order' });
    await user.click(within(chosen).getAllByRole('button', { name: /^Move .* down$/ })[0]!);
    await waitFor(async () => expect((await shotNow()).poseIds).toEqual([c, a]));
    await waitFor(() => expect(within(chosen).getAllByRole('listitem')[0]).toHaveTextContent(/Cluster/i)); // the list on screen has caught up
    await user.click(within(chosen).getAllByRole('button', { name: /^Move .* up$/ })[1]!);
    await waitFor(async () => expect((await shotNow()).poseIds).toEqual([a, c]));
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: /^Pose sheet \(1\)/ }));
    const poseList = await screen.findByRole('list', { name: 'Shots with poses' });
    expect(within(poseList).getAllByText(/,/).length).toBeGreaterThan(0);
    expect(b).toBeDefined();
  });

  it('moves a shot with the drag handle’s arrow keys, which counts as ordering by hand (O4)', async () => {
    const { user, shoot } = await open();
    const before = shotNames();
    const handle = within(rows()[0]!).getByRole('button', { name: /^Drag .* to reorder$/ });
    handle.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(shotNames()[1]).toBe(before[0]));
    expect((await reload(shoot.id)).manualOrder).toBe(true);
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(shotNames()[0]).toBe(before[0]));
  });

  it('suggests an order with who to call in and who can leave, and re-orders the rest (O1–O4)', async () => {
    const demo = await createDemoFamily();
    const shoot = await createShoot(demo, { startTime: '10:00' });
    const user = userEvent.setup();
    render(<ShootScreen shootId={shoot.id} />);
    await screen.findByRole('button', { name: 'Suggested order' });
    await user.click(screen.getByRole('button', { name: 'Suggested order' }));
    await waitFor(async () => expect((await reload(shoot.id)).order).not.toEqual(shoot.order));
    const saved = await reload(shoot.id);
    expect(saved.manualOrder).toBe(false);
    expect(shotNames()[0]).toBe(saved.shots.find((s) => s.id === saved.order[0])!.name);
    expect(document.querySelector('.step.in')).toHaveTextContent('Call in:');
    expect(document.querySelector('.step.out')).toHaveTextContent('Can leave:');
    expect(screen.getAllByText(/done for the day/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '↻ Re-order rest' }));
    await user.click(screen.getByRole('switch', { name: 'Big group first' }));
    await waitFor(async () => expect((await reload(shoot.id)).orderOptions.bigGroupFirst).toBe(false));
  });

  it('flags shots that can’t be made when people are not coming (E3)', async () => {
    const seeded = await seedFamily();
    const shoot = await createShoot(seeded.family, { attendingIds: [seeded.max.id, seeded.nia.id, seeded.ivy.id] });
    await updateShoot(shoot.id, { templates: shoot.templates.map((t) => (t.id === 'grandparentsGrandkids' ? { ...t, enabled: true } : t)) });
    render(<ShootScreen shootId={shoot.id} />);
    const flagged = await screen.findByRole('region', { name: 'Shots that can’t be made' });
    expect(flagged).toHaveTextContent(/needs at least 3 people/);
  });

  it('shares the shot list as text (P5)', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      const { user } = await open();
      await user.click(screen.getByRole('button', { name: 'Shoot options' }));
      await user.click(await screen.findByRole('button', { name: 'Share shot list as text' }));
      await waitFor(() => expect(share).toHaveBeenCalled());
      const { text, title } = share.mock.calls[0]![0] as { text: string; title: string };
      expect(title).toBe('Winter');
      expect(text).toMatch(/^The Testers: Winter, .*from 4:00 PM\n\n1\. /);
      expect(text).toContain('Everyone');
      expect(await screen.findByText('Shot list shared.')).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(navigator, 'share');
    }
  });

  it('copies the text when sharing is not available', async () => {
    const { user } = await open();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Shoot options' }));
    await user.click(await screen.findByRole('button', { name: 'Share shot list as text' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(await screen.findByText(/Shot list copied/)).toBeInTheDocument();
  });

  it('edits the title, date and start time; duplicates (P4) and deletes with a confirmation', async () => {
    const { user, shoot } = await open();
    await user.click(screen.getByRole('button', { name: 'Shoot options' }));
    const sheet = await screen.findByRole('dialog', { name: 'Shoot options' });
    const title = within(sheet).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Spring');
    fireDate(within(sheet).getByLabelText('Date'), '2027-03-04');
    fireDate(within(sheet).getByLabelText('Start time'), '09:30');
    await waitFor(async () => expect(await reload(shoot.id)).toMatchObject({ title: 'Spring', date: '2027-03-04', startTime: '09:30' }));

    await user.click(within(sheet).getByRole('button', { name: 'Duplicate shoot' }));
    await waitFor(async () => expect(await db.shoots.count()).toBe(2));
    const copy = (await db.shoots.toArray()).find((s) => s.id !== shoot.id)!;
    expect(window.location.hash).toBe(`#/shoots/${copy.id}`);

    await user.click(screen.getByRole('button', { name: 'Shoot options' }));
    const again = await screen.findByRole('dialog', { name: 'Shoot options' });
    await user.click(within(again).getByRole('button', { name: 'Delete shoot' }));
    expect(await db.shoots.get(shoot.id)).toBeDefined();
    const ask = await screen.findByRole('alertdialog', { name: 'Delete shoot?' });
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(await db.shoots.get(shoot.id)).toBeDefined();
    await user.click(within(again).getByRole('button', { name: 'Delete shoot' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete shoot' }));
    await waitFor(async () => expect(await db.shoots.get(shoot.id)).toBeUndefined());
    expect(window.location.hash).toBe('#/');
  });
});

describe('ShootScreen early and late people', () => {
  it('marks people Early or Late one at a time, with badges on their chips (O7)', async () => {
    const { shoot, user, gran, ivy, nia } = await open();
    await user.click(screen.getByRole('button', { name: 'Early or late people' }));
    const sheet = await screen.findByRole('dialog', { name: 'Who goes first or last' });
    await user.click(within(within(sheet).getByRole('radiogroup', { name: 'Gran Tester goes' })).getByRole('radio', { name: 'Early' }));
    await waitFor(async () => expect((await reload(shoot.id)).priorities).toEqual({ [gran.id]: 'early' }));
    const order = (await reload(shoot.id)).order;
    const shots = (await reload(shoot.id)).shots;
    const flags = order.map((id) => shots.find((x) => x.id === id)!.personIds.includes(gran.id));
    expect(flags.slice(flags.indexOf(false)).every((f) => !f)).toBe(true);
    expect(within(sheet).queryByRole('checkbox')).toBeNull();
    await user.click(within(within(sheet).getByRole('radiogroup', { name: 'Ivy Tester goes' })).getByRole('radio', { name: 'Late' }));
    await user.click(within(within(sheet).getByRole('radiogroup', { name: 'Nia Tester goes' })).getByRole('radio', { name: 'Late' }));
    await waitFor(async () => expect((await reload(shoot.id)).priorities).toEqual({ [gran.id]: 'early', [ivy.id]: 'late', [nia.id]: 'late' }));
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: '3 early or late' })).toBeInTheDocument();
    expect(screen.getAllByText('Early').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Late').length).toBeGreaterThan(0);
  });

  it('resets everyone to Normal after a confirm, and only shows the reset when someone is Early or Late', async () => {
    const { shoot, user, gran, ivy } = await open();
    await user.click(screen.getByRole('button', { name: 'Early or late people' }));
    const sheet = await screen.findByRole('dialog', { name: 'Who goes first or last' });
    expect(within(sheet).queryByRole('button', { name: 'Reset all to Normal' })).toBeNull();
    await user.click(within(within(sheet).getByRole('radiogroup', { name: 'Gran Tester goes' })).getByRole('radio', { name: 'Early' }));
    await user.click(within(within(sheet).getByRole('radiogroup', { name: 'Ivy Tester goes' })).getByRole('radio', { name: 'Late' }));
    await waitFor(async () => expect((await reload(shoot.id)).priorities).toEqual({ [gran.id]: 'early', [ivy.id]: 'late' }));
    await user.click(await within(sheet).findByRole('button', { name: 'Reset all to Normal' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(Object.keys((await reload(shoot.id)).priorities ?? {})).toHaveLength(2);
    await user.click(within(sheet).getByRole('button', { name: 'Reset all to Normal' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reset all' }));
    await waitFor(async () => expect(Object.values((await reload(shoot.id)).priorities ?? {}).filter(Boolean)).toHaveLength(0));
    await waitFor(() => expect(within(sheet).queryByRole('button', { name: 'Reset all to Normal' })).toBeNull());
  });

  it('groups people by household, grandparents first', async () => {
    await open();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Early or late people' }));
    const sheet = await screen.findByRole('dialog', { name: 'Who goes first or last' });
    expect(within(sheet).getAllByRole('heading', { level: 3 })[0]).toHaveTextContent('Grandparents');
  });

  it('tells you when a hand-ordered list was left alone (O7)', async () => {
    const { shoot, user } = await open();
    await updateShoot(shoot.id, { manualOrder: true });
    await user.click(screen.getByRole('button', { name: 'Early or late people' }));
    const sheet = await screen.findByRole('dialog', { name: 'Who goes first or last' });
    await user.click(within(within(sheet).getByRole('radiogroup', { name: 'Gran Tester goes' })).getByRole('radio', { name: 'Late' }));
    expect(await within(sheet).findByRole('status')).toHaveTextContent(/by hand/);
  });
});

function fireDate(input: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ShootScreen everyone first (O9)', () => {
  it('has an Everyone first option, on by default, and says when the full group waits for someone', async () => {
    const { shoot, user, ivy } = await open();
    expect((await reload(shoot.id)).orderOptions.everyoneFirst).toBe(true);
    await user.click(screen.getByText(/^Order options/));
    const toggle = screen.getByRole('switch', { name: 'Everyone first' });
    expect(toggle).toBeChecked();
    expect(shotNames()[0]).toMatch(/everyone|full|group/i);
    await user.click(screen.getByRole('button', { name: 'Early or late people' }));
    const sheet = await screen.findByRole('dialog', { name: 'Who goes first or last' });
    await user.click(within(within(sheet).getByRole('radiogroup', { name: 'Ivy Tester goes' })).getByRole('radio', { name: 'Late' }));
    expect(await within(sheet).findByRole('status')).toHaveTextContent(/Full group waits for Ivy/);
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(await screen.findByText(/Full group waits for Ivy\./)).toBeInTheDocument();
    expect((await reload(shoot.id)).priorities).toEqual({ [ivy.id]: 'late' });
  });
});

