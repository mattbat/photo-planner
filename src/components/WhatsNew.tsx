import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../data/db';
import { markVersionSeen, releaseToShow, type Release } from '../data/whatsNew';
import { formatDate } from '../domain/dates';
import { useInLiveShoot } from '../hooks/useInLiveShoot';
import { Sheet } from './ui';

const GROUPS = [
  ['new', 'New'],
  ['improved', 'Improved'],
  ['fixed', 'Fixed'],
] as const;

/** One release's changes, grouped New, Improved, Fixed (REL3). */
export function ReleaseNotes({ release }: { release: Release }) {
  return (
    <div className="release-notes">
      {GROUPS.map(([key, heading]) =>
        release[key]?.length ? (
          <div key={key}>
            <h3 className="sheet-sub">{heading}</h3>
            <ul className="release-list">
              {release[key]!.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}

/**
 * Shows what's new once, after the app updates to a new version (REL3).
 * Never during a shoot or the first-run intro (M8).
 */
export function WhatsNewSheet() {
  const inShoot = useInLiveShoot();
  const familyCount = useLiveQuery(() => db.families.count());
  const [closed, setClosed] = useState(false);
  if (closed || inShoot || familyCount === undefined) return null;
  const release = releaseToShow(familyCount > 0);
  if (!release) return null;

  const close = () => {
    markVersionSeen(release.version);
    setClosed(true);
  };
  return (
    <Sheet title={`What’s new in ${release.version}`} onClose={close}>
      <p className="hint">Photo Planner updated on {formatDate(release.date)}. Your families and shoots are just as you left them.</p>
      <ReleaseNotes release={release} />
      <button type="button" className="btn wide" onClick={close}>
        Got it
      </button>
    </Sheet>
  );
}
