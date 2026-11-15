import type { Partnership, Person } from '../data/types';
import { checkFamily } from './shotView';

/**
 * Linking people who are already in the family (F9, F10), pure: who can be
 * picked for a role, what a link would break, and whether a typed name looks
 * like someone who is already there.
 */

export type LinkRole = 'parent' | 'child' | 'partner';

const parentsOf = (people: Person[]) => new Map(people.map((p) => [p.id, p.parentIds]));

/** Everyone above `id`: parents, their parents, and so on. */
export function ancestorsOf(people: Person[], id: string): Set<string> {
  const parents = parentsOf(people);
  const out = new Set<string>();
  const stack = [...(parents.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (out.has(next)) continue;
    out.add(next);
    stack.push(...(parents.get(next) ?? []));
  }
  return out;
}

/** Everyone below `id`: children, their children, and so on. */
export function descendantsOf(people: Person[], id: string): Set<string> {
  return new Set(people.filter((p) => p.id !== id && ancestorsOf(people, p.id).has(id)).map((p) => p.id));
}

const partnerIdsOf = (partnerships: Partnership[], id: string) =>
  partnerships.filter((pt) => pt.personIds.includes(id)).map((pt) => (pt.personIds[0] === id ? pt.personIds[1] : pt.personIds[0]));

/**
 * People who can be chosen for `role` of `personId` without an impossible
 * link: never themselves or someone already linked; not their own descendants
 * as a parent, nor their own ancestors as a child; nobody who would be both a
 * parent and a partner; nobody who would end up with three parents.
 * `withParentId` is the other parent when adding a child to a couple.
 */
export function linkCandidates(
  people: Person[],
  partnerships: Partnership[],
  personId: string,
  role: LinkRole,
  withParentId?: string,
): Person[] {
  const me = people.find((p) => p.id === personId);
  if (!me) return [];
  const partners = new Set(partnerIdsOf(partnerships, personId));
  const ancestors = ancestorsOf(people, personId);
  const descendants = descendantsOf(people, personId);
  const children = new Set(people.filter((p) => p.parentIds.includes(personId)).map((p) => p.id));
  const parents = new Set(me.parentIds);
  const related = (a: string, b: string) => ancestorsOf(people, a).has(b) || ancestorsOf(people, b).has(a);
  /** Two parents of one child can't be each other's ancestors (validateFamily: "child of both … and … 's parent"). */
  const goodPair = (ids: string[]) => ids.length < 2 || !related(ids[0]!, ids[1]!);
  /** Two people who already share a child can't also be parent and child (F7). */
  const sharesChild = (a: string, b: string) => people.some((x) => x.parentIds.includes(a) && x.parentIds.includes(b));
  const okay = (p: Person): boolean => {
    if (p.id === personId) return false;
    if (role === 'parent') return !parents.has(p.id) && !descendants.has(p.id) && !partners.has(p.id) && me.parentIds.length < 2 && goodPair([...me.parentIds, p.id]) && !sharesChild(p.id, personId);
    if (role === 'child') {
      if (ancestors.has(p.id) || partners.has(p.id)) return false;
      // Already their child: only worth offering to add the other parent of a couple.
      if (children.has(p.id) && !(withParentId && !p.parentIds.includes(withParentId))) return false;
      if (withParentId && (p.id === withParentId || ancestorsOf(people, withParentId).has(p.id))) return false;
      const next = [...new Set([...p.parentIds, personId, ...(withParentId ? [withParentId] : [])])];
      return next.length <= 2 && goodPair(next) && !sharesChild(p.id, personId) && !(withParentId && sharesChild(p.id, withParentId));
    }
    return !partners.has(p.id) && !parents.has(p.id) && !children.has(p.id);
  };
  return people.filter(okay).sort((a, b) => a.name.localeCompare(b.name));
}

export interface LinkChange {
  people: Person[];
  partnerships: Partnership[];
}

/**
 * Problems that exist after `after` but not before it, in plain words
 * (validateFamily, F7). Empty means the change is safe to save.
 */
export function newProblems(before: LinkChange, after: LinkChange): string[] {
  const had = new Set(checkFamily(before.people, before.partnerships).map((p) => p.message));
  return checkFamily(after.people, after.partnerships)
    .map((p) => p.message)
    .filter((m) => !had.has(m));
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Case, accent and spacing don't matter when matching typed text to names. */
export const matchesText = (person: Person, query: string): boolean => {
  const q = fold(query);
  return !q || fold(person.name).includes(q) || fold(person.nickname ?? '').includes(q);
};

/**
 * People whose name looks like the one being typed (F10): the same full name,
 * the same nickname, or a single typed word that is their first name ("Emma"
 * for "Emma Rivera"). A light hint, never a block.
 */
export function similarPeople(people: Person[], typed: string): Person[] {
  const t = fold(typed);
  if (t.length < 2) return [];
  const words = t.split(' ');
  return people.filter((p) => {
    const full = fold(p.name);
    const first = full.split(' ')[0];
    if (full === t || fold(p.nickname ?? '') === t) return true;
    return words.length === 1 ? first === t : words[0] === first && full.startsWith(t);
  });
}
