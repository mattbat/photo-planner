import type { Partnership, Person } from '../data/types';
import type { SuggestInput } from '../poses/suggest';
import { layoutTree } from '../tree/layout';
import { toTreePeople } from './familyView';

/** Who is in a shot, as the pose suggestions want it (PL5). Extras count as people in the group size only. */
export function poseGroup(personIds: string[], people: Person[], partnerships: Partnership[], thisYear = new Date().getFullYear()): SuggestInput {
  const tree = toTreePeople(people, partnerships, thisYear);
  const gen = new Map(layoutTree(tree).nodes.map((n) => [n.id, n.generation]));
  const deepest = Math.max(1, ...gen.values());
  const inShot = tree.filter((t) => personIds.includes(t.id));
  const byId = new Map(people.map((p) => [p.id, p]));
  const generations = new Set(inShot.map((t) => gen.get(t.id)));
  return {
    peopleCount: personIds.length,
    hasKids: inShot.some((t) => !t.grown),
    hasBaby: inShot.some((t) => {
      const born = byId.get(t.id)?.birthYear;
      return born !== undefined && thisYear - born <= 2;
    }),
    generations: Math.max(1, generations.size),
    isCouple: inShot.length === 2 && personIds.length === 2 && inShot[0]!.partnerIds.includes(inShot[1]!.id),
    hasSeniors: deepest >= 3 && inShot.some((t) => gen.get(t.id) === 1 && t.grown),
  };
}
