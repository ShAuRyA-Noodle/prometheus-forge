/**
 * WaveConnector — SVG dependency arrows between AgentDashboard wave rows.
 *
 * Drawn as a thin orange line with arrowhead. Animates path-draw on completion
 * via Framer Motion stroke-dasharray trick.
 */
import { motion } from "framer-motion";

import { cn } from "@/lib/cn";

interface WaveConnectorProps {
  /** Whether the upstream wave is complete — controls path-draw animation. */
  active: boolean;
  /** Show subtle "gate" pill in the middle (Gate 1, Gate 2, etc). */
  gateLabel?: string;
  className?: string;
}

export function WaveConnector({ active, gateLabel, className }: WaveConnectorProps): JSX.Element {
  return (
    <div className={cn("relative grid place-items-center py-2", className)} aria-hidden="true">
      <svg viewBox="0 0 200 24" className="h-6 w-full max-w-[280px]" preserveAspectRatio="none">
        <defs>
          <marker
            id="waveArrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="3"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 6 3, 0 6" fill="currentColor" />
          </marker>
        </defs>
        <motion.path
          d="M 12 12 L 188 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2 4"
          markerEnd="url(#waveArrowhead)"
          className={active ? "text-accent-500" : "text-ink-700"}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: active ? 1 : 0.6 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </svg>
      {gateLabel && (
        <span
          className={cn(
            "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-950 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
            active ? "text-accent-500" : "text-ink-500",
          )}
        >
          {gateLabel}
        </span>
      )}
    </div>
  );
}
