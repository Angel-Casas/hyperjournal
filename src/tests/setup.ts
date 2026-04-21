import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom lacks ResizeObserver. ECharts (and future resize-aware code) expects
// it on the global. A no-op polyfill is sufficient for component tests —
// we don't actually verify resize behavior in jsdom (no real layout).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
});
