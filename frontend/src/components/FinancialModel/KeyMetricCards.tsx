/**
 * KeyMetricCards — bento grid of investor-facing finance metrics.
 *
 * Each card wraps DataPoint with a derived ConfidenceBadge based on whether
 * the metric was sourced from external benchmark, derived from the
 * deterministic finance engine, or inferred by the LLM.
 *
 * Tile size:
 *   - "lead" (col-span 2 row-span 2) — runway / breakeven
 *   - "wide" (col-span 2)            — LTV/CAC ratio with mini-explanation
 *   - "1x1" — everything else
 */
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";
import type {
  BusinessModelResult,
  FinancialModelResult,
} from "../../types/agents";
import type { DataPoint as DataPointModel } from "../../types/agents";
import { DataPoint, formatCurrency, formatNumberCompact } from "../DataPoint";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface KeyMetricCardsProps {
  finance: FinancialModelResult;
  business?: BusinessModelResult | null;
  className?: string;
}

export function KeyMetricCards({
  finance,
  business,
  className,
}: KeyMetricCardsProps): JSX.Element {
  const metrics = finance.key_metrics ?? {};
  const cac = business?.unit_economics.cac_usd;
  const ltv = business?.unit_economics.ltv_usd;
  const ltvCac = business?.unit_economics.ltv_cac_ratio ?? metrics.ltv_cac_ratio ?? 0;
  const grossMargin = business?.unit_economics.gross_margin_pct;
  const arrYear3 =
    finance.projections[finance.projections.length - 1]?.revenue_usd ?? metrics.arr_year_3 ?? 0;
  const burn = metrics.monthly_burn_usd ?? metrics.burn_monthly_usd ?? 0;
  const ebitdaY3 =
    finance.projections[finance.projections.length - 1]?.ebitda_usd ?? metrics.ebitda_year_3 ?? 0;

  const runwayPoint: DataPointModel = {
    label: "Runway",
    value: finance.runway_months,
    unit: "months",
    confidence: "derived",
    derivation: `seed / monthly burn (${formatCurrency(burn)})`,
  };

  const breakevenPoint: DataPointModel = {
    label: "Breakeven",
    value: finance.breakeven_month != null ? finance.breakeven_month : "—",
    unit: finance.breakeven_month != null ? "months" : null,
    confidence: "derived",
    derivation: "first month where monthly EBITDA ≥ 0",
  };

  const ltvCacPoint: DataPointModel = {
    label: "LTV / CAC",
    value: ltvCac,
    unit: "ratio",
    confidence: ltv && cac ? "derived" : "inferred",
    derivation: ltv && cac ? `${formatCurrency(Number(ltv.value))} / ${formatCurrency(Number(cac.value))}` : null,
  };

  const arrPoint: DataPointModel = {
    label: `ARR · year ${finance.projections[finance.projections.length - 1]?.year ?? "?"}`,
    value: arrYear3,
    unit: "usd",
    confidence: "derived",
    derivation: "final-year revenue from finance engine",
  };

  const burnPoint: DataPointModel = {
    label: "Monthly burn",
    value: burn,
    unit: "usd",
    confidence: "derived",
    derivation: "OpEx − gross profit, monthly average",
  };

  return (
    <section
      aria-label="Key financial metrics"
      className={cn(
        "grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6",
        className,
      )}
    >
      <Card className="col-span-2 row-span-2 p-5" lead>
        <DataPoint point={runwayPoint} size="xl" />
        <p className="mt-2 text-[12px] leading-snug text-ink-400">
          Cash on hand divided by current monthly burn — assumes burn doesn't change.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <Stat
            label="Seed"
            value={formatCurrency(finance.funding_seed_usd)}
            tone="neutral"
          />
          <Stat
            label="Burn / mo"
            value={formatCurrency(burn)}
            tone={burn > 0 ? "negative" : "positive"}
          />
        </div>
      </Card>
      <Card className="col-span-2 p-4" wide>
        <DataPoint point={breakevenPoint} size="lg" />
        <p className="mt-1 text-[11px] text-ink-400">
          Month where revenue covers all costs. Lower = capital-efficient.
        </p>
      </Card>
      <Card className="col-span-2 p-4" wide>
        <DataPoint point={ltvCacPoint} size="lg" />
        <p className="mt-1 text-[11px] text-ink-400">
          {ltvCac >= 3
            ? "Healthy — typically ≥3 for venture-grade SaaS."
            : "Below 3× signals weak unit economics or premature scaling."}
        </p>
      </Card>
      {cac && (
        <Card className="p-4">
          <DataPoint point={cac} size="md" />
        </Card>
      )}
      {ltv && (
        <Card className="p-4">
          <DataPoint point={ltv} size="md" />
        </Card>
      )}
      {grossMargin && (
        <Card className="p-4">
          <DataPoint point={grossMargin} size="md" />
        </Card>
      )}
      <Card className="p-4">
        <DataPoint point={arrPoint} size="md" />
      </Card>
      <Card className="p-4">
        <DataPoint point={burnPoint} size="md" />
      </Card>
      <Card className="p-4">
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
            EBITDA Y{finance.projections[finance.projections.length - 1]?.year ?? "?"}
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-display text-lg font-medium tabular-nums",
                ebitdaY3 >= 0 ? "text-emerald-300" : "text-rose-300",
              )}
            >
              {formatCurrency(ebitdaY3)}
            </span>
            {ebitdaY3 >= 0 ? (
              <TrendingUp size={13} className="text-emerald-300" aria-hidden="true" />
            ) : (
              <TrendingDown size={13} className="text-rose-300" aria-hidden="true" />
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}

function Card({
  children,
  className,
  lead,
  wide,
}: {
  children: React.ReactNode;
  className?: string;
  lead?: boolean;
  wide?: boolean;
}): JSX.Element {
  return (
    <motion.article
      layout
      transition={SPRING}
      className={cn(
        "rounded-2xl border bg-ink-900/40 shadow-bento",
        lead
          ? "border-accent/40 bg-accent/5"
          : wide
            ? "border-ink-800"
            : "border-ink-800",
        className,
      )}
    >
      {children}
    </motion.article>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "positive" | "negative";
}): JSX.Element {
  return (
    <div className="grid gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-widest text-ink-500">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          tone === "negative" && "text-rose-300",
          tone === "positive" && "text-emerald-300",
          tone === "neutral" && "text-ink-50",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export { formatNumberCompact };
