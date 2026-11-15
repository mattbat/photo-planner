import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CustomShotSheet } from '../components/CustomShotSheet';
import { FamilyTree } from '../components/FamilyTree';
import { treeCss } from '../components/treeStyles';
import { Empty, Section, Segmented, Sheet, TopBar, Toggle } from '../components/ui';
import { shareText } from '../data/share';
import {
  doShotNow,
  finishShoot,
  getSettings,
  markShotOnDay,
  moveShotsUpNext,
  reopenShoot,
  setShootPresence,
  undoLastOnDay,
  updateSettings,
} from '../data/repo';
import type { Extra, Person, Pose, Presence, Shot } from '../data/types';
import { formatDate } from '../domain/dates';
import { displayName, groupByGeneration, toTreePeople } from '../domain/familyView';
import { shortNames } from '../domain/shortNames';
import {
  currentShot,
  dayLists,
  progress,
  summarize,
  summaryText,
  transition,
  undoLabel,
  waitingFor,
  type DayState,
} from '../domain/shootDay';
import { analyzeOrder } from '../domain/shotView';
import { useLiveQuery } from 'dexie-react-hooks';
import { useShootData, type ShootData } from '../hooks/useShootData';
import { usePoseMap } from '../hooks/usePoseMap';
import { useWakeLock } from '../hooks/useWakeLock';
import { PoseThumb } from '../components/PoseThumb';
import { LightBanner } from '../components/LightBanner';
import { db } from '../data/db';
import { layoutTree } from '../tree/layout';
import type { AttendanceStatus } from '../tree/types';
import { paths } from '../router';
import '../live.css';

/** Shoot day (§8): the checklist the assistant uses outdoors. `lightBanner` is a slot for the golden-hour countdown (D7). */
export function LiveScreen({ shootId, lightBanner }: { shootId: string; lightBanner?: ReactNode }) {
  const data = useShootData(shootId);
  if (data === undefined) return <main className="screen" />;
  if (data === null) {
    return (
      <main className="screen">
        <TopBar title="Shoot day" back={paths.shoots()} />
        <Empty>This shoot isn’t on this phone any more.</Empty>
      </main>
    );
  }
  if (data.shoot.status === 'planned') {
    return (
      <main className="screen">
        <TopBar title="Shoot day" back={paths.shoot(shootId)} />
        <Empty>
          This shoot hasn’t started. <a href={paths.shoot(shootId)}>Open the shoot</a> and tap Start shoot.
        </Empty>
      </main>
    );
  }
  if (data.shoot.status === 'done') return <Finished data={data} />;
  return <Live data={data} lightBanner={lightBanner} />;
}

const minutesText = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim());

function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

type Dialog = 'who' | 'add' | 'menu' | { shotId: string } | null;
type View = 'now' | 'list' | 'tree';

function Live({ data, lightBanner }: { data: ShootData; lightBanner: ReactNode }) {
  const { shoot, people, partnerships, extras, settings } = data;
  const wake = useWakeLock(true);
  const poses = usePoseMap();
  const now = useNow();
  const location = useLiveQuery(() => (shoot.locationId ? db.locations.get(shoot.locationId) : undefined), [shoot.locationId]);
  const banner = lightBanner ?? <LightBanner shoot={shoot} location={location} now={new Date(now)} />;
  const [view, setView] = useState<View>('now');
  const [dialog, setDialog] = useState<Dialog>(null);

  const state: DayState = shoot;
  const nameById = useMemo(() => shortNames(people, extras), [people, extras]);
  const nameOf = (id: string) => nameById.get(id) ?? 'Someone';
  const treePeople = useMemo(() => toTreePeople(people, partnerships), [people, partnerships]);
  const nodes = useMemo(() => new Map(layoutTree(treePeople).nodes.map((n) => [n.id, n])), [treePeople]);
  const planned = useMemo(
    () => analyzeOrder({ people, partnerships, extras, shots: shoot.shots, order: shoot.order, options: shoot.orderOptions, estimates: settings.timeEstimates }).totalMinutes,
    [people, partnerships, extras, shoot.shots, shoot.order, shoot.orderOptions, settings.timeEstimates],
  );

  const current = currentShot(state);
  const move = transition(state, current);
  const lists = dayLists(state);
  const stats = progress(state, { now, startedAt: shoot.startedAt, plannedMinutes: planned });
  const attendingPeople = people.filter((p) => shoot.attendingIds.includes(p.id));
  const notHere = attendingPeople.filter((p) => shoot.presence[p.id] === 'expected' || shoot.presence[p.id] === 'left');
  const last = undoLabel(state, nameOf);
  const open = stats.todo + stats.waiting + stats.retakes;

  const statusById = useMemo(() => {
    const out: Record<string, AttendanceStatus> = {};
    for (const p of people) {
      const pr = shoot.presence[p.id];
      out[p.id] = !shoot.attendingIds.includes(p.id) ? 'absent' : pr === 'left' ? 'left' : pr === 'expected' ? 'waiting' : 'arrived';
    }
    return out;
  }, [people, shoot.attendingIds, shoot.presence]);

  const shotSheet = typeof dialog === 'object' && dialog !== null ? shoot.shots.find((s) => s.id === dialog.shotId) : undefined;

  return (
    <main className="screen live ft">
      <style>{treeCss('auto')}</style>
      <TopBar
        title="Shoot day"
        back={paths.shoot(shoot.id)}
        action={
          <button type="button" className="link" aria-label="Shoot day menu" onClick={() => setDialog('menu')}>
            ⋯
          </button>
        }
      />
      {banner}
      {wake.failed && <p className="callout-small">The screen may lock. Keep the phone awake in Settings › Display.</p>}

      <section className="live-progress" aria-label="Progress">
        <b>
          {stats.done} of {stats.total} done
        </b>
        <span> · {stats.mustHavesLeft} ★ left</span>
        <span className="live-time">
          {stats.elapsedMinutes !== undefined ? `${minutesText(stats.elapsedMinutes)} of about ${minutesText(stats.plannedMinutes)}` : `about ${minutesText(stats.plannedMinutes)}`}
        </span>
        <div className="live-bar" aria-hidden>
          <span style={{ width: `${stats.total ? (100 * stats.done) / stats.total : 0}%` }} />
        </div>
      </section>

      <div className="live-tools">
        <Segmented<View>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'now', label: 'Now' },
            { value: 'list', label: `List (${open})` },
            { value: 'tree', label: 'Tree' },
          ]}
        />
        <div className="live-tool-row">
          <button type="button" className="btn secondary" onClick={() => setDialog('who')}>
            Who’s here{notHere.length > 0 ? ` · ${notHere.length} away` : ''}
          </button>
          <button type="button" className="btn secondary" onClick={() => setDialog('add')}>
            + Shot
          </button>
        </div>
      </div>

      {view === 'now' && (
        <>
          {current ? (
            <CurrentCard shot={current} nameOf={nameOf} nodes={nodes} extras={extras} pose={current.poseId ? poses.get(current.poseId) : undefined} waiting={waitingFor(state, current)} number={shoot.shots.indexOf(current) + 1} total={stats.total} />
          ) : (
            <section className="live-card live-empty" aria-label="Current shot">
              <h2>{open === 0 ? 'All shots handled' : 'Waiting for people'}</h2>
              <p>
                {open === 0
                  ? 'Nothing left to photograph.'
                  : 'Every shot left needs someone who isn’t here. Mark them as here, or open the list.'}
              </p>
              {open === 0 && (
                <button type="button" className="btn big wide" onClick={() => void finishShoot(shoot.id)}>
                  Finish shoot
                </button>
              )}
            </section>
          )}
          {current && <NextCard move={move} nameOf={nameOf} />}
        </>
      )}

      {view === 'list' && (
        <ShotLists lists={lists} currentId={current?.id} nameOf={nameOf} onOpen={(id) => setDialog({ shotId: id })} />
      )}

      {view === 'tree' && (
        <div className="live-tree">
          <p className="hint">{current ? `Now: ${current.name}. ` : ''}Badges show who has arrived, is away or has left.</p>
          <div className="tree-box live-tree-box">
            <FamilyTree people={treePeople} highlightIds={new Set(current?.personIds ?? [])} statusById={statusById} />
          </div>
        </div>
      )}

      <footer className="footer live-footer">
        <button type="button" className="btn big wide done-btn" disabled={!current} onClick={() => current && void markShotOnDay(shoot.id, current.id, 'done')}>
          Done ✓
        </button>
        <div className="footer-row">
          <button type="button" className="btn secondary grow" disabled={!current} onClick={() => current && void markShotOnDay(shoot.id, current.id, 'skip')}>
            Skip
          </button>
          <button type="button" className="btn secondary grow" disabled={!current} onClick={() => current && void markShotOnDay(shoot.id, current.id, 'retake')}>
            Needs retake
          </button>
          <button type="button" className="btn secondary grow" disabled={!last} aria-label={last ? `Undo ${last}` : 'Undo'} title={last ? `Undo ${last}` : undefined} onClick={() => void undoLastOnDay(shoot.id)}>
            ↶ Undo
          </button>
        </div>
      </footer>

      {dialog === 'who' && <WhoSheet data={data} nameOf={nameOf} onClose={() => setDialog(null)} />}
      {dialog === 'add' && (
        <CustomShotSheet
          shootId={shoot.id}
          people={people}
          partnerships={partnerships}
          extras={extras}
          attendingIds={shoot.attendingIds}
          onClose={() => {
            setDialog(null);
            setView('now');
          }}
        />
      )}
      {shotSheet && (
        <Sheet title={shotSheet.name} onClose={() => setDialog(null)}>
          <ShotActions
            shot={shotSheet}
            shootId={shoot.id}
            nameOf={nameOf}
            waiting={waitingFor(state, shotSheet)}
            onDone={() => {
              setDialog(null);
              setView('now');
            }}
          />
        </Sheet>
      )}
      {dialog === 'menu' && (
        <Sheet title="Shoot day" onClose={() => setDialog(null)}>
          <button type="button" className="btn wide" onClick={() => void finishShoot(shoot.id)}>
            Finish shoot
          </button>
          <p className="hint">Shows the summary. You can reopen the shoot afterwards.</p>
          <a className="btn secondary wide" href={paths.shoot(shoot.id)}>
            Back to the shot list
          </a>
        </Sheet>
      )}
    </main>
  );
}

interface NodeInfo {
  branchId?: string | undefined;
  colorIndex: number;
  generation: number;
}

/** Who is in a shot, grouped by branch (D1): "Mike’s family" in blue, and so on. Extras come last. */
function groupPeople(ids: string[], nodes: Map<string, NodeInfo>, extraIds: Set<string>, nameOf: (id: string) => string) {
  const groups = new Map<string, { key: string; label: string; color: string; ids: string[]; order: number }>();
  const extra: string[] = [];
  for (const id of ids) {
    if (extraIds.has(id) || !nodes.has(id)) {
      extra.push(id);
      continue;
    }
    const n = nodes.get(id)!;
    const key = n.branchId ?? 'top';
    const g = groups.get(key) ?? {
      key,
      label: n.branchId ? `${nameOf(n.branchId)}’s family` : n.generation <= 1 ? 'Grandparents' : 'Family',
      color: n.branchId ? `var(--branch-${n.colorIndex})` : 'var(--ft-line)',
      ids: [],
      order: n.branchId ? n.colorIndex + 1 : 0,
    };
    g.ids.push(id);
    groups.set(key, g);
  }
  return { groups: [...groups.values()].sort((a, b) => a.order - b.order), extra };
}

function CurrentCard({
  shot,
  nameOf,
  nodes,
  extras,
  pose,
  waiting,
  number,
  total,
}: {
  shot: Shot;
  nameOf: (id: string) => string;
  nodes: Map<string, NodeInfo>;
  extras: Extra[];
  pose: Pose | undefined;
  waiting: string[];
  number: number;
  total: number;
}) {
  const extraById = new Map(extras.map((e) => [e.id, e]));
  const { groups, extra } = groupPeople(shot.personIds, nodes, new Set(extraById.keys()), nameOf);
  return (
    <section className="live-card" aria-label="Current shot">
      <p className="live-kicker">
        Shot {number} of {total}
        {shot.mustHave && (
          <span className="live-star" role="img" aria-label="Must-have">
            {' '}
            ★ Must-have
          </span>
        )}
      </p>
      <h2 className="live-name">{shot.name}</h2>
      {waiting.length > 0 && (
        <p className="live-waiting" role="status">
          Waiting for: {waiting.map(nameOf).join(', ')}
        </p>
      )}
      {groups.map((g) => (
        <div key={g.key} className="live-group" style={{ borderLeftColor: g.color }}>
          <div className="live-glabel">{g.label}</div>
          <div className="live-people">
            {g.ids.map((id) => (
              <span key={id}>{nameOf(id)}</span>
            ))}
          </div>
        </div>
      ))}
      {extra.length > 0 && (
        <div className="live-group" style={{ borderLeftColor: 'var(--ft-line)' }}>
          <div className="live-glabel">Also in the shot</div>
          <div className="live-people">
            {extra.map((id) => (
              <span key={id}>{`${extraById.get(id)?.emoji ?? (extraById.get(id)?.kind === 'pet' ? '🐾' : '🙂')} ${nameOf(id)}`}</span>
            ))}
          </div>
        </div>
      )}
      {pose && (
        <a className="live-pose" href={`#/poses/${encodeURIComponent(pose.id)}`}>
          <PoseThumb pose={pose} />
          <span>
            <span className="live-glabel">Suggested pose</span>
            <b>{pose.name}</b>
          </span>
        </a>
      )}
      {shot.notes.trim() && <p className="live-notes">{shot.notes}</p>}
    </section>
  );
}

function NextCard({ move, nameOf }: { move: ReturnType<typeof transition>; nameOf: (id: string) => string }) {
  const list = (ids: string[]) => ids.map(nameOf).join(', ');
  const done = new Set(move.doneForDay);
  return (
    <section className="live-next" aria-label="Next shot">
      <p className="live-kicker">Next</p>
      {move.next ? <h3>{move.next.name}</h3> : <h3>That’s the last shot</h3>}
      {move.callIn.length > 0 && (
        <p className="step in">
          <span aria-hidden>▲</span> Call in: <b>{list(move.callIn)}</b>
        </p>
      )}
      {move.canLeave.length > 0 && (
        <p className="step out">
          <span aria-hidden>▼</span> Can leave: <b>{list(move.canLeave.filter((id) => !done.has(id)))}</b>
          {done.size > 0 && (
            <>
              {move.canLeave.some((id) => !done.has(id)) ? ' · ' : ''}
              Done for the day: <b>{list(move.doneForDay)}</b>
            </>
          )}
        </p>
      )}
      {move.next && move.callIn.length === 0 && move.canLeave.length === 0 && <p className="hint">Same people.</p>}
    </section>
  );
}

function ShotLists({ lists, currentId, nameOf, onOpen }: { lists: ReturnType<typeof dayLists>; currentId: string | undefined; nameOf: (id: string) => string; onOpen: (id: string) => void }) {
  const row = (shot: Shot, note?: string) => (
    <li key={shot.id}>
      <button type="button" className={`live-row ${shot.id === currentId ? 'now' : ''}`} onClick={() => onOpen(shot.id)}>
        <span className="live-row-name">
          {shot.mustHave ? '★ ' : ''}
          {shot.name}
          {shot.id === currentId && <span className="live-now"> · now</span>}
        </span>
        <span className="live-row-sub">{note ?? shot.personIds.map(nameOf).join(', ')}</span>
      </button>
    </li>
  );
  const section = (title: string, count: number, body: ReactNode, collapsed = false) =>
    count > 0 && (
      <details className="live-sec" open={!collapsed}>
        <summary>
          {title} ({count})
        </summary>
        <ul className="live-list">{body}</ul>
      </details>
    );
  const none = lists.todo.length + lists.waiting.length + lists.retakes.length + lists.done.length + lists.skipped.length === 0;
  return (
    <div className="live-lists">
      {none && <Empty>No shots in this shoot.</Empty>}
      {section('To do', lists.todo.length, lists.todo.map((s) => row(s)))}
      {section('Waiting', lists.waiting.length, lists.waiting.map((w) => row(w.shot, `waiting for: ${w.waitingFor.map(nameOf).join(', ')}`)))}
      {section('Retakes', lists.retakes.length, lists.retakes.map((s) => row(s)))}
      {section('Done', lists.done.length, lists.done.map((s) => row(s)), true)}
      {section('Skipped', lists.skipped.length, lists.skipped.map((s) => row(s)), true)}
    </div>
  );
}

/** Tap a shot in the list (D4): do it now, or change what happened to it. */
function ShotActions({ shot, shootId, nameOf, waiting, onDone }: { shot: Shot; shootId: string; nameOf: (id: string) => string; waiting: string[]; onDone: () => void }) {
  const act = (fn: () => Promise<void>) => () => {
    void fn();
    onDone();
  };
  return (
    <>
      <p className="live-people-line">{shot.personIds.map(nameOf).join(', ')}</p>
      {waiting.length > 0 && shot.status === 'todo' && <p className="live-waiting">Waiting for: {waiting.map(nameOf).join(', ')}</p>}
      {shot.notes.trim() && <p className="hint">{shot.notes}</p>}
      <button type="button" className="btn big wide" onClick={act(() => doShotNow(shootId, shot.id))}>
        Do this now
      </button>
      {shot.status !== 'done' && (
        <button type="button" className="btn secondary wide" onClick={act(() => markShotOnDay(shootId, shot.id, 'done'))}>
          Mark done ✓
        </button>
      )}
      {shot.status !== 'skipped' && shot.status !== 'done' && (
        <button type="button" className="btn secondary wide" onClick={act(() => markShotOnDay(shootId, shot.id, 'skip'))}>
          Skip
        </button>
      )}
      {shot.status !== 'retake' && (
        <button type="button" className="btn secondary wide" onClick={act(() => markShotOnDay(shootId, shot.id, 'retake'))}>
          Needs retake
        </button>
      )}
      {shot.status !== 'todo' && (
        <button type="button" className="btn secondary wide" onClick={act(() => markShotOnDay(shootId, shot.id, 'reset'))}>
          Put back to do
        </button>
      )}
    </>
  );
}

const PRESENCE: { value: Presence; label: string }[] = [
  { value: 'here', label: 'Here' },
  { value: 'expected', label: 'Not yet' },
  { value: 'left', label: 'Left' },
];

/** Who’s here (D5): arrived, not yet, or left. Someone leaving offers to bring their shots forward. */
function WhoSheet({ data, nameOf, onClose }: { data: ShootData; nameOf: (id: string) => string; onClose: () => void }) {
  const { shoot, people, partnerships } = data;
  const [offer, setOffer] = useState<string | null>(null);
  const treatAll = useLiveQuery(async () => (await getSettings()).treatEveryoneAsHere !== false) ?? true;
  const groups = useMemo(() => groupByGeneration(people.filter((p) => shoot.attendingIds.includes(p.id)), partnerships), [people, partnerships, shoot.attendingIds]);
  const remaining = (id: string) => shoot.shots.filter((s) => s.status === 'todo' && s.personIds.includes(id)).length;
  const set = (p: Person, to: Presence) => {
    void setShootPresence(shoot.id, p.id, to);
    setOffer(to === 'left' && remaining(p.id) > 0 ? p.id : null);
  };
  return (
    <Sheet title="Who’s here" onClose={onClose}>
      {offer && (
        <div className="live-offer" role="status">
          <p>
            <b>{nameOf(offer)}</b> has to leave. {remaining(offer)} shot{remaining(offer) === 1 ? '' : 's'} left with them.
          </p>
          <button
            type="button"
            className="btn wide"
            onClick={() => {
              void moveShotsUpNext(shoot.id, offer);
              setOffer(null);
            }}
          >
            Move all of {nameOf(offer)}’s shots up next
          </button>
        </div>
      )}
      {groups.map((g) => (
        <ul key={g.generation} className="list live-who" aria-label={`Generation ${g.generation}`}>
          {g.people.map((p) => {
            const now = shoot.presence[p.id] ?? 'here';
            return (
              <li key={p.id} className="live-who-row">
                <span className="live-who-name">{displayName(p)}</span>
                <div className="segmented" role="radiogroup" aria-label={`${displayName(p)} is`}>
                  {PRESENCE.map((o) => (
                    <button key={o.value} type="button" role="radio" aria-checked={o.value === now} className={o.value === now ? 'on' : ''} onClick={() => set(p, o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      ))}
      <Toggle label="Treat everyone as here" checked={treatAll} onChange={(v) => void updateSettings({ treatEveryoneAsHere: v })} />
      <p className="hint">On: a new shoot starts with everyone here, and only people you mark Not yet or Left make shots wait.</p>
    </Sheet>
  );
}

/** After Finish shoot (D9): what got done, what is owed, and a text to share. Finished shoots can be reopened. */
function Finished({ data }: { data: ShootData }) {
  const { shoot, family, people, extras } = data;
  const [status, setStatus] = useState('');
  const nameOf = (id: string) => shortNames(people, extras).get(id) ?? 'Someone';
  const sum = summarize(shoot);
  const minutes = shoot.startedAt && shoot.finishedAt ? Math.max(1, Math.round((shoot.finishedAt - shoot.startedAt) / 60000)) : undefined;
  const title = shoot.title || family?.name || 'Shoot';
  const text = summaryText({ title: family && shoot.title ? `${family.name}: ${shoot.title}` : title, date: formatDate(shoot.date), summary: sum, total: shoot.shots.length, minutes });
  const block = (heading: string, shots: Shot[]) =>
    shots.length > 0 && (
      <Section title={`${heading} (${shots.length})`}>
        <ul className="list">
          {shots.map((s) => (
            <li key={s.id} className="list-item static">
              <span className="list-title">
                {s.name}
                <span className="list-sub">{s.personIds.map(nameOf).join(', ')}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    );
  return (
    <main className="screen live ft">
      <TopBar title="Shoot summary" back={paths.shoot(shoot.id)} />
      <section className="live-card" aria-label="Summary">
        <h2 className="live-name">
          {sum.done.length} of {shoot.shots.length} shots done
        </h2>
        <p className="hint">
          {title}, {formatDate(shoot.date)}
          {minutes !== undefined ? ` · about ${minutesText(minutes)}` : ''}
        </p>
        {sum.retakes.length > 0 && <p className="live-waiting">{sum.retakes.length} retake{sum.retakes.length === 1 ? '' : 's'} still owed</p>}
      </section>
      {block('Done', sum.done)}
      {block('Retakes still owed', sum.retakes)}
      {block('Skipped', sum.skipped)}
      {block('Not reached', sum.notReached)}
      {block('Added on the day', sum.added)}
      {status && (
        <p className="status-msg" role="status">
          {status}
        </p>
      )}
      <button type="button" className="btn wide" onClick={async () => setStatus(await shareText(title, text, 'Shoot summary'))}>
        Share summary as text
      </button>
      <button type="button" className="btn secondary wide" onClick={() => void reopenShoot(shoot.id)}>
        Reopen shoot
      </button>
    </main>
  );
}
