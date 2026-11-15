import type { Shot } from '../data/types';

/**
 * A shot can have several poses, in order (PL5). Older data and files have a
 * single `poseId`; these helpers read both and turn the old form into the new.
 */

type WithPoses = Pick<Shot, 'poseId' | 'poseIds'>;

/** The poses on a shot, in order, from either layout. */
export const poseIdsOf = (shot: WithPoses): string[] => (shot.poseIds?.length ? shot.poseIds : shot.poseId ? [shot.poseId] : []);

/** The shot with `poseIds` set (when it has poses) and the old `poseId` gone. */
export function migrateShot<T extends WithPoses>(shot: T): Omit<T, 'poseId'> {
  const { poseId, poseIds, ...rest } = shot;
  const ids = poseIds?.length ? poseIds : poseId ? [poseId] : [];
  return (ids.length ? { ...rest, poseIds: [...new Set(ids)] } : rest) as Omit<T, 'poseId'>;
}

/** A shoot with every shot migrated; the same object when nothing needed changing. */
export function migrateShoot<S extends { shots: Shot[] }>(shoot: S): S {
  if (!shoot.shots.some((s) => s.poseId !== undefined)) return shoot;
  return { ...shoot, shots: shoot.shots.map((s) => migrateShot(s) as Shot) };
}
