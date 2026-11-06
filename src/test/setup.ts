import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Clean up DOM after each test
afterEach(() => {
  cleanup();
});

// Mock ResizeObserver for jsdom test environment
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Newer Node versions ship their own experimental `localStorage` global, which is undefined unless a storage file is configured, and it hides
// the one jsdom provides. Point both storage globals at jsdom's so the tests see a working Storage whatever the Node version.
const jsdom = (globalThis as { jsdom?: { window: Window } }).jsdom;
if (jsdom) {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, { configurable: true, get: () => jsdom.window[name] });
  }
}
