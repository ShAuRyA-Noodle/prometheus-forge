/**
 * useStreamingAgent — pulls reasoning chunks from useSession, concatenates,
 * reflects running status.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const sessionState = {
  session: {
    agents: {
      market_research: {
        name: "market_research",
        wave: "wave_1",
        status: "running",
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: 0.001,
        retry_count: 0,
      },
    },
  },
  reasoning: {
    market_research: [
      { text: "Looking at the ", at: 1 },
      { text: "TAM/SAM/SOM…", at: 2 },
    ],
  },
};

vi.mock("../useSession", () => ({
  useSession: () => sessionState,
}));

import { useStreamingAgent } from "../useStreamingAgent";

describe("useStreamingAgent", () => {
  it("returns concatenated text and isStreaming=true when running", () => {
    const { result } = renderHook(() => useStreamingAgent("s1", "market_research"));
    expect(result.current.text).toBe("Looking at the TAM/SAM/SOM…");
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.chunks.length).toBe(2);
  });

  it("falls back to empty chunks for missing agent", () => {
    const { result } = renderHook(() => useStreamingAgent("s1", "tech_architecture"));
    expect(result.current.text).toBe("");
    expect(result.current.chunks).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
  });
});
