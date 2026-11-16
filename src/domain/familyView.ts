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

/**
 * People in a fixed order, whatever order they were read from the database
 * in (that is the random order of their ids): oldest record first, then by
 * name. The tree, its branch colors and the shot engine all rely on this.
 */
export function orderedPeople(people: Person[]): Person[] {
  return [...people].sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
}

/** The tree's view of a family: ids, names (nickname first), partners and kid/grown. */
export function toTreePeople(peopleIn: Person[], partnerships: Partnership[], thisYear = new Date().getFullYear()): TreePerson[] {
  const people = orderedPeople(peopleIn);
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
 * The branch color (0 to 7) of each person who belongs to a branch, as the
 * tree draws it, so shot lists can use the same colors (V2). People of the
 * top couples have none. Colors follow the picture from left to right, not
 * the ids, so a family always looks the same.
 */
export function branchColors(treePeople: TreePerson[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of layoutTree(treePeople).nodes) if (n.branchId) out.set(n.id, n.colorIndex);
  return out;
}

export interface HouseholdGroup {
  /** The person heading the branch (a child of the top couple), or undefined for the top couples. */
  headId?: string;
  /** Branch color 0 to 7, as the tree draws it; undefined for the top couples. */
  colorIndex?: number;
  people: Person[];
}

/**
 * People grouped the way the tree colors them: the top couples (the grandparents)
 * first, then one group per branch from left to right. Inside a group, older
 * generations come first, then name order. Only `people` are listed, but the
 * branches are worked out from `everyone`, so a partial list keeps its groups.
 */
export function groupByHousehold(people: Person[], everyone: Person[], partnerships: Partnership[]): HouseholdGroup[] {
  const nodes = new Map(layoutTree(toTreePeople(everyone, partnerships)).nodes.map((n) => [n.id, n]));
  const groups = new Map<string, HouseholdGroup>();
  for (const p of people) {
    const n = nodes.get(p.id);
    const key = n?.branchId ?? '';
    let g = groups.get(key);
    if (!g) {
      g = n?.branchId ? { headId: n.branchId, colorIndex: n.colorIndex, people: [] } : { people: [] };
      groups.set(key, g);
    }
    g.people.push(p);
  }
  const gen = (p: Person) => nodes.get(p.id)?.generation ?? 1;
  for (const g of groups.values()) g.people.sort((a, b) => gen(a) - gen(b) || a.name.localeCompare(b.name));
  return [...groups.values()].sort((a, b) => (a.colorIndex ?? -1) - (b.colorIndex ?? -1));
}
