/**
 * ScenarioSliders — Radix Slider wrappers for every assumption key.
 *
 * Each row: label, numeric readout (tabular-nums), Radix Slider with
 * keyboard support (`arrows`, `home/end`, `page up/down`), and an optional
 * "vs base" delta chip when the value diverges from the base preset.
 *
 * The component is fully controlled: parent owns FinanceAssumptions state.
 */
import { useCallback, useId } from "react";
import * as Slider from "@radix-ui/react-slider";
import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import {
  DEFAULT_BOUNDS,
  type FinanceAssumptions,
} from "../../lib/financeEngineClient";
import { BASE, diffVsBase } from "../../lib/financePresets";
import { PresetChips } from "./PresetChips";
import type { PresetName } from "../../lib/financePresets";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface ScenarioSlidersProps {
  assumptions: FinanceAssumptions;
  /** Which preset (if any) is currently matched. "custom" if none. */
  activePreset: PresetName | "custom";
  onChange: (next: FinanceAssumptions) => void;
  onPreset: (name: PresetName) => void;
  /** Per-key reset to LLM-suggested initial value. */
  llmAssumptions?: Partial<FinanceAssumptions>;
  className?: string;
}

interface SliderSpec {
  key: keyof FinanceAssumptions;
  label: string;
  description?: string;
  format: (v: number) => string;
  /** Override of default bounds. */
  min?: number;
  max?: number;
  step?: number;
}

const fmtCurrency = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 10_000) return `$${(v / 1000).toFixed(0)}K`;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtInt = (v: number) => `${Math.round(v).toLocaleString()}`;
const fmtYears = (v: number) => `${Math.round(v)} yr`;

const SLIDER_SPECS: SliderSpec[] = [
  {
    key: "pricing_usd_monthly",
    label: "Average price",
    description: "ARPU per active customer / month",
    format: fmtCurrency,
  },
  {
    key: "initial_paying_customers",
    label: "Starting customers",
    description: "Paying customers on day zero",
    format: fmtInt,
  },
  {
    key: "monthly_growth_rate_pct",
    label: "Monthly growth",
    description: "New-customer compounding rate",
    format: fmtPct,
  },
  {
    key: "monthly_churn_pct",
    label: "Monthly churn",
    description: "Logo churn — % of customers lost each month",
    format: fmtPct,
  },
  {
    key: "cac_usd",
    label: "CAC",
    description: "Fully-loaded customer acquisition cost",
    format: fmtCurrency,
  },
  {
    key: "gross_margin_pct",
    label: "Gross margin",
    description: "Revenue minus COGS, %",
    format: fmtPct,
  },
  {
    key: "starting_headcount",
    label: "Starting headcount",
    description: "Full-time team on day zero",
    format: fmtInt,
  },
  {
    key: "fully_loaded_salary_usd",
    label: "Loaded salary (avg)",
    description: "Salary + benefits + taxes per FTE",
    format: fmtCurrency,
  },
  {
    key: "monthly_other_opex_usd",
    label: "Other monthly OpEx",
    description: "Tools, marketing, infra, rent, etc.",
    format: fmtCurrency,
  },
  {
    key: "seed_amount_usd",
    label: "Seed funding",
    description: "Cash on hand at start",
    format: fmtCurrency,
  },
  {
    key: "projection_years",
    label: "Projection years",
    description: "Range of P&L forecast",
    format: fmtYears,
  },
];

export function ScenarioSliders({
  assumptions,
  activePreset,
  onChange,
  onPreset,
  llmAssumptions,
  className,
}: ScenarioSlidersProps): JSX.Element {
  const handleChange = useCallback(
    (key: keyof FinanceAssumptions, value: number) => {
      onChange({ ...assumptions, [key]: value } as FinanceAssumptions);
    },
    [assumptions, onChange],
  );

  const deltas = diffVsBase(assumptions);

  return (
    <section
      aria-label="Scenario sliders"
      className={cn(
        "grid gap-4 rounded-2xl border border-ink-800 bg-ink-900/40 p-5",
        className,
      )}
    >
      <header className="grid grid-cols-[1fr_auto] items-center gap-3">
        <div>
          <h2 className="font-display text-sm font-medium text-ink-100">Scenario</h2>
          <p className="text-[11px] uppercase tracking-widest text-ink-500">
            Adjust assumptions — model recomputes live
          </p>
        </div>
        <PresetChips active={activePreset} onSelect={onPreset} />
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SLIDER_SPECS.map((spec) => {
          const bounds = {
            ...DEFAULT_BOUNDS[spec.key],
            ...(spec.min !== undefined ? { min: spec.min } : {}),
            ...(spec.max !== undefined ? { max: spec.max } : {}),
            ...(spec.step !== undefined ? { step: spec.step } : {}),
          };
          const value = assumptions[spec.key] as number;
          const delta = deltas[spec.key] ?? 0;
          const llmValue = llmAssumptions?.[spec.key] as number | undefined;
          return (
            <SliderRow
              key={spec.key}
              label={spec.label}
              description={spec.description}
              value={value}
              min={bounds.min}
              max={bounds.max}
              step={bounds.step}
              format={spec.format}
              deltaPct={delta}
              llmValue={llmValue}
              onChange={(v) => handleChange(spec.key, v)}
            />
          );
        })}
      </div>
    </section>
  );
}

interface SliderRowProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  deltaPct: number;
  llmValue?: number;
  onChange: (next: number) => void;
}

function SliderRow({
  label,
  description,
  value,
  min,
  max,
  step,
  format,
  deltaPct,
  llmValue,
  onChange,
}: SliderRowProps): JSX.Element {
  const id = useId();
  const showDelta = Math.abs(deltaPct) > 0.5;
  const canResetToLLM =
    typeof llmValue === "number" && Math.abs(llmValue - value) > step / 2;
  return (
    <motion.div
      layout
      transition={SPRING}
      className="grid gap-2 rounded-xl border border-ink-800 bg-ink-950/50 p-3"
    >
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-2">
        <label
          htmlFor={id}
          className="font-display text-[12.5px] font-medium text-ink-100"
        >
          {label}
        </label>
        <span className="font-mono text-[13px] tabular-nums text-ink-50">{format(value)}</span>
      </div>
      <Slider.Root
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
        className="relative flex h-5 w-full touch-none select-none items-center"
        aria-label={label}
        aria-valuetext={format(value)}
      >
        <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-ink-800">
          <Slider.Range className="absolute h-full rounded-full bg-accent/70" />
        </Slider.Track>
        <Slider.Thumb
          className={cn(
            "block h-4 w-4 rounded-full border border-accent bg-ink-50 shadow-[0_0_0_2px_rgba(255,90,31,0.18)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
          )}
        />
      </Slider.Root>
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-[10.5px]">
        <p className="text-ink-500">
          {description ?? "—"}
        </p>
        <div className="flex items-center gap-1">
          {showDelta && (
            <span
              className={cn(
                "rounded-full border px-1.5 py-px font-mono tabular-nums",
                deltaPct > 0
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300",
              )}
            >
              {deltaPct > 0 ? "+" : ""}
              {deltaPct.toFixed(0)}% vs base
            </span>
          )}
          {canResetToLLM && (
            <button
              type="button"
              onClick={() => onChange(llmValue!)}
              className="grid grid-cols-[auto_1fr] items-center gap-1 rounded-md border border-ink-800 bg-ink-900 px-1.5 py-px text-[10px] text-ink-300 hover:bg-ink-800"
              title={`Reset to LLM-suggested ${format(llmValue!)}`}
              aria-label={`Reset ${label} to LLM-suggested value`}
            >
              <RotateCcw size={9} />
              LLM
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Re-export base for tests + parent. */
export { BASE };
