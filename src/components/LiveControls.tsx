import { useState } from 'react';
import { lockedAway } from '../data/handoff';
import { finishShoot, reopenShoot, startShoot } from '../data/repo';
import type { Extra, Person, Shoot } from '../data/types';
import { shortNames } from '../domain/shortNames';
import { inOrder } from '../domain/shotView';
import { poseIdsOf } from '../domain/shotPoses';
import { usePoseMap } from '../hooks/usePoseMap';
import { navigate, paths } from '../router';
import { PoseThumb } from './PoseThumb';
import { ShareShootSheet, SharedBanner } from './ShareShoot';
import { Sheet } from './ui';

/** Start shoot / carry on / reopen (§8), and the pose sheet (PL7), on the shoot screen. */
export function LiveControls({ shoot, people, extras, familyName = 'Shoot' }: { shoot: Shoot; people: Person[]; extras: Extra[]; familyName?: string }) {
  const [poseSheet, setPoseSheet] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState('');
  const locked = lockedAway(shoot);
  const withPose = shoot.shots.filter((s) => poseIdsOf(s).length).length;
  return (
    <div className="live-start">
      <SharedBanner shoot={shoot} onShareAgain={() => setSharing(true)} />
      {shoot.status === 'planned' && (
        <button
          type="button"
          className="btn big wide"
          disabled={shoot.shots.length === 0 || !!shoot.handoff?.away}
          onClick={() => void startShoot(shoot.id).then(() => navigate(paths.live(shoot.id)))}
        >
          Start shoot
        </button>
      )}
      {shoot.status === 'planned' && shoot.handoff?.away && (
        <p className="hint">The other phone starts this shoot. Tap Take back control to start it here.</p>
      )}
      {shoot.status === 'live' && !locked && (
        <a className="btn big wide" href={paths.live(shoot.id)}>
          Continue shoot day
        </a>
      )}
      {shoot.status === 'done' && (
        <>
          <a className="btn wide" href={paths.live(shoot.id)}>
            See the summary
          </a>
          <button type="button" className="btn secondary wide" onClick={() => void reopenShoot(shoot.id).then(() => navigate(paths.live(shoot.id)))}>
            Reopen shoot
          </button>
        </>
      )}
      {shoot.status === 'live' && !locked && (
        <button type="button" className="btn secondary wide" onClick={() => void finishShoot(shoot.id).then(() => navigate(paths.live(shoot.id)))}>
          Finish shoot
        </button>
      )}
      {!locked && (
        <button type="button" className="btn secondary wide" onClick={() => setSharing(true)}>
          Share shoot
        </button>
      )}
      {message && (
        <p className="status-msg" role="status">
          {message}
        </p>
      )}
      <button type="button" className="btn secondary wide" onClick={() => setPoseSheet(true)}>
        Pose sheet{withPose > 0 ? ` (${withPose})` : ''}
      </button>
      {sharing && (
        <ShareShootSheet
          shoot={shoot}
          familyName={familyName}
          onClose={() => setSharing(false)}
          onSent={(m) => {
            setSharing(false);
            setMessage(m);
          }}
        />
      )}
      {poseSheet && <PoseSheet shoot={shoot} people={people} extras={extras} onClose={() => setPoseSheet(false)} />}
    </div>
  );
}

/** The poses attached to this shoot's shots, in shooting order, to show the family or keep in hand (PL7). */
function PoseSheet({ shoot, people, extras, onClose }: { shoot: Shoot; people: Person[]; extras: Extra[]; onClose: () => void }) {
  const poses = usePoseMap();
  const names = shortNames(people, extras);
  const rows = inOrder(shoot.shots, shoot.order)
    .map((s) => ({ shot: s, list: poseIdsOf(s).flatMap((id) => (poses.has(id) ? [poses.get(id)!] : [])) }))
    .filter((r) => r.list.length > 0);
  return (
    <Sheet title="Pose sheet" onClose={onClose}>
      {rows.length === 0 ? (
        <p className="empty">No poses yet. Open a shot and pick one under Suggested poses.</p>
      ) : (
        <ul className="list" aria-label="Shots with poses">
          {rows.map(({ shot: s, list }) => (
            <li key={s.id} className="pose-sheet-row">
              <span className="pose-sheet-thumbs">
                {list.map((pose) => (
                  <PoseThumb key={pose.id} pose={pose} />
                ))}
              </span>
              <span>
                <b>{s.name}</b>
                <span className="list-sub">{list.map((p) => p.name).join(', ')}</span>
                <span className="list-sub">{s.personIds.map((id) => names.get(id) ?? 'Someone').join(', ')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
