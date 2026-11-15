import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Partnership, Person } from '../data/types';
import { demoFamily } from '../tree/fixtures';
import { branchColors, displayName, groupByGeneration, indexFamily, isGrown, orderedPeople, toTreePeople } from './familyView';

const person = (id: string, fields: Partial<Person> = {}): Person => ({
  id,
  familyId: 'f',
  name: id.toUpperCase(),
  parentIds: [],
  createdAt: 1,
  updatedAt: 1,
  ...fields,
});
const pair = (a: string, b: string, status: Partnership['status'] = 'together'): Partnership => ({
  id: `${a}-${b}`,
  familyId: 'f',
  personIds: [a, b],
  status,
  createdAt: 1,
  updatedAt: 1,
});

describe('isGrown', () => {
  const p = (f: Partial<Person>) => person('x', f);
  it('anyone with a partner or children is grown', () => {
    expect(isGrown(p({ ageGroup: 'child', parentIds: ['a'] }), true, false, 2026)).toBe(true);
    expect(isGrown(p({ grown: false, parentIds: ['a'] }), false, true, 2026)).toBe(true);
  });
  it('otherwise the stated age group, then the grown flag, then birth year', () => {
    expect(isGrown(p({ ageGroup: 'child', grown: true }), false, false, 2026)).toBe(false);
    expect(isGrown(p({ ageGroup: 'adult', parentIds: ['a'] }), false, false, 2026)).toBe(true);
    expect(isGrown(p({ grown: false }), false, false, 2026)).toBe(false);
    expect(isGrown(p({ birthYear: 2015, parentIds: ['a'] }), false, false, 2026)).toBe(false);
    expect(isGrown(p({ birthYear: 1990, parentIds: ['a'] }), false, false, 2026)).toBe(true);
  });
  it('with nothing said: grown at the top of the tree, a kid under parents', () => {
    expect(isGrown(p({}), false, false, 2026)).toBe(true);
    expect(isGrown(p({ parentIds: ['a'] }), false, false, 2026)).toBe(false);
  });
});

describe('toTreePeople', () => {
  it('maps partners, separated partners, names and kid/grown', () => {
    const people = [
      person('a', { sex: 'female' }),
      person('b', { nickname: 'Bee' }),
      person('c', { parentIds: ['a', 'zzz'] }),
      person('d'),
    ];
    const tree = toTreePeople(people, [pair('a', 'b'), pair('a', 'd', 'separated'), pair('a', 'ghost')], 2026);
    const a = tree.find((t) => t.id === 'a')!;
    expect(a).toMatchObject({ name: 'A', sex: 'female', grown: true, partnerIds: ['b'], separatedPartnerIds: ['d'] });
    expect(tree.find((t) => t.id === 'b')).toMatchObject({ name: 'Bee', partnerIds: ['a'] });
    expect(tree.find((t) => t.id === 'b')!.separatedPartnerIds).toBeUndefined();
    expect(tree.find((t) => t.id === 'c')).toMatchObject({ grown: false, parentIds: ['a'] });
  });

  it('ignores partnerships with themselves or with strangers', () => {
    const idx = indexFamily([person('a')], [pair('a', 'a'), pair('a', 'q')]);
    expect(idx.partnersOf.size).toBe(0);
  });

  it('round-trips the demo family through the layout without losing anyone', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: demoFamily.length }), (n) => {
        const people = demoFamily.slice(0, n).map((t) => person(t.id, { parentIds: t.parentIds, grown: t.grown }));
        expect(toTreePeople(people, [], 2026)).toHaveLength(n);
      }),
    );
  });
});

describe('groupByGeneration and displayName', () => {
  it('groups by the tree row, in name order', () => {
    const people = [person('kid', { name: 'Kid', parentIds: ['mum'] }), person('mum', { name: 'Mom' }), person('dad', { name: 'Dad' })];
    const groups = groupByGeneration(people, [pair('mum', 'dad')]);
    expect(groups.map((g) => [g.generation, g.people.map((p) => p.name)])).toEqual([
      [1, ['Dad', 'Mom']],
      [2, ['Kid']],
    ]);
  });
  it('shows the nickname when there is one', () => {
    expect(displayName({ name: 'Robert', nickname: ' Bob ' })).toBe('Bob');
    expect(displayName({ name: 'Robert', nickname: ' ' })).toBe('Robert');
  });
});

describe('branch colors (V2)', () => {
  /** The demo family as stored people, with random-looking ids in a shuffled order, as the database returns them. */
  const stored = (salt: string, shuffle: boolean) => {
    const ids = new Map(demoFamily.map((t, i) => [t.id, `${salt}-${(i * 7919) % 101}-${t.id}`]));
    const people = demoFamily.map((t, i) =>
      person(ids.get(t.id)!, { name: t.name, createdAt: i + 1, parentIds: t.parentIds.map((x) => ids.get(x)!), grown: t.grown, ...(t.sex ? { sex: t.sex } : {}) }),
    );
    const partnerships = demoFamily.flatMap((t) =>
      t.partnerIds.filter((q) => t.id < q).map((q) => pair(ids.get(t.id)!, ids.get(q)!)),
    );
    const sorted = shuffle ? [...people].sort((a, b) => (a.id < b.id ? -1 : 1)) : people;
    return { people: sorted, partnerships };
  };
  const byName = (people: Person[], colors: Map<string, number>) =>
    Object.fromEntries(people.filter((p) => colors.has(p.id)).map((p) => [p.name, colors.get(p.id)]));

  it('are the same for a family whatever its ids and the order it is read in', () => {
    const results = ['a', 'b', 'c'].map((salt, i) => {
      const { people, partnerships } = stored(salt, i > 0);
      return byName(people, branchColors(toTreePeople(people, partnerships)));
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it('give each branch of a fresh demo family its own color', () => {
    const { people, partnerships } = stored('z', true);
    const colors = byName(people, branchColors(toTreePeople(people, partnerships)));
    const heads = ['Ben Pike', 'Dana Pike', 'Ruth Pike', 'Carla Vega', 'Gabe Vega'];
    expect(new Set(heads.map((h) => colors[h])).size).toBe(heads.length);
    expect(colors['Leo']).toBe(colors['Dana Pike']);
    expect(colors['Zoe']).toBe(colors['Ruth Pike']);
    expect(colors['Harold Pike']).toBeUndefined();
  });

  it('puts people in a fixed order: oldest first, then by name', () => {
    const people = [person('z', { name: 'Zed', createdAt: 2 }), person('b', { name: 'Bea', createdAt: 2 }), person('a', { name: 'Ann', createdAt: 1 }), person('c', { name: 'Bea', createdAt: 2 })];
    expect(orderedPeople(people).map((p) => p.id)).toEqual(['a', 'b', 'c', 'z']);
  });
});
