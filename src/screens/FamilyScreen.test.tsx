import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { addPerson, createFamily, updatePerson } from '../data/repo';
import { clearDb, seedFamily } from '../test/helpers';

const share = vi.hoisted(() => vi.fn());
vi.mock('../components/treeImage', () => ({ shareTreeImage: share }));

const { FamilyScreen } = await import('./FamilyScreen');

beforeEach(async () => {
  await clearDb();
  share.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const open = async (familyId: string, name: string) => {
  const user = userEvent.setup();
  render(<FamilyScreen familyId={familyId} />);
  await user.click(await screen.findByRole('button', { name: new RegExp(`^${name},`) }));
  return { user, sheet: await screen.findByRole('dialog') };
};

describe('FamilyScreen', () => {
  it('says so when the family is gone, and shows an empty family', async () => {
    const { unmount } = render(<FamilyScreen familyId="nope" />);
    expect(await screen.findByText(/isn’t on this phone/)).toBeInTheDocument();
    unmount();
    const family = await createFamily('Empty');
    render(<FamilyScreen familyId={family.id} />);
    expect(await screen.findByText('No one here yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('edits a person from the tree: name, nickname, sex, kid/grown, year, absent, notes', async () => {
    const { family, ivy } = await seedFamily();
    const { user, sheet } = await open(family.id, 'Ivy Tester');
    const name = within(sheet).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Ivy Rose Tester');
    await user.type(within(sheet).getByLabelText(/Nickname/), 'Ives');
    await user.click(within(sheet).getByRole('radio', { name: 'Female' }));
    await user.click(within(sheet).getByRole('radio', { name: 'Grown' }));
    await user.type(within(sheet).getByLabelText(/Birth year/), '20ab14');
    await user.click(within(sheet).getByRole('switch', { name: /Not usually at shoots/ }));
    await user.type(within(sheet).getByLabelText('Notes'), 'Loves bubbles');
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    await waitFor(async () =>
      expect(await db.people.get(ivy.id)).toMatchObject({
        name: 'Ivy Rose Tester',
        nickname: 'Ives',
        sex: 'female',
        grown: true,
        ageGroup: 'adult',
        birthYear: 2014,
        usuallyAbsent: true,
        notes: 'Loves bubbles',
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The tree now shows the nickname.
    expect(await screen.findByRole('button', { name: /^Ives,/ })).toBeInTheDocument();
  });

  it('keeps the old name when it is emptied, clears optional fields, and explains automatic grown-ups', async () => {
    const { family, max, ivy } = await seedFamily();
    await updatePerson(ivy.id, { birthYear: 2015, sex: 'female', nickname: 'Ives' });
    const { user, sheet } = await open(family.id, 'Ives');
    await user.clear(within(sheet).getByLabelText('Name'));
    await user.tab();
    expect(within(sheet).getByLabelText('Name')).toHaveValue('Ivy Tester');
    await user.clear(within(sheet).getByLabelText(/Nickname/));
    await user.clear(within(sheet).getByLabelText(/Birth year/));
    await user.click(within(sheet).getByRole('radio', { name: 'Not set' }));
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    await waitFor(async () => expect((await db.people.get(ivy.id))!.nickname).toBeUndefined());
    expect((await db.people.get(ivy.id))!.birthYear).toBeUndefined();
    expect((await db.people.get(ivy.id))!.sex).toBeUndefined();

    const second = await open(family.id, 'Max Tester');
    expect(second.sheet).toHaveTextContent('Grown, because they have a partner or children.');
    await second.user.click(within(second.sheet).getByRole('radio', { name: 'Kid' }));
    expect((await db.people.get(max.id))!.grown).toBe(true);
  });

  it('manages parents, partners and children from the sheet', async () => {
    const { family, ivy, max, nia } = await seedFamily();
    const joe = await addPerson(family.id, { name: 'Uncle Joe' });
    const { user, sheet } = await open(family.id, 'Ivy Tester');
    // Gran is Max's parent, so she can't also be Ivy's second parent: she isn't offered.
    // Parents: remove one, add another.
    await user.click(within(sheet).getByRole('button', { name: 'Remove parent Nia Tester' }));
    await waitFor(async () => expect((await db.people.get(ivy.id))!.parentIds).toEqual([max.id]));
    await user.click(await within(sheet).findByRole('button', { name: 'Choose someone already in the family (parent)' }));
    expect(within(sheet).queryByRole('button', { name: 'Gran Tester' })).not.toBeInTheDocument();
    await user.click(await within(sheet).findByRole('button', { name: 'Uncle Joe' }));
    await waitFor(async () => expect((await db.people.get(ivy.id))!.parentIds).toEqual([max.id, joe.id]));
    // The sheet re-renders from a live query, so wait for it to drop the parent form.
    await waitFor(() => expect(within(sheet).queryByLabelText('New parent’s name')).not.toBeInTheDocument());

    // Partners: a new person, then toggle status, then remove.
    await user.type(within(sheet).getByLabelText('New partner’s name'), 'Sky');
    await user.click(within(sheet).getByRole('button', { name: 'Add partner' }));
    const sky = await waitFor(async () => {
      const found = (await db.people.toArray()).find((p) => p.name === 'Sky');
      expect(found).toBeDefined();
      return found!;
    });
    await user.click(await within(sheet).findByRole('button', { name: /Sky is together/ }));
    await waitFor(async () => expect((await db.partnerships.toArray()).find((p) => p.personIds.includes(sky.id))!.status).toBe('separated'));
    await user.click(await within(sheet).findByRole('button', { name: 'Choose someone already in the family (partner)' }));
    await user.type(await within(sheet).findByLabelText('Search the family'), 'nia');
    await user.click(await within(sheet).findByRole('button', { name: 'Nia Tester' }));
    await waitFor(async () => expect(await db.partnerships.count()).toBe(4));
    await user.click(within(sheet).getByRole('button', { name: 'Remove partner Sky' }));
    await waitFor(async () => expect(await db.partnerships.count()).toBe(3));

    // Children: with the remaining partner, then alone.
    await user.type(within(sheet).getByLabelText('New child’s name'), 'Tiny');
    await user.selectOptions(await within(sheet).findByLabelText('Child is with'), nia.id);
    await user.click(within(sheet).getByRole('button', { name: 'Add child' }));
    await waitFor(async () => {
      const tiny = (await db.people.toArray()).find((p) => p.name === 'Tiny');
      expect(tiny?.parentIds).toEqual([ivy.id, nia.id]);
    });
    expect(await within(sheet).findByRole('button', { name: 'Tiny' })).toBeInTheDocument();

    // Tapping a relative opens them in the same sheet.
    await user.click(within(sheet).getByRole('button', { name: 'Tiny' }));
    expect(await screen.findByRole('dialog', { name: 'Tiny' })).toBeInTheDocument();
  });

  it('adds a new parent, and picks existing people as parent, partner and child without duplicates (F9)', async () => {
    const { family, ivy, gran, grandad, max } = await seedFamily();
    const sam = await addPerson(family.id, { name: 'Sam Other' });
    const { user, sheet } = await open(family.id, 'Sam Other');
    // A new parent.
    await user.type(within(sheet).getByLabelText('New parent’s name'), 'Pip');
    await user.click(within(sheet).getByRole('button', { name: 'Add parent' }));
    const pip = await waitFor(async () => {
      const found = (await db.people.toArray()).find((p) => p.name === 'Pip');
      expect(found).toBeDefined();
      return found!;
    });
    expect((await db.people.get(sam.id))!.parentIds).toEqual([pip.id]);
    // The picker lists only possible people: not Sam, Pip (a parent) and nobody who would make a loop.
    await user.click(within(sheet).getByRole('button', { name: 'Choose someone already in the family (parent)' }));
    const list = within(sheet).getByRole('group', { name: 'Choose someone already in the family' });
    expect(within(list).queryByRole('button', { name: 'Sam Other' })).not.toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: 'Pip' })).not.toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Gran Tester' })).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Cancel' }));
    // A child: pick Ivy's grandfather as a child of Sam? He is a parentless adult, so he can be.
    await user.click(within(sheet).getByRole('button', { name: 'Choose someone already in the family (child)' }));
    const group = within(sheet).getByRole('group', { name: 'Choose someone already in the family' });
    expect(within(group).queryByRole('button', { name: 'Ivy Tester' })).not.toBeInTheDocument(); // Ivy already has two parents
    expect(within(group).queryByRole('button', { name: 'Pip' })).not.toBeInTheDocument(); // Pip is Sam's parent
    await user.click(within(group).getByRole('button', { name: 'Grandad Tester' }));
    await waitFor(async () => expect((await db.people.get(grandad.id))!.parentIds).toEqual([sam.id]));
    expect(await db.people.count()).toBe(7);
    void ivy;
    void gran;
    void max;
  });

  it('warns about a possible duplicate and links instead (F10), and says why a link is refused', async () => {
    const { family, nia } = await seedFamily();
    await addPerson(family.id, { name: 'Emma Rivera' });
    const { user, sheet } = await open(family.id, 'Nia Tester');
    // Nia's partner is Max already; typing "Emma" offers the existing Emma.
    await user.type(within(sheet).getByLabelText('New child’s name'), 'Emma');
    expect(await within(sheet).findByText(/Is this the same Emma Rivera\?/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Link Emma Rivera instead' }));
    await waitFor(async () => {
      const emma = (await db.people.toArray()).find((p) => p.name === 'Emma Rivera')!;
      expect(emma.parentIds).toEqual([nia.id]);
    });
    expect((await db.people.toArray()).filter((p) => p.name.startsWith('Emma'))).toHaveLength(1);
    // A hint never blocks adding a new person with that name.
    await user.click(within(sheet).getByRole('button', { name: 'Add child' }));
    await waitFor(async () => expect((await db.people.toArray()).filter((p) => p.name === 'Emma')).toHaveLength(1));
  });

  it('adds a child to a couple from the tree by choosing someone already there', async () => {
    const { family, gran, grandad } = await seedFamily();
    const lone = await addPerson(family.id, { name: 'Lone Kid', parentIds: [gran.id] });
    const user = userEvent.setup();
    render(<FamilyScreen familyId={family.id} />);
    await screen.findByRole('button', { name: /^Gran Tester,/ });
    const add = await screen.findAllByRole('button', { name: /add child/i });
    await user.click(add[0]!);
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Choose someone already in the family' }));
    const group = within(sheet).getByRole('group', { name: 'Choose someone already in the family' });
    expect(within(group).queryByRole('button', { name: 'Max Tester' })).not.toBeInTheDocument(); // already their child
    await user.click(within(group).getByRole('button', { name: 'Lone Kid' }));
    await waitFor(async () => expect((await db.people.get(lone.id))!.parentIds).toEqual([gran.id, grandad.id]));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('quick add people into an existing family can pick someone already there', async () => {
    const { family, ivy } = await seedFamily();
    const user = userEvent.setup();
    render(<FamilyScreen familyId={family.id} />);
    await user.click(await screen.findByRole('button', { name: 'Quick add people' }));
    const sheet = await screen.findByRole('dialog', { name: 'Quick add people' });
    expect(within(sheet).queryByText(/What is the family called/)).not.toBeInTheDocument();
    expect(within(sheet).getByText(/Step 1 of 3/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Choose someone already in the family (First grandparent)' }));
    await user.click(within(sheet).getByRole('button', { name: 'Max Tester' }));
    expect(within(sheet).getByText('Max Tester')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Next' }));
    await user.type(within(sheet).getByLabelText('Children'), 'Wren');
    await user.click(within(sheet).getByRole('button', { name: 'Next' }));
    await user.click(within(sheet).getByRole('button', { name: 'Choose someone already in the family (kids of Wren)' }));
    await user.click(within(sheet).getByRole('button', { name: 'Ivy Tester' }));
    await user.click(within(sheet).getByRole('button', { name: 'Add them' }));
    // Ivy already had two parents, so the third is refused and the sheet explains why.
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(/more than two parents/);
    expect((await db.people.get(ivy.id))!.parentIds).toHaveLength(2);
    expect((await db.people.toArray()).some((p) => p.name === 'Wren')).toBe(false);
  });

  it('deletes a person after confirming, and cleans up the links', async () => {
    const { family, max, ivy, nia } = await seedFamily();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user, sheet } = await open(family.id, 'Max Tester');
    await user.click(within(sheet).getByRole('button', { name: 'Delete Max Tester' }));
    expect(await db.people.get(max.id)).toBeDefined();
    await user.click(within(sheet).getByRole('button', { name: 'Delete Max Tester' }));
    await waitFor(async () => expect(await db.people.get(max.id)).toBeUndefined());
    expect((await db.people.get(ivy.id))!.parentIds).toEqual([nia.id]);
    expect(await db.partnerships.count()).toBe(1);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('adds a child from a couple line and a person from + Person', async () => {
    const { family, max, nia } = await seedFamily();
    const user = userEvent.setup();
    render(<FamilyScreen familyId={family.id} />);
    await user.click(await screen.findByRole('button', { name: 'Add child to Max Tester and Nia Tester' }));
    await user.type(screen.getByLabelText('Child’s name'), 'Newbie');
    await user.click(screen.getByRole('button', { name: 'Add child' }));
    await waitFor(async () => {
      const kid = (await db.people.toArray()).find((p) => p.name === 'Newbie');
      expect(kid?.parentIds).toEqual([max.id, nia.id]);
    });
    await user.click(screen.getByRole('button', { name: '+ Person' }));
    await user.type(screen.getByLabelText('Name'), 'Walker');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('dialog', { name: 'Walker' })).toBeInTheDocument();
  });

  it('lists people by generation in the List view and opens them', async () => {
    const { family } = await seedFamily();
    const user = userEvent.setup();
    render(<FamilyScreen familyId={family.id} />);
    await user.click(await screen.findByRole('radio', { name: 'List' }));
    expect(screen.getByText('Generation 1')).toBeInTheDocument();
    expect(screen.getByText('Generation 3')).toBeInTheDocument();
    expect(screen.getByText('Kid')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Ivy Tester/ }));
    expect(await screen.findByRole('dialog', { name: 'Ivy Tester' })).toBeInTheDocument();
  });

  it('adds, edits and deletes extras', async () => {
    const { family, dog } = await seedFamily();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<FamilyScreen familyId={family.id} />);
    await user.click(await screen.findByRole('button', { name: /Biscuit/ }));
    let sheet = screen.getByRole('dialog', { name: 'Biscuit' });
    await user.clear(within(sheet).getByLabelText('Name'));
    await user.type(within(sheet).getByLabelText('Name'), 'Bix');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await db.extras.get(dog.id))!.name).toBe('Bix'));

    await user.click(screen.getByRole('button', { name: '+ Guest or pet' }));
    sheet = screen.getByRole('dialog', { name: 'Add a guest or pet' });
    expect(within(sheet).getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(within(sheet).getByLabelText('Name'), 'Cousin Pat');
    await user.click(within(sheet).getByRole('radio', { name: 'Guest' }));
    await user.type(within(sheet).getByLabelText(/Emoji/), '🧑');
    await user.click(within(sheet).getByRole('button', { name: 'Add' }));
    await waitFor(async () => expect((await db.extras.toArray()).find((e) => e.name === 'Cousin Pat')).toMatchObject({ kind: 'guest', emoji: '🧑' }));

    await user.click(await screen.findByRole('button', { name: /Bix/ }));
    await user.click(screen.getByRole('button', { name: 'Delete Bix' }));
    await waitFor(async () => expect(await db.extras.get(dog.id)).toBeUndefined());
  });

  it('shows problems in plain words and opens the person', async () => {
    const { family, ivy, gran, max } = await seedFamily();
    await updatePerson(ivy.id, { parentIds: [max.id, gran.id] });
    const user = userEvent.setup();
    render(<FamilyScreen familyId={family.id} />);
    const problems = await screen.findByRole('region', { name: 'Problems' });
    expect(problems).toHaveTextContent('Ivy is listed as a child of both Max and Max\'s parent Gran.');
    await user.click(within(problems).getAllByRole('button')[0]!);
    expect(await screen.findByRole('dialog', { name: 'Ivy Tester' })).toBeInTheDocument();
  });

  it('tells how two people are related in a banner (V6)', async () => {
    const { family } = await seedFamily();
    const user = userEvent.setup();
    render(<FamilyScreen familyId={family.id} />);
    const mode = await screen.findByRole('button', { name: 'How are they related?' });
    await user.click(mode);
    expect(screen.getByRole('status')).toHaveTextContent('Tap two people');
    await user.click(await screen.findByRole('button', { name: /^Ivy Tester,/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Now tap someone else to compare with Ivy Tester');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Gran Tester,/ }));
    expect(screen.getByRole('status')).toHaveTextContent(/Ivy is Gran.s granddaughter|grand/i);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('status')).toHaveTextContent('Tap two people');
    await user.click(screen.getByRole('button', { name: /^Ivy Tester,/ }));
    await user.click(screen.getByRole('button', { name: /^Ivy Tester,/ }));
    await user.click(screen.getByRole('button', { name: /^Max Tester,/ }));
    await user.click(screen.getByRole('button', { name: /^Nia Tester,/ }));
    expect(screen.getByRole('status')).not.toHaveTextContent('Ivy');
    await user.click(mode);
    expect(screen.queryByText(/Tap two people/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Ivy Tester,/ }));
    expect(await screen.findByRole('dialog', { name: 'Ivy Tester' })).toBeInTheDocument();
  });

  it('shares the tree picture and says what happened', async () => {
    const { family } = await seedFamily();
    const user = userEvent.setup();
    share.mockResolvedValueOnce('downloaded').mockResolvedValueOnce('shared').mockRejectedValueOnce(new Error('Nope')).mockResolvedValueOnce('canceled');
    render(<FamilyScreen familyId={family.id} />);
    const button = await screen.findByRole('button', { name: 'Share' });
    await user.click(button);
    expect(await screen.findByText('Picture saved to your downloads.')).toBeInTheDocument();
    await user.click(button);
    expect(await screen.findByText('Picture shared.')).toBeInTheDocument();
    await user.click(button);
    expect(await screen.findByText('Nope')).toBeInTheDocument();
    await user.click(button);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(share).toHaveBeenCalledWith(expect.any(Array), 'The Testers tree.png');
  });
});
