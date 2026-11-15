import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { createFamily, setFamilyArchived } from '../data/repo';
import { clearDb, seedFamily } from '../test/helpers';
import { FamiliesScreen } from './FamiliesScreen';

beforeEach(async () => {
  await clearDb();
  window.location.hash = '#/families';
});
afterEach(() => vi.restoreAllMocks());

describe('FamiliesScreen', () => {
  it('shows the empty state and loads the demo family', async () => {
    const user = userEvent.setup();
    render(<FamiliesScreen />);
    expect(await screen.findByText('No families yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load demo family' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/families\/.+/));
    expect(await db.people.count()).toBeGreaterThanOrEqual(20);
  });

  it('adds, searches, renames and counts people', async () => {
    const user = userEvent.setup();
    await seedFamily();
    render(<FamiliesScreen />);
    expect(await screen.findByText('The Testers')).toBeInTheDocument();
    expect(screen.getByText('5 people')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New family' }));
    await user.type(screen.getByLabelText('Family name'), 'The Okafors');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/families\/.+/));
    expect((await db.families.toArray()).map((f) => f.name).sort()).toEqual(['The Okafors', 'The Testers']);

    await user.type(screen.getByLabelText('Search families'), 'oka');
    expect(screen.queryByText('The Testers')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search families'));
    await user.type(screen.getByLabelText('Search families'), 'zzz');
    expect(screen.getByText(/No family matches/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search families'));

    await user.click(screen.getByRole('button', { name: 'Options for The Testers' }));
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Family name');
    await user.clear(input);
    await user.type(input, 'The Examples');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('The Examples')).toBeInTheDocument();
  });

  it('archives and unarchives, hiding archived families until asked', async () => {
    const user = userEvent.setup();
    await seedFamily();
    render(<FamiliesScreen />);
    await user.click(await screen.findByRole('button', { name: 'Options for The Testers' }));
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(screen.queryByText('The Testers')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Show archived (1)' }));
    expect(screen.getByText('Archived')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Options for The Testers' }));
    await user.click(screen.getByRole('button', { name: 'Unarchive' }));
    await waitFor(async () => expect((await db.families.toArray())[0]!.archived).toBe(false));
  });

  it('deletes a family only after confirming', async () => {
    const user = userEvent.setup();
    const { family } = await seedFamily();
    await createFamily('Other');
    render(<FamiliesScreen />);
    await user.click(await screen.findByRole('button', { name: 'Options for The Testers' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    let ask = await screen.findByRole('alertdialog', { name: 'Delete The Testers?' });
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await db.families.get(family.id)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    ask = await screen.findByRole('alertdialog');
    await user.click(within(ask).getByRole('button', { name: 'Delete' }));
    await waitFor(async () => expect(await db.families.get(family.id)).toBeUndefined());
    expect(await db.people.count()).toBe(0);
  });

  it('quick add walks name, grandparents, children, then partners and kids', async () => {
    const user = userEvent.setup();
    render(<FamiliesScreen />);
    await user.click(await screen.findByRole('button', { name: 'Quick add family' }));
    const sheet = screen.getByRole('dialog', { name: 'Quick add family' });
    await user.type(within(sheet).getByLabelText('What is the family called?'), 'The Rivers');
    await user.click(within(sheet).getByRole('button', { name: 'Next' }));
    await user.type(within(sheet).getByLabelText('First grandparent'), 'Ann Rivers');
    await user.type(within(sheet).getByLabelText('Second grandparent'), 'Bo Rivers');
    await user.click(within(sheet).getByRole('button', { name: 'Next' }));
    await user.type(within(sheet).getByLabelText('Children'), 'Cy{Enter}Gus');
    await user.click(within(sheet).getByRole('button', { name: 'Next' }));
    await user.type(within(sheet).getByLabelText('Partner of Cy'), 'Di');
    await user.type(within(sheet).getByLabelText('Kids of Cy'), 'Eli{Enter}Fay');
    await user.click(within(sheet).getByRole('button', { name: 'Create family' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/families\/.+/));
    expect((await db.people.toArray()).map((p) => p.name).sort()).toEqual(['Ann Rivers', 'Bo Rivers', 'Cy', 'Di', 'Eli', 'Fay', 'Gus']);
    expect(await db.partnerships.count()).toBe(2);
  });

  it('quick add can go back, and skips children', async () => {
    const user = userEvent.setup();
    await setFamilyArchived((await createFamily('X')).id, false);
    render(<FamiliesScreen />);
    await user.click(await screen.findByRole('button', { name: 'Quick add family' }));
    await user.type(screen.getByLabelText('What is the family called?'), 'Solo');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.type(screen.getByLabelText('First grandparent'), 'Only One');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText(/No children to add/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create family' }));
    await waitFor(async () => expect(await db.people.count()).toBe(1));
  });
});
