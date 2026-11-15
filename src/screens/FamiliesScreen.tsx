import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { NameSheet } from '../components/NameSheet';
import { QuickAddFamilySheet } from '../components/QuickAddFamilySheet';
import { Empty, Sheet, TopBar } from '../components/ui';
import { db } from '../data/db';
import { createDemoFamily, createFamily, deleteFamily, setFamilyArchived, updateFamily } from '../data/repo';
import type { Family } from '../data/types';
import { navigate, paths } from '../router';

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

type Dialog = { kind: 'new' } | { kind: 'quick' } | { kind: 'options'; family: Family } | { kind: 'rename'; family: Family } | null;

/** Families list (F1): add, rename, archive, delete, search; demo family on the empty state. */
export function FamiliesScreen() {
  const families = useLiveQuery(() => db.families.orderBy('name').toArray());
  const counts = useLiveQuery(async () => {
    const map = new Map<string, number>();
    for (const p of await db.people.toArray()) map.set(p.familyId, (map.get(p.familyId) ?? 0) + 1);
    return map;
  });
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  const open = (id: string) => navigate(paths.family(id));
  const q = search.trim().toLowerCase();
  const active = (families ?? []).filter((f) => !f.archived);
  const archived = (families ?? []).filter((f) => f.archived);
  const shown = (showArchived ? [...active, ...archived] : active).filter((f) => f.name.toLowerCase().includes(q));

  return (
    <main className="screen">
      <TopBar
        title="Families"
        action={
          <a href={paths.settings()} aria-label="Settings">
            ⚙︎
          </a>
        }
      />
      {families && (
        <div className="action-row">
          <button type="button" className="btn" onClick={() => setDialog({ kind: 'quick' })}>
            Quick add family
          </button>
          <button type="button" className="btn secondary" onClick={() => setDialog({ kind: 'new' })}>
            New family
          </button>
        </div>
      )}
      {families?.length === 0 && (
        <>
          <Empty>
            <b>No families yet</b>
            <br />
            Describe a family once (who is married to whom, who is whose child) and reuse it for every shoot.
          </Empty>
          <button type="button" className="btn secondary wide" onClick={() => void createDemoFamily().then((f) => open(f.id))}>
            Load demo family
          </button>
        </>
      )}
      {families && families.length > 0 && (
        <>
          <input
            className="search"
            type="search"
            aria-label="Search families"
            placeholder="Search families"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {shown.length === 0 && <Empty>No family matches “{search.trim()}”.</Empty>}
          <ul className="list">
            {shown.map((family) => (
              <li key={family.id} className="list-item with-options">
                <a className={`list-item${family.archived ? ' inactive' : ''}`} href={paths.family(family.id)}>
                  <span className="list-title">
                    {family.name}
                    {family.archived && <span className="list-sub">Archived</span>}
                  </span>
                  <span className="list-meta">{people(counts?.get(family.id) ?? 0)}</span>
                </a>
                <button type="button" className="link" aria-label={`Options for ${family.name}`} onClick={() => setDialog({ kind: 'options', family })}>
                  ⋯
                </button>
              </li>
            ))}
          </ul>
          {archived.length > 0 && (
            <button type="button" className="link" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
            </button>
          )}
        </>
      )}

      {dialog?.kind === 'new' && (
        <NameSheet
          title="New family"
          label="Family name"
          submitLabel="Create"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const f = await createFamily(name);
            setDialog(null);
            open(f.id);
          }}
        />
      )}
      {dialog?.kind === 'quick' && (
        <QuickAddFamilySheet
          onClose={() => setDialog(null)}
          onCreated={(id) => {
            setDialog(null);
            open(id);
          }}
        />
      )}
      {dialog?.kind === 'rename' && (
        <NameSheet
          title="Rename family"
          label="Family name"
          initial={dialog.family.name}
          submitLabel="Save"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await updateFamily(dialog.family.id, { name });
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'options' && (
        <FamilyOptions family={dialog.family} onClose={() => setDialog(null)} onRename={() => setDialog({ kind: 'rename', family: dialog.family })} />
      )}
    </main>
  );
}

function FamilyOptions({ family, onClose, onRename }: { family: Family; onClose: () => void; onRename: () => void }) {
  return (
    <Sheet title={family.name} onClose={onClose}>
      <button type="button" className="btn secondary wide" onClick={onRename}>
        Rename
      </button>
      <button
        type="button"
        className="btn secondary wide"
        onClick={() => void setFamilyArchived(family.id, !family.archived).then(onClose)}
      >
        {family.archived ? 'Unarchive' : 'Archive'}
      </button>
      <button
        type="button"
        className="btn danger wide"
        onClick={() => {
          if (!window.confirm(`Delete ${family.name} with all its people and shoots? This can’t be undone.`)) return;
          void deleteFamily(family.id).then(onClose);
        }}
      >
        Delete
      </button>
    </Sheet>
  );
}
