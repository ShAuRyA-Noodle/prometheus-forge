/**
 * DataPoint — formatted metric value with provenance badge.
 *
 * Wraps `agent_schemas.DataPoint`. Handles unit-aware formatting:
 *   - $X.XB / $X.XM / $X.XK
 *   - X.X%
 *   - x months / x weeks
 *   - integer counts
 */
import type { DataPoint as DataPointModel } from "../types/agents";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { cn } from "../lib/cn";

export interface DataPointProps {
  point: DataPointModel;
  label?: string;
  /** Display size — `xl` is meant for hero metrics. */
  size?: "sm" | "md" | "lg" | "xl";
  /** Hide unit suffix (used when caller renders unit separately). */
  hideUnit?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<DataPointProps["size"]>, string> = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-3xl",
  xl: "text-5xl md:text-6xl",
};

export function formatNumeric(value: number | string, unit?: string | null): string {
  if (typeof value === "string") return value;
  const u = (unit ?? "").toLowerCase();
  if (u.includes("usd") || u.includes("$") || u === "dollars") return formatCurrency(value);
  if (u.includes("%") || u.includes("pct") || u === "percent") return `${formatNumberCompact(value, 1)}%`;
  if (u.includes("month")) return `${Math.round(value)} mo`;
  if (u.includes("week")) return `${Math.round(value)} wk`;
  if (u.includes("year")) return `${Math.round(value)} yr`;
  if (u.includes("ratio") || u === "x") return `${value.toFixed(2)}×`;
  return formatNumberCompact(value, value < 10 ? 2 : 0);
}

export function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatNumberCompact(value: number, decimals: number = 1): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(decimals)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(decimals)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(decimals)}K`;
  return value.toFixed(decimals);
}

export function DataPoint({
  point,
  label,
  size = "md",
  hideUnit = false,
  className,
}: DataPointProps): JSX.Element {
  const formatted = formatNumeric(point.value, hideUnit ? null : point.unit);
  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      {(label ?? point.label) && (
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
          {label ?? point.label}
        </div>
      )}
      <div className="flex items-baseline gap-2">
        <span className={cn("font-display font-medium tabular-nums text-ink-50", SIZE_CLASS[size])}>
          {formatted}
        </span>
        <ConfidenceBadge
          level={point.confidence}
          source={point.source ?? null}
          derivation={point.derivation ?? null}
          compact={size === "sm"}
        />
      </div>
    </div>
  );
}
