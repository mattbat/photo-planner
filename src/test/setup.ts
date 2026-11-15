import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest globals are off, so Testing Library can't register this itself.
afterEach(() => cleanup());
// jsdom doesn't implement scrollTo; the router scrolls to the top on every navigation.
if (typeof window !== 'undefined') window.scrollTo = () => {};
