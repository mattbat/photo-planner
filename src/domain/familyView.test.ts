import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Partnership, Person } from '../data/types';
import { demoFamily } from '../tree/fixtures';
import { displayName, groupByGeneration, indexFamily, isGrown, toTreePeople } from './familyView';

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
    const people = [person('kid', { name: 'Kid', parentIds: ['mum'] }), person('mum', { name: 'Mum' }), person('dad', { name: 'Dad' })];
    const groups = groupByGeneration(people, [pair('mum', 'dad')]);
    expect(groups.map((g) => [g.generation, g.people.map((p) => p.name)])).toEqual([
      [1, ['Dad', 'Mum']],
      [2, ['Kid']],
    ]);
  });
  it('shows the nickname when there is one', () => {
    expect(displayName({ name: 'Robert', nickname: ' Bob ' })).toBe('Bob');
    expect(displayName({ name: 'Robert', nickname: ' ' })).toBe('Robert');
  });
});
