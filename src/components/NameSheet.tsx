import { useState } from 'react';
import type { Person } from '../data/types';
import type { LinkResult } from '../data/repo';
import { ChoosePerson, DuplicateHint } from './ChoosePerson';
import { Sheet } from './ui';

/** A sheet that asks for one name: new family, rename, new person, new child. */
export function NameSheet({
  title,
  label,
  initial = '',
  submitLabel,
  onSubmit,
  onClose,
  existing,
}: {
  title: string;
  label: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (name: string) => void | Promise<void>;
  onClose: () => void;
  /**
   * Offer people already in the family (F9): `people` can be chosen with
   * "Choose someone already in the family", and a typed name that looks like
   * one of them gets "Is this the same …?". `onPick` links or opens them.
   */
  existing?: { people: Person[]; action?: 'Link' | 'Open'; onPick: (person: Person) => LinkResult | Promise<LinkResult> };
}) {
  const [name, setName] = useState(initial);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  const pick = async (person: Person) => {
    const result = await existing!.onPick(person);
    if (!result.ok) setError(result.message);
  };
  const ok = name.trim().length > 0;
  const submit = async () => {
    if (!ok) return;
    await onSubmit(name.trim());
  };
  return (
    <Sheet title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="row stack">
          <span className="row-label">{label}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" />
        </label>
        {existing && <DuplicateHint people={existing.people} typed={name} action={existing.action ?? 'Link'} onLink={(p) => void pick(p)} />}
        <button type="submit" className="btn wide" disabled={!ok}>
          {submitLabel}
        </button>
      </form>
      {error && (
        <p className="problems" role="alert">
          {error}
        </p>
      )}
      {existing && existing.action !== 'Open' && existing.people.length > 0 &&
        (choosing ? (
          <ChoosePerson people={existing.people} onPick={(p) => void pick(p)} onCancel={() => setChoosing(false)} />
        ) : (
          <button type="button" className="btn secondary wide" onClick={() => setChoosing(true)}>
            Choose someone already in the family
          </button>
        ))}
    </Sheet>
  );
}
