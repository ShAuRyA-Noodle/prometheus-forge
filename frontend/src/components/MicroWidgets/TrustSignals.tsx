/**
 * TrustSignals — anti-slop, citation-first row of guarantees.
 *
 * Asymmetric grid (taste rule: NO 3-equal-cards-row).
 */
import { ShieldCheck, FileSearch, Lock, UserRound } from "lucide-react";

import { cn } from "@/lib/cn";
import { TRUST_SIGNALS } from "@/lib/constants";

const ICONS = [FileSearch, ShieldCheck, Lock, UserRound];

interface Props {
  className?: string;
  variant?: "row" | "grid";
}

export function TrustSignals({ className, variant = "grid" }: Props) {
  return (
    <div
      className={cn(
        variant === "grid"
          ? "grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1fr_2fr]"
          : "flex flex-wrap items-center gap-3",
        className,
      )}
    >
      {TRUST_SIGNALS.map((signal, i) => {
        const Icon = ICONS[i % ICONS.length] ?? ShieldCheck;
        return (
          <div
            key={signal.label}
            className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-2xl border border-ink-800/80 bg-ink-900/30 p-3"
          >
            <Icon className="mt-0.5 h-4 w-4 text-accent-500" aria-hidden="true" />
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-500">
                {signal.label}
              </div>
              <div className="text-sm text-ink-100">{signal.value}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
