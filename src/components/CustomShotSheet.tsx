import { useState } from 'react';
import { addCustomShot } from '../data/repo';
import type { Extra, Partnership, Person } from '../data/types';
import { PeoplePicker } from './PeoplePicker';
import { Sheet } from './ui';

/** "+ Custom shot" (E4): a name and the people and extras in it. */
export function CustomShotSheet({
  shootId,
  people,
  partnerships,
  extras,
  attendingIds,
  onClose,
}: {
  shootId: string;
  people: Person[];
  partnerships: Partnership[];
  extras: Extra[];
  attendingIds: string[];
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const here = new Set(attendingIds);
  return (
    <Sheet title="Custom shot" onClose={onClose}>
      <label className="row stack">
        <span className="row-label">Name (optional)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grandpa with the twins" autoComplete="off" />
      </label>
      <h3 className="sheet-sub">Who is in it ({ids.length})</h3>
      <PeoplePicker
        people={people.filter((p) => here.has(p.id))}
        partnerships={partnerships}
        extras={extras.filter((e) => here.has(e.id))}
        selectedIds={ids}
        onToggle={(id, on) => setIds(on ? [...ids, id] : ids.filter((x) => x !== id))}
      />
      <button
        type="button"
        className="btn wide"
        disabled={ids.length === 0}
        onClick={() => {
          void addCustomShot(shootId, { name, personIds: ids });
          onClose();
        }}
      >
        Add shot
      </button>
    </Sheet>
  );
}
