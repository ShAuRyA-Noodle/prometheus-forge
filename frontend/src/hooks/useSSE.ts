/**
 * useSSE — typed SSE subscription hook.
 *
 * - Subscribes when `enabled` becomes true and `sessionId` is set.
 * - Returns `events` (rolling buffer, capped) + `status`.
 * - Cleans up on unmount.
 */
import { useEffect, useRef, useState } from "react";

import { subscribeSse, type SseStatus } from "@/lib/sse";
import type { SseEvent } from "@/types/sse";

const DEFAULT_BUFFER_LIMIT = 500;

export interface UseSseOptions {
  enabled?: boolean;
  bufferLimit?: number;
  onEvent?: (event: SseEvent) => void;
}

export function useSSE(
  sessionId: string | null,
  options: UseSseOptions = {},
): { events: SseEvent[]; status: SseStatus; clear: () => void } {
  const { enabled = true, bufferLimit = DEFAULT_BUFFER_LIMIT, onEvent } = options;
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [status, setStatus] = useState<SseStatus>("closed");
  // Stable ref for the user callback so we don't re-subscribe on every render.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !sessionId) {
      setStatus("closed");
      return;
    }
    setEvents([]);
    const unsub = subscribeSse(
      sessionId,
      (ev) => {
        setEvents((prev) => {
          const next = prev.length >= bufferLimit ? prev.slice(1) : prev;
          return [...next, ev];
        });
        onEventRef.current?.(ev);
      },
      { onStatus: setStatus },
    );
    return () => unsub();
  }, [sessionId, enabled, bufferLimit]);

  const clear = () => setEvents([]);
  return { events, status, clear };
}
