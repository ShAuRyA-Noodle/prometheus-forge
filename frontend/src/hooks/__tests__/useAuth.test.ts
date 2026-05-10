/**
 * useAuth — verify shape + bootstrap call.
 *
 * The auth lib is mocked: we only assert the hook delegates to the store and
 * exposes the contract.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const bootstrapAuth = vi.fn();

vi.mock("@/lib/auth", () => {
  const useAuthStore = (selector: (s: AuthState) => unknown) => selector(state);
  type AuthState = {
    firebaseUser: { uid: string; isAnonymous: boolean; email: string | null; displayName: string | null; photoURL: string | null } | null;
    profile: { email: string; display_name: string; photo_url: string | null; tier: "free" } | null;
    loading: boolean;
    initialized: boolean;
    error: string | null;
    signInAnon: () => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
  };
  const state: AuthState = {
    firebaseUser: { uid: "u1", isAnonymous: false, email: "a@b.com", displayName: "A", photoURL: null },
    profile: { email: "a@b.com", display_name: "A", photo_url: null, tier: "free" },
    loading: false,
    initialized: true,
    error: null,
    signInAnon: vi.fn().mockResolvedValue(undefined),
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
  };
  return { useAuthStore, bootstrapAuth };
});

import { useAuth } from "../useAuth";

describe("useAuth", () => {
  beforeEach(() => {
    bootstrapAuth.mockClear();
  });

  it("returns derived user fields and bootstraps once", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.uid).toBe("u1");
    expect(result.current.tier).toBe("free");
    expect(result.current.email).toBe("a@b.com");
    expect(result.current.displayName).toBe("A");
    expect(result.current.loading).toBe(false);
    expect(bootstrapAuth).toHaveBeenCalledTimes(1);
  });

  it("exposes auth actions", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signInAnon();
      await result.current.signOut();
    });
    expect(typeof result.current.signInWithGoogle).toBe("function");
    expect(typeof result.current.refreshProfile).toBe("function");
  });
});
