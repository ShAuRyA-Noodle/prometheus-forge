/**
 * Vitest setup — jest-dom matchers, ResizeObserver/MatchMedia polyfills,
 * fetch mocking helpers.
 *
 * Each test file gets a fresh `vi.stubGlobal('fetch', …)` if it needs network.
 * No real network calls allowed in vitest runs — see jsdom env.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't ship these.
class MockResizeObserver {
  observe(): void {
    /* noop */
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    /* noop */
  }
}
(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;

class MockIntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {
    /* noop */
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    /* noop */
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
(globalThis as unknown as { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver =
  MockIntersectionObserver;

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

if (!("scrollTo" in window)) {
  Object.defineProperty(window, "scrollTo", { value: () => undefined, writable: true });
}

if (!("crypto" in globalThis) || !globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      randomUUID: () =>
        `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`,
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
      },
    },
    configurable: true,
  });
}

// Vibrate stub for haptics tests.
if (!("vibrate" in navigator)) {
  Object.defineProperty(navigator, "vibrate", { value: vi.fn(() => true), writable: true });
}

beforeEach(() => {
  // Reset modules' state across tests.
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
