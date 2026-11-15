import { useState } from 'react';
import { isStandalone } from '../viewport';

/** When opened in Safari rather than from the Home Screen, explains how to install (H-7). */
export function InstallHint() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('photo-planner.installHintDismissed') === '1';
    } catch {
      return false;
    }
  });
  if (dismissed || isStandalone()) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('photo-planner.installHintDismissed', '1');
    } catch {
      // Private browsing: just hide it for this visit.
    }
  };

  return (
    <aside className="callout" aria-label="Install Photo Planner">
      <strong>Add Photo Planner to your Home Screen</strong>
      <p>
        In Safari, tap <b>Share</b> <span aria-hidden>⬆︎</span> then <b>Add to Home Screen</b>. It then opens like an
        app and works without internet.
      </p>
      <button type="button" className="link" onClick={dismiss}>
        Got it
      </button>
    </aside>
  );
}
