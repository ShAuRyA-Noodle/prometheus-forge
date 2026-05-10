/**
 * CompetitiveView — competitor cards, feature matrix, positioning gaps.
 *
 * Hard rule: when `data_disclosed = false` show "Not disclosed" muted instead
 * of inventing numbers.
 */
import { motion } from "framer-motion";
import { Check, ExternalLink, Minus, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { DataPoint } from "./DataPoint";
import type { CompetitiveAnalysisResult, CompetitorEntry } from "@/types/agents";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface CompetitiveViewProps {
  competition: CompetitiveAnalysisResult;
  className?: string;
}

const CONCENTRATION_TINT: Record<CompetitiveAnalysisResult["market_concentration"], string> = {
  fragmented: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  moderate: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  concentrated: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  monopolized: "bg-red-500/15 text-red-300 border-red-500/30",
};

export function CompetitiveView({ competition, className }: CompetitiveViewProps): JSX.Element {
  return (
    <section className={cn("grid gap-6", className)} aria-label="Competitive analysis">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-wider",
            CONCENTRATION_TINT[competition.market_concentration],
          )}
        >
          Market: {competition.market_concentration}
        </span>
        <span className="text-xs text-ink-400">
          {competition.competitors.length} competitors mapped
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {competition.competitors.map((c, i) => (
          <CompetitorCard key={c.name + i} c={c} index={i} />
        ))}
      </div>

      {/* Feature matrix */}
      {Object.keys(competition.feature_matrix).length > 0 && (
        <FeatureMatrix matrix={competition.feature_matrix} />
      )}

      {/* Positioning gaps */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="grid gap-3 rounded-bento border border-accent-500/30 bg-accent-500/5 p-5"
      >
        <span className="text-[11px] uppercase tracking-widest text-accent-500">
          Positioning gaps
        </span>
        <ul className="grid gap-2">
          {competition.positioning_gaps.map((g, i) => (
            <li key={i} className="grid grid-cols-[auto_1fr] items-start gap-2 text-sm text-ink-100">
              <span className="mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent-500/30 text-[9px] font-bold text-accent-500">
                ✦
              </span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}

function CompetitorCard({ c, index }: { c: CompetitorEntry; index: number }): JSX.Element {
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: index * 0.03 }}
      className="grid gap-3 rounded-bento border border-ink-800 bg-ink-900/40 p-4 shadow-bento"
    >
      <header className="grid grid-cols-[1fr_auto] items-start gap-2">
        <div className="grid gap-0.5">
          <h3 className="font-display text-lg text-ink-50">{c.name}</h3>
          {c.url && (
            <a
              href={String(c.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-ink-400 hover:text-accent-500"
            >
              {new URL(String(c.url)).hostname} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </header>

      <p className="line-clamp-3 text-sm text-ink-300">{c.description}</p>

      {c.data_disclosed ? (
        <div className="grid grid-cols-3 gap-2 border-t border-ink-800 pt-2">
          {c.funding ? (
            <DataPoint point={c.funding} label="Funding" size="sm" />
          ) : (
            <NoData label="Funding" />
          )}
          {c.revenue ? (
            <DataPoint point={c.revenue} label="Revenue" size="sm" />
          ) : (
            <NoData label="Revenue" />
          )}
          {c.employee_count ? (
            <DataPoint point={c.employee_count} label="Employees" size="sm" />
          ) : (
            <NoData label="Employees" />
          )}
        </div>
      ) : (
        <p className="rounded-md border border-ink-800/70 bg-ink-950/50 px-2.5 py-1.5 text-[11px] text-ink-500">
          Financials not publicly disclosed.
        </p>
      )}

      {(c.strengths.length > 0 || c.weaknesses.length > 0) && (
        <div className="grid gap-2 border-t border-ink-800/60 pt-2 sm:grid-cols-2">
          {c.strengths.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-emerald-400">Strengths</span>
              <ul className="mt-1 grid gap-0.5 text-[12px] text-ink-300">
                {c.strengths.slice(0, 3).map((s, i) => (
                  <li key={i} className="grid grid-cols-[auto_1fr] gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 text-emerald-400" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.weaknesses.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-red-400">Weaknesses</span>
              <ul className="mt-1 grid gap-0.5 text-[12px] text-ink-300">
                {c.weaknesses.slice(0, 3).map((w, i) => (
                  <li key={i} className="grid grid-cols-[auto_1fr] gap-1.5">
                    <X className="mt-0.5 h-3 w-3 text-red-400" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </motion.article>
  );
}

function NoData({ label }: { label: string }): JSX.Element {
  return (
    <div className="grid gap-1">
      <span className="text-[10px] uppercase tracking-wider text-ink-500">{label}</span>
      <span className="inline-flex items-center gap-1 text-xs text-ink-500">
        <Minus className="h-3 w-3" /> Not disclosed
      </span>
    </div>
  );
}

function FeatureMatrix({
  matrix,
}: {
  matrix: Record<string, Record<string, boolean | string>>;
}): JSX.Element {
  const competitors = Object.keys(matrix);
  const features = Array.from(
    new Set(competitors.flatMap((c) => Object.keys(matrix[c] ?? {}))),
  );
  return (
    <div className="overflow-x-auto rounded-bento border border-ink-800 bg-ink-900/30 p-1">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[12px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-ink-900/80 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-ink-500">
              Feature
            </th>
            {competitors.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-ink-300"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.map((f) => (
            <tr key={f}>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-ink-900/60 px-3 py-2 text-left font-medium text-ink-200"
              >
                {f}
              </th>
              {competitors.map((c) => {
                const cell = matrix[c]?.[f];
                return (
                  <td key={c + f} className="border-t border-ink-800 px-3 py-2 text-ink-300">
                    {typeof cell === "boolean" ? (
                      cell ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-ink-600" />
                      )
                    ) : typeof cell === "string" ? (
                      cell
                    ) : (
                      <span className="text-ink-600">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
