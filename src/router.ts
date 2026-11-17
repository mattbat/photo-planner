import { useEffect, useState } from 'react';

/**
 * Tiny hash router. GitHub Pages can't fall back to index.html for deep
 * links, so routes live after the # (REQUIREMENTS.md T2).
 */

export type Route =
  | { name: 'shoots' }
  | { name: 'shoot'; id: string }
  | { name: 'live'; id: string }
  | { name: 'families' }
  | { name: 'family'; id: string }
  | { name: 'poses' }
  | { name: 'pose'; id: string }
  | { name: 'receive'; data: string }
  | { name: 'settings' }
  | { name: 'diagnostics' }
  | { name: 'help'; topic: string | null }
  | { name: 'welcome' };

/** The three top-level tabs, in tab-bar order. */
export const TABS = ['shoots', 'families', 'poses'] as const;
export type TabName = (typeof TABS)[number];

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'shoots':
      if (parts[1] && parts[2] === 'live') return { name: 'live', id: decodeURIComponent(parts[1]) };
      return parts[1] ? { name: 'shoot', id: decodeURIComponent(parts[1]) } : { name: 'shoots' };
    case 'families':
      return parts[1] ? { name: 'family', id: decodeURIComponent(parts[1]) } : { name: 'families' };
    case 'poses':
      return parts[1] ? { name: 'pose', id: decodeURIComponent(parts[1]) } : { name: 'poses' };
    case 'receive':
      return parts[1] ? { name: 'receive', data: parts[1] } : { name: 'shoots' };
    case 'settings':
      return { name: 'settings' };
    case 'diagnostics':
      return { name: 'diagnostics' };
    case 'help':
      return { name: 'help', topic: parts[1] ?? null };
    case 'welcome':
      return { name: 'welcome' };
    default:
      return { name: 'shoots' };
  }
}

export const paths = {
  shoots: () => '#/',
  shoot: (id: string) => `#/shoots/${encodeURIComponent(id)}`,
  /** Shoot day: the checklist (§8). */
  live: (id: string) => `#/shoots/${encodeURIComponent(id)}/live`,
  families: () => '#/families',
  family: (id: string) => `#/families/${encodeURIComponent(id)}`,
  poses: () => '#/poses',
  pose: (id: string) => `#/poses/${encodeURIComponent(id)}`,
  /** A shared shoot, packed after the # (§9). */
  receive: (data: string) => `#/receive/${data}`,
  settings: () => '#/settings',
  diagnostics: () => '#/diagnostics',
  help: (topic?: string) => (topic ? `#/help/${topic}` : '#/help'),
  welcome: () => '#/welcome',
};

/** Opens a page. With `replace`, it takes the current page's place in the history instead of adding one. */
export function navigate(hash: string, { replace = false }: { replace?: boolean } = {}): void {
  if (!replace) {
    window.location.hash = hash;
    return;
  }
  if (normalize(hash) === normalize(window.location.hash)) return;
  replacing = true;
  window.location.replace(hash);
}

/** The page a screen's back button leads up to, or null for the three tabs. */
export function parentOf(hash: string): string | null {
  const route = parseRoute(hash);
  switch (route.name) {
    case 'shoots':
    case 'families':
    case 'poses':
      return null;
    case 'shoot':
      return paths.shoots();
    case 'live':
      return paths.shoot(route.id);
    case 'family':
      return paths.families();
    case 'pose':
      return paths.poses();
    case 'diagnostics':
      return paths.settings();
    case 'help':
      return route.topic ? paths.help() : paths.settings();
    case 'receive':
    case 'settings':
    case 'welcome':
      return paths.shoots();
  }
}

/** True when `hash` is a page somewhere under `above` (e.g. shoot day under its shoot). */
export function isBelow(hash: string, above: string): boolean {
  const target = normalize(above);
  let at = parentOf(hash);
  for (let i = 0; at !== null && i < 10; i++) {
    if (normalize(at) === target) return true;
    at = parentOf(at);
  }
  return false;
}

/** One spelling per page, so `#/`, `#` and `` all read as Shoots. */
function normalize(hash: string): string {
  return '#/' + hash.replace(/^#\/?/, '').replace(/\/+$/, '');
}

/**
 * What a top bar's back button does. It never adds a page, so back can't go
 * round in a loop (e.g. summary → shoot → summary → …):
 * - goes back in the history when the page before is `target`, or, with
 *   `followHistory`, any page that isn't under this one;
 * - otherwise this page is swapped for `target`.
 */
export function goBack(target: string, followHistory = false): void {
  const prev = previousHash;
  const here = window.location.hash;
  if (canGoBack() && prev !== null && (normalize(prev) === normalize(target) || (followHistory && !isBelow(prev, here) && normalize(prev) !== normalize(here)))) {
    window.history.back();
    return;
  }
  navigate(target, { replace: true });
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
/** The page before this one in the visit, if known. */
let previousHash: string | null = null;
/** Set while navigate(…, { replace: true }) swaps the current page. */
let replacing = false;

interface Stamp {
  ppKey?: string;
  ppDepth?: number;
  ppPrev?: string | null;
}

/** Reads this page's place in the visit, or stamps it on a page not seen before. */
function stampHistory(opened: boolean): void {
  const hash = window.location.hash;
  // The same page again (e.g. a repeated event): nothing has moved.
  if (!opened && hash === currentHash) return;
  const swapped = replacing;
  replacing = false;
  const state = (window.history.state ?? {}) as Stamp;
  const known = typeof state.ppKey === 'string' && typeof state.ppDepth === 'number';
  if (known && !swapped && (opened || state.ppKey !== currentKey)) {
    // Opened (or reloaded) on a page, or back or forward to one we've been on.
    depth = state.ppDepth!;
    currentKey = state.ppKey!;
    previousHash = typeof state.ppPrev === 'string' ? state.ppPrev : null;
  } else {
    // A new page: the first if the app just opened, one deeper, or (swapped) in the same place.
    if (!swapped) {
      previousHash = opened ? null : currentHash;
      depth = opened ? 0 : depth + 1;
    }
    currentKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.history.replaceState({ ...state, ppKey: currentKey, ppDepth: depth, ppPrev: previousHash }, '');
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
