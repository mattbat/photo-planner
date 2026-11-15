import type { Partnership, Person } from '../data/types';
import { displayName } from './familyView';

/** A problem in a family's relationships, in plain language (F7). */
export interface FamilyProblem {
  kind: 'own-ancestor' | 'too-many-parents' | 'parent-is-partner' | 'own-parent' | 'parent-of-parent';
  /** People to show first when the problem is tapped. */
  personIds: string[];
  message: string;
}

const list = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Finds relationships that can't be right. Pure; unknown ids are ignored. */
export function checkFamily(people: Person[], partnerships: Partnership[]): FamilyProblem[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const name = (id: string) => (byId.has(id) ? displayName(byId.get(id)!) : 'Someone');
  const problems: FamilyProblem[] = [];

  for (const p of people) {
    if (p.parentIds.includes(p.id)) {
      problems.push({ kind: 'own-parent', personIds: [p.id], message: `${name(p.id)} is listed as their own parent.` });
    }
    const parents = [...new Set(p.parentIds.filter((id) => byId.has(id) && id !== p.id))];
    if (parents.length > 2) {
      problems.push({
        kind: 'too-many-parents',
        personIds: [p.id, ...parents],
        message: `${name(p.id)} has ${parents.length} parents listed (${list(parents.map(name))}). A person can have two at most.`,
      });
    }
    // "Emma is listed as a child of both Mike and Mike's mother."
    if (parents.length === 2) {
      const [x, y] = parents as [string, string];
      const [child, parent] = byId.get(x)!.parentIds.includes(y) ? [x, y] : byId.get(y)!.parentIds.includes(x) ? [y, x] : [];
      if (child && parent) {
        problems.push({
          kind: 'parent-of-parent',
          personIds: [p.id, child, parent],
          message: `${name(p.id)} is listed as a child of both ${name(child)} and ${name(child)}'s parent ${name(parent)}.`,
        });
      }
    }
  }

  // Own ancestor: walk up from each person; reaching themselves means a loop.
  const reported = new Set<string>();
  for (const p of people) {
    if (reported.has(p.id)) continue;
    const seen = new Set<string>();
    const stack = p.parentIds.filter((id) => id !== p.id && byId.has(id));
    let loops = false;
    while (stack.length) {
      const id = stack.pop()!;
      if (id === p.id) {
        loops = true;
        break;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...byId.get(id)!.parentIds.filter((x) => byId.has(x)));
    }
    if (loops) {
      // Everyone on the loop is its own ancestor; say it once.
      const members = [p.id, ...[...seen].filter((id) => ancestorsOf(id, byId).has(id))];
      members.forEach((id) => reported.add(id));
      problems.push({
        kind: 'own-ancestor',
        personIds: members,
        message: `${list(members.map(name))} ${members.length === 1 ? 'is' : 'are each'} their own ancestor${members.length === 1 ? '' : 's'}. Check who is whose parent.`,
      });
    }
  }

  // A partner who is also a parent or child of the same person.
  for (const pt of partnerships) {
    const [a, b] = pt.personIds;
    const pa = byId.get(a);
    const pb = byId.get(b);
    if (!pa || !pb) continue;
    if (pa.parentIds.includes(b)) {
      problems.push({
        kind: 'parent-is-partner',
        personIds: [a, b],
        message: `${name(b)} is listed as ${name(a)}'s parent and also as their partner.`,
      });
    } else if (pb.parentIds.includes(a)) {
      problems.push({
        kind: 'parent-is-partner',
        personIds: [b, a],
        message: `${name(a)} is listed as ${name(b)}'s parent and also as their partner.`,
      });
    }
  }
  return problems;
}

function ancestorsOf(id: string, byId: Map<string, Person>): Set<string> {
  const out = new Set<string>();
  const stack = [...byId.get(id)!.parentIds];
  while (stack.length) {
    const x = stack.pop()!;
    if (out.has(x) || !byId.has(x)) continue;
    out.add(x);
    stack.push(...byId.get(x)!.parentIds);
  }
  return out;
}
