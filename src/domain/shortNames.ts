import type { Extra, Person } from '../data/types';
import { displayName } from './familyView';

/** First names for chips and lists; a full name only where two people share a first name. */
export function shortNames(people: Person[], extras: Extra[]): Map<string, string> {
  const first = (p: Person) => displayName(p).split(' ')[0] ?? displayName(p);
  const count = new Map<string, number>();
  for (const p of people) count.set(first(p), (count.get(first(p)) ?? 0) + 1);
  return new Map<string, string>([
    ...people.map((p) => [p.id, (count.get(first(p)) ?? 0) > 1 ? displayName(p) : first(p)] as const),
    ...extras.map((e) => [e.id, e.name] as const),
  ]);
}
