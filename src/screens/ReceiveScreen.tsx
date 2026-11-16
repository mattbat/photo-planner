import { useEffect, useState } from 'react';
import { Section, TopBar } from '../components/ui';
import { db } from '../data/db';
import { decideReceive, decodeHandoff, shootProgress, type ReceiveDecision, type ShootHandoff } from '../data/handoff';
import { receiveShoot } from '../data/repo';
import type { Shoot } from '../data/types';
import { formatDate } from '../domain/dates';
import { navigate, paths } from '../router';
import { isStandalone } from '../viewport';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; handoff: ShootHandoff; local: Shoot | undefined; decision: ReceiveDecision };

/** Opening a shoot someone sent: from a link, a pasted link, or a file (SH3, SH4). */
export function ReceiveScreen({ data }: { data: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    void (async () => {
      const parsed = await decodeHandoff(data);
      if (canceled) return;
      if (!parsed.ok) return setState({ kind: 'error', message: parsed.message });
      const local = await db.shoots.get(parsed.handoff.shoot.id);
      if (!canceled) setState({ kind: 'ready', handoff: parsed.handoff, local, decision: decideReceive(local, parsed.handoff) });
    })();
    return () => {
      canceled = true;
    };
  }, [data]);

  if (state.kind === 'loading') return <main className="screen" />;
  if (state.kind === 'error') {
    return (
      <main className="screen">
        <TopBar title="Open shoot" back={paths.shoots()} />
        <p className="error" role="alert">
          {state.message}
        </p>
      </main>
    );
  }

  const { handoff, local, decision } = state;
  const { shoot, family } = handoff;
  const inApp = isStandalone();
  const open = (target: Shoot) => navigate(target.status === 'live' ? paths.live(target.id) : paths.shoot(target.id), { replace: true });

  const keep = async () => {
    await receiveShoot(handoff);
    open(shoot);
  };
  const openMine = () => local && open(local);

  const copyForApp = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied('Copied. Now open Photo Planner from your Home Screen and tap Paste shoot.');
    } catch {
      setCopied('Couldn’t copy. Press and hold the link in your message, tap Copy, then open Photo Planner and tap Paste shoot.');
    }
  };

  return (
    <main className="screen">
      <TopBar title="Shared shoot" back={paths.shoots()} />
      <Section title={family.name}>
        <p className="hint">
          {shoot.title ? `${shoot.title} · ` : ''}
          {formatDate(shoot.date)} · {shootProgress(shoot)}
        </p>
      </Section>

      {(decision.kind === 'add' || decision.kind === 'replace') && (
        <div className="actions">
          <p>{whatOpening(shoot, decision.kind === 'replace')}</p>
          <button type="button" className="btn wide big" onClick={() => void keep()}>
            {inApp ? 'Open shoot' : 'Open here'}
          </button>
        </div>
      )}

      {decision.kind === 'older' && (
        <div className="actions">
          <p>This phone already has this shoot, or a newer copy of it. Nothing to change.</p>
          <button type="button" className="btn wide" onClick={openMine}>
            Open your copy
          </button>
        </div>
      )}

      {decision.kind === 'would-lose' && local && (
        <div className="actions">
          <p className="error" role="alert">
            This phone has {decision.localDone} shots done; this copy has {decision.incomingDone}. Opening it would lose your check marks.
          </p>
          <button type="button" className="btn wide" onClick={openMine}>
            Keep mine
          </button>
          <button type="button" className="btn danger wide" onClick={() => void keep()}>
            Replace anyway
          </button>
        </div>
      )}

      {decision.kind === 'tie' && local && (
        <div className="actions">
          <p>
            Both phones changed this shoot since it was last sent. Yours: {shootProgress(local)}. This copy: {shootProgress(shoot)}. Which one do you want to keep?
          </p>
          <button type="button" className="btn wide" onClick={() => void keep()}>
            Use this copy
          </button>
          <button type="button" className="btn secondary wide" onClick={openMine}>
            Keep mine
          </button>
        </div>
      )}

      {!inApp && decision.kind !== 'older' && (
        <Section title="Using the Photo Planner app?">
          <p className="hint">
            The app on your Home Screen keeps its own data, separate from Safari. To open the shoot there, copy it, then open Photo Planner and tap Paste shoot.
          </p>
          <button type="button" className="btn secondary wide" onClick={() => void copyForApp()}>
            Copy for the app
          </button>
          {copied && (
            <p className="notice" role="status">
              {copied}
            </p>
          )}
        </Section>
      )}
    </main>
  );
}

/** What opening the shoot does, by how far it has got (SH3). */
function whatOpening(shoot: Shoot, replacing: boolean): string {
  const yours = replacing ? ' It replaces your copy.' : '';
  if (shoot.status === 'planned') return `You can run this shoot on this phone. Share it again whenever the other phone should have it.${yours}`;
  if (shoot.status === 'live') return `This shoot is in progress. You carry on from the shot it’s on, with every check mark so far.${yours}`;
  return `This is the finished shoot, with every check mark and retake.${yours}`;
}
