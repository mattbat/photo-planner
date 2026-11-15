import { useState } from 'react';
import { Sheet } from './ui';

/** A sheet that asks for one name: new family, rename, new person, new child. */
export function NameSheet({
  title,
  label,
  initial = '',
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (name: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
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
        <button type="submit" className="btn wide" disabled={!ok}>
          {submitLabel}
        </button>
      </form>
    </Sheet>
  );
}
