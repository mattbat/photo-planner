import { useMemo, useState } from 'react';
import { AttendanceList } from '../components/AttendanceList';
import { LiveControls } from '../components/LiveControls';
import { LightSection } from '../components/LightSection';
import { CustomShotSheet } from '../components/CustomShotSheet';
import { ShotSheet } from '../components/ShotSheet';
import { TemplatesPanel } from '../components/TemplatesPanel';
import { treeCss } from '../components/treeStyles';
import { Empty, Section, Sheet, TopBar, Toggle } from '../components/ui';
import { shareText } from '../data/share';
import {
  applySuggestedOrder,
  deleteShoot,
  duplicateShoot,
  restoreShot,
  setAttending,
  setOrderOptions,
  setShotOrder,
  setSoloScope,
  setTemplateEnabled,
  updateShoot,
  updateShot,
} from '../data/repo';
import type { Shot } from '../data/types';
import { formatDate } from '../domain/dates';
import { shortNames } from '../domain/shortNames';
import { goldenHourLabel } from '../domain/light';
import { guessTimeZone } from '../sun';
import { branchColors, toTreePeople } from '../domain/familyView';
import {
  analyzeOrder,
  clockAt,
  inOrder,
  moveShot,
  planShoot,
  previewShoot,
  shotListText,
  type OrderInput,
} from '../domain/shotView';
import { useBlockDrag } from '../hooks/useBlockDrag';
import { useShootData, type ShootData } from '../hooks/useShootData';
import { navigate, paths } from '../router';

const minutesText = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim());

type Dialog = 'attendance' | 'custom' | 'options' | { shotId: string } | null;

/** One shoot: templates, shot list and order (§6, §7). */
export function ShootScreen({ shootId }: { shootId: string }) {
  const data = useShootData(shootId);
  if (data === undefined) return <main className="screen" />;
  if (data === null) {
    return (
      <main className="screen">
        <TopBar title="Shoot" back={paths.shoots()} historyBack />
        <Empty>This shoot isn’t on this phone any more.</Empty>
      </main>
    );
  }
  return <Shoot data={data} />;
}

function Shoot({ data }: { data: ShootData }) {
  const { shoot, family, people, partnerships, extras, settings, location } = data;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [status, setStatus] = useState('');

  const treePeople = useMemo(() => toTreePeople(people, partnerships), [people, partnerships]);
  const colors = useMemo(() => branchColors(treePeople), [treePeople]);
  const nameById = useMemo(() => shortNames(people, extras), [people, extras]);
  const nameOf = (id: string) => nameById.get(id) ?? 'Someone';

  const ordered = useMemo(() => inOrder(shoot.shots, shoot.order), [shoot.shots, shoot.order]);
  const orderInput: OrderInput = useMemo(
    () => ({ people, partnerships, extras, shots: shoot.shots, order: shoot.order, options: shoot.orderOptions, estimates: settings.timeEstimates }),
    [people, partnerships, extras, shoot.shots, shoot.order, shoot.orderOptions, settings.timeEstimates],
  );
  const analysis = useMemo(() => analyzeOrder(orderInput), [orderInput]);
  const planInput = useMemo(
    () => ({ people, partnerships, extras, shoot, ...(family ? { familyName: family.name } : {}) }),
    [people, partnerships, extras, shoot, family],
  );
  const previews = useMemo(() => previewShoot(planInput), [planInput]);
  const plan = useMemo(() => planShoot(planInput), [planInput]);

  const stepByKey = new Map(analysis.steps.map((s) => [s.key, s]));
  const minutesByKey = new Map(analysis.minutes.map((m) => [m.key, m]));
  const attendingIds = shoot.attendingIds.filter((id) => nameById.has(id));
  const title = shoot.title || family?.name || 'Shoot';

  const drag = useBlockDrag(
    ordered.map((s) => s.id),
    0,
    (id, move) => void setShotOrder(shoot.id, moveShot(ordered.map((s) => s.id), id, move)),
  );

  const share = async () => {
    const text = shotListText({
      title: family && shoot.title ? `${family.name}: ${shoot.title}` : title,
      date: formatDate(shoot.date),
      ...(shoot.startTime ? { startTime: shoot.startTime } : {}),
      shots: shoot.shots,
      order: shoot.order,
      nameOf,
      minutes: analysis.minutes,
    });
    setStatus(await shareText(title, text, 'Shot list'));
  };

  const shotSheet = typeof dialog === 'object' && dialog !== null ? shoot.shots.find((s) => s.id === dialog.shotId) : undefined;

  return (
    <main className="screen ft">
      <style>{treeCss('auto')}</style>
      <TopBar
        title={title}
        back={paths.shoots()}
        historyBack
        action={
          <button type="button" className="link" aria-label="Shoot options" onClick={() => setDialog('options')}>
            ⋯
          </button>
        }
      />

      <section className="shoot-head" aria-label="Shoot">
        <div className="shoot-when">
          {formatDate(shoot.date)}
          {shoot.startTime ? ` · ${clockAt(shoot.startTime, 0)}` : ''}
        </div>
        <div className="shoot-sub">
          {family?.name}
          {location ? ` · ${location.name}` : ''}
          {location ? ` · ${goldenHourLabel(shoot.date, location, guessTimeZone()) ?? 'No golden hour'}` : ''}
        </div>
        <div className="shoot-facts">
          <button type="button" className="link" onClick={() => setDialog('attendance')}>
            {attendingIds.length} attending
          </button>
          <span>{shoot.shots.length} shots</span>
          <span>about {minutesText(analysis.totalMinutes)}</span>
        </div>
      </section>
      <LiveControls shoot={shoot} people={people} extras={extras} />
      {status && (
        <p className="status-msg" role="status">
          {status}
        </p>
      )}

      <Section title="Light">
        <LightSection shoot={shoot} location={location} totalMinutes={analysis.totalMinutes} />
      </Section>

      <Section title="Templates">
        <details className="fold" open>
          <summary>
            {shoot.templates.filter((t) => t.enabled).length} on. Switch templates on or off to change the shot list.
          </summary>
          <TemplatesPanel
            templates={shoot.templates}
            previews={previews}
            onToggle={(id, enabled) => void setTemplateEnabled(shoot.id, id, enabled)}
            onSolo={(scope) => void setSoloScope(shoot.id, scope)}
          />
        </details>
      </Section>

      <Section title={`Shot list (${shoot.shots.length})`}>
        {plan.flagged.length > 0 && (
          <section className="problems" aria-label="Shots that can’t be made">
            <h2>Can’t make these shots</h2>
            {plan.flagged.map((f) => (
              <p key={f.key}>{f.reason}</p>
            ))}
          </section>
        )}
        <div className="action-row">
          <button type="button" className="btn" onClick={() => void applySuggestedOrder(shoot.id)} disabled={shoot.shots.length < 2}>
            Suggested order
          </button>
          <button type="button" className="btn secondary" onClick={() => void applySuggestedOrder(shoot.id, true)} disabled={shoot.shots.length < 2}>
            ↻ Re-order rest
          </button>
        </div>
        <details className="fold">
          <summary>Order options{shoot.manualOrder ? ' (you ordered these by hand)' : ''}</summary>
          <Toggle label="Kids first" checked={shoot.orderOptions.kidsFirst} onChange={(v) => void setOrderOptions(shoot.id, { kidsFirst: v })} />
          <Toggle label="Release older people early" checked={shoot.orderOptions.releaseOlderEarly} onChange={(v) => void setOrderOptions(shoot.id, { releaseOlderEarly: v })} />
          <Toggle label="Big group first" checked={shoot.orderOptions.bigGroupFirst} onChange={(v) => void setOrderOptions(shoot.id, { bigGroupFirst: v })} />
          <Toggle label="Must-haves early" checked={shoot.orderOptions.mustHavesEarly} onChange={(v) => void setOrderOptions(shoot.id, { mustHavesEarly: v })} />
        </details>

        {shoot.shots.length === 0 ? (
          <Empty>
            <b>No shots yet</b>
            <br />
            Switch on a template above, or add a custom shot.
          </Empty>
        ) : (
          <ol className={`shots ${drag.dragging !== null ? 'dragging' : ''}`}>
            {ordered.map((shot, index) => (
              <ShotRow
                key={shot.id}
                shot={shot}
                index={index}
                nameOf={nameOf}
                colorOf={(id) => colors.get(id)}
                step={stepByKey.get(shot.id)}
                minutes={minutesByKey.get(shot.id)}
                startTime={shoot.startTime}
                dragHandle={drag.handleProps(index)}
                itemRef={drag.register(index)}
                itemStyle={drag.itemStyle(index)}
                dragged={drag.dragging === index}
                onOpen={() => setDialog({ shotId: shot.id })}
                onMustHave={() => void updateShot(shoot.id, shot.id, { mustHave: !shot.mustHave })}
              />
            ))}
          </ol>
        )}
        <button type="button" className="btn secondary wide" onClick={() => setDialog('custom')}>
          + Custom shot
        </button>
        {plan.removed.length > 0 && (
          <details className="fold">
            <summary>Removed shots ({plan.removed.length})</summary>
            <ul className="list">
              {plan.removed.map((r) => (
                <li key={r.key}>
                  <div className="list-item">
                    <span className="list-title">{r.name}</span>
                    <button type="button" className="btn small secondary" aria-label={`Restore ${r.name}`} onClick={() => void restoreShot(shoot.id, r.key)}>
                      Restore
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      {dialog === 'attendance' && (
        <Sheet title="Who is coming" onClose={() => setDialog(null)}>
          <AttendanceList
            people={people}
            partnerships={partnerships}
            extras={extras}
            attendingIds={attendingIds}
            onChange={(id, on) => void setAttending(shoot.id, id, on)}
          />
        </Sheet>
      )}
      {dialog === 'custom' && (
        <CustomShotSheet
          shootId={shoot.id}
          people={people}
          partnerships={partnerships}
          extras={extras}
          attendingIds={attendingIds}
          onClose={() => setDialog(null)}
        />
      )}
      {shotSheet && (
        <ShotSheet key={shotSheet.id} shootId={shoot.id} shot={shotSheet} treePeople={treePeople} extras={extras} people={people} partnerships={partnerships} onClose={() => setDialog(null)} />
      )}
      {dialog === 'options' && (
        <OptionsSheet
          data={data}
          onClose={() => setDialog(null)}
          onShare={() => {
            setDialog(null);
            void share();
          }}
        />
      )}
    </main>
  );
}

function ShotRow({
  shot,
  index,
  nameOf,
  colorOf,
  step,
  minutes,
  startTime,
  dragHandle,
  itemRef,
  itemStyle,
  dragged,
  onOpen,
  onMustHave,
}: {
  shot: Shot;
  index: number;
  nameOf: (id: string) => string;
  colorOf: (id: string) => number | undefined;
  step: ReturnType<typeof analyzeOrder>['steps'][number] | undefined;
  minutes: { start: number; duration: number } | undefined;
  startTime: string | undefined;
  dragHandle: ReturnType<ReturnType<typeof useBlockDrag>['handleProps']>;
  itemRef: (el: HTMLElement | null) => void;
  itemStyle: React.CSSProperties | undefined;
  dragged: boolean;
  onOpen: () => void;
  onMustHave: () => void;
}) {
  const shown = shot.personIds.slice(0, 6);
  const more = shot.personIds.length - shown.length;
  const when = minutes ? (startTime ? clockAt(startTime, minutes.start) : `+${minutes.start} min`) : '';
  const list = (ids: string[]) => ids.map(nameOf).join(', ');
  return (
    <li ref={itemRef} style={itemStyle} className={`shot ${dragged ? 'dragged' : ''}`} aria-label={`Shot ${index + 1}: ${shot.name}`}>
      <div className="shot-top">
        <button type="button" className="drag-handle" aria-label={`Drag ${shot.name} to reorder`} {...dragHandle}>
          ⠿
        </button>
        <span className="shot-num">{index + 1}</span>
        <button type="button" className="shot-name" onClick={onOpen}>
          {shot.name}
        </button>
        <button
          type="button"
          className={`star ${shot.mustHave ? 'on' : ''}`}
          aria-label={`Must-have: ${shot.name}`}
          aria-pressed={shot.mustHave}
          onClick={onMustHave}
        >
          {shot.mustHave ? '★' : '☆'}
        </button>
      </div>
      <div className="pchips">
        {shown.map((id) => {
          const c = colorOf(id);
          return (
            <span key={id} className="pchip" style={{ borderColor: c === undefined ? 'var(--ft-line)' : `var(--branch-${c})` }}>
              {nameOf(id)}
            </span>
          );
        })}
        {more > 0 && <span className="pchip more">+{more} more</span>}
      </div>
      {step && (
        <div className="shot-steps">
          {step.callIn.length > 0 && (
            <span className="step in">
              <span aria-hidden>▲</span> Call in: {list(step.callIn)}
            </span>
          )}
          {step.canLeave.length > 0 && (
            <span className="step out">
              <span aria-hidden>▼</span> Can leave: {list(step.canLeave)}
              {step.doneForDay.length > 0 && ` (done for the day: ${list(step.doneForDay)})`}
            </span>
          )}
        </div>
      )}
      <div className="shot-meta">
        {when && <span>{when}</span>}
        {minutes && <span>{minutes.duration} min</span>}
        {shot.source === 'custom' && <span>Custom</span>}
      </div>
      {shot.notes.trim() && <p className="shot-notes">{shot.notes}</p>}
    </li>
  );
}

function OptionsSheet({ data, onClose, onShare }: { data: ShootData; onClose: () => void; onShare: () => void }) {
  const { shoot } = data;
  const [confirming, setConfirming] = useState(false);
  return (
    <Sheet title="Shoot options" onClose={onClose}>
      <label className="row stack">
        <span className="row-label">Title</span>
        <input defaultValue={shoot.title ?? ''} onChange={(e) => void updateShoot(shoot.id, { title: e.target.value })} autoComplete="off" />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Date</span>
          <input type="date" defaultValue={shoot.date} onChange={(e) => e.target.value && void updateShoot(shoot.id, { date: e.target.value })} />
        </label>
        <label className="field">
          <span>Start time</span>
          <input
            type="time"
            defaultValue={shoot.startTime ?? ''}
            onChange={(e) => e.target.value && void updateShoot(shoot.id, { startTime: e.target.value })}
          />
        </label>
      </div>
      <button type="button" className="btn secondary wide" onClick={onShare}>
        Share shot list as text
      </button>
      <button
        type="button"
        className="btn secondary wide"
        onClick={() =>
          void duplicateShoot(shoot.id).then((copy) => {
            onClose();
            if (copy) navigate(paths.shoot(copy.id));
          })
        }
      >
        Duplicate shoot
      </button>
      {confirming ? (
        <div className="problems">
          <p>Delete this shoot and its shot list? This can’t be undone.</p>
          <button
            type="button"
            className="btn danger wide"
            onClick={() =>
              void deleteShoot(shoot.id).then(() => {
                onClose();
                navigate(paths.shoots());
              })
            }
          >
            Yes, delete shoot
          </button>
        </div>
      ) : (
        <button type="button" className="btn danger wide" onClick={() => setConfirming(true)}>
          Delete shoot
        </button>
      )}
    </Sheet>
  );
}
