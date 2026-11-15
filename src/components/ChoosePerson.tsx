import { useState } from 'react';
import type { Person } from '../data/types';
import { displayName } from '../domain/familyView';
import { matchesText, similarPeople } from '../domain/links';

/** "Choose someone already in the family" (F9): a searchable list of the people who can be picked. */
export function ChoosePerson({
  people,
  onPick,
  onCancel,
  label = 'Choose someone already in the family',
}: {
  people: Person[];
  onPick: (person: Person) => void;
  onCancel: () => void;
  label?: string;
}) {
  const [query, setQuery] = useState('');
  const shown = people.filter((p) => matchesText(p, query));
  return (
    <div className="choose-person" role="group" aria-label={label}>
      <p className="row-label">{label}</p>
      <input type="search" className="search" aria-label="Search the family" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      {shown.length === 0 ? (
        <p className="status-msg">{people.length === 0 ? 'No one else can be chosen here.' : 'No one matches.'}</p>
      ) : (
        <ul className="list choose-list">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" className="list-item" onClick={() => onPick(p)}>
                <span className="list-title">{displayName(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn secondary small" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** "Is this the same Emma?" (F10): a light hint under a new-name field, with a way to link instead. Never blocks adding. */
export function DuplicateHint({ people, typed, onLink, action = 'Link' }: { people: Person[]; typed: string; onLink: (person: Person) => void; action?: 'Link' | 'Open' }) {
  const same = similarPeople(people, typed).slice(0, 2);
  if (same.length === 0) return null;
  return (
    <>
      {same.map((p) => (
        <p key={p.id} className="dup-hint" role="status">
          Is this the same {p.name}?{' '}
          <button type="button" className="link" aria-label={`${action} ${p.name} instead`} onClick={() => onLink(p)}>
            {action} instead
          </button>
        </p>
      ))}
    </>
  );
}
