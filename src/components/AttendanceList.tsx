import { useMemo } from 'react';
import type { Extra, Partnership, Person } from '../data/types';
import { displayName, groupByGeneration } from '../domain/familyView';

/** Tick who is at the shoot (E3): people by generation, then guests and pets. */
export function AttendanceList({
  people,
  partnerships,
  extras,
  attendingIds,
  onChange,
}: {
  people: Person[];
  partnerships: Partnership[];
  extras: Extra[];
  attendingIds: string[];
  onChange: (id: string, attending: boolean) => void;
}) {
  const groups = useMemo(() => groupByGeneration(people, partnerships), [people, partnerships]);
  const on = new Set(attendingIds);
  const row = (id: string, label: string, sub?: string) => (
    <li key={id}>
      <label className="list-item check">
        <input type="checkbox" checked={on.has(id)} onChange={(e) => onChange(id, e.target.checked)} />
        <span className="checkmark" aria-hidden />
        <span className="list-title">
          {label}
          {sub && <span className="list-sub">{sub}</span>}
        </span>
      </label>
    </li>
  );
  return (
    <>
      {groups.map((g) => (
        <ul key={g.generation} className="list" aria-label={`Generation ${g.generation}`}>
          {g.people.map((p) => row(p.id, displayName(p), p.usuallyAbsent ? 'not usually at shoots' : undefined))}
        </ul>
      ))}
      {extras.length > 0 && (
        <ul className="list" aria-label="Guests and pets">
          {extras.map((e) => row(e.id, `${e.emoji ?? (e.kind === 'pet' ? '🐾' : '🙂')} ${e.name}`, e.kind === 'pet' ? 'Pet' : 'Guest'))}
        </ul>
      )}
    </>
  );
}
