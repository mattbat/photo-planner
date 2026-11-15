import { describe, expect, it } from 'vitest';
import type { Partnership, Person } from '../data/types';
import { poseGroup } from './poseGroup';

const person = (id: string, extra: Partial<Person> = {}): Person => ({ id, familyId: 'f', name: id, parentIds: [], createdAt: 0, updatedAt: 0, ...extra });
const together = (a: string, b: string): Partnership => ({ id: `${a}${b}`, familyId: 'f', personIds: [a, b], status: 'together', createdAt: 0, updatedAt: 0 });

describe('poseGroup', () => {
  const people = [
    person('gran'),
    person('gramps'),
    person('mum', { parentIds: ['gran', 'gramps'], grown: true }),
    person('dad'),
    person('baby', { parentIds: ['mum', 'dad'], ageGroup: 'child', birthYear: 2026 }),
  ];
  const links = [together('gran', 'gramps'), together('mum', 'dad')];

  it('describes a couple', () => {
    expect(poseGroup(['mum', 'dad'], people, links, 2026)).toMatchObject({ peopleCount: 2, isCouple: true, hasKids: false, generations: 1 });
  });

  it('spots kids, babies, generations and seniors', () => {
    const g = poseGroup(['gran', 'mum', 'baby'], people, links, 2026);
    expect(g).toMatchObject({ peopleCount: 3, hasKids: true, hasBaby: true, generations: 3, isCouple: false, hasSeniors: true });
  });

  it('counts extras in the group size only', () => {
    expect(poseGroup(['mum', 'pet-1'], people, links, 2026)).toMatchObject({ peopleCount: 2, isCouple: false });
  });
});
