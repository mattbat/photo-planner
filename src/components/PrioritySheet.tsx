import { useMemo, useState, type ReactNode } from 'react';
import type { Partnership, Person, Priority, Shoot } from '../data/types';
import { displayName, groupByHousehold } from '../domain/familyView';
import { applyPriority, type PriorityChoice } from './priority';
import { useConfirm } from './ConfirmSheet';
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

/**
 * One compact row: the name (with its badge) on the left, the Normal / Early /
 * Late control on the right. Shared by the shoot screen and Who's here (O7).
 * `below` adds a full-width line under the row (Who's here puts Here / Not yet / Left there).
 */
export function PriorityRow({ name, value, onChange, below }: { name: string; value: PriorityChoice; onChange: (v: PriorityChoice) => void; below?: ReactNode }) {
  return (
    <li className="prio-row">
      <div className="prio-line">
        <span className="prio-name">{name}</span>
        <PriorityControl name={name} value={value} onChange={onChange} />
      </div>
      {below}
    </li>
  );
}

/** A small Early / Late badge for a person's chip (O7). */
export function PriorityBadge({ value }: { value: Priority | undefined }) {
  if (!value) return null;
  return <span className={`prio-badge ${value}`}>{value === 'early' ? 'Early' : 'Late'}</span>;
}

/**
 * Before the shoot (O7): who goes Early or Late, one row per person, grouped by
 * household. Early people are finished first; Late people are kept to the end.
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
  const [note, setNote] = useState('');
  const { confirm, confirmSheet } = useConfirm();
  const groups = useMemo(
    () =>
      groupByHousehold(
        people.filter((p) => shoot.attendingIds.includes(p.id)),
        people,
        partnerships,
      ),
    [people, partnerships, shoot.attendingIds],
  );
  const flagged = Object.keys(shoot.priorities ?? {}).filter((id) => shoot.priorities?.[id]);
  const set = async (ids: string[], how: PriorityChoice) => setNote(await applyPriority(shoot, ids, how, nameOf));
  const reset = async () => {
    if (await confirm({ title: 'Reset everyone to Normal?', body: 'Nobody will go first or last.', confirmLabel: 'Reset all' })) await set(flagged, 'normal');
  };
  const headName = (id?: string) => {
    const head = people.find((p) => p.id === id);
    return head ? `${displayName(head).split(' ')[0]}’s household` : 'Grandparents';
  };
  return (
    <Sheet title="Who goes first or last" onClose={onClose}>
      <p className="hint">
        <b>Early:</b> finished first (older guests, anyone who needs a break). <b>Late:</b> kept for the end (someone away, a little one resting).
      </p>
      {note && (
        <p className="status-msg" role="status">
          {note}
        </p>
      )}
      {groups.map((g) => (
        <section key={g.headId ?? 'top'} className="prio-group" aria-label={headName(g.headId)}>
          <h3 className="prio-head">
            <span className="prio-dot" style={{ background: g.colorIndex === undefined ? 'var(--ft-line)' : `var(--branch-${g.colorIndex})` }} aria-hidden="true" />
            {headName(g.headId)}
          </h3>
          <ul className="list prio-list">
            {g.people.map((p) => (
              <PriorityRow key={p.id} name={displayName(p)} value={shoot.priorities?.[p.id] ?? 'normal'} onChange={(v) => void set([p.id], v)} />
            ))}
          </ul>
        </section>
      ))}
      {flagged.length > 0 && (
        <button type="button" className="link prio-reset" onClick={() => void reset()}>
          Reset all to Normal
        </button>
      )}
      {confirmSheet}
    </Sheet>
  );
}
