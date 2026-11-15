import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';
import { db } from '../data/db';
import { seedStarterPoses } from '../data/repo';
import type { Pose } from '../data/types';
import { sizeLabel } from '../poses/labels';
import { starterPoses } from '../poses/starterPoses';
import { suggestPoses, type SuggestInput } from '../poses/suggest';
import { poseImageSrc } from '../screens/posePhoto';

/**
 * Suggested poses for a shot (PL5): a swipeable row of the best matches for who is in it.
 * Drop it into the shot screens; `onPick` gets the pose to attach (`Shot.poseId`).
 * `selectedId` highlights the pose already attached.
 */
export function PoseSuggestions({
  onPick,
  selectedId,
  limit = 8,
  ...group
}: SuggestInput & { onPick: (pose: Pose) => void; selectedId?: string | undefined; limit?: number }) {
  const stored = useLiveQuery(() => db.poses.toArray());
  useEffect(() => {
    void seedStarterPoses();
  }, []);
  const { peopleCount, hasKids, hasBaby, generations, isCouple, hasSeniors } = group;
  const suggestions = useMemo(
    // Until the table is filled (first run) the bundled list stands in.
    () => suggestPoses(stored && stored.length > 0 ? stored : starterPoses, { peopleCount, hasKids, hasBaby, generations, isCouple, hasSeniors }).slice(0, limit),
    [stored, peopleCount, hasKids, hasBaby, generations, isCouple, hasSeniors, limit],
  );
  if (suggestions.length === 0) return null;
  return (
    <div className="pl-suggest" role="list" aria-label="Suggested poses">
      {suggestions.map((p) => (
        <button key={p.id} type="button" role="listitem" className="pl-suggest-card" aria-pressed={p.id === selectedId} onClick={() => onPick(p)}>
          <span className="pl-thumb">{p.image ? <img src={poseImageSrc(p.image)} alt="" loading="lazy" /> : <span className="pl-noimg" aria-hidden>🧍</span>}</span>
          <span className="pl-card-name">{p.name}</span>
          <span className="pl-card-sub">{sizeLabel(p.minSize, p.maxSize)}</span>
        </button>
      ))}
    </div>
  );
}
