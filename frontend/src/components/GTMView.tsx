/**
 * GTMView — channel cards, 90-day kanban, KPI table, partnership list.
 */
import { motion } from "framer-motion";
import { Megaphone, Rocket, Target, Users } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatCurrency, formatNumberCompact } from "./DataPoint";
import type { GoToMarketResult } from "@/types/agents";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface GTMViewProps {
  gtm: GoToMarketResult;
  className?: string;
}

const STRATEGY_LABEL: Record<GoToMarketResult["launch_strategy_type"], string> = {
  soft_launch: "Soft launch",
  product_hunt: "Product Hunt",
  press: "Press",
  community_first: "Community-first",
  founder_led: "Founder-led",
};

export function GTMView({ gtm, className }: GTMViewProps): JSX.Element {
  // 90-day kanban derived from first_90_days_plan.
  const kanbanCols = ["weeks_1_4", "weeks_5_8", "weeks_9_12"] as const;
  const kanbanLabels: Record<(typeof kanbanCols)[number], string> = {
    weeks_1_4: "Weeks 1–4",
    weeks_5_8: "Weeks 5–8",
    weeks_9_12: "Weeks 9–12",
  };

  const channels = (gtm.marketing_channels ?? []).map((m) => ({
    name: String(m.name ?? m.channel ?? "Unknown"),
    cac: typeof m.cac_usd === "number" ? m.cac_usd : null,
    priority: String(m.priority ?? "medium"),
    rationale: String(m.rationale ?? ""),
  }));

  const kpis = gtm.kpis ?? {};

  return (
    <section className={cn("grid gap-6", className)} aria-label="Go-to-market plan">
      <header className="grid grid-cols-[auto_1fr] items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-500/15 text-accent-500">
          <Rocket className="h-4 w-4" />
        </span>
        <div className="grid gap-0.5">
          <span className="text-[11px] uppercase tracking-widest text-ink-500">Launch strategy</span>
          <p className="font-display text-2xl text-ink-50">
            {STRATEGY_LABEL[gtm.launch_strategy_type]}
          </p>
        </div>
      </header>

      {/* Channels */}
      <div className="grid gap-2">
        <span className="grid grid-cols-[auto_1fr] items-center gap-2 text-[11px] uppercase tracking-widest text-ink-500">
          <Megaphone className="h-3.5 w-3.5" />
          Channels
        </span>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((c, i) => (
            <motion.article
              key={c.name + i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: i * 0.03 }}
              className="grid gap-2 rounded-2xl border border-ink-800 bg-ink-900/40 p-4"
            >
              <header className="grid grid-cols-[1fr_auto] items-center gap-2">
                <h3 className="font-display text-base text-ink-100">{c.name}</h3>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                    c.priority === "high"
                      ? "bg-accent-500/20 text-accent-500"
                      : c.priority === "low"
                        ? "bg-ink-800 text-ink-500"
                        : "bg-ink-800 text-ink-300",
                  )}
                >
                  {c.priority}
                </span>
              </header>
              {c.cac !== null && (
                <div className="grid grid-cols-[auto_1fr] items-baseline gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-ink-500">CAC</span>
                  <span className="font-display text-2xl tabular-nums text-ink-50">
                    {formatCurrency(c.cac)}
                  </span>
                </div>
              )}
              {c.rationale && <p className="text-[12px] text-ink-300">{c.rationale}</p>}
            </motion.article>
          ))}
        </div>
      </div>

      {/* 90-day kanban */}
      <div className="grid gap-2">
        <span className="text-[11px] uppercase tracking-widest text-ink-500">First 90 days</span>
        <div className="grid gap-3 md:grid-cols-3">
          {kanbanCols.map((col, idx) => {
            const items = gtm.first_90_days_plan[col] ?? [];
            return (
              <motion.article
                key={col}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: idx * 0.05 }}
                className="grid gap-2 rounded-bento border border-ink-800 bg-ink-900/30 p-4"
              >
                <header className="grid grid-cols-[1fr_auto] items-center">
                  <span className="font-display text-sm font-medium text-ink-100">
                    {kanbanLabels[col]}
                  </span>
                  <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[10px] tabular-nums text-ink-400">
                    {items.length}
                  </span>
                </header>
                <ul className="grid gap-1.5">
                  {items.map((it, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-ink-800/60 bg-ink-950/40 px-2.5 py-1.5 text-[12px] text-ink-200"
                    >
                      {it}
                    </li>
                  ))}
                </ul>
              </motion.article>
            );
          })}
        </div>
      </div>

      {/* KPI table */}
      {Object.keys(kpis).length > 0 && (
        <div className="grid gap-2">
          <span className="grid grid-cols-[auto_1fr] items-center gap-2 text-[11px] uppercase tracking-widest text-ink-500">
            <Target className="h-3.5 w-3.5" />
            Key metrics
          </span>
          <div className="overflow-x-auto rounded-bento border border-ink-800 bg-ink-900/30">
            <table className="w-full min-w-[480px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                    Metric
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                    3 months
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                    12 months
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(kpis).map(([metric, vals]) => (
                  <tr key={metric}>
                    <td className="border-t border-ink-800 px-3 py-2 text-ink-200">{metric}</td>
                    <td className="border-t border-ink-800 px-3 py-2 text-right font-mono tabular-nums text-ink-100">
                      {fmtKpi(metric, vals["3mo"] ?? vals.three_month ?? 0)}
                    </td>
                    <td className="border-t border-ink-800 px-3 py-2 text-right font-mono tabular-nums text-ink-100">
                      {fmtKpi(metric, vals["12mo"] ?? vals.twelve_month ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Launch phases */}
      {gtm.launch_phases.length > 0 && (
        <div className="grid gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-500">Launch phases</span>
          <ol className="grid gap-2">
            {gtm.launch_phases.map((p, i) => (
              <li
                key={i}
                className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-2xl border border-ink-800 bg-ink-900/30 p-3"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-500/15 text-xs font-bold text-accent-500">
                  {i + 1}
                </span>
                <div className="grid gap-1">
                  <div className="font-display text-sm text-ink-100">
                    {p.name ?? p.title ?? `Phase ${i + 1}`}
                  </div>
                  {p.description && <div className="text-xs text-ink-400">{p.description}</div>}
                  {p.duration && (
                    <div className="text-[10px] uppercase tracking-wider text-ink-500">
                      {p.duration}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {gtm.partnerships.length > 0 && (
        <div className="grid gap-2">
          <span className="grid grid-cols-[auto_1fr] items-center gap-2 text-[11px] uppercase tracking-widest text-ink-500">
            <Users className="h-3.5 w-3.5" />
            Partnerships to pursue
          </span>
          <div className="flex flex-wrap gap-1.5">
            {gtm.partnerships.map((p, i) => (
              <span
                key={i}
                className="rounded-full border border-ink-800 bg-ink-900/40 px-3 py-1 text-xs text-ink-200"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function fmtKpi(metric: string, val: number): string {
  const m = metric.toLowerCase();
  if (m.includes("revenue") || m.includes("mrr") || m.includes("arr") || m.includes("usd"))
    return formatCurrency(val);
  if (m.includes("rate") || m.includes("%")) return `${val.toFixed(1)}%`;
  return formatNumberCompact(val);
}
