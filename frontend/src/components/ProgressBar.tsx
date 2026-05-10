/**
 * ProgressBar — top-of-screen pipeline progress.
 *
 * Shows X/13 agents complete with gradient fill in accent.
 */
import { motion } from "framer-motion";

import { cn } from "@/lib/cn";

interface ProgressBarProps {
  total: number;
  completed: number;
  /** Optional label override. */
  label?: string;
  className?: string;
}

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export function ProgressBar({ total, completed, label, className }: ProgressBarProps): JSX.Element {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div
      className={cn("grid w-full gap-1", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={completed}
      aria-label={label ?? `${completed} of ${total} agents complete`}
    >
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-[11px] uppercase tracking-widest text-ink-500">
        <span>{label ?? "Pipeline"}</span>
        <span className="font-mono tabular-nums text-ink-300">
          {completed}/{total}
        </span>
      </div>
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-ink-900">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={SPRING}
          className="h-full rounded-full bg-accent-500"
          style={{
            backgroundImage:
              "linear-gradient(90deg, #FF5A1F 0%, #FF7E4B 50%, #FF5A1F 100%)",
          }}
        />
      </div>
    </div>
  );
}
