import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { InstallHint } from '../components/InstallHint';
import { NewShootSheet } from '../components/NewShootSheet';
import { ProgressRing } from '../components/icons';
import { Empty, Section, SettingsLink, TopBar } from '../components/ui';
import { db } from '../data/db';
import { dataFromText, encodeHandoff, parseHandoff } from '../data/handoff';
import type { Shoot } from '../data/types';
import { formatDate } from '../domain/dates';
import { goldenHourLabel } from '../domain/light';
import { clockAt } from '../domain/shotView';
import { guessTimeZone } from '../sun';
import { navigate, paths } from '../router';

/** Shoots home screen (P1): upcoming, in progress and finished shoots. */
export function ShootsScreen() {
  const data = useLiveQuery(async () => ({
    shoots: await db.shoots.orderBy('date').toArray(),
    families: await db.families.toArray(),
    locations: await db.locations.toArray(),
  }));
  const [creating, setCreating] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Receiving a shoot from the photographer or assistant (SH3).
  const pasteShoot = async () => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return setReceiveError('Couldn’t read what you copied. Copy the shoot link again, then tap Paste shoot.');
    }
    const data = dataFromText(text);
    if (!data) return setReceiveError('What you copied isn’t a Photo Planner shoot link. Copy the link from the message, then try again.');
    setReceiveError(null);
    navigate(paths.receive(data));
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseHandoff(await file.text());
    if (fileInput.current) fileInput.current.value = '';
    if (!parsed.ok) return setReceiveError(parsed.message);
    setReceiveError(null);
    navigate(paths.receive(await encodeHandoff(parsed.handoff)));
  };

  const familyName = new Map((data?.families ?? []).map((f) => [f.id, f.name]));
  const locationById = new Map((data?.locations ?? []).map((l) => [l.id, l]));
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
        action={<SettingsLink />}
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
                const place = shoot.locationId ? locationById.get(shoot.locationId) : undefined;
                const golden = place ? goldenHourLabel(shoot.date, place, guessTimeZone()) : null;
                return (
                  <li key={shoot.id}>
                    <a className="list-item" href={paths.shoot(shoot.id)}>
                      <span className="list-title">
                        {familyName.get(shoot.familyId) ?? 'Shoot'}
                        {shoot.title && <span className="list-sub">{shoot.title}</span>}
                        <span className="list-sub meta">
                          <span className="meta-in">
                            {[formatDate(shoot.date), shoot.startTime ? clockAt(shoot.startTime, 0) : '', place?.name ?? '', golden ?? '']
                              .filter(Boolean)
                              .map((bit) => (
                                <span key={bit} className="meta-bit">
                                  {bit}
                                </span>
                              ))}
                          </span>
                        </span>
                      </span>
                      {shoot.handoff && (
                        <span className="chip muted">Shared</span>
                      )}
                      <span className="list-meta progress-meta" aria-label={`${done} of ${shoot.shots.length} shots done`}>
                        <ProgressRing done={done} total={shoot.shots.length} />
                        <span>
                          {done}/{shoot.shots.length}
                        </span>
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
      <Section title="Receive a shared shoot">
        <div className="footer-row">
          <button type="button" className="btn secondary grow" onClick={() => void pasteShoot()}>
            Paste shoot
          </button>
          <button type="button" className="btn secondary grow" onClick={() => fileInput.current?.click()}>
            Open shoot file
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="file-input"
          aria-label="Shoot file"
          onChange={(e) => void openFile(e.target.files?.[0])}
        />
        {receiveError && (
          <p className="error" role="alert">
            {receiveError}
          </p>
        )}
      </Section>
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
