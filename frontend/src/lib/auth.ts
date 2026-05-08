/**
 * Auth zustand store + helpers.
 *
 * Bridges Firebase Auth + our backend `/api/me` profile.
 *
 * Source of truth for: { firebaseUser, profile, tier, loading, error }.
 */
import { create } from "zustand";
import type { User as FirebaseUser } from "firebase/auth";

import { api, APIError } from "./api";
import {
  authReady,
  onAuthStateChangedClient,
  signInAnonymouslyClient,
  signInWithGoogleClient,
  signOutClient,
} from "./firebase";
import { identify, resetAnalytics, setAnalyticsConsent } from "./analytics";
import type { User, SubscriptionTier } from "@/types/user";

export interface AuthState {
  firebaseUser: FirebaseUser | null;
  profile: User | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  signInAnon: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  _setFirebaseUser: (u: FirebaseUser | null) => void;
  _setProfile: (p: User | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  profile: null,
  loading: true,
  error: null,
  initialized: false,

  signInAnon: async () => {
    set({ loading: true, error: null });
    try {
      await signInAnonymouslyClient();
      // profile load happens via auth state listener
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Anonymous sign-in failed",
        loading: false,
      });
    }
  },

  signInWithGoogle: async () => {
    set({ loading: true, error: null });
    try {
      await signInWithGoogleClient();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Google sign-in failed",
        loading: false,
      });
    }
  },

  signOut: async () => {
    set({ loading: true });
    try {
      await signOutClient();
      resetAnalytics();
      set({ profile: null, firebaseUser: null, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Sign-out failed",
        loading: false,
      });
    }
  },

  refreshProfile: async () => {
    const fbUser = get().firebaseUser;
    if (!fbUser) {
      set({ profile: null });
      return;
    }
    try {
      const profile = await api.me();
      set({ profile, error: null });
      identify(profile.uid, {
        tier: profile.tier,
        is_anonymous: profile.is_anonymous,
        locale: profile.locale,
      });
      setAnalyticsConsent(profile.consent.analytics);
    } catch (err) {
      // 404 == backend hasn't seen this user yet (first call). Silent.
      if (err instanceof APIError && err.status === 404) {
        set({ profile: null });
        return;
      }
      set({
        error: err instanceof Error ? err.message : "Failed to load profile",
      });
    }
  },

  _setFirebaseUser: (u) => set({ firebaseUser: u }),
  _setProfile: (p) => set({ profile: p }),
}));

// ─── Bootstrap ───────────────────────────────────────────────────────────────

let bootstrapped = false;

export function bootstrapAuth(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  const store = useAuthStore;
  // Persist Firebase user → profile fetch.
  onAuthStateChangedClient(async (fbUser) => {
    store.getState()._setFirebaseUser(fbUser);
    if (fbUser) {
      await store.getState().refreshProfile();
    } else {
      store.getState()._setProfile(null);
    }
    store.setState({ loading: false, initialized: true });
  });

  void authReady.then(() => {
    if (!store.getState().firebaseUser) {
      store.setState({ loading: false, initialized: true });
    }
  });
}

// ─── Convenience selectors ───────────────────────────────────────────────────

export const selectTier = (s: AuthState): SubscriptionTier =>
  s.profile?.tier ?? (s.firebaseUser?.isAnonymous ? "anonymous" : "anonymous");
