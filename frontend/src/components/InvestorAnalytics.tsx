/**
 * InvestorAnalytics — Pro+ feature: deck view tracking, geo, time-on-slide.
 *
 * Pulls aggregated analytics for a sessionId via Firestore on
 * `share/{shareToken}/views` aggregations. If user lacks `operator`+ tier,
 * triggers PaywallModal via useTier().requireTier on mount.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query as fsQuery, orderBy, limit } from "firebase/firestore";
import { motion } from "framer-motion";
import { ChartLine, Eye, Globe2, Lock, Timer } from "lucide-react";

import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase";
import { useTier } from "@/lib/billing";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface InvestorAnalyticsProps {
  sessionId: string;
  className?: string;
}

interface ViewEvent {
  id: string;
  viewed_at: string;
  region: string | null;
  per_slide_ms: number[];
}

export function InvestorAnalytics({ sessionId, className }: InvestorAnalyticsProps): JSX.Element {
  const { hasTier, requireTier } = useTier();
  const allowed = hasTier("operator");
  const [views, setViews] = useState<ViewEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!allowed) {
      requireTier("operator", "Deck view tracking + investor analytics is on Operator and above.");
      return;
    }
    const q = fsQuery(
      collection(db, "sessions", sessionId, "deck_views"),
      orderBy("viewed_at", "desc"),
      limit(200),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: ViewEvent[] = [];
        snap.forEach((d) => {
          const data = d.data();
          out.push({
            id: d.id,
            viewed_at: String(data.viewed_at ?? new Date().toISOString()),
            region: typeof data.region === "string" ? data.region : null,
            per_slide_ms: Array.isArray(data.per_slide_ms) ? (data.per_slide_ms as number[]) : [],
          });
        });
        setViews(out);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [allowed, sessionId, requireTier]);

  const slideHistogram = useMemo(() => {
    const buckets: number[] = [];
    for (const v of views) {
      v.per_slide_ms.forEach((ms, i) => {
        buckets[i] = (buckets[i] ?? 0) + ms;
      });
    }
    return buckets;
  }, [views]);

  const regionCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const v of views) {
      const k = v.region ?? "Unknown";
      m[k] = (m[k] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [views]);

  const weeklySparkline = useMemo(() => {
    const now = Date.now();
    const days = 14;
    const counts = new Array<number>(days).fill(0);
    for (const v of views) {
      const t = Date.parse(v.viewed_at);
      const ago = Math.floor((now - t) / (24 * 3600 * 1000));
      if (ago >= 0 && ago < days) counts[days - 1 - ago] = (counts[days - 1 - ago] ?? 0) + 1;
    }
    return counts;
  }, [views]);

  if (!allowed) {
    return (
      <section
        className={cn(
          "grid gap-3 rounded-bento border border-ink-800 bg-ink-900/30 p-6 text-center",
          className,
        )}
        aria-label="Investor analytics — locked"
      >
        <Lock className="mx-auto h-5 w-5 text-ink-500" aria-hidden />
        <h3 className="font-display text-lg text-ink-100">Investor analytics</h3>
        <p className="text-sm text-ink-400">
          Track who viewed your deck, which slides they lingered on, and where they came from.
          Available on Operator and above.
        </p>
        <button
          type="button"
          onClick={() =>
            requireTier(
              "operator",
              "Deck view tracking + investor analytics is on Operator and above.",
            )
          }
          className="mx-auto mt-2 rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-accent-400 focus-ring"
        >
          See pricing
        </button>
      </section>
    );
  }

  const maxBucket = Math.max(1, ...slideHistogram);
  const maxSpark = Math.max(1, ...weeklySparkline);

  return (
    <section
      aria-label="Investor analytics"
      className={cn(
        "grid gap-4 rounded-bento border border-ink-800 bg-ink-900/30 p-5",
        className,
      )}
    >
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-500/15 text-accent-500">
          <ChartLine className="h-4 w-4" />
        </span>
        <div>
          <span className="text-[11px] uppercase tracking-widest text-ink-500">
            Investor analytics
          </span>
          <p className="font-display text-base text-ink-100">Deck view tracking</p>
        </div>
        <span className="grid grid-cols-[auto_1fr] items-center gap-1.5 text-xs text-ink-300">
          <Eye className="h-3.5 w-3.5 text-ink-500" />
          {views.length} views
        </span>
      </header>

      {loading && <p className="text-xs text-ink-500">Loading analytics…</p>}

      {/* Weekly sparkline */}
      <article className="grid gap-2 rounded-2xl border border-ink-800 bg-ink-950/40 p-4">
        <span className="text-[10px] uppercase tracking-widest text-ink-500">Last 14 days</span>
        <div className="flex h-16 items-end gap-1">
          {weeklySparkline.map((c, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${(c / maxSpark) * 100}%` }}
              transition={{ ...SPRING, delay: i * 0.02 }}
              className="flex-1 rounded-t bg-accent-500/70"
              title={`${c} view(s)`}
            />
          ))}
        </div>
      </article>

      {/* Time-per-slide histogram */}
      <article className="grid gap-2 rounded-2xl border border-ink-800 bg-ink-950/40 p-4">
        <header className="grid grid-cols-[auto_1fr] items-center gap-2 text-[10px] uppercase tracking-widest text-ink-500">
          <Timer className="h-3.5 w-3.5" />
          Time on slide
        </header>
        <div className="grid gap-1">
          {slideHistogram.map((ms, i) => (
            <div key={i} className="grid grid-cols-[2.5rem_1fr_4rem] items-center gap-2">
              <span className="font-mono text-[10px] text-ink-500">#{i + 1}</span>
              <div className="h-2 overflow-hidden rounded-full bg-ink-900">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(ms / maxBucket) * 100}%` }}
                  transition={SPRING}
                  className="h-full rounded-full bg-accent-500"
                />
              </div>
              <span className="text-right font-mono text-[10px] tabular-nums text-ink-400">
                {(ms / 1000).toFixed(1)}s
              </span>
            </div>
          ))}
          {slideHistogram.length === 0 && (
            <p className="text-xs text-ink-500">No slide-level data yet.</p>
          )}
        </div>
      </article>

      {/* Geo */}
      <article className="grid gap-2 rounded-2xl border border-ink-800 bg-ink-950/40 p-4">
        <header className="grid grid-cols-[auto_1fr] items-center gap-2 text-[10px] uppercase tracking-widest text-ink-500">
          <Globe2 className="h-3.5 w-3.5" />
          Top regions
        </header>
        <ul className="grid gap-1">
          {regionCounts.length === 0 ? (
            <li className="text-xs text-ink-500">No regional data yet.</li>
          ) : (
            regionCounts.map(([region, n]) => (
              <li
                key={region}
                className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border border-ink-800 bg-ink-950/40 px-2.5 py-1.5 text-xs text-ink-200"
              >
                <span>{region}</span>
                <span className="font-mono tabular-nums text-ink-500">{n}</span>
              </li>
            ))
          )}
        </ul>
      </article>
    </section>
  );
}
