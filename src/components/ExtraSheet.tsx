import { useState } from 'react';
import { addExtra, deleteExtra, updateExtra } from '../data/repo';
import type { Extra, ExtraKind } from '../data/types';
import { Segmented, Sheet } from './ui';

/** Add or edit a guest or pet (F8). */
export function ExtraSheet({ familyId, extra, onClose }: { familyId: string; extra?: Extra; onClose: () => void }) {
  const [name, setName] = useState(extra?.name ?? '');
  const [kind, setKind] = useState<ExtraKind>(extra?.kind ?? 'pet');
  const [emoji, setEmoji] = useState(extra?.emoji ?? '');
  const ok = name.trim().length > 0;

  const save = async () => {
    if (!ok) return;
    const fields = { name: name.trim(), kind, emoji: emoji.trim() || undefined };
    if (extra) await updateExtra(extra.id, fields);
    else await addExtra(familyId, fields);
    onClose();
  };
  const remove = async () => {
    if (!extra || !window.confirm(`Delete ${extra.name}?`)) return;
    await deleteExtra(extra.id);
    onClose();
  };

  return (
    <Sheet title={extra ? extra.name : 'Add a guest or pet'} onClose={onClose}>
      <label className="row stack">
        <span className="row-label">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <div className="row stack">
        <span className="row-label">Is a</span>
        <Segmented
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'pet', label: 'Pet' },
            { value: 'guest', label: 'Guest' },
          ]}
        />
      </div>
      <label className="row stack">
        <span className="row-label">Emoji (optional)</span>
        <input value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} placeholder={kind === 'pet' ? '🐶' : '🙂'} />
      </label>
      <button type="button" className="btn wide" disabled={!ok} onClick={() => void save()}>
        {extra ? 'Save' : 'Add'}
      </button>
      {extra && (
        <button type="button" className="btn danger wide" onClick={() => void remove()}>
          Delete {extra.name}
        </button>
      )}
    </Sheet>
  );
}
