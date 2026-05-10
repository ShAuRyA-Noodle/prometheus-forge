/**
 * AgentCard — single agent state pill in AgentDashboard.
 *
 * States: pending, running, completed, error, gate_rejected, safety_blocked, skipped.
 * Hover: token count, cost, duration. Click: opens detail panel via callback.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  Clock,
  Loader2,
  ShieldAlert,
  ShieldX,
  SkipForward,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { AGENT_DISPLAY_NAMES, AGENT_DESCRIPTIONS, STATUS_COLORS, STATUS_LABEL } from "@/lib/constants";
import { formatCurrency } from "./DataPoint";
import type { AgentName, AgentRecord, AgentStatusValue } from "@/types/session";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface AgentCardProps {
  agent: AgentName;
  record?: AgentRecord;
  /** Click → expand details. Parent owns the panel. */
  onClick?: (agent: AgentName) => void;
  /** Compact rendering for sidebar/dashboard. */
  compact?: boolean;
  className?: string;
}

function statusIcon(status: AgentStatusValue): JSX.Element {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />;
    case "completed":
      return <Check className="h-3.5 w-3.5" aria-hidden />;
    case "error":
      return <X className="h-3.5 w-3.5" aria-hidden />;
    case "gate_rejected":
      return <ShieldAlert className="h-3.5 w-3.5" aria-hidden />;
    case "safety_blocked":
      return <ShieldX className="h-3.5 w-3.5" aria-hidden />;
    case "skipped":
      return <SkipForward className="h-3.5 w-3.5" aria-hidden />;
    case "pending":
    default:
      return <Clock className="h-3.5 w-3.5" aria-hidden />;
  }
}

export const AgentCard = memo(function AgentCard({
  agent,
  record,
  onClick,
  compact = false,
  className,
}: AgentCardProps): JSX.Element {
  const status: AgentStatusValue = record?.status ?? "pending";
  const colors = STATUS_COLORS[status];
  const label = AGENT_DISPLAY_NAMES[agent];
  const desc = AGENT_DESCRIPTIONS[agent];
  const durationS = record?.duration_ms ? Math.round(record.duration_ms / 100) / 10 : null;
  const cost = record?.cost_usd ?? 0;
  const tokens = (record?.input_tokens ?? 0) + (record?.output_tokens ?? 0);
  const errorMsg = record?.error_message;

  const isInteractive = Boolean(onClick);

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: status === "pending" ? 0.55 : 1, scale: 1 }}
      transition={SPRING}
      onClick={isInteractive ? () => onClick?.(agent) : undefined}
      aria-label={`${label}: ${STATUS_LABEL[status]}${errorMsg ? `. ${errorMsg}` : ""}`}
      aria-pressed={isInteractive ? false : undefined}
      title={errorMsg ?? desc}
      className={cn(
        "group relative grid gap-2 rounded-2xl border p-3 text-left transition focus-ring",
        "ring-1",
        colors.bg,
        colors.ring,
        status === "running" && "animate-breathe",
        isInteractive ? "cursor-pointer hover:border-ink-700" : "cursor-default",
        compact && "p-2",
        className,
      )}
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "grid h-6 w-6 place-items-center rounded-full",
            colors.text,
            "bg-ink-950/60",
          )}
        >
          {statusIcon(status)}
        </span>
        <span className={cn("truncate font-display text-sm font-medium text-ink-100")}>{label}</span>
        {durationS !== null ? (
          <span className="font-mono text-[10px] tabular-nums text-ink-500">{durationS}s</span>
        ) : (
          <span className={cn("font-mono text-[10px] uppercase tracking-wider", colors.text)}>
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>
      {!compact && (
        <p className="line-clamp-2 text-[11px] leading-snug text-ink-400">{desc}</p>
      )}
      {!compact && (record?.cost_usd || record?.output_tokens) ? (
        <div className="grid grid-cols-3 gap-1 border-t border-ink-800/60 pt-2 text-[10px] text-ink-500">
          <span title="Total tokens">{tokens.toLocaleString()} tok</span>
          <span title="Cost (USD)" className="text-center">{formatCurrency(cost)}</span>
          <span title="Retries" className="text-right">
            {record?.retry_count ? `${record.retry_count}× retry` : "—"}
          </span>
        </div>
      ) : null}
      {errorMsg && !compact && (
        <p className="grid grid-cols-[auto_1fr] items-start gap-1.5 rounded-md bg-danger/10 px-2 py-1 text-[10.5px] leading-snug text-red-200">
          <AlertCircle className="mt-0.5 h-3 w-3" aria-hidden />
          <span className="line-clamp-2">{errorMsg}</span>
        </p>
      )}
    </motion.button>
  );
});
