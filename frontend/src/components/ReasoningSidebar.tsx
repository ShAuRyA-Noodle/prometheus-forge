/**
 * ReasoningSidebar — Cursor-style streaming reasoning view.
 *
 * Right rail of GeneratePage. Subscribes to the SSE stream via the parent's
 * `useGenerationStream` hook and renders agent-by-agent thinking traces with
 * token-level animation.
 *
 * Stream events handled:
 *   - agent_started   → opens a new collapsible section
 *   - agent_token     → appends text, animates last span (opacity 0 → 1)
 *   - agent_completed → closes section, shows summary + duration
 *   - agent_failed    → shows error pill, keeps trace open
 *   - wave_started/completed → group divider
 *
 * Honors prefers-reduced-motion. Auto-scrolls only if user is already pinned
 * to the bottom (no jank on review).
 */
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { AgentRole, ReasoningStreamEvent } from "../types/agents";
import { cn } from "../lib/cn";

// Spring per taste-skill rule.
const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface ReasoningSidebarProps {
  /**
   * Live, append-only event log. Most recent at the end.
   * Sibling owns the hook that produces this.
   */
  events: ReasoningStreamEvent[];
  /** Active wave number (1-3). 0 = pre-wave / not started. */
  currentWave: number;
  /** Whether SSE stream is currently open. */
  streaming: boolean;
  /** Total elapsed seconds since pipeline start. */
  elapsedSec: number;
  className?: string;
}

interface AgentTrace {
  agent: AgentRole;
  wave: number;
  startedAt: number;
  completedAt: number | null;
  failedAt: number | null;
  failureReason: string | null;
  summary: string | null;
  /** Concatenated token text. */
  text: string;
  /** Index of the most recent token boundary (for shimmer animation). */
  lastTokenIdx: number;
  open: boolean;
}

const AGENT_LABELS: Record<string, string> = {
  market_research: "Market Research",
  competitive_analysis: "Competitive Analysis",
  business_model: "Business Model",
  brand_identity: "Brand Identity",
  risk_analysis: "Risk Analysis",
  tech_architecture: "Tech Architecture",
  financial_model: "Financial Model",
  landing_page: "Landing Page",
  legal_documents: "Legal Documents",
  go_to_market: "Go-to-Market",
  pitch_deck: "Pitch Deck",
  executive_summary: "Executive Summary",
  idea_parser: "Idea Parser",
  articulation: "Articulation",
};

function fmtElapsed(s: number): string {
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}

export const ReasoningSidebar = forwardRef<HTMLElement, ReasoningSidebarProps>(
  function ReasoningSidebar({ events, currentWave, streaming, elapsedSec, className }, ref) {
    const prefersReduced = useReducedMotion();
    const scrollRef = useRef<HTMLDivElement>(null);
    const pinnedToBottomRef = useRef(true);
    const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});

    // Reduce stream events to per-agent traces in stable order.
    const traces = useMemo(() => {
      const map = new Map<string, AgentTrace>();
      const order: string[] = [];
      for (const evt of events) {
        if (evt.kind === "agent_started") {
          if (!map.has(evt.agent)) order.push(evt.agent);
          map.set(evt.agent, {
            agent: evt.agent,
            wave: evt.wave,
            startedAt: evt.t_ms,
            completedAt: null,
            failedAt: null,
            failureReason: null,
            summary: null,
            text: "",
            lastTokenIdx: 0,
            open: true,
          });
        } else if (evt.kind === "agent_token") {
          const t = map.get(evt.agent);
          if (t) {
            t.lastTokenIdx = t.text.length;
            t.text += evt.token;
          }
        } else if (evt.kind === "agent_completed") {
          const t = map.get(evt.agent);
          if (t) {
            t.completedAt = evt.t_ms;
            t.summary = evt.summary ?? null;
            t.open = false;
          }
        } else if (evt.kind === "agent_failed") {
          const t = map.get(evt.agent);
          if (t) {
            t.failedAt = evt.t_ms;
            t.failureReason = evt.reason;
            t.open = true;
          }
        }
      }
      return order.map((a) => map.get(a)!).filter(Boolean);
    }, [events]);

    // Determine the in-flight agent (for header).
    const liveAgent = useMemo(
      () => traces.find((t) => !t.completedAt && !t.failedAt) ?? null,
      [traces],
    );

    // Auto-scroll if user is pinned.
    useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (pinnedToBottomRef.current) {
        el.scrollTo({ top: el.scrollHeight, behavior: prefersReduced ? "auto" : "smooth" });
      }
    }, [events.length, prefersReduced]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
      pinnedToBottomRef.current = distance < 60;
    }, []);

    const toggleOpen = useCallback((agent: string) => {
      setOpenOverrides((prev) => ({ ...prev, [agent]: !(prev[agent] ?? false) }));
    }, []);

    return (
      <aside
        ref={ref}
        aria-label="Live reasoning trace"
        className={cn(
          "grid h-full w-full grid-rows-[auto_1fr] overflow-hidden",
          "border-l border-ink-800 bg-ink-950/80 backdrop-blur-sm",
          className,
        )}
      >
        <ReasoningHeader
          liveAgent={liveAgent}
          currentWave={currentWave}
          streaming={streaming}
          elapsedSec={elapsedSec}
        />
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="overflow-y-auto px-4 pb-10 pt-3 [scrollbar-width:thin]"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
        >
          <AnimatePresence initial={false}>
            {traces.map((t) => (
              <TraceSection
                key={t.agent}
                trace={t}
                open={openOverrides[t.agent] ?? t.open}
                onToggle={() => toggleOpen(t.agent)}
                prefersReduced={Boolean(prefersReduced)}
              />
            ))}
          </AnimatePresence>
          {traces.length === 0 && (
            <div className="mt-12 flex flex-col items-center gap-2 text-center text-ink-500">
              <Sparkles size={18} className="text-ink-600" />
              <p className="font-mono text-xs">
                Waiting for the first agent to start thinking…
              </p>
            </div>
          )}
        </div>
      </aside>
    );
  },
);

// ─── Header ──────────────────────────────────────────────────────────────────

interface ReasoningHeaderProps {
  liveAgent: AgentTrace | null;
  currentWave: number;
  streaming: boolean;
  elapsedSec: number;
}

function ReasoningHeader({
  liveAgent,
  currentWave,
  streaming,
  elapsedSec,
}: ReasoningHeaderProps): JSX.Element {
  const label = liveAgent ? AGENT_LABELS[liveAgent.agent] ?? liveAgent.agent : "Idle";
  return (
    <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink-800 px-4 py-3">
      <div
        className={cn(
          "grid h-8 w-8 place-items-center rounded-full",
          streaming ? "bg-accent/15 text-accent" : "bg-ink-800 text-ink-500",
        )}
        aria-hidden="true"
      >
        {streaming ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          <span>Wave {currentWave || "—"} / 3</span>
          <span className="h-1 w-1 rounded-full bg-ink-700" />
          <span>Reasoning</span>
        </div>
        <div className="truncate font-display text-sm font-medium text-ink-100">{label}</div>
      </div>
      <span className="font-mono text-xs tabular-nums text-ink-400">{fmtElapsed(elapsedSec)}</span>
    </header>
  );
}

// ─── Per-agent trace section ─────────────────────────────────────────────────

interface TraceSectionProps {
  trace: AgentTrace;
  open: boolean;
  onToggle: () => void;
  prefersReduced: boolean;
}

const TraceSection = memo(function TraceSection({
  trace,
  open,
  onToggle,
  prefersReduced,
}: TraceSectionProps) {
  const label = AGENT_LABELS[trace.agent] ?? trace.agent;
  const status: "running" | "ok" | "fail" = trace.failedAt
    ? "fail"
    : trace.completedAt
      ? "ok"
      : "running";
  const elapsedMs =
    (trace.completedAt ?? trace.failedAt ?? Date.now()) - trace.startedAt;

  return (
    <motion.section
      layout
      initial={prefersReduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={SPRING}
      className="mb-3 overflow-hidden rounded-xl border border-ink-800 bg-ink-900/60"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`trace-${trace.agent}`}
        className={cn(
          "grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-2 text-left",
          "hover:bg-ink-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        )}
      >
        <StatusDot status={status} />
        <span className="truncate font-display text-sm font-medium text-ink-100">{label}</span>
        <span className="font-mono text-[10px] tabular-nums text-ink-500">
          {(elapsedMs / 1000).toFixed(1)}s
        </span>
        <ChevronDown
          size={14}
          className={cn(
            "text-ink-500 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`trace-${trace.agent}`}
            key="body"
            initial={prefersReduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden border-t border-ink-800/80"
          >
            <div className="px-3 py-2.5">
              <TokenStream
                text={trace.text}
                lastTokenIdx={trace.lastTokenIdx}
                running={status === "running"}
                prefersReduced={prefersReduced}
              />
              {trace.summary && (
                <p className="mt-2 rounded-md bg-ink-800/60 px-2 py-1.5 text-[12px] leading-relaxed text-ink-200">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                    summary
                  </span>
                  {trace.summary}
                </p>
              )}
              {trace.failureReason && (
                <p className="mt-2 flex items-start gap-1.5 rounded-md bg-danger/10 px-2 py-1.5 text-[12px] leading-relaxed text-red-200">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>{trace.failureReason}</span>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
});

// ─── Token-level streaming text ──────────────────────────────────────────────

interface TokenStreamProps {
  text: string;
  lastTokenIdx: number;
  running: boolean;
  prefersReduced: boolean;
}

const TokenStream = memo(function TokenStream({
  text,
  lastTokenIdx,
  running,
  prefersReduced,
}: TokenStreamProps) {
  // Split into "settled" prefix + "fresh" suffix so only the latest token
  // animates. Avoids re-running motion for every prior token (perf + correctness).
  const settled = text.slice(0, lastTokenIdx);
  const fresh = text.slice(lastTokenIdx);
  return (
    <p className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-ink-300">
      <span>{settled}</span>
      {fresh && (
        <motion.span
          key={lastTokenIdx}
          initial={prefersReduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.08, ease: "linear" }}
          className="text-ink-100"
        >
          {fresh}
        </motion.span>
      )}
      {running && (
        <span
          aria-hidden="true"
          className={cn(
            "ml-0.5 inline-block h-3 w-1.5 translate-y-[2px] bg-accent",
            !prefersReduced && "animate-breathe",
          )}
        />
      )}
    </p>
  );
});

function StatusDot({ status }: { status: "running" | "ok" | "fail" }): JSX.Element {
  if (status === "ok") return <CheckCircle2 size={13} className="text-emerald-400" />;
  if (status === "fail") return <AlertTriangle size={13} className="text-red-400" />;
  return (
    <span className="relative grid h-3 w-3 place-items-center" aria-hidden="true">
      <span className="absolute inset-0 animate-breathe rounded-full bg-accent/40" />
      <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
    </span>
  );
}
