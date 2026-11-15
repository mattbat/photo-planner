import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../data/db';
import { createShoot, today } from '../data/repo';
import type { Family } from '../data/types';
import { AttendanceList } from './AttendanceList';
import { Sheet } from './ui';

/** New shoot (P2): family, title, date, start time, and who is coming (E3). */
export function NewShootSheet({
  families,
  initialFamilyId,
  onClose,
  onCreated,
}: {
  families: Family[];
  initialFamilyId?: string;
  onClose: () => void;
  onCreated: (shootId: string) => void;
}) {
  const [familyId, setFamilyId] = useState(initialFamilyId ?? families[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState('');
  // Ticked by hand for one family; changing family starts again from the defaults.
  const [picked, setPicked] = useState<{ familyId: string; ids: string[] } | null>(null);
  const attending = picked?.familyId === familyId ? picked.ids : null;
  const [busy, setBusy] = useState(false);

  const data = useLiveQuery(
    async () => ({
      people: await db.people.where('familyId').equals(familyId).toArray(),
      partnerships: await db.partnerships.where('familyId').equals(familyId).toArray(),
      extras: await db.extras.where('familyId').equals(familyId).filter((e) => e.shootId === undefined).toArray(),
    }),
    [familyId],
  );
  // Everyone ticked, except people "not usually at shoots" (F5).
  const checked = attending ?? (data ? [...data.people.filter((p) => !p.usuallyAbsent).map((p) => p.id), ...data.extras.map((e) => e.id)] : []);

  const create = async () => {
    if (!familyId || busy) return;
    setBusy(true);
    const shoot = await createShoot(
      { id: familyId },
      { date, attendingIds: checked, ...(title.trim() ? { title: title.trim() } : {}), ...(startTime ? { startTime } : {}) },
    );
    onCreated(shoot.id);
  };

  return (
    <Sheet title="New shoot" onClose={onClose}>
      <label className="row stack">
        <span className="row-label">Family</span>
        <select value={familyId} onChange={(e) => {
            setFamilyId(e.target.value);
            setPicked(null);
          }}>
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="row stack">
        <span className="row-label">Title (optional)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spring portraits" autoComplete="off" />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Start time (optional)</span>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
      </div>
      <h3 className="sheet-sub">Who is coming</h3>
      {data && (
        <AttendanceList
          people={data.people}
          partnerships={data.partnerships}
          extras={data.extras}
          attendingIds={checked}
          onChange={(id, on) => setPicked({ familyId, ids: on ? [...checked, id] : checked.filter((x) => x !== id) })}
        />
      )}
      <button type="button" className="btn wide" disabled={!familyId || !date || busy || checked.length === 0} onClick={() => void create()}>
        Create shoot
      </button>
    </Sheet>
  );
}
