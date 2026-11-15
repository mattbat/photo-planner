import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { useRoute } from '../router';

/**
 * True on any screen of a shoot in progress (shoot day, its shot list), where
 * nothing should interrupt the assistant (T5): the update banner and What's new
 * wait. Re-checks on every navigation. While the shoot is still loading it
 * counts as in progress.
 */
export function useInLiveShoot(): boolean {
  const route = useRoute();
  return useShootIsLive(route.name === 'shoot' || route.name === 'live' ? route.id : null);
}

/** True while the shoot with this id is running (or still loading). False for `null`. */
export function useShootIsLive(shootId: string | null): boolean {
  const status = useLiveQuery(async () => (shootId ? ((await db.shoots.get(shootId))?.status ?? null) : null), [shootId]);
  return shootId !== null && (status === undefined || status === 'live');
}
