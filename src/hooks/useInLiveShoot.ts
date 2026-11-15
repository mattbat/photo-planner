import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { useRoute } from '../router';

/**
 * True on any screen of a shoot in progress (shoot day, its shot list), where
 * nothing should interrupt the assistant (T5): the update banner and What's new
 * wait. Re-checks on every navigation. While the shoot is still loading it
 * counts as in progress.
 *
 * Shoot routes arrive in M3/M4; until then no route has a `shootId` and this
 * is always false.
 */
export function useInLiveShoot(): boolean {
  const route = useRoute();
  return useShootIsLive((route as { shootId?: string }).shootId ?? null);
}

/** True while the shoot with this id is running (or still loading). False for `null`. */
export function useShootIsLive(shootId: string | null): boolean {
  const status = useLiveQuery(async () => (shootId ? ((await db.shoots.get(shootId))?.status ?? null) : null), [shootId]);
  return shootId !== null && (status === undefined || status === 'live');
}
