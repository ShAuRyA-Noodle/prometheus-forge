/**
 * Timer — elapsed-time counter with ARIA live region.
 *
 * Mounts a single 250ms tick. Format: MM:SS. Pauses when `running` is false.
 */
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

interface TimerProps {
  /** Wall-clock start (ISO 8601 or epoch ms). When null, displays 0. */
  startedAt: string | number | null;
  /** Stop ticking when false. */
  running: boolean;
  className?: string;
  /** Optional override — when set, displays this elapsed in seconds (frozen). */
  frozenElapsedS?: number;
}

function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function Timer({ startedAt, running, className, frozenElapsedS }: TimerProps): JSX.Element {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  const elapsed: number =
    typeof frozenElapsedS === "number"
      ? frozenElapsedS
      : startedAt
        ? (now - (typeof startedAt === "number" ? startedAt : Date.parse(startedAt))) / 1000
        : 0;

  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={`Elapsed time: ${fmt(elapsed)}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-ink-800 bg-ink-900/60 px-3 py-1 font-mono text-xs tabular-nums text-ink-200",
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          running ? "animate-breathe bg-accent-500" : "bg-ink-600",
        )}
        aria-hidden="true"
      />
      {fmt(elapsed)}
    </span>
  );
}
