import { useState } from 'react';
import { buildHandoff, encodeHandoff, handoffFileName, handoffLink, lockedAway, sharedAway, changedSinceSent } from '../data/handoff';
import { markSent, takeBack } from '../data/repo';
import { shareFile, shareLink } from '../data/share';
import type { Shoot } from '../data/types';
import { formatDate } from '../domain/dates';
import { Sheet } from './ui';

/**
 * Share a shoot with the other phone at any point (SH1, SH2): as a link for
 * Messages and other chat apps, or as a file for AirDrop and Files. This
 * phone is the photographer's until the shoot is received from one; then it
 * is the assistant's.
 */
export function ShareShootSheet({ shoot, familyName, onSent, onClose }: { shoot: Shoot; familyName: string; onSent: (message: string) => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const role = shoot.handoff?.role ?? 'photographer';

  /** Built from the latest saved copy, so a just-made change goes too. */
  const build = () => buildHandoff(shoot.id);

  const sendLink = async () => {
    const handoff = await build();
    if (!handoff) return setError('This shoot isn’t on this phone any more.');
    const url = handoffLink(await encodeHandoff(handoff));
    const title = `Photo Planner: ${familyName}`;
    const outcome = await shareLink(url, title, `${title} shoot on ${formatDate(shoot.date)}. Tap to open it in Photo Planner.`);
    if (outcome === 'cancelled') return;
    if (outcome === 'failed') return setError('Couldn’t share or copy the link. Try sending a file instead.');
    await markSent(shoot.id, handoff.n);
    onSent(outcome === 'copied' ? 'Link copied. Paste it in a message to the other phone.' : 'Shoot shared.');
  };

  const sendFile = async () => {
    const handoff = await build();
    if (!handoff) return setError('This shoot isn’t on this phone any more.');
    const outcome = await shareFile(handoffFileName(handoff), JSON.stringify(handoff));
    if (outcome === 'cancelled') return;
    await markSent(shoot.id, handoff.n);
    onSent(outcome === 'shared' ? 'Shoot shared.' : 'Shoot file downloaded. Send it to the other phone.');
  };

  return (
    <Sheet title="Share shoot" onClose={onClose}>
      <p className="hint">
        You’re the {role}. The other phone is the {role === 'photographer' ? 'assistant' : 'photographer'}.
      </p>
      <div className="actions">
        <button type="button" className="btn wide" onClick={() => void sendLink()}>
          Text a link
        </button>
        <p className="hint">For Messages, WhatsApp or email, when you’re not together.</p>
        <button type="button" className="btn secondary wide" onClick={() => void sendFile()}>
          AirDrop a file
        </button>
        <p className="hint">When you’re standing together. Works with no signal. Also saves to Files.</p>
      </div>
      <p className="hint">{whatHappens(shoot)}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

function whatHappens(shoot: Shoot): string {
  if (shoot.status === 'planned') {
    return 'You can keep changing the plan and share it again until the shoot starts. Once the other phone starts it, it runs there.';
  }
  if (shoot.status === 'live') {
    return 'The other phone carries on from the shot you’re on. This phone stops running the checklist until you take back control.';
  }
  return 'Shares the finished shoot with every check mark and retake. This phone keeps running nothing, so nothing locks.';
}

/** "Shared with the other phone", with Take back control for a live shoot (SH5). Nothing for a shoot that isn't away. */
export function SharedBanner({ shoot, onShareAgain }: { shoot: Shoot; onShareAgain?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!sharedAway(shoot)) return null;
  const locked = lockedAway(shoot);
  return (
    <aside className="handoff-banner" aria-label="Shared with the other phone">
      <b>Shared with the other phone</b>
      <p>
        {locked
          ? 'It’s running the checklist now. This phone is locked until it’s shared back, or you take back control.'
          : 'You can keep editing the plan here and share it again.'}
        {changedSinceSent(shoot) ? ' You’ve changed it since you shared it.' : ''}
      </p>
      {onShareAgain && (
        <button type="button" className="btn secondary wide" onClick={onShareAgain}>
          Share again
        </button>
      )}
      {locked && !confirming && (
        <button type="button" className="btn secondary wide" onClick={() => setConfirming(true)}>
          Take back control
        </button>
      )}
      {locked && confirming && (
        <div className="problems">
          <p>If the other phone has been marking shots, those marks won’t reach this phone unless you open its copy afterwards. Take back control anyway?</p>
          <button type="button" className="btn danger wide" onClick={() => void takeBack(shoot.id).then(() => setConfirming(false))}>
            Yes, take back control
          </button>
          <button type="button" className="btn secondary wide" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
    </aside>
  );
}
