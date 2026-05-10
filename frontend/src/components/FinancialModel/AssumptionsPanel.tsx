/**
 * AssumptionsPanel — collapsible inspector that shows every assumption value
 * with its source (LLM-suggested vs user-edited) and a per-key reset button.
 *
 * Used as a "what's powering this model" drill-in next to the chart. Saves
 * users from squinting at slider readouts.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, RotateCcw, Sparkles, User } from "lucide-react";
import { type FinanceAssumptions } from "../../lib/financeEngineClient";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface AssumptionsPanelProps {
  current: FinanceAssumptions;
  llm: Partial<FinanceAssumptions>;
  onChange: (next: FinanceAssumptions) => void;
  className?: string;
  defaultOpen?: boolean;
}

const LABELS: Record<keyof FinanceAssumptions, string> = {
  pricing_usd_monthly: "Avg price / mo",
  cac_usd: "CAC",
  monthly_churn_pct: "Monthly churn",
  initial_paying_customers: "Starting customers",
  monthly_growth_rate_pct: "Monthly growth",
  starting_headcount: "Starting headcount",
  fully_loaded_salary_usd: "Loaded salary",
  gross_margin_pct: "Gross margin",
  seed_amount_usd: "Seed",
  monthly_other_opex_usd: "Other OpEx / mo",
  projection_years: "Projection years",
};

const FORMAT: Record<keyof FinanceAssumptions, (v: number) => string> = {
  pricing_usd_monthly: (v) => `$${v.toFixed(0)}`,
  cac_usd: (v) => `$${v.toFixed(0)}`,
  monthly_churn_pct: (v) => `${v.toFixed(1)}%`,
  initial_paying_customers: (v) => `${Math.round(v)}`,
  monthly_growth_rate_pct: (v) => `${v.toFixed(1)}%`,
  starting_headcount: (v) => `${Math.round(v)}`,
  fully_loaded_salary_usd: (v) => `$${(v / 1000).toFixed(0)}K`,
  gross_margin_pct: (v) => `${v.toFixed(0)}%`,
  seed_amount_usd: (v) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${(v / 1000).toFixed(0)}K`,
  monthly_other_opex_usd: (v) => `$${(v / 1000).toFixed(1)}K`,
  projection_years: (v) => `${Math.round(v)}`,
};

export function AssumptionsPanel({
  current,
  llm,
  onChange,
  className,
  defaultOpen = false,
}: AssumptionsPanelProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const keys = Object.keys(LABELS) as (keyof FinanceAssumptions)[];

  return (
    <section
      aria-label="Assumptions"
      className={cn(
        "rounded-2xl border border-ink-800 bg-ink-900/40",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="assumptions-panel-body"
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl px-4 py-3 text-left hover:bg-ink-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <div>
          <h2 className="font-display text-sm font-medium text-ink-100">Assumptions</h2>
          <p className="text-[11px] uppercase tracking-widest text-ink-500">
            What the engine consumes — every input, with its source
          </p>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="assumptions-panel-body"
            key="body"
            layout
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden"
          >
            <ul className="grid grid-cols-1 gap-px bg-ink-800 sm:grid-cols-2">
              {keys.map((k) => {
                const value = current[k];
                const llmValue = llm[k];
                const edited = llmValue != null && Math.abs(llmValue - value) > 1e-6;
                return (
                  <li
                    key={k}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-2 bg-ink-900/40 px-4 py-2 text-[12.5px]"
                  >
                    <div className="grid gap-0.5 min-w-0">
                      <span className="truncate font-medium text-ink-200">{LABELS[k]}</span>
                      <span
                        className={cn(
                          "grid grid-cols-[12px_1fr] items-center gap-1 text-[10.5px] uppercase tracking-widest",
                          edited ? "text-amber-300" : "text-ink-500",
                        )}
                      >
                        {edited ? <User size={10} /> : <Sparkles size={10} />}
                        {edited ? "User edited" : "LLM suggested"}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-ink-50">
                      {FORMAT[k](value)}
                    </span>
                    <button
                      type="button"
                      disabled={!edited || llmValue == null}
                      onClick={() => llmValue != null && onChange({ ...current, [k]: llmValue })}
                      className="grid grid-cols-[14px_auto] items-center gap-1 rounded-md border border-ink-800 bg-ink-900 px-2 py-1 text-[11px] text-ink-300 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Reset ${LABELS[k]} to LLM value`}
                    >
                      <RotateCcw size={11} />
                      Reset
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
