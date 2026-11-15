import { useLiveQuery } from 'dexie-react-hooks';
import { Empty, TopBar } from '../components/ui';
import { InstallHint } from '../components/InstallHint';
import { db } from '../data/db';
import { formatDate } from '../domain/dates';
import { paths } from '../router';

/** Shoots home screen (P1). Creating shoots arrives in M3. */
export function ShootsScreen() {
  const shoots = useLiveQuery(() => db.shoots.orderBy('date').toArray());
  const families = useLiveQuery(() => db.families.toArray());
  const familyName = new Map((families ?? []).map((f) => [f.id, f.name]));

  return (
    <main className="screen">
      <TopBar
        title="Shoots"
        action={
          <a href={paths.settings()} aria-label="Settings">
            ⚙︎
          </a>
        }
      />
      <InstallHint />
      {shoots?.length === 0 && (
        <Empty>
          <b>No shoots yet</b>
          <br />
          Add a family first, then plan a shoot for them. The shot list builds itself from the family tree.
        </Empty>
      )}
      {shoots && shoots.length > 0 && (
        <ul className="list">
          {shoots.map((shoot) => {
            const done = shoot.shots.filter((s) => s.status === 'done').length;
            return (
              <li key={shoot.id} className="list-item static">
                <span className="list-title">{shoot.title || familyName.get(shoot.familyId) || 'Shoot'}</span>
                <span className="list-meta">
                  {formatDate(shoot.date)} · {done} of {shoot.shots.length} shots
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
