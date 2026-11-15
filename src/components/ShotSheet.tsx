import { useMemo, useState } from 'react';
import { clearPoses, movePose, removeShot, renameShot, togglePose, updateShot } from '../data/repo';
import { poseIdsOf } from '../domain/shotPoses';
import { usePoseMap } from '../hooks/usePoseMap';
import type { Extra, Partnership, Person, Shot } from '../data/types';
import { poseGroup } from '../domain/poseGroup';
import { TEMPLATE_BY_ID } from '../engine/templates';
import type { TreePerson } from '../tree/types';
import { FamilyTree } from './FamilyTree';
import { PoseSuggestions } from './PoseSuggestions';
import { Sheet, Toggle } from './ui';

/**
 * One shot: who is in it, shown on the tree (V7), and its name, must-have
 * flag, notes and removal (E6).
 */
export function ShotSheet({
  shootId,
  shot,
  treePeople,
  extras,
  people,
  partnerships,
  onClose,
}: {
  shootId: string;
  shot: Shot;
  treePeople: TreePerson[];
  extras: Extra[];
  people: Person[];
  partnerships: Partnership[];
  onClose: () => void;
}) {
  const [name, setName] = useState(shot.name);
  const [notes, setNotes] = useState(shot.notes);
  const ids = new Set(shot.personIds);
  const extraNames = extras.filter((e) => ids.has(e.id)).map((e) => `${e.emoji ?? ''} ${e.name}`.trim());
  const group = useMemo(() => poseGroup(shot.personIds, people, partnerships), [shot.personIds, people, partnerships]);
  const chosen = poseIdsOf(shot);
  const poses = usePoseMap();
  const reasons = shot.reasons.map((r) => TEMPLATE_BY_ID[r].label);
  return (
    <Sheet title={shot.name} onClose={onClose}>
      <div className="tree-box small" aria-label="Who is in this shot">
        <FamilyTree people={treePeople} highlightIds={ids} />
      </div>
      {extraNames.length > 0 && <p className="status-msg">Also in the shot: {extraNames.join(', ')}</p>}
      {reasons.length > 0 && <p className="status-msg">Made by: {reasons.join(', ')}</p>}
      <h3 className="sheet-sub">
        Suggested poses
        {chosen.length > 0 && (
          <>
            {' '}
            <span className="pose-count">{chosen.length} {chosen.length === 1 ? 'pose' : 'poses'}</span>{' '}
            <button type="button" className="link" onClick={() => void clearPoses(shootId, shot.id)}>
              Clear poses
            </button>
          </>
        )}
      </h3>
      <p className="hint">Tap several to use them all on this shot. Tap again to take one off.</p>
      <PoseSuggestions {...group} selectedIds={chosen} onPick={(pose) => void togglePose(shootId, shot.id, pose.id)} />
      {chosen.length > 0 && (
        <ol className="pose-chosen" aria-label="Poses for this shot, in order">
          {chosen.map((id, i) => (
            <li key={id}>
              <span className="grow">{poses.get(id)?.name ?? 'Pose'}</span>
              <button type="button" className="link" aria-label={`Move ${poses.get(id)?.name ?? 'pose'} up`} disabled={i === 0} onClick={() => void movePose(shootId, shot.id, id, -1)}>
                ↑
              </button>
              <button type="button" className="link" aria-label={`Move ${poses.get(id)?.name ?? 'pose'} down`} disabled={i === chosen.length - 1} onClick={() => void movePose(shootId, shot.id, id, 1)}>
                ↓
              </button>
              <button type="button" className="link" aria-label={`Remove ${poses.get(id)?.name ?? 'pose'}`} onClick={() => void togglePose(shootId, shot.id, id)}>
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      <Toggle label="Must-have" checked={shot.mustHave} onChange={(mustHave) => void updateShot(shootId, shot.id, { mustHave })} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void renameShot(shootId, shot.id, name);
        }}
      >
        <label className="row stack">
          <span className="row-label">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void renameShot(shootId, shot.id, name)} autoComplete="off" />
        </label>
      </form>
      <label className="row stack">
        <span className="row-label">Notes</span>
        <textarea
          value={notes}
          rows={3}
          onChange={(e) => {
            setNotes(e.target.value);
            void updateShot(shootId, shot.id, { notes: e.target.value });
          }}
        />
      </label>
      <button
        type="button"
        className="btn danger wide"
        onClick={() => {
          void removeShot(shootId, shot.id);
          onClose();
        }}
      >
        Remove this shot
      </button>
    </Sheet>
  );
}
