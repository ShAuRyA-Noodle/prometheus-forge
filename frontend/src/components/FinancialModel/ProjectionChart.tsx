/**
 * ProjectionChart — Recharts ComposedChart of FinancialModelResult.projections.
 *
 * Areas:
 *   - revenue (gradient accent)
 *   - gross_profit (lighter accent)
 * Lines:
 *   - cash (ink-200)
 *   - ebitda (success / danger depending on sign)
 *
 * Vertical reference line at breakeven_month — dashed accent.
 * Hover tooltip uses tabular-nums + brand-colored swatches.
 */
import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FinancialModelResult } from "../../types/agents";
import { formatCurrency } from "../DataPoint";
import { cn } from "../../lib/cn";

export interface ProjectionChartProps {
  result: FinancialModelResult;
  /** Optional brand accent — used to colour the revenue area. */
  accentColor?: string;
  height?: number;
  className?: string;
}

interface ChartRow {
  year: number;
  revenue: number;
  gross_profit: number;
  ebitda: number;
  cash: number;
  headcount: number;
}

export function ProjectionChart({
  result,
  accentColor = "#FF5A1F",
  height = 320,
  className,
}: ProjectionChartProps): JSX.Element {
  const data = useMemo<ChartRow[]>(
    () =>
      result.projections.map((p) => ({
        year: p.year,
        revenue: p.revenue_usd,
        gross_profit: p.gross_profit_usd,
        ebitda: p.ebitda_usd,
        cash: p.cash_usd,
        headcount: p.headcount,
      })),
    [result.projections],
  );

  const breakevenYear = useMemo(() => {
    if (result.breakeven_month == null) return null;
    return Math.ceil(result.breakeven_month / 12);
  }, [result.breakeven_month]);

  return (
    <div
      aria-label="Financial projection chart"
      className={cn(
        "rounded-2xl border border-ink-800 bg-ink-900/40 p-4",
        className,
      )}
    >
      <header className="mb-2 grid grid-cols-[1fr_auto] items-baseline gap-2">
        <div>
          <h2 className="font-display text-sm font-medium text-ink-100">Projections</h2>
          <p className="text-[11px] uppercase tracking-widest text-ink-500">
            {data.length}-year P&amp;L · cash · EBITDA
          </p>
        </div>
        {breakevenYear != null && (
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
            Breakeven · Y{breakevenYear}
          </span>
        )}
      </header>
      <div style={{ width: "100%", height }} className="font-mono">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="pm-rev-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity={0.55} />
                <stop offset="100%" stopColor={accentColor} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="pm-gp-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity={0.28} />
                <stop offset="100%" stopColor={accentColor} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#27272A" strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fill: "#A1A1AA", fontSize: 11 }}
              tickFormatter={(v: number) => `Y${v}`}
              tickLine={false}
              axisLine={{ stroke: "#27272A" }}
            />
            <YAxis
              tick={{ fill: "#A1A1AA", fontSize: 11 }}
              tickFormatter={(v: number) => formatCurrency(v)}
              tickLine={false}
              axisLine={{ stroke: "#27272A" }}
              width={60}
            />
            <Tooltip
              cursor={{ stroke: "#3F3F46", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={<ChartTooltip />}
            />
            <Legend
              iconSize={8}
              wrapperStyle={{ paddingTop: 6, color: "#A1A1AA", fontSize: 11 }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              fill="url(#pm-rev-grad)"
              stroke={accentColor}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="gross_profit"
              name="Gross profit"
              fill="url(#pm-gp-grad)"
              stroke={accentColor}
              strokeOpacity={0.6}
              strokeWidth={1.4}
              strokeDasharray="2 3"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="cash"
              name="Cash"
              stroke="#E4E4E7"
              strokeWidth={2}
              dot={{ r: 3, stroke: "#E4E4E7", strokeWidth: 1, fill: "#09090B" }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ebitda"
              name="EBITDA"
              stroke="#16A34A"
              strokeWidth={2}
              dot={{ r: 3, stroke: "#16A34A", strokeWidth: 1, fill: "#09090B" }}
              isAnimationActive={false}
            />
            {breakevenYear != null && (
              <ReferenceLine
                x={breakevenYear}
                stroke={accentColor}
                strokeDasharray="3 3"
                label={{
                  value: "Breakeven",
                  fill: accentColor,
                  fontSize: 10,
                  position: "top",
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface TooltipPayloadEntry {
  dataKey: string;
  name: string;
  value: number;
  color: string;
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipPayloadEntry[];
}

function ChartTooltip({ active, label, payload }: TooltipProps): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-ink-700/80 bg-ink-900/95 px-3 py-2 text-xs text-ink-100 shadow-bento backdrop-blur">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-ink-400">Year {label}</div>
      <ul className="grid gap-1">
        {payload.map((p) => (
          <li key={p.dataKey} className="grid grid-cols-[10px_1fr_auto] items-center gap-2">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-ink-300">{p.name}</span>
            <span className="font-mono tabular-nums text-ink-50">{formatCurrency(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
