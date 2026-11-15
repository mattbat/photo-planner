import { useState } from 'react';
import { quickAddFamily, type QuickAddChild } from '../data/repo';
import type { Person } from '../data/types';
import { ChoosePerson, DuplicateHint } from './ChoosePerson';
import { Sheet } from './ui';

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

interface ChildDraft {
  /** Typed name of a new child, or the name of the existing person. */
  name: string;
  existingId?: string;
  partner: string;
  partnerId?: string | undefined;
  kids: string;
  kidIds: string[];
}

interface Slot {
  text: string;
  id?: string;
}

const CHOOSE = 'Choose someone already in the family';

/** A name field that can switch to picking someone already in the family (F9). */
function PersonField({
  label,
  slot,
  onChange,
  people,
  exclude,
  placeholder,
  ariaLabel,
}: {
  label?: string;
  slot: Slot;
  onChange: (slot: Slot) => void;
  people: Person[];
  exclude: (string | undefined)[];
  placeholder?: string;
  ariaLabel: string;
}) {
  const [choosing, setChoosing] = useState(false);
  const picked = slot.id ? people.find((p) => p.id === slot.id) : undefined;
  const options = people.filter((p) => !exclude.includes(p.id));
  const pick = (p: Person) => {
    onChange({ text: '', id: p.id });
    setChoosing(false);
  };
  return (
    <div className="qa-field">
      {label && <span className="row-label">{label}</span>}
      {picked ? (
        <p className="qa-picked">
          <b>{picked.name}</b>{' '}
          <button type="button" className="link" aria-label={`Type a name instead of ${picked.name}`} onClick={() => onChange({ text: '' })}>
            Type a name instead
          </button>
        </p>
      ) : (
        <>
          <input aria-label={ariaLabel} placeholder={placeholder} value={slot.text} onChange={(e) => onChange({ text: e.target.value })} autoComplete="off" />
          <DuplicateHint people={options} typed={slot.text} onLink={pick} />
          {options.length > 0 &&
            (choosing ? (
              <ChoosePerson people={options} onPick={pick} onCancel={() => setChoosing(false)} />
            ) : (
              <button type="button" className="link" aria-label={`${CHOOSE} (${ariaLabel})`} onClick={() => setChoosing(true)}>
                {CHOOSE}
              </button>
            ))}
        </>
      )}
    </div>
  );
}

/** A list of existing people picked one at a time, shown as chips. */
function PickedList({ ids, people, exclude, onChange, ariaLabel }: { ids: string[]; people: Person[]; exclude: (string | undefined)[]; onChange: (ids: string[]) => void; ariaLabel: string }) {
  const [choosing, setChoosing] = useState(false);
  const options = people.filter((p) => !ids.includes(p.id) && !exclude.includes(p.id));
  return (
    <div className="qa-field">
      {ids.length > 0 && (
        <ul className="mini-list">
          {ids.map((id) => (
            <li key={id}>
              <span className="grow">{people.find((p) => p.id === id)?.name ?? 'Someone'}</span>
              <button type="button" className="link" aria-label={`Remove ${people.find((p) => p.id === id)?.name ?? 'person'}`} onClick={() => onChange(ids.filter((x) => x !== id))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {options.length > 0 &&
        (choosing ? (
          <ChoosePerson
            people={options}
            onPick={(p) => {
              onChange([...ids, p.id]);
              setChoosing(false);
            }}
            onCancel={() => setChoosing(false)}
          />
        ) : (
          <button type="button" className="link" aria-label={`${CHOOSE} (${ariaLabel})`} onClick={() => setChoosing(true)}>
            {CHOOSE}
          </button>
        ))}
    </div>
  );
}

/**
 * Guided "Quick add family" (F2): family name, grandparents, their children, then each child's partner and kids.
 * With `into` (a family's people), it adds to that family instead of making a new one, and every name
 * can be someone already there (F9).
 */
export function QuickAddFamilySheet({
  onClose,
  onCreated,
  into,
}: {
  onClose: () => void;
  onCreated: (familyId: string) => void;
  into?: { familyId: string; people: Person[] };
}) {
  const people = into?.people ?? [];
  const first = into ? 1 : 0;
  const [step, setStep] = useState(first);
  const [familyName, setFamilyName] = useState('');
  const [gp1, setGp1] = useState<Slot>({ text: '' });
  const [gp2, setGp2] = useState<Slot>({ text: '' });
  const [childText, setChildText] = useState('');
  const [childIds, setChildIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<ChildDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const gpIds = [gp1.id, gp2.id];
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Someone';

  const goToHouseholds = () => {
    const entries: { name: string; existingId?: string }[] = [
      ...childIds.map((id) => ({ name: nameOf(id), existingId: id })),
      ...lines(childText).map((name) => ({ name })),
    ];
    const keyOf = (d: { name: string; existingId?: string }) => d.existingId ?? `new:${d.name}`;
    setDrafts((old) => entries.map((e) => old.find((d) => keyOf(d) === keyOf(e)) ?? { ...e, partner: '', kids: '', kidIds: [] }));
    setStep(3);
  };

  const create = async () => {
    setBusy(true);
    setError('');
    const children: QuickAddChild[] = drafts.map((d) => {
      const child: QuickAddChild = { name: d.name, kids: lines(d.kids) };
      if (d.existingId) child.existingId = d.existingId;
      if (d.partnerId) child.partnerId = d.partnerId;
      else if (d.partner.trim()) child.partner = d.partner.trim();
      if (d.kidIds.length) child.kidIds = d.kidIds;
      return child;
    });
    try {
      const family = await quickAddFamily({
        familyName,
        ...(into ? { familyId: into.familyId } : {}),
        grandparents: [gp1.text, gp2.text],
        grandparentIds: gpIds.filter((x): x is string => !!x),
        children,
      });
      onCreated(family.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add them.');
      setBusy(false);
    }
  };

  const patch = (i: number, change: Partial<ChildDraft>) => setDrafts((all) => all.map((d, j) => (j === i ? { ...d, ...change } : d)));

  const titles = ['Family name', into ? 'Parents (the top of this group)' : 'Grandparents', 'Their children', 'Partners and kids'];
  const hasTop = !!(gp1.text.trim() || gp2.text.trim() || gp1.id || gp2.id);
  const allPicked = [...gpIds, ...childIds, ...drafts.flatMap((d) => [d.partnerId, ...d.kidIds])];
  return (
    <Sheet title={into ? 'Quick add people' : 'Quick add family'} onClose={onClose}>
      <p className="step-dots">
        Step {step + 1 - first} of {4 - first} · {titles[step]}
      </p>
      {step === 0 && (
        <>
          <label className="row stack">
            <span className="row-label">What is the family called?</span>
            <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="The Rivera family" autoFocus />
          </label>
          <button type="button" className="btn wide" disabled={!familyName.trim()} onClick={() => setStep(1)}>
            Next
          </button>
        </>
      )}
      {step === 1 && (
        <>
          <span className="row-label">{into ? 'Who is at the top? (one or two people)' : 'Who are the grandparents? (the oldest generation)'}</span>
          <PersonField slot={gp1} onChange={setGp1} people={people} exclude={[gp2.id]} placeholder="First grandparent" ariaLabel="First grandparent" />
          <PersonField slot={gp2} onChange={setGp2} people={people} exclude={[gp1.id]} placeholder="Their partner (optional)" ariaLabel="Second grandparent" />
          <div className="footer-row">
            <button type="button" className="btn secondary grow" onClick={() => (into ? onClose() : setStep(0))}>
              {into ? 'Cancel' : 'Back'}
            </button>
            <button type="button" className="btn grow" disabled={!hasTop} onClick={() => setStep(2)}>
              Next
            </button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <label className="row stack">
            <span className="row-label">Their children (one name per line)</span>
            <textarea value={childText} onChange={(e) => setChildText(e.target.value)} placeholder={'Ruth\nBen\nDana'} aria-label="Children" />
          </label>
          {into && <PickedList ids={childIds} people={people} exclude={[...gpIds]} onChange={setChildIds} ariaLabel="children" />}
          <div className="footer-row">
            <button type="button" className="btn secondary grow" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="btn grow" onClick={goToHouseholds}>
              {lines(childText).length || childIds.length ? 'Next' : 'Skip'}
            </button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          {drafts.length === 0 && <p className="status-msg">No children to add. You can add people later.</p>}
          {drafts.map((d, i) => (
            <div key={d.existingId ?? `new:${d.name}`} className="qa-child">
              <b>{d.name}</b>
              <PersonField
                label="Partner (optional)"
                slot={{ text: d.partner, ...(d.partnerId ? { id: d.partnerId } : {}) }}
                onChange={(s) => patch(i, { partner: s.text, partnerId: s.id })}
                people={people}
                exclude={allPicked.filter((x) => x !== d.partnerId).concat(d.existingId)}
                ariaLabel={`Partner of ${d.name}`}
              />
              <label className="row stack">
                <span className="row-label">Their kids (one name per line)</span>
                <textarea aria-label={`Kids of ${d.name}`} value={d.kids} onChange={(e) => patch(i, { kids: e.target.value })} />
              </label>
              {into && <PickedList ids={d.kidIds} people={people} exclude={[...allPicked, d.existingId]} onChange={(kidIds) => patch(i, { kidIds })} ariaLabel={`kids of ${d.name}`} />}
            </div>
          ))}
          {error && (
            <p className="problems" role="alert">
              {error}
            </p>
          )}
          <div className="footer-row">
            <button type="button" className="btn secondary grow" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" className="btn grow" disabled={busy} onClick={() => void create()}>
              {into ? 'Add them' : 'Create family'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
