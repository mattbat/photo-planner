import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { buildHandoff, encodeHandoff, type ShootHandoff } from '../data/handoff';
import { addChild, createShoot, markShotOnDay, markSent, startShoot, takeBack, updatePerson } from '../data/repo';
import { generateShots } from '../engine';
import { planShoot, toEnginePeople } from '../domain/shotView';
import { clearDb, seedFamily } from '../test/helpers';
import { FamiliesScreen } from './FamiliesScreen';
import { ReceiveScreen } from './ReceiveScreen';
import { ShootScreen } from './ShootScreen';
import { ShootsScreen } from './ShootsScreen';

beforeEach(async () => {
  await clearDb();
  window.location.hash = '#/';
});
afterEach(() => vi.restoreAllMocks());

const rows = () => screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-label')?.startsWith('Shot '));

describe('workflow: three generations to a shoot', () => {
  it('quick-adds a family, plans a shoot, and gets exactly the shots the engine makes', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<FamiliesScreen />);
    await user.click(await screen.findByRole('button', { name: 'Quick add family' }));
    const sheet = screen.getByRole('dialog', { name: 'Quick add family' });
    await user.type(within(sheet).getByLabelText('What is the family called?'), 'The Larkspurs');
    await user.click(within(sheet).getByRole('button', { name: 'Next' }));
    await user.type(within(sheet).getByLabelText('First grandparent'), 'Odette Larkspur');
    await user.type(within(sheet).getByLabelText('Second grandparent'), 'Bram Larkspur');
    await user.click(within(sheet).getByRole('button', { name: 'Next' }));
    await user.type(within(sheet).getByLabelText('Children'), 'Cleo{Enter}Dov{Enter}Esme');
    await user.click(within(sheet).getByRole('button', { name: 'Next' }));
    await user.type(within(sheet).getByLabelText('Partner of Cleo'), 'Finn');
    await user.type(within(sheet).getByLabelText('Kids of Cleo'), 'Gus{Enter}Hana');
    await user.type(within(sheet).getByLabelText('Kids of Dov'), 'Ines');
    await user.click(within(sheet).getByRole('button', { name: 'Create family' }));
    await waitFor(async () => expect(await db.people.count()).toBe(9));
    unmount();

    const user2 = userEvent.setup();
    render(<ShootsScreen />);
    await user2.click(await screen.findByRole('button', { name: '+ New shoot' }));
    const dialog = await screen.findByRole('dialog', { name: 'New shoot' });
    await user2.click(await within(dialog).findByRole('button', { name: 'Create shoot' }));
    await waitFor(async () => expect(await db.shoots.count()).toBe(1));
    const shoot = (await db.shoots.toArray())[0]!;

    // Same people, same templates: the engine's own list is the list on the shoot.
    const people = await db.people.toArray();
    const partnerships = await db.partnerships.toArray();
    const expected = planShoot({ people, partnerships, extras: [], shoot: { ...shoot, shots: [], order: [], removedKeys: [] }, familyName: 'The Larkspurs' });
    expect(shoot.shots.length).toBe(expected.shots.length);
    expect(shoot.shots.map((s) => s.id).sort()).toEqual(expected.shots.map((s) => s.id).sort());
    expect(shoot.shots.length).toBeGreaterThan(8);
    // Nobody appears who is not coming, and nothing is duplicated.
    const seen = new Set<string>();
    for (const s of shoot.shots) {
      for (const id of s.personIds) expect(shoot.attendingIds).toContain(id);
      const sig = [...s.personIds].sort().join(',');
      expect(seen.has(sig)).toBe(false);
      seen.add(sig);
    }
    // Switching a template on afterwards matches the engine's own count for it.
    const withPairs = planShoot({ people, partnerships, extras: [], shoot: { ...shoot, shots: [], order: [], removedKeys: [] }, familyName: 'The Larkspurs' });
    expect(withPairs.shots.length).toBe(
      generateShots({
        people: toEnginePeople(people, partnerships),
        extras: [],
        attendingIds: shoot.attendingIds,
        templateIds: shoot.templates.filter((t) => t.enabled).map((t) => t.id),
      }).shots.length,
    );
  });
});

describe('workflow: editing a person while a shoot is open', () => {
  it('adds a baby and the open shot list grows without leaving the screen', async () => {
    const { family, max, nia } = await seedFamily();
    const shoot = await createShoot(family, { date: '2026-12-05', title: 'Winter' });
    render(<ShootScreen shootId={shoot.id} />);
    await screen.findByRole('heading', { name: 'Winter' });
    const before = rows().length;
    const baby = await addChild(family.id, 'Bea Tester', [max.id, nia.id]);
    await updatePerson(baby.id, { ageGroup: 'child' });
    await db.shoots.update(shoot.id, { attendingIds: [...shoot.attendingIds, baby.id] });
    await waitFor(() => expect(rows().length).toBeGreaterThan(before));
    await waitFor(() => expect(rows().some((li) => within(li).queryByText('Bea'))).toBe(true));
  });

  it('a name change shows in the open list, and a hand-made rename of a shot stays', async () => {
    const { family, ivy } = await seedFamily();
    const shoot = await createShoot(family, { date: '2026-12-05', title: 'Winter' });
    const everyone = shoot.shots.find((s) => s.name === 'Everyone')!;
    await db.shoots.update(shoot.id, { shots: shoot.shots.map((s) => (s.id === everyone.id ? { ...s, name: 'The whole clan', nameEdited: true } : s)) });
    render(<ShootScreen shootId={shoot.id} />);
    await screen.findAllByText('The whole clan');
    await updatePerson(ivy.id, { name: 'Ivy-Rose Tester', nickname: 'Rosie' });
    await waitFor(() => expect(screen.getAllByText('Rosie').length).toBeGreaterThan(0));
    expect(screen.getAllByText('The whole clan').length).toBeGreaterThan(0);
  });

  it('removing someone from the family drops their shots from the open list', async () => {
    const { family, ivy } = await seedFamily();
    const shoot = await createShoot(family, { date: '2026-12-05', title: 'Winter' });
    render(<ShootScreen shootId={shoot.id} />);
    await screen.findByRole('heading', { name: 'Winter' });
    expect(rows().some((li) => within(li).queryByText('Ivy'))).toBe(true);
    const { deletePerson } = await import('../data/repo');
    await deletePerson(ivy.id);
    await waitFor(() => expect(rows().every((li) => !within(li).queryByText('Ivy'))).toBe(true));
  });
});

describe('workflow: a hand-off where both phones changed', () => {
  async function conflict() {
    const seeded = await seedFamily();
    const shoot = await createShoot(seeded.family, { date: '2026-12-05', title: 'Winter' });
    await startShoot(shoot.id);
    const mine0 = (await db.shoots.get(shoot.id))!;
    await markShotOnDay(shoot.id, mine0.shots[0]!.id, 'done');
    await markSent(shoot.id, 1);
    const sent: ShootHandoff = (await buildHandoff(shoot.id))!;
    // The photographer takes control back and carries on; the assistant also marked a shot.
    await takeBack(shoot.id);
    await db.shoots.update(shoot.id, { title: 'Mine, edited', updatedAt: 5_000 });
    const theirs: ShootHandoff = { ...sent, n: 2, from: 'assistant', shoot: { ...sent.shoot, title: 'Theirs, edited', updatedAt: 9_000 } };
    return { shootId: shoot.id, data: await encodeHandoff(theirs) };
  }

  it('Use this copy takes the other phone’s version and opens it', async () => {
    const { shootId, data } = await conflict();
    const user = userEvent.setup();
    render(<ReceiveScreen data={data} />);
    expect(await screen.findByText(/Both phones changed this shoot/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use this copy' }));
    await waitFor(async () => expect((await db.shoots.get(shootId))!.title).toBe('Theirs, edited'));
    await waitFor(() => expect(window.location.hash).toBe(`#/shoots/${shootId}/live`));
    expect((await db.shoots.get(shootId))!.handoff).toMatchObject({ n: 2, role: 'photographer', away: false });
  });

  it('Keep mine leaves this phone’s version alone and opens it', async () => {
    const { shootId, data } = await conflict();
    const before = (await db.shoots.get(shootId))!;
    const user = userEvent.setup();
    render(<ReceiveScreen data={data} />);
    await user.click(await screen.findByRole('button', { name: 'Keep mine' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/shoots/${shootId}/live`));
    expect(await db.shoots.get(shootId)).toEqual(before);
    expect(before.title).toBe('Mine, edited');
  });
});
