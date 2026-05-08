/**
 * useSession — combined Firestore + SSE live state.
 *
 * Firestore is the source of truth (durable, replayable). SSE provides
 * sub-second reasoning streaming + cost updates. We merge both into a
 * single object for consumers (GeneratePage, ResultsPage).
 */
import { useMemo, useState } from "react";

import { useSessionListener } from "./useSessionListener";
import { useSSE } from "./useSSE";
import type { SseEvent } from "@/types/sse";
import type { AgentName, Session } from "@/types/session";

export interface AgentReasoningChunk {
  agent: AgentName;
  text: string;
  seq: number;
  at: string;
}

export interface UseSessionResult {
  session: Session | null;
  artifacts: Partial<Record<AgentName, unknown>>;
  loading: boolean;
  /** Buffered SSE events for this session. */
  events: SseEvent[];
  /** Cursor-style streaming reasoning, keyed by agent name. */
  reasoning: Partial<Record<AgentName, AgentReasoningChunk[]>>;
  /** Last SSE-reported cost, or undefined if not yet streamed. */
  liveCostUsd: number | undefined;
  sseStatus: "connecting" | "open" | "reconnecting" | "closed" | "error";
}

export function useSession(sessionId: string | null): UseSessionResult {
  const { session, artifacts, loading } = useSessionListener(sessionId);
  const [reasoning, setReasoning] = useState<
    Partial<Record<AgentName, AgentReasoningChunk[]>>
  >({});
  const [liveCostUsd, setLiveCostUsd] = useState<number | undefined>(undefined);

  const enabled = useMemo(() => {
    if (!session) return Boolean(sessionId);
    return ["queued", "running"].includes(session.status);
  }, [session, sessionId]);

  const { events, status: sseStatus } = useSSE(sessionId, {
    enabled,
    onEvent: (ev) => {
      switch (ev.type) {
        case "agent.reasoning": {
          const chunk: AgentReasoningChunk = {
            agent: ev.agent,
            text: ev.delta,
            seq: ev.seq,
            at: ev.at,
          };
          setReasoning((prev) => {
            const list = prev[ev.agent] ?? [];
            // Drop dupes — order by seq.
            if (list.some((c) => c.seq === ev.seq)) return prev;
            const merged = [...list, chunk].sort((a, b) => a.seq - b.seq);
            return { ...prev, [ev.agent]: merged };
          });
          break;
        }
        case "cost.update":
          setLiveCostUsd(ev.total_cost_usd);
          break;
        default:
          break;
      }
    },
  });

  return {
    session,
    artifacts,
    loading,
    events,
    reasoning,
    liveCostUsd,
    sseStatus,
  };
}
