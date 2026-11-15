import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { InstallHint } from '../components/InstallHint';
import { NewShootSheet } from '../components/NewShootSheet';
import { Empty, Section, TopBar } from '../components/ui';
import { db } from '../data/db';
import type { Shoot } from '../data/types';
import { formatDate } from '../domain/dates';
import { navigate, paths } from '../router';

/** Shoots home screen (P1): upcoming, in progress and finished shoots. */
export function ShootsScreen() {
  const data = useLiveQuery(async () => ({
    shoots: await db.shoots.orderBy('date').toArray(),
    families: await db.families.toArray(),
    locations: await db.locations.toArray(),
  }));
  const [creating, setCreating] = useState(false);

  const familyName = new Map((data?.families ?? []).map((f) => [f.id, f.name]));
  const locationName = new Map((data?.locations ?? []).map((l) => [l.id, l.name]));
  const shoots = data?.shoots ?? [];
  const groups: { title: string; shoots: Shoot[] }[] = [
    { title: 'Upcoming', shoots: shoots.filter((s) => s.status === 'planned') },
    { title: 'In progress', shoots: shoots.filter((s) => s.status === 'live') },
    { title: 'Finished', shoots: shoots.filter((s) => s.status === 'done').reverse() },
  ];
  const families = (data?.families ?? []).filter((f) => !f.archived);

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
      {data && families.length > 0 && (
        <button type="button" className="btn wide" onClick={() => setCreating(true)}>
          + New shoot
        </button>
      )}
      {data && shoots.length === 0 && (
        <Empty>
          <b>No shoots yet</b>
          <br />
          {families.length === 0
            ? 'Add a family first, then plan a shoot for them. The shot list builds itself from the family tree.'
            : 'Plan a shoot and the shot list builds itself from the family tree.'}
        </Empty>
      )}
      {groups
        .filter((g) => g.shoots.length > 0)
        .map((g) => (
          <Section key={g.title} title={g.title}>
            <ul className="list">
              {g.shoots.map((shoot) => {
                const done = shoot.shots.filter((s) => s.status === 'done').length;
                const place = shoot.locationId ? locationName.get(shoot.locationId) : undefined;
                return (
                  <li key={shoot.id}>
                    <a className="list-item" href={paths.shoot(shoot.id)}>
                      <span className="list-title">
                        {familyName.get(shoot.familyId) ?? 'Shoot'}
                        {shoot.title && <span className="list-sub">{shoot.title}</span>}
                        <span className="list-sub">
                          {formatDate(shoot.date)}
                          {shoot.startTime ? ` ${shoot.startTime}` : ''}
                          {place ? ` · ${place}` : ''}
                        </span>
                      </span>
                      <span className="list-meta" aria-label={`${done} of ${shoot.shots.length} shots done`}>
                        {done}/{shoot.shots.length}
                      </span>
                      <span className="chevron" aria-hidden>
                        ›
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}
      {creating && (
        <NewShootSheet
          families={families}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            navigate(paths.shoot(id));
          }}
        />
      )}
    </main>
  );
}
