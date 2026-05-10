/**
 * RiskMatrixView — 3×3 probability × impact heatmap + risk cards bucketed,
 * regulatory considerations by jurisdiction, worst-case + pivot options.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, GitBranch } from "lucide-react";

import { cn } from "@/lib/cn";
import type { RiskAnalysisResult, RiskEntry } from "@/types/agents";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

const PROB: RiskEntry["probability"][] = ["low", "medium", "high"];
const IMPACT: RiskEntry["impact"][] = ["low", "medium", "high"];

const CATEGORY_LABEL: Record<RiskEntry["category"], string> = {
  market: "Market",
  execution: "Execution",
  regulatory: "Regulatory",
  technical: "Technical",
  financial: "Financial",
  team: "Team",
  ip: "IP",
  macro: "Macro",
};

interface RiskMatrixViewProps {
  risk: RiskAnalysisResult;
  className?: string;
}

function cellTint(p: RiskEntry["probability"], i: RiskEntry["impact"]): string {
  const score =
    (p === "low" ? 1 : p === "medium" ? 2 : 3) *
    (i === "low" ? 1 : i === "medium" ? 2 : 3);
  if (score >= 6) return "bg-red-500/20 text-red-100 border-red-500/40";
  if (score >= 4) return "bg-amber-500/15 text-amber-100 border-amber-500/30";
  return "bg-emerald-500/10 text-emerald-100 border-emerald-500/30";
}

export function RiskMatrixView({ risk, className }: RiskMatrixViewProps): JSX.Element {
  const grid = useMemo(() => {
    const m: Record<string, RiskEntry[]> = {};
    for (const p of PROB) {
      for (const i of IMPACT) {
        m[`${p}_${i}`] = [];
      }
    }
    for (const r of risk.risk_matrix) {
      m[`${r.probability}_${r.impact}`]?.push(r);
    }
    return m;
  }, [risk]);

  return (
    <section className={cn("grid gap-6", className)} aria-label="Risk analysis">
      {/* Heatmap */}
      <div className="grid gap-2">
        <span className="text-[11px] uppercase tracking-widest text-ink-500">
          Probability × Impact
        </span>
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-1.5">
          <div />
          {IMPACT.map((i) => (
            <div
              key={i}
              className="px-2 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-500"
            >
              Impact {i}
            </div>
          ))}
          {PROB.slice()
            .reverse()
            .map((p) => (
              <div key={p} className="contents">
                <div className="grid place-items-center text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  Prob {p}
                </div>
                {IMPACT.map((i) => {
                  const cell = grid[`${p}_${i}`] ?? [];
                  return (
                    <motion.div
                      key={`${p}_${i}`}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={SPRING}
                      className={cn(
                        "min-h-[88px] rounded-2xl border p-2 transition",
                        cellTint(p, i),
                        cell.length === 0 && "opacity-40",
                      )}
                    >
                      <div className="grid gap-1">
                        {cell.length > 0 ? (
                          cell.map((r, k) => (
                            <div
                              key={k}
                              className="rounded bg-ink-950/40 px-1.5 py-0.5 text-[10.5px]"
                              title={r.description}
                            >
                              {CATEGORY_LABEL[r.category]}
                            </div>
                          ))
                        ) : (
                          <span className="text-[10px] text-current/60">—</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ))}
        </div>
      </div>

      {/* Detailed risks */}
      <div className="grid gap-2">
        <span className="text-[11px] uppercase tracking-widest text-ink-500">Risk register</span>
        <div className="grid gap-2 md:grid-cols-2">
          {risk.risk_matrix.map((r, i) => (
            <article
              key={i}
              className="grid gap-2 rounded-2xl border border-ink-800 bg-ink-900/40 p-3"
            >
              <header className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-300">
                  {CATEGORY_LABEL[r.category]}
                </span>
                <span className={cn("text-[10px] font-mono", labelColor(r.probability))}>
                  P:{r.probability}
                </span>
                <span className={cn("text-[10px] font-mono", labelColor(r.impact))}>
                  I:{r.impact}
                </span>
              </header>
              <p className="text-[13px] leading-snug text-ink-200">{r.description}</p>
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 text-[12px] text-emerald-100">
                <span className="text-[10px] uppercase tracking-wider text-emerald-300">
                  Mitigation
                </span>
                <p className="mt-0.5 leading-snug">{r.mitigation}</p>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Worst case + pivots */}
      <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="grid gap-2 rounded-bento border border-red-500/30 bg-red-500/5 p-5"
        >
          <span className="grid grid-cols-[auto_1fr] items-center gap-2 text-[11px] uppercase tracking-widest text-red-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Worst-case scenario
          </span>
          <p className="text-sm text-red-100/90">{risk.worst_case_scenario}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0.04 }}
          className="grid gap-2 rounded-bento border border-accent-500/30 bg-accent-500/5 p-5"
        >
          <span className="grid grid-cols-[auto_1fr] items-center gap-2 text-[11px] uppercase tracking-widest text-accent-500">
            <GitBranch className="h-3.5 w-3.5" />
            Pivot options
          </span>
          <ul className="grid gap-1.5">
            {risk.pivot_options.map((p, i) => (
              <li key={i} className="grid grid-cols-[auto_1fr] gap-2 text-sm text-ink-100">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-accent-500/30 text-[9px] font-bold text-accent-500">
                  {i + 1}
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* Regulatory by jurisdiction */}
      {Object.keys(risk.regulatory_considerations).length > 0 && (
        <div className="grid gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-500">
            Regulatory by jurisdiction
          </span>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(risk.regulatory_considerations).map(([juris, items]) => (
              <article
                key={juris}
                className="grid gap-2 rounded-2xl border border-ink-800 bg-ink-900/40 p-3"
              >
                <header className="font-display text-sm text-ink-100">{juris}</header>
                <ul className="grid gap-1 text-[12px] text-ink-300">
                  {items.map((it, i) => (
                    <li key={i} className="grid grid-cols-[auto_1fr] gap-1.5">
                      <span className="mt-1 h-1 w-1 rounded-full bg-accent-500/60" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function labelColor(level: "low" | "medium" | "high"): string {
  if (level === "high") return "text-red-300";
  if (level === "medium") return "text-amber-300";
  return "text-emerald-300";
}
