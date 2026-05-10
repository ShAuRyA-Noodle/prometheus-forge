/**
 * AgentDashboard — bento grid of all 13 agent cards by wave row.
 *
 * Layout (CSS Grid, no flex math):
 *   Pre-Wave row:  2 cards
 *   Wave 1 row:    6 cards
 *   Wave 2 row:    4 cards
 *   Wave 3 row:    2 cards
 *
 * Connectors between rows = WaveConnector.
 * Collapsible — default collapsed on GeneratePage.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Layers } from "lucide-react";

import { cn } from "@/lib/cn";
import { AgentCard } from "./AgentCard";
import { WaveConnector } from "./WaveConnector";
import { WAVE_AGENTS, WAVE_LABELS } from "@/lib/constants";
import type { AgentName, AgentRecord, Session, Wave } from "@/types/session";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

const ORDER: Wave[] = ["pre", "wave_1", "wave_2", "wave_3"];

const GATE_LABELS: Partial<Record<Wave, string>> = {
  wave_1: "Gate 1",
  wave_2: "Gate 2",
  wave_3: "Gate 3",
};

interface AgentDashboardProps {
  session: Session | null;
  /** When closed, only the header bar shows. */
  defaultCollapsed?: boolean;
  onAgentClick?: (agent: AgentName) => void;
  className?: string;
}

function isWaveComplete(records: Partial<Record<AgentName, AgentRecord>>, wave: Wave): boolean {
  return WAVE_AGENTS[wave].every((a) => {
    const r = records[a];
    return r?.status === "completed" || r?.status === "skipped";
  });
}

export function AgentDashboard({
  session,
  defaultCollapsed = true,
  onAgentClick,
  className,
}: AgentDashboardProps): JSX.Element {
  const [open, setOpen] = useState(!defaultCollapsed);
  const records = (session?.agents ?? {}) as Partial<Record<AgentName, AgentRecord>>;

  const totals = ORDER.reduce(
    (acc, w) => {
      const ags = WAVE_AGENTS[w];
      const done = ags.filter(
        (a) => records[a]?.status === "completed" || records[a]?.status === "skipped",
      ).length;
      acc.total += ags.length;
      acc.done += done;
      return acc;
    },
    { total: 0, done: 0 },
  );

  return (
    <section
      aria-label="Agent dashboard"
      className={cn(
        "rounded-bento border border-ink-800 bg-ink-950/60 backdrop-blur",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 text-left focus-ring"
      >
        <Layers className="h-4 w-4 text-ink-400" aria-hidden />
        <div className="grid gap-0.5">
          <span className="text-[11px] uppercase tracking-widest text-ink-500">Agent dashboard</span>
          <span className="text-sm text-ink-200">All 13 agents · live status</span>
        </div>
        <span className="font-mono text-xs tabular-nums text-ink-300">
          {totals.done}/{totals.total}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-ink-400 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden border-t border-ink-800/80"
          >
            <div className="grid gap-3 p-4">
              {ORDER.map((wave, i) => {
                const ags = WAVE_AGENTS[wave];
                const cols =
                  wave === "wave_1"
                    ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
                    : wave === "wave_2"
                      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                      : wave === "wave_3"
                        ? "grid-cols-1 sm:grid-cols-2"
                        : "grid-cols-1 sm:grid-cols-2";
                const upstream = ORDER[i - 1];
                const upstreamComplete =
                  i === 0 ? true : upstream ? isWaveComplete(records, upstream) : false;
                return (
                  <div key={wave} className="grid gap-2">
                    {i > 0 && (
                      <WaveConnector
                        active={upstreamComplete}
                        {...(GATE_LABELS[wave] ? { gateLabel: GATE_LABELS[wave]! } : {})}
                      />
                    )}
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                        <span>{WAVE_LABELS[wave]}</span>
                        <span className="font-mono text-ink-600">
                          {ags.filter((a) => records[a]?.status === "completed").length}/{ags.length}
                        </span>
                      </div>
                      <div className={cn("grid gap-2", cols)}>
                        {ags.map((agent) => (
                          <AgentCard
                            key={agent}
                            agent={agent}
                            {...(records[agent] ? { record: records[agent]! } : {})}
                            {...(onAgentClick ? { onClick: onAgentClick } : {})}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
