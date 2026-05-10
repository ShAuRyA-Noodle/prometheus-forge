/**
 * SensitivityTable — 2-axis sensitivity heatmap. User picks two axes (e.g.
 * CAC vs churn) and a target metric (breakeven_month or LTV/CAC). The cells
 * are colored on a green→amber→red gradient.
 *
 * Computes locally via a closed-form approximation rather than calling the
 * server engine for every cell — that's prohibitively slow for a 7×7 grid.
 * The result is a directional read; the canonical value still comes from
 * `/api/finance/recompute`.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import type { FinanceAssumptions } from "../../lib/financeEngineClient";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

type AxisKey =
  | "monthly_growth_rate_pct"
  | "monthly_churn_pct"
  | "cac_usd"
  | "pricing_usd_monthly"
  | "gross_margin_pct";

type Metric = "breakeven_month" | "ltv_cac" | "arr_year_3";

const AXIS_LABEL: Record<AxisKey, string> = {
  monthly_growth_rate_pct: "Growth %",
  monthly_churn_pct: "Churn %",
  cac_usd: "CAC ($)",
  pricing_usd_monthly: "ARPU ($)",
  gross_margin_pct: "Gross margin %",
};

const METRIC_LABEL: Record<Metric, string> = {
  breakeven_month: "Breakeven month",
  ltv_cac: "LTV / CAC",
  arr_year_3: "ARR · year 3",
};

export interface SensitivityTableProps {
  base: FinanceAssumptions;
  className?: string;
}

const AXIS_OFFSETS: Record<AxisKey, number[]> = {
  monthly_growth_rate_pct: [-6, -4, -2, 0, 2, 4, 6],
  monthly_churn_pct: [-2, -1.2, -0.5, 0, 0.5, 1.2, 2],
  cac_usd: [-100, -60, -25, 0, 25, 60, 100],
  pricing_usd_monthly: [-30, -15, -5, 0, 5, 15, 30],
  gross_margin_pct: [-12, -7, -3, 0, 3, 7, 12],
};

/** Quick closed-form approximations. Not authoritative — directional only. */
function approxLTV(a: FinanceAssumptions): number {
  const churn = Math.max(0.1, a.monthly_churn_pct) / 100;
  return (a.pricing_usd_monthly * (a.gross_margin_pct / 100)) / churn;
}

function approxBreakeven(a: FinanceAssumptions): number {
  const grossMonthly0 =
    a.initial_paying_customers * a.pricing_usd_monthly * (a.gross_margin_pct / 100);
  const opex =
    (a.starting_headcount * a.fully_loaded_salary_usd) / 12 + a.monthly_other_opex_usd;
  const growth = a.monthly_growth_rate_pct / 100;
  if (grossMonthly0 >= opex) return 1;
  if (growth <= 0) return Infinity;
  // months until grossMonthly0 * (1+g)^t >= opex
  return Math.ceil(Math.log(opex / grossMonthly0) / Math.log(1 + growth));
}

function approxARRYear3(a: FinanceAssumptions): number {
  const startingARR = a.initial_paying_customers * a.pricing_usd_monthly * 12;
  const monthly = a.monthly_growth_rate_pct / 100;
  const churn = a.monthly_churn_pct / 100;
  const net = monthly - churn;
  const months = 36;
  return startingARR * Math.pow(1 + Math.max(-0.1, net), months);
}

function compute(a: FinanceAssumptions, metric: Metric): number {
  switch (metric) {
    case "breakeven_month":
      return approxBreakeven(a);
    case "ltv_cac":
      return approxLTV(a) / Math.max(1, a.cac_usd);
    case "arr_year_3":
      return approxARRYear3(a);
  }
}

function colorScale(value: number, min: number, max: number, lowerBetter: boolean): string {
  if (!isFinite(value)) return "rgba(244, 63, 94, 0.18)"; // rose-400/18 — out of bounds
  if (max === min) return "rgba(255, 90, 31, 0.16)";
  const norm = (value - min) / (max - min);
  const t = lowerBetter ? norm : 1 - norm;
  // green → amber → red
  if (t < 0.5) {
    const k = t / 0.5;
    return `rgba(16, 185, 129, ${0.32 - 0.16 * k})`;
  }
  const k = (t - 0.5) / 0.5;
  return `rgba(${244 + (244 - 244) * k}, ${63 + (115 - 63) * (1 - k)}, ${94 + (22 - 94) * (1 - k)}, ${0.16 + 0.18 * k})`;
}

export function SensitivityTable({ base, className }: SensitivityTableProps): JSX.Element {
  const [xAxis, setXAxis] = useState<AxisKey>("cac_usd");
  const [yAxis, setYAxis] = useState<AxisKey>("monthly_churn_pct");
  const [metric, setMetric] = useState<Metric>("breakeven_month");

  const xOffsets = AXIS_OFFSETS[xAxis];
  const yOffsets = AXIS_OFFSETS[yAxis];
  const lowerBetter = metric === "breakeven_month";

  const grid = useMemo(() => {
    const cells: { x: number; y: number; value: number }[][] = [];
    for (const dy of yOffsets) {
      const row: { x: number; y: number; value: number }[] = [];
      for (const dx of xOffsets) {
        const a: FinanceAssumptions = {
          ...base,
          [xAxis]: Math.max(0.001, (base[xAxis] as number) + dx),
          [yAxis]: Math.max(0.001, (base[yAxis] as number) + dy),
        };
        row.push({ x: a[xAxis] as number, y: a[yAxis] as number, value: compute(a, metric) });
      }
      cells.push(row);
    }
    return cells;
  }, [base, xAxis, yAxis, metric, xOffsets, yOffsets]);

  const flat = grid.flat().map((c) => c.value).filter((v) => Number.isFinite(v));
  const min = Math.min(...flat);
  const max = Math.max(...flat);

  const formatCell = (v: number): string => {
    if (!Number.isFinite(v)) return "∞";
    if (metric === "breakeven_month") return `${Math.round(v)}m`;
    if (metric === "ltv_cac") return `${v.toFixed(1)}×`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <section
      aria-label="Sensitivity heatmap"
      className={cn(
        "rounded-2xl border border-ink-800 bg-ink-900/40 p-4",
        className,
      )}
    >
      <header className="mb-3 grid grid-cols-[1fr_auto] items-center gap-2">
        <div>
          <h2 className="font-display text-sm font-medium text-ink-100">Sensitivity</h2>
          <p className="text-[11px] uppercase tracking-widest text-ink-500">
            Directional — full precision via recompute
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AxisPicker label="X" value={xAxis} onChange={setXAxis} />
          <AxisPicker label="Y" value={yAxis} onChange={setYAxis} />
          <MetricPicker value={metric} onChange={setMetric} />
        </div>
      </header>
      <motion.div
        layout
        transition={SPRING}
        className="overflow-x-auto rounded-xl border border-ink-800 bg-ink-950"
      >
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border-b border-r border-ink-800 px-2 py-1.5 text-left uppercase tracking-widest text-ink-500">
                {AXIS_LABEL[yAxis]} \ {AXIS_LABEL[xAxis]}
              </th>
              {grid[0]?.map((cell, i) => (
                <th
                  key={`x-${i}`}
                  className="border-b border-l border-ink-800 px-2 py-1.5 text-right font-mono tabular-nums text-ink-400"
                >
                  {formatAxis(xAxis, cell.x)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, ri) => (
              <tr key={`row-${ri}`}>
                <th
                  scope="row"
                  className="border-r border-ink-800 px-2 py-1.5 text-left font-mono tabular-nums text-ink-400"
                >
                  {formatAxis(yAxis, row[0]?.y ?? 0)}
                </th>
                {row.map((cell, ci) => (
                  <td
                    key={`c-${ri}-${ci}`}
                    className="border-l border-t border-ink-900 px-2 py-1.5 text-right font-mono tabular-nums text-ink-100"
                    style={{ backgroundColor: colorScale(cell.value, min, max, lowerBetter) }}
                    title={`${AXIS_LABEL[yAxis]}=${formatAxis(yAxis, cell.y)} · ${AXIS_LABEL[xAxis]}=${formatAxis(xAxis, cell.x)}`}
                  >
                    {formatCell(cell.value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
      <p className="mt-2 text-[11px] text-ink-500">
        Showing <span className="text-ink-200">{METRIC_LABEL[metric]}</span> ·
        green is better, red is worse.
      </p>
    </section>
  );
}

function formatAxis(axis: AxisKey, v: number): string {
  if (axis === "cac_usd" || axis === "pricing_usd_monthly") return `$${Math.round(v)}`;
  if (axis === "gross_margin_pct") return `${v.toFixed(0)}%`;
  return `${v.toFixed(1)}%`;
}

function AxisPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AxisKey;
  onChange: (v: AxisKey) => void;
}): JSX.Element {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2 py-1 text-[11px] text-ink-200 hover:bg-ink-800"
        >
          <span className="text-ink-500">{label}:</span>
          <span>{AXIS_LABEL[value]}</span>
          <ChevronDown size={10} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 w-44 rounded-xl border border-ink-700/80 bg-ink-900/95 p-1 text-xs text-ink-100 shadow-bento backdrop-blur"
        >
          {(Object.keys(AXIS_LABEL) as AxisKey[]).map((k) => (
            <DropdownMenu.Item
              key={k}
              onSelect={() => onChange(k)}
              className="cursor-pointer rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-ink-800"
            >
              {AXIS_LABEL[k]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MetricPicker({
  value,
  onChange,
}: {
  value: Metric;
  onChange: (v: Metric) => void;
}): JSX.Element {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2 py-1 text-[11px] text-ink-200 hover:bg-ink-800"
        >
          <span className="text-ink-500">Metric:</span>
          <span>{METRIC_LABEL[value]}</span>
          <ChevronDown size={10} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 w-44 rounded-xl border border-ink-700/80 bg-ink-900/95 p-1 text-xs text-ink-100 shadow-bento backdrop-blur"
        >
          {(Object.keys(METRIC_LABEL) as Metric[]).map((k) => (
            <DropdownMenu.Item
              key={k}
              onSelect={() => onChange(k)}
              className="cursor-pointer rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-ink-800"
            >
              {METRIC_LABEL[k]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
