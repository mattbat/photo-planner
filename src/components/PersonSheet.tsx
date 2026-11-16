import { useState } from 'react';
import { displayName, indexFamily, isGrown } from '../domain/familyView';
import { addChild, addPerson, deletePartnership, deletePerson, ensurePartnership, linkChild, linkParent, linkPartner, updatePartnership, updatePerson, type LinkResult } from '../data/repo';
import { linkCandidates, type LinkRole } from '../domain/links';
import { useConfirm } from './ConfirmSheet';
import { ChoosePerson, DuplicateHint } from './ChoosePerson';
import type { Partnership, Person, Sex } from '../data/types';
import { Info, Segmented, Sheet, Toggle } from './ui';

interface Props {
  personId: string;
  people: Person[];
  partnerships: Partnership[];
  onClose: () => void;
  /** Open another person in the same sheet (a parent, partner or child). */
  onOpen: (id: string) => void;
}

/**
 * The person sheet (F2–F5, V5): edit a person and their parents, partners and
 * children. Every change is saved at once through repo.ts.
 *
 * Hook point for the relationship finder (V6): a "How are we related?" row
 * goes under Partners once `describeRelationship` exists in src/domain.
 */
export function PersonSheet({ personId, people, partnerships, onClose, onOpen }: Props) {
  const person = people.find((p) => p.id === personId);
  if (!person) return null;
  return <PersonForm key={person.id} person={person} people={people} partnerships={partnerships} onClose={onClose} onOpen={onOpen} />;
}

function PersonForm({ person, people, partnerships, onClose, onOpen }: Omit<Props, 'personId'> & { person: Person }) {
  const { confirm, confirmSheet } = useConfirm();
  const [name, setName] = useState(person.name);
  const [nickname, setNickname] = useState(person.nickname ?? '');
  const [birthYear, setBirthYear] = useState(person.birthYear?.toString() ?? '');
  const [notes, setNotes] = useState(person.notes ?? '');
  const [childName, setChildName] = useState('');
  const [childWith, setChildWith] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [parentName, setParentName] = useState('');
  const [picking, setPicking] = useState<LinkRole | null>(null);
  const [linkMsg, setLinkMsg] = useState<{ role: LinkRole; text: string } | null>(null);

  const index = indexFamily(people, partnerships);
  const parents = person.parentIds.map((id) => index.byId.get(id)).filter((p): p is Person => !!p);
  const children = (index.childrenOf.get(person.id) ?? []).map((id) => index.byId.get(id)!);
  const myPartnerships = partnerships.filter((pt) => pt.personIds.includes(person.id));
  const partnerOf = (pt: Partnership) => index.byId.get(pt.personIds[0] === person.id ? pt.personIds[1] : pt.personIds[0]);
  const hasPartner = myPartnerships.length > 0;
  const grownAuto = hasPartner || children.length > 0;
  const grown = isGrown(person, hasPartner, children.length > 0, new Date().getFullYear());

  const commitName = () => {
    const next = name.trim();
    if (!next) setName(person.name);
    else if (next !== person.name) void updatePerson(person.id, { name: next });
  };
  const commitText = (field: 'nickname' | 'notes', value: string) => {
    const next = value.trim() || undefined;
    if (next !== person[field]) void updatePerson(person.id, { [field]: next });
  };
  const commitYear = () => {
    const n = Number.parseInt(birthYear, 10);
    const next = Number.isFinite(n) && n >= 1800 && n <= 2200 ? n : undefined;
    if (next === undefined) setBirthYear('');
    if (next !== person.birthYear) void updatePerson(person.id, { birthYear: next });
  };

  const removeParent = (id: string) => void updatePerson(person.id, { parentIds: person.parentIds.filter((p) => p !== id) });

  const addNewPartner = async () => {
    const n = partnerName.trim();
    if (!n) return;
    const partner = await addPerson(person.familyId, { name: n, grown: true });
    await ensurePartnership(person.familyId, [person.id, partner.id]);
    setPartnerName('');
  };
  const addNewParent = async () => {
    const n = parentName.trim();
    if (!n || person.parentIds.length >= 2) return;
    const parent = await addPerson(person.familyId, { name: n, grown: true });
    await updatePerson(person.id, { parentIds: [...person.parentIds, parent.id] });
    setParentName('');
  };

  const addNewChild = async () => {
    const n = childName.trim();
    if (!n) return;
    await addChild(person.familyId, n, childWith ? [person.id, childWith] : [person.id]);
    setChildName('');
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${person.name}?`,
      body: 'They’re taken out of the tree and out of shoots. This can’t be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deletePerson(person.id);
    onClose();
  };

  /** People who can be picked for a role: no impossible links (F9). */
  const candidates = (role: LinkRole) => linkCandidates(people, partnerships, person.id, role, role === 'child' ? childWith || undefined : undefined);
  const pick = async (role: LinkRole, other: Person) => {
    const result: LinkResult =
      role === 'parent' ? await linkParent(person.id, other.id) : role === 'partner' ? await linkPartner(person.id, other.id) : await linkChild(person.id, other.id, childWith || undefined);
    setLinkMsg(result.ok ? null : { role, text: result.message });
    if (result.ok) setPicking(null);
  };
  const chooser = (role: LinkRole) => {
    const list = candidates(role);
    const alert = linkMsg?.role === role && (
      <p className="problems" role="alert">
        {linkMsg.text}
      </p>
    );
    if (picking === role) {
      return (
        <>
          {alert}
          <ChoosePerson people={list} onPick={(p) => void pick(role, p)} onCancel={() => setPicking(null)} />
        </>
      );
    }
    return (
      <>
        {alert}
        {list.length > 0 && (
          <button type="button" className="btn secondary wide" aria-label={`Choose someone already in the family (${role})`} onClick={() => setPicking(role)}>
            Choose someone already in the family
          </button>
        )}
      </>
    );
  };

  return (
    <Sheet title={displayName(person)} onClose={onClose}>
      <label className="row stack">
        <span className="row-label">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} autoComplete="off" />
      </label>
      <label className="row stack">
        <span className="row-label">Nickname (shown on the tree)</span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onBlur={() => commitText('nickname', nickname)}
          autoComplete="off"
        />
      </label>
      <div className="row stack">
        <span className="row-label">Sex (optional)</span>
        <Segmented<Sex | ''>
          label="Sex"
          value={person.sex ?? ''}
          onChange={(v) => void updatePerson(person.id, { sex: v || undefined })}
          options={[
            { value: '', label: 'Not set' },
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
          ]}
        />
      </div>
      <div className="row stack">
        <span className="row-label">
          Kid or grown <Info label="kid or grown">Kids sit under their parents and are shot first. Anyone with a partner or children counts as grown automatically.</Info>
        </span>
        <Segmented<'kid' | 'grown'>
          label="Kid or grown"
          value={grown ? 'grown' : 'kid'}
          onChange={(v) => {
            if (grownAuto) return;
            void updatePerson(person.id, { grown: v === 'grown', ageGroup: v === 'grown' ? 'adult' : 'child' });
          }}
          options={[
            { value: 'kid', label: 'Kid' },
            { value: 'grown', label: 'Grown' },
          ]}
        />
        {grownAuto && <span className="status-msg">Grown, because they have a partner or children.</span>}
      </div>
      <label className="row stack">
        <span className="row-label">Birth year (optional)</span>
        <input
          inputMode="numeric"
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onBlur={commitYear}
        />
      </label>
      <Toggle
        label="Not usually at shoots"
        checked={!!person.usuallyAbsent}
        onChange={(v) => void updatePerson(person.id, { usuallyAbsent: v })}
        info="For someone who lives far away, say. They start unticked on each new shoot, and you can tick them in."
      />
      <label className="row stack">
        <span className="row-label">Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => commitText('notes', notes)} />
      </label>

      <h3 className="sheet-sub">Parents</h3>
      <ul className="mini-list">
        {parents.map((p) => (
          <li key={p.id}>
            <button type="button" className="grow" onClick={() => onOpen(p.id)}>
              {displayName(p)}
            </button>
            <button type="button" className="link" aria-label={`Remove parent ${p.name}`} onClick={() => removeParent(p.id)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {person.parentIds.length < 2 && (
        <>
          <form
            className="inline-add"
            onSubmit={(e) => {
              e.preventDefault();
              void addNewParent();
            }}
          >
            <input aria-label="New parent’s name" placeholder="New parent’s name" value={parentName} onChange={(e) => setParentName(e.target.value)} />
            <button type="submit" className="btn small" disabled={!parentName.trim()}>
              Add parent
            </button>
          </form>
          <DuplicateHint people={candidates('parent')} typed={parentName} onLink={(p) => void pick('parent', p)} />
          {chooser('parent')}
        </>
      )}

      <h3 className="sheet-sub">Partners</h3>
      <ul className="mini-list">
        {myPartnerships.map((pt) => {
          const partner = partnerOf(pt);
          if (!partner) return null;
          return (
            <li key={pt.id}>
              <button type="button" className="grow" onClick={() => onOpen(partner.id)}>
                {displayName(partner)}
              </button>
              <button
                type="button"
                className="btn secondary small"
                aria-label={`${partner.name} is ${pt.status}. Tap to change`}
                onClick={() => void updatePartnership(pt.id, { status: pt.status === 'together' ? 'separated' : 'together' })}
              >
                {pt.status === 'together' ? 'Together' : 'Separated'}
              </button>
              <button type="button" className="link" aria-label={`Remove partner ${partner.name}`} onClick={() => void deletePartnership(pt.id)}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="inline-add"
        onSubmit={(e) => {
          e.preventDefault();
          void addNewPartner();
        }}
      >
        <input aria-label="New partner’s name" placeholder="New partner’s name" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
        <button type="submit" className="btn small" disabled={!partnerName.trim()}>
          Add partner
        </button>
      </form>
      <DuplicateHint people={candidates('partner')} typed={partnerName} onLink={(p) => void pick('partner', p)} />
      {chooser('partner')}

      <h3 className="sheet-sub">Children</h3>
      <ul className="mini-list">
        {children.map((c) => (
          <li key={c.id}>
            <button type="button" className="grow" onClick={() => onOpen(c.id)}>
              {displayName(c)}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="inline-add"
        onSubmit={(e) => {
          e.preventDefault();
          void addNewChild();
        }}
      >
        <input aria-label="New child’s name" placeholder="New child’s name" value={childName} onChange={(e) => setChildName(e.target.value)} />
        <button type="submit" className="btn small" disabled={!childName.trim()}>
          Add child
        </button>
      </form>
      <DuplicateHint people={candidates('child')} typed={childName} onLink={(p) => void pick('child', p)} />
      {myPartnerships.length > 0 && (
        <select aria-label="Child is with" value={childWith} onChange={(e) => setChildWith(e.target.value)}>
          <option value="">Child of {person.name} only</option>
          {myPartnerships.map((pt) => {
            const partner = partnerOf(pt);
            return partner ? (
              <option key={pt.id} value={partner.id}>
                Child of {person.name} and {partner.name}
              </option>
            ) : null;
          })}
        </select>
      )}

      {chooser('child')}

      <button type="button" className="btn danger wide" onClick={() => void remove()}>
        Delete {person.name}
      </button>
      {confirmSheet}
    </Sheet>
  );
}
