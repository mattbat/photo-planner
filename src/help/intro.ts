import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../data/db';

/**
 * Whether the first-run intro (H-3) has been seen. Kept in localStorage: it
 * only matters on this device.
 */
export const INTRO_KEY = 'photo-planner.introSeen';

export function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    // Storage unavailable (private browsing): don't keep showing it.
    return true;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // Private browsing: it just shows again next time.
  }
}

/** True on a phone with no families that hasn't seen the intro yet, plus a way to close it. */
export function useFirstRun(): [boolean, () => void] {
  const [closed, setClosed] = useState(introSeen);
  const families = useLiveQuery(() => db.families.count());
  return [!closed && families === 0, () => setClosed(true)];
}
