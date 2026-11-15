import { setPriorities } from '../data/repo';
import type { Priority, Shoot } from '../data/types';
import { everyoneWaitsFor, reorderNote } from '../domain/shotView';

export type PriorityChoice = Priority | 'normal';

/** What `setPriorities` changed, in words: used on the shoot screen and shoot day. */
export async function applyPriority(shoot: Shoot, ids: string[], how: PriorityChoice, nameOf: (id: string) => string): Promise<string> {
  const { reordered } = await setPriorities(shoot.id, ids, how);
  const name = ids.length === 1 ? nameOf(ids[0]!) : `${ids.length} people`;
  const count = shoot.shots.filter((s) => s.status === 'todo' && s.personIds.some((p) => ids.includes(p))).length;
  const waits = how === 'late' ? everyoneWaitsFor(shoot.shots, Object.fromEntries(ids.map((i) => [i, 'late' as const])), shoot.orderOptions) : [];
  const tail = waits.length ? ` Full group waits for ${waits.map(nameOf).join(', ')}.` : '';
  if (shoot.status === 'live') return reorderNote(name, how, count) + tail;
  if (reordered) return reorderNote(name, how, count) + tail;
  return shoot.manualOrder ? 'Saved. You ordered the list by hand, so tap Suggested order to apply it.' : 'Saved.';
}
