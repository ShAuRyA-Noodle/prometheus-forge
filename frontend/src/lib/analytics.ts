/**
 * PostHog analytics wrapper.
 *
 * - Init from VITE_POSTHOG_KEY (skipped if not set — never crash dev).
 * - track(event, props) — generic event.
 * - identify(uid, props) — wire on auth.
 * - Respects user.consent.analytics — flushed via setConsent().
 */
import posthog from "posthog-js";

let initialized = false;
let consentGranted = true;

export function initAnalytics(): void {
  if (initialized) return;
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) {
    // dev fallback — silent.
    return;
  }
  const host = import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";
  posthog.init(key, {
    api_host: host,
    capture_pageview: false, // we handle SPA pageviews manually
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    autocapture: false,
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-mask]",
    },
    loaded: () => {
      initialized = true;
    },
  });
  initialized = true;
}

export function setAnalyticsConsent(granted: boolean): void {
  consentGranted = granted;
  if (!initialized) return;
  if (granted) {
    posthog.opt_in_capturing();
  } else {
    posthog.opt_out_capturing();
  }
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!initialized || !consentGranted) return;
  posthog.capture(event, props);
}

export function identify(
  uid: string,
  props?: Record<string, unknown>,
): void {
  if (!initialized) return;
  posthog.identify(uid, props);
}

export function resetAnalytics(): void {
  if (!initialized) return;
  posthog.reset();
}

export function pageview(path: string): void {
  if (!initialized || !consentGranted) return;
  posthog.capture("$pageview", { $current_url: path });
}

// Convenient typed event names — keeps call-sites consistent.
export const Events = {
  IDEA_SUBMITTED: "idea_submitted",
  GENERATION_STARTED: "generation_started",
  GENERATION_COMPLETED: "generation_completed",
  GENERATION_CANCELED: "generation_canceled",
  GENERATION_ERROR: "generation_error",
  EXPORT_TRIGGERED: "export_triggered",
  DEPLOY_TRIGGERED: "deploy_triggered",
  SHARE_LINK_CREATED: "share_link_created",
  PAYWALL_SHOWN: "paywall_shown",
  PAYWALL_CONVERTED: "paywall_converted",
  AGENT_CARD_OPENED: "agent_card_opened",
  CMD_PALETTE_OPENED: "cmd_palette_opened",
  VOICE_RECORDED: "voice_recorded",
  TEMPLATE_PICKED: "template_picked",
  BRANCH_CREATED: "branch_created",
  REGEN_TRIGGERED: "regen_triggered",
} as const;
export type EventName = (typeof Events)[keyof typeof Events];
