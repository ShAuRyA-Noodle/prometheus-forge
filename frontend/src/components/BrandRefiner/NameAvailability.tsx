/**
 * NameAvailability — fans out availability checks for a single name candidate.
 *
 * Shows compact badges for: .com / .ai / .app / USPTO / x.com / instagram / github.
 * Each badge has 3 states: loading, available, taken.
 *
 * Mounts → fires `api.checkAvailability(name)` (debounced via availabilityClient).
 * Aborts in-flight requests when the name changes or component unmounts.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { checkAvailabilityDebounced } from "../../lib/availabilityClient";
import type { AvailabilityBundle } from "../../lib/api";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface NameAvailabilityProps {
  name: string;
  /** Compact mode hides labels and shows only icon pills (used inside list rows). */
  compact?: boolean;
  className?: string;
}

type ChannelKey =
  | "domain_com"
  | "domain_ai"
  | "domain_app"
  | "uspto"
  | "handle_x"
  | "handle_instagram"
  | "handle_github";

const CHANNELS: { key: ChannelKey; label: string; short: string }[] = [
  { key: "domain_com", label: ".com", short: ".com" },
  { key: "domain_ai", label: ".ai", short: ".ai" },
  { key: "domain_app", label: ".app", short: ".app" },
  { key: "uspto", label: "USPTO", short: "TM" },
  { key: "handle_x", label: "x.com", short: "X" },
  { key: "handle_instagram", label: "instagram", short: "IG" },
  { key: "handle_github", label: "github", short: "GH" },
];

function channelStatus(
  bundle: AvailabilityBundle | null,
  key: ChannelKey,
): "loading" | "available" | "taken" | "unknown" {
  if (!bundle) return "loading";
  if (key === "uspto") {
    const u = bundle.uspto;
    if (!u) return "unknown";
    return u.conflicts.length === 0 ? "available" : "taken";
  }
  if (key.startsWith("domain_")) {
    const d = bundle[key];
    if (!d) return "unknown";
    return d.available ? "available" : "taken";
  }
  const h = bundle[key];
  if (!h) return "unknown";
  if (h.available === null) return "unknown";
  return h.available ? "available" : "taken";
}

export function NameAvailability({
  name,
  compact = false,
  className,
}: NameAvailabilityProps): JSX.Element {
  const [bundle, setBundle] = useState<AvailabilityBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    setError(null);
    if (!name || name.length < 2) return;
    checkAvailabilityDebounced(name)
      .then((b) => {
        if (!cancelled) setBundle(b);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e && typeof e === "object" && "name" in e && (e as Error).name === "AbortError") {
          return;
        }
        setError("Lookup failed");
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        compact ? "text-[10px]" : "text-[11px]",
        className,
      )}
      role="group"
      aria-label={`Availability for ${name}`}
    >
      {CHANNELS.map(({ key, label, short }) => {
        const status = channelStatus(bundle, key);
        return (
          <Badge
            key={key}
            label={compact ? short : label}
            status={error ? "unknown" : status}
            compact={compact}
          />
        );
      })}
    </div>
  );
}

interface BadgeProps {
  label: string;
  status: "loading" | "available" | "taken" | "unknown";
  compact: boolean;
}

function Badge({ label, status, compact }: BadgeProps): JSX.Element {
  const styles = {
    loading:
      "border-ink-700/70 bg-ink-800/40 text-ink-400",
    available: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    taken: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    unknown: "border-ink-700/70 bg-ink-800/40 text-ink-500",
  } as const;
  return (
    <motion.span
      layout
      transition={SPRING}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium tabular-nums",
        styles[status],
        compact && "px-1 py-px",
      )}
      aria-label={`${label}: ${status}`}
    >
      {status === "loading" ? (
        <Loader2 size={compact ? 9 : 11} className="animate-[spin_1.4s_linear_infinite]" aria-hidden="true" />
      ) : status === "available" ? (
        <Check size={compact ? 9 : 11} aria-hidden="true" />
      ) : status === "taken" ? (
        <X size={compact ? 9 : 11} aria-hidden="true" />
      ) : (
        <span aria-hidden="true">·</span>
      )}
      <span>{label}</span>
    </motion.span>
  );
}
