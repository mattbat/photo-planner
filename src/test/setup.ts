import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest globals are off, so Testing Library can't register this itself.
afterEach(() => cleanup());
// jsdom doesn't implement scrollTo; the router scrolls to the top on every navigation.
if (typeof window !== 'undefined') window.scrollTo = () => {};

// The first-run intro (H-3) would cover the screens under test, so tests that clear storage keep it marked as seen.
if (typeof window !== 'undefined') {
  const clear = Storage.prototype.clear;
  Storage.prototype.clear = function (this: Storage) {
    clear.call(this);
    if (this === window.localStorage) this.setItem('photo-planner.introSeen', '1');
  };
  localStorage.setItem('photo-planner.introSeen', '1');
}
