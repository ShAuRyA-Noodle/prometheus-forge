/**
 * useSSE — mocks the underlying subscribeSse helper from `lib/sse` so we can
 * deterministically deliver events.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

let activeHandler: ((ev: { type: string }) => void) | null = null;
let activeStatusHandler: ((s: string) => void) | null = null;

const subscribeSseMock = vi.fn(
  (sessionId: string, handler: (ev: { type: string }) => void, opts: { onStatus?: (s: string) => void } = {}) => {
    void sessionId;
    activeHandler = handler;
    activeStatusHandler = opts.onStatus ?? null;
    activeStatusHandler?.("open");
    return () => {
      activeHandler = null;
      activeStatusHandler?.("closed");
    };
  },
);

vi.mock("@/lib/sse", () => ({
  subscribeSse: subscribeSseMock,
}));

vi.mock("@/types/sse", () => ({
  SseEventSchema: {
    safeParse: (v: unknown) => ({ success: true, data: v }),
  },
}));

import { useSSE } from "../useSSE";

describe("useSSE", () => {
  it("does not subscribe when sessionId is null", () => {
    const { result } = renderHook(() => useSSE(null));
    expect(subscribeSseMock).not.toHaveBeenCalled();
    expect(result.current.events).toEqual([]);
    expect(result.current.status).toBe("closed");
  });

  it("subscribes and accumulates events up to bufferLimit", async () => {
    const { result } = renderHook(() =>
      useSSE("sess-1", { bufferLimit: 3 }),
    );

    expect(subscribeSseMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status).toBe("open"));

    act(() => {
      activeHandler?.({ type: "agent_started" });
      activeHandler?.({ type: "agent_chunk" });
      activeHandler?.({ type: "agent_completed" });
      activeHandler?.({ type: "session_completed" });
    });

    // Buffer capped at 3.
    expect(result.current.events.length).toBe(3);
    expect(result.current.events[0]).toEqual({ type: "agent_chunk" });
    expect(result.current.events[2]).toEqual({ type: "session_completed" });
  });

  it("invokes onEvent callback per event", () => {
    const onEvent = vi.fn();
    renderHook(() => useSSE("sess-2", { onEvent }));
    act(() => activeHandler?.({ type: "x" }));
    expect(onEvent).toHaveBeenCalledWith({ type: "x" });
  });

  it("clear() empties the buffer", () => {
    const { result } = renderHook(() => useSSE("sess-3"));
    act(() => activeHandler?.({ type: "a" }));
    expect(result.current.events.length).toBe(1);
    act(() => result.current.clear());
    expect(result.current.events.length).toBe(0);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useSSE("sess-4"));
    unmount();
    expect(activeHandler).toBeNull();
  });
});
