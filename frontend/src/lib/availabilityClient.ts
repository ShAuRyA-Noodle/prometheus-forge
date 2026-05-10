/**
 * availabilityClient — debounced wrappers around api.checkDomain /
 * api.checkUSPTO / api.checkHandle. The user types into a name candidate input
 * and we fan out lookups, but we collapse rapid typing into a single trailing
 * call per domain via per-key timers.
 */
import { api } from "./api";
import type {
  AvailabilityBundle,
  DomainCheckResponse,
  HandleCheckResponse,
  USPTOCheckResponse,
} from "./api";

type Key = string;

interface DebouncedSlot<T> {
  timer: ReturnType<typeof setTimeout> | null;
  abortCtrl: AbortController | null;
  resolve: ((v: T) => void) | null;
  reject: ((e: unknown) => void) | null;
}

const slots = new Map<Key, DebouncedSlot<unknown>>();

function getSlot<T>(key: Key): DebouncedSlot<T> {
  let slot = slots.get(key) as DebouncedSlot<T> | undefined;
  if (!slot) {
    slot = { timer: null, abortCtrl: null, resolve: null, reject: null };
    slots.set(key, slot as DebouncedSlot<unknown>);
  }
  return slot;
}

function debounce<T>(
  key: Key,
  delayMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const slot = getSlot<T>(key);
  if (slot.timer) {
    clearTimeout(slot.timer);
    slot.timer = null;
  }
  if (slot.abortCtrl) {
    slot.abortCtrl.abort();
    slot.abortCtrl = null;
  }
  if (slot.reject) {
    slot.reject(new DOMException("superseded", "AbortError"));
    slot.reject = null;
    slot.resolve = null;
  }
  return new Promise<T>((resolve, reject) => {
    slot.resolve = resolve;
    slot.reject = reject;
    slot.timer = setTimeout(() => {
      const ctrl = new AbortController();
      slot.abortCtrl = ctrl;
      slot.timer = null;
      task(ctrl.signal).then(
        (v) => slot.resolve?.(v),
        (e) => slot.reject?.(e),
      );
    }, delayMs);
  });
}

export function checkDomainDebounced(
  domain: string,
  delayMs: number = 220,
): Promise<DomainCheckResponse> {
  return debounce(`domain:${domain}`, delayMs, (signal) => api.checkDomain(domain, signal));
}

export function checkUSPTODebounced(
  name: string,
  delayMs: number = 280,
): Promise<USPTOCheckResponse> {
  return debounce(`uspto:${name}`, delayMs, (signal) => api.checkUSPTO(name, signal));
}

export function checkHandleDebounced(
  platform: "x" | "instagram" | "github" | "tiktok",
  handle: string,
  delayMs: number = 220,
): Promise<HandleCheckResponse> {
  return debounce(`handle:${platform}:${handle}`, delayMs, (signal) =>
    api.checkHandle(platform, handle, signal),
  );
}

export function checkAvailabilityDebounced(
  name: string,
  delayMs: number = 320,
): Promise<AvailabilityBundle> {
  return debounce(`bundle:${name}`, delayMs, (signal) => api.checkAvailability(name, signal));
}

/** Slugify a brand name → domain-safe label (lowercase, alnum-hyphen, ≤63 chars). */
export function toSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

/** Common TLD options. The free tier always offers a *.prometheus.app subdomain. */
export const TLD_OPTIONS = [".com", ".ai", ".app", ".io", ".co"] as const;
export type TLD = (typeof TLD_OPTIONS)[number];
