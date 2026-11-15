import { useState } from 'react';
import { removeShot, renameShot, updateShot } from '../data/repo';
import type { Extra, Shot } from '../data/types';
import { TEMPLATE_BY_ID } from '../engine/templates';
import type { TreePerson } from '../tree/types';
import { FamilyTree } from './FamilyTree';
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
  onClose,
}: {
  shootId: string;
  shot: Shot;
  treePeople: TreePerson[];
  extras: Extra[];
  onClose: () => void;
}) {
  const [name, setName] = useState(shot.name);
  const [notes, setNotes] = useState(shot.notes);
  const ids = new Set(shot.personIds);
  const extraNames = extras.filter((e) => ids.has(e.id)).map((e) => `${e.emoji ?? ''} ${e.name}`.trim());
  const reasons = shot.reasons.map((r) => TEMPLATE_BY_ID[r].label);
  return (
    <Sheet title={shot.name} onClose={onClose}>
      <div className="tree-box small" aria-label="Who is in this shot">
        <FamilyTree people={treePeople} highlightIds={ids} />
      </div>
      {extraNames.length > 0 && <p className="status-msg">Also in the shot: {extraNames.join(', ')}</p>}
      {reasons.length > 0 && <p className="status-msg">Made by: {reasons.join(', ')}</p>}
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
