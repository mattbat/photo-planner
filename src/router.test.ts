import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { canGoBack, goBack, isBelow, navigate, parentOf, parseRoute, paths, TABS, useRoute } from './router';

describe('router', () => {
  it('parses every route and falls back to Shoots', () => {
    expect(parseRoute('')).toEqual({ name: 'shoots' });
    expect(parseRoute('#/')).toEqual({ name: 'shoots' });
    expect(parseRoute('#/families')).toEqual({ name: 'families' });
    expect(parseRoute('#/poses')).toEqual({ name: 'poses' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/diagnostics')).toEqual({ name: 'diagnostics' });
    expect(parseRoute('#/nope/at/all')).toEqual({ name: 'shoots' });
  });

  it('builds paths that parse back to the same route', () => {
    const { family, shoot, live, pose, receive, help, ...plain } = paths;
    expect(parseRoute(help())).toEqual({ name: 'help', topic: null });
    expect(parseRoute(help('light'))).toEqual({ name: 'help', topic: 'light' });
    for (const [name, path] of Object.entries(plain)) {
      expect(parseRoute(path())).toEqual({ name });
    }
    expect(parseRoute(family('a b/1'))).toEqual({ name: 'family', id: 'a b/1' });
    expect(parseRoute(pose('p/1'))).toEqual({ name: 'pose', id: 'p/1' });
    expect(parseRoute('#/families/f1')).toEqual({ name: 'family', id: 'f1' });
    expect(parseRoute(shoot('s 1/x'))).toEqual({ name: 'shoot', id: 's 1/x' });
    expect(parseRoute('#/shoots/s1')).toEqual({ name: 'shoot', id: 's1' });
    expect(parseRoute(live('s 1/x'))).toEqual({ name: 'live', id: 's 1/x' });
    expect(parseRoute('#/shoots/s1/live')).toEqual({ name: 'live', id: 's1' });
    expect(parseRoute(receive('zAbC_-1'))).toEqual({ name: 'receive', data: 'zAbC_-1' });
  });

  it('has one tab per top-level screen, in tab-bar order', () => {
    expect(TABS).toEqual(['shoots', 'families', 'poses']);
  });

  it('follows the hash and tracks how deep the visit is', async () => {
    window.location.hash = '#/';
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ name: 'shoots' });
    expect(canGoBack()).toBe(false);
    await act(async () => {
      navigate(paths.families());
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toEqual({ name: 'families' });
    expect(canGoBack()).toBe(true);
    // The same page again changes nothing.
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toEqual({ name: 'families' });
  });

  it('gives every page but the tabs a parent, and knows what is under what', () => {
    expect(parentOf(paths.shoots())).toBeNull();
    expect(parentOf(paths.families())).toBeNull();
    expect(parentOf(paths.poses())).toBeNull();
    expect(parentOf(paths.live('s1'))).toBe(paths.shoot('s1'));
    expect(parentOf(paths.shoot('s1'))).toBe(paths.shoots());
    expect(parentOf(paths.family('f1'))).toBe(paths.families());
    expect(parentOf(paths.pose('p1'))).toBe(paths.poses());
    expect(parentOf(paths.diagnostics())).toBe(paths.settings());
    expect(parentOf(paths.help('light'))).toBe(paths.help());
    expect(parentOf(paths.help())).toBe(paths.settings());
    expect(parentOf(paths.settings())).toBe(paths.shoots());
    expect(parentOf(paths.receive('x'))).toBe(paths.shoots());
    expect(parentOf(paths.welcome())).toBe(paths.shoots());
    expect(isBelow(paths.live('s1'), paths.shoot('s1'))).toBe(true);
    expect(isBelow(paths.live('s1'), '#/')).toBe(true);
    expect(isBelow(paths.live('s1'), paths.shoot('s2'))).toBe(false);
    expect(isBelow(paths.shoot('s1'), paths.live('s1'))).toBe(false);
    expect(isBelow(paths.families(), paths.shoots())).toBe(false);
  });

  it('never loops: back from the shoot summary reaches Shoots', async () => {
    window.location.hash = '#/';
    const { result } = renderHook(() => useRoute());
    const go = async (fn: () => void) => {
      await act(async () => {
        fn();
        await new Promise((r) => setTimeout(r, 20));
      });
    };
    // Shoots → shoot → Start shoot (shoot day) → Finish (summary).
    await go(() => navigate(paths.shoot('s1')));
    await go(() => navigate(paths.live('s1')));
    expect(result.current).toEqual({ name: 'live', id: 's1' });
    // Back from the summary goes back to the shoot, not to a new copy of it…
    const length = window.history.length;
    await go(() => goBack(paths.shoot('s1')));
    expect(result.current).toEqual({ name: 'shoot', id: 's1' });
    // …and the shoot's back goes to Shoots, not round to the summary.
    await go(() => goBack(paths.shoots(), true));
    expect(result.current).toEqual({ name: 'shoots' });
    expect(window.history.length).toBe(length);
  });

  it('never loops when shoot day was opened straight from a shared link', async () => {
    window.location.hash = '#/';
    const { result } = renderHook(() => useRoute());
    const go = async (fn: () => void) => {
      await act(async () => {
        fn();
        await new Promise((r) => setTimeout(r, 20));
      });
    };
    await go(() => navigate(paths.families()));
    await go(() => navigate(paths.live('s2')));
    // The page before isn't the shoot, so the summary is swapped for it.
    await go(() => goBack(paths.shoot('s2')));
    expect(result.current).toEqual({ name: 'shoot', id: 's2' });
    // The shoot's back follows the history to Families: shoot day is gone from it.
    await go(() => goBack(paths.shoots(), true));
    expect(result.current).toEqual({ name: 'families' });
  });

  it('back from a shoot opened from shoot day goes up, not down into shoot day', async () => {
    window.location.hash = '#/';
    const { result } = renderHook(() => useRoute());
    const go = async (fn: () => void) => {
      await act(async () => {
        fn();
        await new Promise((r) => setTimeout(r, 20));
      });
    };
    // An old-style link that pushed the shoot on top of shoot day.
    await go(() => navigate(paths.live('s3')));
    await go(() => navigate(paths.shoot('s3')));
    await go(() => goBack(paths.shoots(), true));
    expect(result.current).toEqual({ name: 'shoots' });
    // Replacing the page you're on does nothing.
    await go(() => navigate(paths.shoots(), { replace: true }));
    expect(result.current).toEqual({ name: 'shoots' });
  });
});
