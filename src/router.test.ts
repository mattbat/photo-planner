import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { canGoBack, navigate, parseRoute, paths, TABS, useRoute } from './router';

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
    const { family, shoot, ...plain } = paths;
    for (const [name, path] of Object.entries(plain)) {
      expect(parseRoute(path())).toEqual({ name });
    }
    expect(parseRoute(family('a b/1'))).toEqual({ name: 'family', id: 'a b/1' });
    expect(parseRoute('#/families/f1')).toEqual({ name: 'family', id: 'f1' });
    expect(parseRoute(shoot('s 1/x'))).toEqual({ name: 'shoot', id: 's 1/x' });
    expect(parseRoute('#/shoots/s1')).toEqual({ name: 'shoot', id: 's1' });
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
});
