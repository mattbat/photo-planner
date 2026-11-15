import { useState } from 'react';
import { quickAddFamily, type QuickAddChild } from '../data/repo';
import { Sheet } from './ui';

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

interface ChildDraft {
  name: string;
  partner: string;
  kids: string;
}

/** Guided "Quick add family" (F2): family name, grandparents, their children, then each child's partner and kids. */
export function QuickAddFamilySheet({ onClose, onCreated }: { onClose: () => void; onCreated: (familyId: string) => void }) {
  const [step, setStep] = useState(0);
  const [familyName, setFamilyName] = useState('');
  const [gp1, setGp1] = useState('');
  const [gp2, setGp2] = useState('');
  const [childText, setChildText] = useState('');
  const [drafts, setDrafts] = useState<ChildDraft[]>([]);
  const [busy, setBusy] = useState(false);

  const goToHouseholds = () => {
    const names = lines(childText);
    setDrafts((old) => names.map((name) => old.find((d) => d.name === name) ?? { name, partner: '', kids: '' }));
    setStep(3);
  };

  const create = async () => {
    setBusy(true);
    const children: QuickAddChild[] = drafts.map((d) => {
      const kids = lines(d.kids);
      const child: QuickAddChild = { name: d.name, kids };
      if (d.partner.trim()) child.partner = d.partner.trim();
      return child;
    });
    const family = await quickAddFamily({ familyName, grandparents: [gp1, gp2], children });
    onCreated(family.id);
  };

  const patch = (i: number, change: Partial<ChildDraft>) => setDrafts((all) => all.map((d, j) => (j === i ? { ...d, ...change } : d)));

  const titles = ['Family name', 'Grandparents', 'Their children', 'Partners and kids'];
  return (
    <Sheet title="Quick add family" onClose={onClose}>
      <p className="step-dots">
        Step {step + 1} of 4 · {titles[step]}
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
          <label className="row stack">
            <span className="row-label">Who are the grandparents? (the oldest generation)</span>
            <input value={gp1} onChange={(e) => setGp1(e.target.value)} placeholder="First grandparent" aria-label="First grandparent" />
            <input value={gp2} onChange={(e) => setGp2(e.target.value)} placeholder="Their partner (optional)" aria-label="Second grandparent" />
          </label>
          <div className="footer-row">
            <button type="button" className="btn secondary grow" onClick={() => setStep(0)}>
              Back
            </button>
            <button type="button" className="btn grow" disabled={!gp1.trim() && !gp2.trim()} onClick={() => setStep(2)}>
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
          <div className="footer-row">
            <button type="button" className="btn secondary grow" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="btn grow" onClick={goToHouseholds}>
              {lines(childText).length ? 'Next' : 'Skip'}
            </button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          {drafts.length === 0 && <p className="status-msg">No children to add. You can add people later.</p>}
          {drafts.map((d, i) => (
            <div key={d.name} className="qa-child">
              <b>{d.name}</b>
              <label className="row stack">
                <span className="row-label">Partner (optional)</span>
                <input aria-label={`Partner of ${d.name}`} value={d.partner} onChange={(e) => patch(i, { partner: e.target.value })} />
              </label>
              <label className="row stack">
                <span className="row-label">Their kids (one name per line)</span>
                <textarea aria-label={`Kids of ${d.name}`} value={d.kids} onChange={(e) => patch(i, { kids: e.target.value })} />
              </label>
            </div>
          ))}
          <div className="footer-row">
            <button type="button" className="btn secondary grow" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" className="btn grow" disabled={busy} onClick={() => void create()}>
              Create family
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
