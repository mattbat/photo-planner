import { useLiveQuery } from 'dexie-react-hooks';
import { Empty, TopBar } from '../components/ui';
import { db } from '../data/db';
import { paths } from '../router';

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** Families list (F1). Adding families and the tree arrive in M1. */
export function FamiliesScreen() {
  const families = useLiveQuery(() => db.families.orderBy('name').filter((f) => !f.archived).toArray());
  const counts = useLiveQuery(async () => {
    const map = new Map<string, number>();
    for (const p of await db.people.toArray()) map.set(p.familyId, (map.get(p.familyId) ?? 0) + 1);
    return map;
  });

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
      {families?.length === 0 && (
        <Empty>
          <b>No families yet</b>
          <br />
          Describe a family once (who is married to whom, who is whose child) and reuse it for every shoot.
        </Empty>
      )}
      {families && families.length > 0 && (
        <ul className="list">
          {families.map((family) => (
            <li key={family.id} className="list-item static">
              <span className="list-title">{family.name}</span>
              <span className="list-meta">{people(counts?.get(family.id) ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
