import { useMemo, useState } from 'react';
import type { Partnership, Person, Priority, Shoot } from '../data/types';
import { displayName, groupByGeneration } from '../domain/familyView';
import { applyPriority, type PriorityChoice } from './priority';
import { Segmented, Sheet } from './ui';

const OPTIONS: { value: PriorityChoice; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'early', label: 'Early' },
  { value: 'late', label: 'Late' },
];

/** Normal, Early or Late for one person (O7). */
export function PriorityControl({ name, value, onChange }: { name: string; value: PriorityChoice; onChange: (v: PriorityChoice) => void }) {
  return <Segmented<PriorityChoice> label={`${name} goes`} value={value} onChange={onChange} options={OPTIONS} />;
}

/** A small Early / Late badge for a person's chip (O7). */
export function PriorityBadge({ value }: { value: Priority | undefined }) {
  if (!value) return null;
  return <span className={`prio-badge ${value}`}>{value === 'early' ? 'Early' : 'Late'}</span>;
}

/**
 * Before the shoot (O7): who goes Early or Late, one person at a time or
 * several at once. Early people are finished first; Late people are kept to
 * the end.
 */
export function PrioritySheet({
  shoot,
  people,
  partnerships,
  nameOf,
  onClose,
}: {
  shoot: Shoot;
  people: Person[];
  partnerships: Partnership[];
  nameOf: (id: string) => string;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const here = useMemo(() => people.filter((p) => shoot.attendingIds.includes(p.id)), [people, shoot.attendingIds]);
  const groups = useMemo(() => groupByGeneration(here, partnerships), [here, partnerships]);
  const set = async (ids: string[], how: PriorityChoice) => setNote(await applyPriority(shoot, ids, how, nameOf));
  return (
    <Sheet title="Who goes first or last" onClose={onClose}>
      <p className="hint">
        <b>Early</b> people are finished first (older guests, or anyone who needs a break soon). <b>Late</b> people are kept to the end (someone called away, a little one who needs a rest).
      </p>
      {note && (
        <p className="status-msg" role="status">
          {note}
        </p>
      )}
      {picked.length > 0 && (
        <div className="prio-bulk" role="group" aria-label="Set the selected people">
          <span>{picked.length} selected:</span>
          {OPTIONS.map((o) => (
            <button key={o.value} type="button" className="btn small secondary" onClick={() => void set(picked, o.value).then(() => setPicked([]))}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {groups.map((g) => (
        <ul key={g.generation} className="list live-who" aria-label={`Generation ${g.generation}`}>
          {g.people.map((p) => (
            <li key={p.id} className="live-who-row">
              <label className="prio-name">
                <input type="checkbox" aria-label={`Select ${displayName(p)}`} checked={picked.includes(p.id)} onChange={(e) => setPicked((all) => (e.target.checked ? [...all, p.id] : all.filter((x) => x !== p.id)))} />
                <span className="live-who-name">{displayName(p)}</span>
              </label>
              <PriorityControl name={displayName(p)} value={shoot.priorities?.[p.id] ?? 'normal'} onChange={(v) => void set([p.id], v)} />
            </li>
          ))}
        </ul>
      ))}
    </Sheet>
  );
}
