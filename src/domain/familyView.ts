import type { Partnership, Person } from '../data/types';
import { layoutTree } from '../tree/layout';
import type { TreePerson } from '../tree/types';

/**
 * Turns stored people and partnerships into what the tree draws (V1–V3), and
 * answers a few questions about a family that several screens ask. Pure.
 */

/** Under this age a person with a birth year counts as a kid (§4). */
export const GROWN_AGE = 18;

export interface FamilyIndex {
  byId: Map<string, Person>;
  /** Everyone a person has a partnership with (together or separated). */
  partnersOf: Map<string, string[]>;
  childrenOf: Map<string, string[]>;
}

export function indexFamily(people: Person[], partnerships: Partnership[]): FamilyIndex {
  const byId = new Map(people.map((p) => [p.id, p]));
  const partnersOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const pt of partnerships) {
    const [a, b] = pt.personIds;
    if (!byId.has(a) || !byId.has(b) || a === b) continue;
    partnersOf.set(a, [...(partnersOf.get(a) ?? []), b]);
    partnersOf.set(b, [...(partnersOf.get(b) ?? []), a]);
  }
  for (const p of people) {
    for (const parent of p.parentIds) {
      if (byId.has(parent)) childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), p.id]);
    }
  }
  return { byId, partnersOf, childrenOf };
}

/**
 * Kid or grown (§4). Anyone with a partner or children is grown. Otherwise
 * the person's own choice wins, then their birth year; someone with no parents
 * in the tree (a top-couple member or a partner who married in) is grown, and
 * a child with nothing said is a kid.
 */
export function isGrown(person: Person, hasPartner: boolean, hasChildren: boolean, thisYear: number): boolean {
  if (hasPartner || hasChildren) return true;
  if (person.ageGroup) return person.ageGroup === 'adult';
  if (person.grown !== undefined) return person.grown;
  if (person.birthYear !== undefined) return thisYear - person.birthYear >= GROWN_AGE;
  return person.parentIds.length === 0;
}

/** The tree's view of a family: ids, names (nickname first), partners and kid/grown. */
export function toTreePeople(people: Person[], partnerships: Partnership[], thisYear = new Date().getFullYear()): TreePerson[] {
  const { byId, partnersOf, childrenOf } = indexFamily(people, partnerships);
  const status = new Map<string, 'together' | 'separated'>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const pt of partnerships) status.set(key(pt.personIds[0], pt.personIds[1]), pt.status);
  return people.map((p) => {
    const partners = [...new Set(partnersOf.get(p.id) ?? [])];
    const out: TreePerson = {
      id: p.id,
      name: p.nickname?.trim() || p.name,
      grown: isGrown(p, partners.length > 0, (childrenOf.get(p.id) ?? []).length > 0, thisYear),
      parentIds: p.parentIds.filter((id) => byId.has(id)),
      partnerIds: partners.filter((q) => status.get(key(p.id, q)) !== 'separated'),
    };
    if (p.sex) out.sex = p.sex;
    const separated = partners.filter((q) => status.get(key(p.id, q)) === 'separated');
    if (separated.length) out.separatedPartnerIds = separated;
    return out;
  });
}

export interface GenerationGroup {
  /** 1 is the top row of the tree. */
  generation: number;
  people: Person[];
}

/** People grouped by generation, as the tree draws them, each group in name order. */
export function groupByGeneration(people: Person[], partnerships: Partnership[]): GenerationGroup[] {
  const tree = toTreePeople(people, partnerships);
  const gen = new Map(layoutTree(tree).nodes.map((n) => [n.id, n.generation]));
  const groups = new Map<number, Person[]>();
  for (const p of people) {
    const g = gen.get(p.id) ?? 1;
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([generation, list]) => ({ generation, people: list.sort((a, b) => a.name.localeCompare(b.name)) }));
}

/** How a person reads in lists: "Ruth Pike (Ruthie)" is shown as the nickname when there is one. */
export function displayName(p: Pick<Person, 'name' | 'nickname'>): string {
  return p.nickname?.trim() || p.name;
}

/**
 * Hook point for the relationship finder (V6): once `src/domain` gets
 * `describeRelationship(a, b)`, the person sheet and the tree call it here.
 */
export type RelationshipDescriber = (aId: string, bId: string) => string | null;
