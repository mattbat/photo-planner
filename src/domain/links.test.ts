import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Partnership, Person } from '../data/types';
import { ancestorsOf, descendantsOf, linkCandidates, matchesText, newProblems, similarPeople } from './links';

const person = (id: string, name: string, parentIds: string[] = []): Person => ({ id, familyId: 'f', name, parentIds, createdAt: 0, updatedAt: 0 });
const pair = (a: string, b: string): Partnership => ({ id: `${a}${b}`, familyId: 'f', personIds: [a, b], status: 'together', createdAt: 0, updatedAt: 0 });

// Gran + Grandad -> Max (with Nia) -> Ivy; Sam is on his own.
const people = [
  person('gran', 'Gran Tester'),
  person('grandad', 'Grandad Tester'),
  person('max', 'Max Tester', ['gran', 'grandad']),
  person('nia', 'Nia Tester'),
  person('ivy', 'Ivy Tester', ['max', 'nia']),
  person('sam', 'Sam Other'),
];
const partnerships = [pair('gran', 'grandad'), pair('max', 'nia')];
const ids = (list: Person[]) => list.map((p) => p.id).sort();

describe('ancestors and descendants', () => {
  it('walks up and down the tree', () => {
    expect([...ancestorsOf(people, 'ivy')].sort()).toEqual(['gran', 'grandad', 'max', 'nia']);
    expect([...descendantsOf(people, 'gran')].sort()).toEqual(['ivy', 'max']);
    expect(ancestorsOf(people, 'gran').size).toBe(0);
  });
});

describe('linkCandidates', () => {
  it('parent: not self, own descendants, partners or existing parents', () => {
    expect(ids(linkCandidates(people, partnerships, 'max', 'parent'))).toEqual([]); // already has two parents
    expect(ids(linkCandidates(people, partnerships, 'sam', 'parent'))).toEqual(['grandad', 'gran', 'ivy', 'max', 'nia'].sort());
    expect(ids(linkCandidates(people, partnerships, 'gran', 'parent'))).toEqual(['nia', 'sam']); // not Max or Ivy (descendants), not Grandad (partner)
  });
  it('child: not self, own ancestors, partners or existing children', () => {
    expect(ids(linkCandidates(people, partnerships, 'max', 'child'))).toEqual(['sam']); // Ivy is already a child, Gran/Grandad are ancestors, Nia a partner
    expect(ids(linkCandidates(people, partnerships, 'sam', 'child'))).toEqual(['gran', 'grandad', 'nia']); // Max and Ivy already have two parents
  });
  it('child of a couple: nobody who would end up with three parents, or above either parent', () => {
    const list = linkCandidates(people, partnerships, 'sam', 'child', 'nia');
    expect(ids(list)).toEqual(['gran', 'grandad']); // Max and Ivy would get a third parent; Nia is the other parent
    const more = [...people, person('kid', 'Kid One', ['sam'])];
    expect(ids(linkCandidates(more, partnerships, 'sam', 'child', 'nia'))).toEqual(['gran', 'grandad', 'kid']); // Kid is Sam's only child: Nia can be added as the other parent
    expect(ids(linkCandidates([...more, person('lone', 'Lone Kid', ['nia'])], partnerships, 'sam', 'child', 'nia'))).toEqual(['gran', 'grandad', 'kid', 'lone']);
  });
  it('partner: not self, partners, parents or children', () => {
    expect(ids(linkCandidates(people, partnerships, 'max', 'partner'))).toEqual(['sam']);
    expect(linkCandidates(people, partnerships, 'nobody', 'partner')).toEqual([]);
  });
});

describe('newProblems', () => {
  it('reports only problems a change would add', () => {
    const before = { people, partnerships };
    expect(newProblems(before, before)).toEqual([]);
    const loop = { people: people.map((p) => (p.id === 'gran' ? { ...p, parentIds: ['ivy'] } : p)), partnerships };
    expect(newProblems(before, loop).length).toBeGreaterThan(0);
    // A problem that was already there isn't blamed on the new change.
    expect(newProblems(loop, loop)).toEqual([]);
  });
});

describe('names', () => {
  it('matches search text ignoring case, accents and spacing', () => {
    expect(matchesText(person('a', 'Zoë  Rivera'), 'zoe r')).toBe(true);
    expect(matchesText({ ...person('a', 'Robert'), nickname: 'Bobby' }, 'bob')).toBe(true);
    expect(matchesText(person('a', 'Robert'), '')).toBe(true);
    expect(matchesText(person('a', 'Robert'), 'xyz')).toBe(false);
  });
  it('finds people who look like the typed name', () => {
    const list = [person('e', 'Emma Rivera'), { ...person('b', 'Robert Pike'), nickname: 'Bobby' }, person('z', 'Zoe')];
    expect(ids(similarPeople(list, 'Emma'))).toEqual(['e']);
    expect(ids(similarPeople(list, ' emma  RIVERA '))).toEqual(['e']);
    expect(ids(similarPeople(list, 'Bobby'))).toEqual(['b']);
    expect(ids(similarPeople(list, 'Emma R'))).toEqual(['e']);
    expect(similarPeople(list, 'E')).toEqual([]);
    expect(similarPeople(list, 'Emmanuel')).toEqual([]);
  });
});

describe('properties', () => {
  // A random forest: each person's parents come from earlier people, so there are no loops to start with.
  const forest = fc
    .array(fc.array(fc.nat(10), { maxLength: 2 }), { minLength: 2, maxLength: 9 })
    .map((raw) => raw.map((ps, i) => person(`p${i}`, `P${i}`, [...new Set(ps.filter((x) => x < i).map((x) => `p${x}`))])));

  it('every candidate can be linked without a new problem', () => {
    fc.assert(
      fc.property(forest, fc.nat(8), fc.constantFrom('parent', 'child', 'partner' as const), (list, k, role) => {
        const me = list[k % list.length]!;
        for (const c of linkCandidates(list, [], me.id, role)) {
          expect(c.id).not.toBe(me.id);
          const after =
            role === 'parent'
              ? { people: list.map((p) => (p.id === me.id ? { ...p, parentIds: [...p.parentIds, c.id] } : p)), partnerships: [] }
              : role === 'child'
                ? { people: list.map((p) => (p.id === c.id ? { ...p, parentIds: [...p.parentIds, me.id] } : p)), partnerships: [] }
                : { people: list, partnerships: [pair(me.id, c.id)] };
          expect(newProblems({ people: list, partnerships: [] }, after)).toEqual([]);
        }
      }),
    );
  });
  it('never offers own descendants as parents or own ancestors as children', () => {
    fc.assert(
      fc.property(forest, fc.nat(8), (list, k) => {
        const me = list[k % list.length]!;
        const down = descendantsOf(list, me.id);
        const up = ancestorsOf(list, me.id);
        expect(linkCandidates(list, [], me.id, 'parent').some((p) => down.has(p.id))).toBe(false);
        expect(linkCandidates(list, [], me.id, 'child').some((p) => up.has(p.id))).toBe(false);
      }),
    );
  });
});
