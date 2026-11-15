import { describe, expect, it } from 'vitest';
import type { Partnership, Person } from '../data/types';
import { checkFamily } from './familyChecks';

const person = (id: string, parentIds: string[] = [], nickname?: string): Person => ({
  id,
  familyId: 'f',
  name: id,
  parentIds,
  ...(nickname ? { nickname } : {}),
  createdAt: 1,
  updatedAt: 1,
});
const partners = (a: string, b: string): Partnership => ({
  id: a + b,
  familyId: 'f',
  personIds: [a, b],
  status: 'together',
  createdAt: 1,
  updatedAt: 1,
});

describe('checkFamily', () => {
  it('finds nothing wrong with an ordinary family', () => {
    const people = [person('mum'), person('dad'), person('kid', ['mum', 'dad']), person('step', ['mum'])];
    expect(checkFamily(people, [partners('mum', 'dad')])).toEqual([]);
  });

  it('flags someone who is their own ancestor, once for the whole loop', () => {
    const people = [person('a', ['c']), person('b', ['a']), person('c', ['b']), person('d', ['a'])];
    const problems = checkFlat(people);
    expect(problems.filter((p) => p.kind === 'own-ancestor')).toHaveLength(1);
    expect(problems[0]!.message).toContain('their own ancestor');
    expect(problems[0]!.personIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('flags a person who is their own parent', () => {
    const problems = checkFlat([person('a', ['a'])]);
    expect(problems.map((p) => p.kind)).toContain('own-parent');
    expect(problems.find((p) => p.kind === 'own-ancestor')).toBeUndefined();
  });

  it('flags more than two parents', () => {
    const people = [person('a'), person('b'), person('c'), person('kid', ['a', 'b', 'c'])];
    const [problem] = checkFlat(people);
    expect(problem).toMatchObject({ kind: 'too-many-parents', personIds: ['kid', 'a', 'b', 'c'] });
    expect(problem!.message).toBe('kid has 3 parents listed (a, b and c). A person can have two at most.');
  });

  it('flags a child of both a person and that person’s parent', () => {
    const people = [person('nan'), person('mike', ['nan']), person('emma', ['mike', 'nan'], 'Em')];
    const [problem] = checkFamily(people, []);
    expect(problem).toMatchObject({ kind: 'parent-of-parent' });
    expect(problem!.message).toBe('Em is listed as a child of both mike and mike\'s parent nan.');
    const flipped = checkFamily([person('nan'), person('mike', ['nan']), person('emma', ['nan', 'mike'])], []);
    expect(flipped).toHaveLength(1);
  });

  it('flags a parent who is also a partner, either way round', () => {
    const people = [person('mum'), person('kid', ['mum'])];
    expect(checkFamily(people, [partners('kid', 'mum')])[0]).toMatchObject({ kind: 'parent-is-partner', personIds: ['kid', 'mum'] });
    expect(checkFamily(people, [partners('mum', 'kid')])[0]).toMatchObject({ kind: 'parent-is-partner', personIds: ['kid', 'mum'] });
  });

  it('ignores ids that are not in the family', () => {
    const people = [person('a', ['ghost']), person('b', ['a', 'ghost2'])];
    expect(checkFamily(people, [partners('a', 'nobody')])).toEqual([]);
  });
});

const checkFlat = (people: Person[]) => checkFamily(people, []);
