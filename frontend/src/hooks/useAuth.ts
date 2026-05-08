/**
 * useAuth — typed hook over the auth zustand store.
 * Returns user, profile, tier, loading, error, and the sign-in helpers.
 */
import { useEffect } from "react";

import { bootstrapAuth, useAuthStore } from "@/lib/auth";
import type { SubscriptionTier } from "@/types/user";

export interface UseAuth {
  uid: string | null;
  isAnonymous: boolean;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  tier: SubscriptionTier;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  signInAnon: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): UseAuth {
  // bootstrap once on first hook usage
  useEffect(() => {
    bootstrapAuth();
  }, []);

  const fbUser = useAuthStore((s) => s.firebaseUser);
  const profile = useAuthStore((s) => s.profile);
  const loading = useAuthStore((s) => s.loading);
  const initialized = useAuthStore((s) => s.initialized);
  const error = useAuthStore((s) => s.error);
  const signInAnon = useAuthStore((s) => s.signInAnon);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signOut = useAuthStore((s) => s.signOut);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  return {
    uid: fbUser?.uid ?? null,
    isAnonymous: fbUser?.isAnonymous ?? false,
    email: profile?.email ?? fbUser?.email ?? null,
    displayName: profile?.display_name ?? fbUser?.displayName ?? null,
    photoURL: profile?.photo_url ?? fbUser?.photoURL ?? null,
    tier: profile?.tier ?? "anonymous",
    loading,
    initialized,
    error,
    signInAnon,
    signInWithGoogle,
    signOut,
    refreshProfile,
  };
}
