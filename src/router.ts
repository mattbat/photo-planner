import { useEffect, useState } from 'react';

/**
 * Tiny hash router. GitHub Pages can't fall back to index.html for deep
 * links, so routes live after the # (REQUIREMENTS.md T2).
 *
 * Later milestones add the family, shoot and shoot-day routes here.
 */

export type Route =
  | { name: 'shoots' }
  | { name: 'families' }
  | { name: 'family'; id: string }
  | { name: 'poses' }
  | { name: 'settings' }
  | { name: 'diagnostics' };

/** The three top-level tabs, in tab-bar order. */
export const TABS = ['shoots', 'families', 'poses'] as const;
export type TabName = (typeof TABS)[number];

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'families':
      return parts[1] ? { name: 'family', id: decodeURIComponent(parts[1]) } : { name: 'families' };
    case 'poses':
      return { name: 'poses' };
    case 'settings':
      return { name: 'settings' };
    case 'diagnostics':
      return { name: 'diagnostics' };
    default:
      return { name: 'shoots' };
  }
}

export const paths = {
  shoots: () => '#/',
  families: () => '#/families',
  family: (id: string) => `#/families/${encodeURIComponent(id)}`,
  poses: () => '#/poses',
  settings: () => '#/settings',
  diagnostics: () => '#/diagnostics',
};

export function navigate(hash: string): void {
  window.location.hash = hash;
}

/**
 * How many pages deep this visit is, stamped on each history entry so it is
 * still right after going back; a top bar's back button uses it to return to
 * the page it was opened from, the way Safari's own back does.
 *
 * Each page also gets its own key. iPhone Safari can carry the previous
 * page's history state over to a new page when only the # part changes, so a
 * page showing the key of the page we were just on is a new page, not an old
 * one we came back to.
 */
let depth = 0;
let currentKey: string | null = null;
let currentHash: string | null = null;

interface Stamp {
  ppKey?: string;
  ppDepth?: number;
}

/** Reads this page's place in the visit, or stamps it on a page not seen before. */
function stampHistory(opened: boolean): void {
  const hash = window.location.hash;
  // The same page again (e.g. a repeated event): nothing has moved.
  if (!opened && hash === currentHash) return;
  const state = (window.history.state ?? {}) as Stamp;
  const known = typeof state.ppKey === 'string' && typeof state.ppDepth === 'number';
  if (known && (opened || state.ppKey !== currentKey)) {
    // Opened (or reloaded) on a page, or back or forward to one we've been on.
    depth = state.ppDepth!;
    currentKey = state.ppKey!;
  } else {
    // A new page: the first if the app just opened, otherwise one deeper.
    depth = opened ? 0 : depth + 1;
    currentKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.history.replaceState({ ...state, ppKey: currentKey, ppDepth: depth }, '');
  }
  currentHash = hash;
}

/** True when there's an earlier Photo Planner page in this visit to go back to. */
export function canGoBack(): boolean {
  return depth > 0;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    stampHistory(true);
    const onChange = () => {
      stampHistory(false);
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
