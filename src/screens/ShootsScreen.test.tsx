import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { addLocation, createFamily, createShoot, updatePerson, updateShoot } from '../data/repo';
import { clearDb, seedFamily } from '../test/helpers';
import { ShootsScreen } from './ShootsScreen';

beforeEach(async () => {
  await clearDb();
  window.location.hash = '#/';
});

describe('ShootsScreen', () => {
  it('asks for a family first when there is none, and offers no new shoot', async () => {
    render(<ShootsScreen />);
    expect(await screen.findByText('No shoots yet')).toBeInTheDocument();
    expect(screen.getByText(/Add a family first/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ New shoot' })).not.toBeInTheDocument();
  });

  it('invites a first shoot once there is a family', async () => {
    await createFamily('Empty');
    render(<ShootsScreen />);
    expect(await screen.findByText(/Plan a shoot and the shot list builds itself/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New shoot' })).toBeInTheDocument();
  });

  it('plans a new shoot: family, title, date, start time, and who is coming (P2)', async () => {
    const { family, ivy, max, dog } = await seedFamily();
    await updatePerson(ivy.id, { usuallyAbsent: true });
    const user = userEvent.setup();
    render(<ShootsScreen />);
    await user.click(await screen.findByRole('button', { name: '+ New shoot' }));
    const sheet = await screen.findByRole('dialog', { name: 'New shoot' });
    expect(within(sheet).getByRole('combobox', { name: 'Family' })).toHaveValue(family.id);
    await user.type(within(sheet).getByLabelText(/Title/), 'Autumn');
    const date = within(sheet).getByLabelText('Date');
    await user.clear(date);
    await user.type(date, '2026-12-05');
    await user.type(within(sheet).getByLabelText(/Start time/), '16:30');
    const ivyBox = await within(sheet).findByRole('checkbox', { name: /Ivy Tester/ });
    expect(ivyBox).not.toBeChecked();
    expect(within(sheet).getByRole('checkbox', { name: /Biscuit/ })).toBeChecked();
    await user.click(within(sheet).getByRole('checkbox', { name: /Max Tester/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Create shoot' }));
    await waitFor(async () => expect(await db.shoots.count()).toBe(1));
    const shoot = (await db.shoots.toArray())[0]!;
    expect(shoot).toMatchObject({ title: 'Autumn', date: '2026-12-05', startTime: '16:30', familyId: family.id });
    expect(shoot.attendingIds).not.toContain(ivy.id);
    expect(shoot.attendingIds).not.toContain(max.id);
    expect(shoot.attendingIds).toContain(dog.id);
    expect(shoot.shots.length).toBeGreaterThan(0);
    await waitFor(() => expect(window.location.hash).toBe(`#/shoots/${shoot.id}`));
  });

  it('starts again from the defaults when another family is picked, and needs someone coming', async () => {
    const { family } = await seedFamily();
    const other = await createFamily('Others');
    const user = userEvent.setup();
    render(<ShootsScreen />);
    await user.click(await screen.findByRole('button', { name: '+ New shoot' }));
    const sheet = await screen.findByRole('dialog', { name: 'New shoot' });
    await user.selectOptions(within(sheet).getByRole('combobox', { name: 'Family' }), family.id);
    await user.click(await within(sheet).findByRole('checkbox', { name: /Gran Tester/ }));
    await user.selectOptions(within(sheet).getByRole('combobox', { name: 'Family' }), other.id);
    expect(within(sheet).getByRole('button', { name: 'Create shoot' })).toBeDisabled();
    await user.selectOptions(within(sheet).getByRole('combobox', { name: 'Family' }), family.id);
    expect(await within(sheet).findByRole('checkbox', { name: /Gran Tester/ })).toBeChecked();
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('groups shoots as upcoming, in progress and finished, with date, place and progress (P1)', async () => {
    const { family } = await seedFamily();
    const place = await addLocation({ name: 'Elm Park', latitude: 40, longitude: -80, source: 'search' });
    const a = await createShoot(family, { date: '2026-12-05', title: 'Winter' });
    const b = await createShoot(family, { date: '2026-11-01' });
    const c = await createShoot(family, { date: '2026-10-01' });
    await updateShoot(a.id, { locationId: place.id, startTime: '09:00', shots: a.shots.map((s, i) => (i < 2 ? { ...s, status: 'done' as const } : s)) });
    await updateShoot(b.id, { status: 'live' });
    await updateShoot(c.id, { status: 'done' });
    render(<ShootsScreen />);
    expect(await screen.findByRole('heading', { name: 'Upcoming' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'In progress' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finished' })).toBeInTheDocument();
    const rows = screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.startsWith('#/shoots/'));
    expect(rows).toHaveLength(3);
    const upcoming = rows.find((r) => r.getAttribute('href') === `#/shoots/${a.id}`)!;
    expect(upcoming).toHaveTextContent('The Testers');
    expect(upcoming).toHaveTextContent('Winter');
    expect(upcoming).toHaveTextContent('Elm Park');
    expect(upcoming).toHaveTextContent('09:00');
    expect(upcoming).toHaveTextContent(`2/${a.shots.length}`);
  });
});
