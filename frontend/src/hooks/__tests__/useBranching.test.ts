/**
 * useBranching — createBranch happy path + Firestore subscription cleanup.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const branchMock = vi.fn();
const successToast = vi.fn();
const errorToast = vi.fn();

vi.mock("@/lib/api", () => ({
  api: { branch: (r: unknown) => branchMock(r) },
  APIError: class APIError extends Error {},
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  Events: { BRANCH_CREATED: "branch_created" },
}));

vi.mock("../useToast", () => ({
  useToast: () => ({
    success: successToast,
    error: errorToast,
    warning: vi.fn(),
    toast: vi.fn(),
    dismiss: vi.fn(),
    clear: vi.fn(),
    toasts: [],
  }),
}));

const onSnapshotMock = vi.fn(
  (
    _q: unknown,
    onNext: (snap: { forEach: (cb: (d: { id: string; data: () => unknown }) => void) => void }) => void,
  ) => {
    void _q;
    onNext({
      forEach: (cb) => {
        cb({
          id: "child-1",
          data: () => ({
            user_uid: "u1",
            idempotency_key: "k1",
            idea_text_hash: "h",
            idea_text: "i",
            status: "completed",
            created_at: "2026-01-01T00:00:00Z",
            parent_session_id: "parent",
            metadata: { branch_name: "Aggressive" },
            agents: {},
            cost: {
              total_input_tokens: 0,
              total_output_tokens: 0,
              total_cost_usd: 0,
              grounding_calls: 0,
              workspace_api_calls: 0,
              image_generations: 0,
            },
          }),
        });
      },
    });
    return () => undefined;
  },
);

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  onSnapshot: (...args: unknown[]) =>
    (onSnapshotMock as unknown as (...a: unknown[]) => () => void)(
      args[0],
      args[1] as never,
    ),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { useBranching } from "../useBranching";

beforeEach(() => {
  branchMock.mockReset();
  successToast.mockClear();
  errorToast.mockClear();
});

describe("useBranching", () => {
  it("returns no branches when sessionId is null", () => {
    const { result } = renderHook(() => useBranching(null));
    expect(result.current.branches).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("subscribes and surfaces branch list", async () => {
    const { result } = renderHook(() => useBranching("parent"));
    await waitFor(() => expect(result.current.branches.length).toBe(1));
    expect(result.current.branches[0]?.session_id).toBe("child-1");
    expect(result.current.branches[0]?.branch_name).toBe("Aggressive");
  });

  it("createBranch returns new session_id on success", async () => {
    branchMock.mockResolvedValue({ session_id: "new-sess", status: "queued" });
    const { result } = renderHook(() => useBranching("parent"));
    let returned: string | null = null;
    await act(async () => {
      returned = await result.current.createBranch({ parent_session_id: "parent" });
    });
    expect(returned).toBe("new-sess");
    expect(successToast).toHaveBeenCalled();
  });

  it("createBranch returns null on failure with error toast", async () => {
    branchMock.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useBranching("parent"));
    let returned: string | null = "init";
    await act(async () => {
      returned = await result.current.createBranch({ parent_session_id: "parent" });
    });
    expect(returned).toBeNull();
    expect(errorToast).toHaveBeenCalled();
  });
});
