import { useMemo, useState } from 'react';
import type { Extra, Partnership, Person } from '../data/types';
import { toTreePeople } from '../domain/familyView';
import { AttendanceList } from './AttendanceList';
import { FamilyTree } from './FamilyTree';
import { Segmented } from './ui';

/** Pick people and extras for a shot: tap them in the tree, or tick them in a list (E4). */
export function PeoplePicker({
  people,
  partnerships,
  extras,
  selectedIds,
  onToggle,
}: {
  people: Person[];
  partnerships: Partnership[];
  extras: Extra[];
  selectedIds: string[];
  onToggle: (id: string, on: boolean) => void;
}) {
  const [mode, setMode] = useState<'list' | 'tree'>('list');
  const treePeople = useMemo(() => toTreePeople(people, partnerships), [people, partnerships]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  return (
    <>
      <Segmented
        label="Pick from"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'list', label: 'List' },
          { value: 'tree', label: 'Tree' },
        ]}
      />
      {mode === 'tree' ? (
        <>
          <div className="tree-box small">
            <FamilyTree people={treePeople} selectedIds={selected} onPersonTap={(id) => onToggle(id, !selected.has(id))} />
          </div>
          {extras.length > 0 && (
            <AttendanceList people={[]} partnerships={[]} extras={extras} attendingIds={selectedIds} onChange={onToggle} />
          )}
        </>
      ) : (
        <AttendanceList people={people} partnerships={partnerships} extras={extras} attendingIds={selectedIds} onChange={onToggle} />
      )}
    </>
  );
}
