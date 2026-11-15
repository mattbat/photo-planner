import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../data/db';
import type { Pose } from '../data/types';
import { starterPoses } from '../poses/starterPoses';

/** Poses by id, for showing the one attached to a shot (PL5). The bundled list stands in until the table is filled. */
export function usePoseMap(): Map<string, Pose> {
  const stored = useLiveQuery(() => db.poses.toArray());
  return useMemo(() => new Map((stored && stored.length > 0 ? stored : starterPoses).map((p) => [p.id, p])), [stored]);
}
