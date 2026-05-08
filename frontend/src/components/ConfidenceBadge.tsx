/**
 * ConfidenceBadge — pill that surfaces provenance for a single data point.
 *
 * Confidence levels mirror backend `agent_schemas.DataPoint.confidence`:
 *  - sourced   (cited URL, primary source)
 *  - derived   (computed from other sourced data — derivation shown)
 *  - estimated (from public benchmarks / heuristics)
 *  - inferred  (LLM judgment, no external anchor)
 *
 * Hover/focus opens a Radix Popover with the source URL and derivation.
 */
import { useId } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ExternalLink, Info, Link2, Sigma, Sparkles } from "lucide-react";
import type { Citation } from "../types/agents";
import { cn } from "../lib/cn";

export type ConfidenceLevel = "sourced" | "derived" | "estimated" | "inferred";

export interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  source?: Citation | null;
  derivation?: string | null;
  /** When true the pill renders compact (icon only). */
  compact?: boolean;
  className?: string;
}

const LEVEL_META: Record<
  ConfidenceLevel,
  { label: string; tint: string; icon: typeof Info; ring: string }
> = {
  sourced: {
    label: "Sourced",
    tint: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    ring: "focus-visible:ring-emerald-500/60",
    icon: Link2,
  },
  derived: {
    label: "Derived",
    tint: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    ring: "focus-visible:ring-sky-500/60",
    icon: Sigma,
  },
  estimated: {
    label: "Estimated",
    tint: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    ring: "focus-visible:ring-amber-500/60",
    icon: Sparkles,
  },
  inferred: {
    label: "Inferred",
    tint: "bg-ink-500/15 text-ink-300 border-ink-500/30",
    ring: "focus-visible:ring-ink-500/60",
    icon: Info,
  },
};

export function ConfidenceBadge({
  level,
  source,
  derivation,
  compact = false,
  className,
}: ConfidenceBadgeProps): JSX.Element {
  const meta = LEVEL_META[level];
  const Icon = meta.icon;
  const popoverId = useId();
  const hasDetails = Boolean(source || derivation);

  const pill = (
    <span
      role="status"
      aria-describedby={hasDetails ? popoverId : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
        meta.tint,
        meta.ring,
        compact && "px-1.5",
        className,
      )}
    >
      <Icon size={10} aria-hidden="true" />
      {!compact && <span>{meta.label}</span>}
    </span>
  );

  if (!hasDetails) return pill;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center rounded-full",
            "focus-visible:outline-none focus-visible:ring-2",
            meta.ring,
          )}
          aria-label={`Show ${meta.label.toLowerCase()} provenance`}
        >
          {pill}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          id={popoverId}
          align="start"
          sideOffset={6}
          className="z-50 w-72 rounded-xl border border-ink-700/80 bg-ink-900/95 p-3 text-xs text-ink-100 shadow-bento backdrop-blur"
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            <Icon size={11} />
            <span>{meta.label}</span>
          </div>
          {source && (
            <div className="mb-2">
              <a
                href={String(source.source_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-ink-100 hover:text-accent transition-colors"
              >
                <span className="truncate">{source.publisher ?? new URL(String(source.source_url)).hostname}</span>
                <ExternalLink size={11} />
              </a>
              <p className="mt-1 line-clamp-3 text-ink-300">{source.text}</p>
              {source.accessed_at && (
                <p className="mt-1 text-ink-500">accessed {source.accessed_at}</p>
              )}
            </div>
          )}
          {derivation && (
            <div className="border-t border-ink-700/70 pt-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-400">derivation</p>
              <p className="mt-1 font-mono text-[11px] leading-snug text-ink-200">{derivation}</p>
            </div>
          )}
          <Popover.Arrow className="fill-ink-900" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
