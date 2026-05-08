/**
 * Billing helpers + tier gating.
 *
 * Exposes:
 *  - useTier()    — current tier + helper
 *  - requireTier(tier, action)  — paywall guard
 *  - openPaywall(reason)        — emits event consumed by <PaywallModal/>
 */
import { create } from "zustand";

import { useAuthStore } from "./auth";
import { TIER_RANK, type SubscriptionTier } from "@/types/user";
import { track, Events } from "./analytics";

export interface PaywallState {
  open: boolean;
  reason: string | null;
  requiredTier: SubscriptionTier | null;
  pendingAction: (() => void) | null;
  show: (
    requiredTier: SubscriptionTier,
    reason: string,
    pendingAction?: () => void,
  ) => void;
  close: () => void;
  resolve: () => void;
}

export const usePaywallStore = create<PaywallState>((set, get) => ({
  open: false,
  reason: null,
  requiredTier: null,
  pendingAction: null,
  show: (requiredTier, reason, pendingAction = undefined) => {
    track(Events.PAYWALL_SHOWN, { reason, required_tier: requiredTier });
    set({
      open: true,
      reason,
      requiredTier,
      pendingAction: pendingAction ?? null,
    });
  },
  close: () => set({ open: false, reason: null, requiredTier: null, pendingAction: null }),
  resolve: () => {
    const action = get().pendingAction;
    set({ open: false, reason: null, requiredTier: null, pendingAction: null });
    action?.();
  },
}));

/** Hook returning current tier + a typed gate helper. */
export function useTier(): {
  tier: SubscriptionTier;
  hasTier: (required: SubscriptionTier) => boolean;
  requireTier: (
    required: SubscriptionTier,
    reason: string,
    action?: () => void,
  ) => boolean;
} {
  const profile = useAuthStore((s) => s.profile);
  const tier: SubscriptionTier = profile?.tier ?? "anonymous";

  const hasTier = (required: SubscriptionTier): boolean =>
    TIER_RANK[tier] >= TIER_RANK[required];

  const requireTier = (
    required: SubscriptionTier,
    reason: string,
    action?: () => void,
  ): boolean => {
    if (hasTier(required)) {
      action?.();
      return true;
    }
    usePaywallStore.getState().show(required, reason, action);
    return false;
  };

  return { tier, hasTier, requireTier };
}
