/**
 * financePresets — Conservative / Base / Aggressive scenario seeds for the
 * FinancialModel sliders. Used by PresetChips to snap user to a reasonable
 * starting point. Values are sane defaults for an early-stage SaaS — actual
 * recompute happens server-side via /api/finance/recompute.
 */
import type { FinanceAssumptions } from "./financeEngineClient";

export type PresetName = "conservative" | "base" | "aggressive";

export interface FinancePresetMeta {
  name: PresetName;
  label: string;
  description: string;
  assumptions: FinanceAssumptions;
}

export const BASE: FinanceAssumptions = {
  pricing_usd_monthly: 49,
  cac_usd: 220,
  monthly_churn_pct: 3.2,
  initial_paying_customers: 25,
  monthly_growth_rate_pct: 12,
  starting_headcount: 4,
  fully_loaded_salary_usd: 145_000,
  gross_margin_pct: 78,
  seed_amount_usd: 1_500_000,
  monthly_other_opex_usd: 18_000,
  projection_years: 3,
};

export const CONSERVATIVE: FinanceAssumptions = {
  ...BASE,
  monthly_growth_rate_pct: 6,
  monthly_churn_pct: 5,
  cac_usd: 320,
  initial_paying_customers: 12,
  monthly_other_opex_usd: 22_000,
};

export const AGGRESSIVE: FinanceAssumptions = {
  ...BASE,
  monthly_growth_rate_pct: 22,
  monthly_churn_pct: 1.8,
  cac_usd: 160,
  initial_paying_customers: 60,
  monthly_other_opex_usd: 14_000,
  gross_margin_pct: 84,
};

export const PRESETS: FinancePresetMeta[] = [
  {
    name: "conservative",
    label: "Conservative",
    description: "Slower growth, higher churn — what you'd defend in a downside model.",
    assumptions: CONSERVATIVE,
  },
  {
    name: "base",
    label: "Base",
    description: "Median assumptions calibrated to comparable seed-stage SaaS.",
    assumptions: BASE,
  },
  {
    name: "aggressive",
    label: "Aggressive",
    description: "Top-quartile execution — what you'd show on the upside.",
    assumptions: AGGRESSIVE,
  },
];

export function getPreset(name: PresetName): FinanceAssumptions {
  switch (name) {
    case "conservative":
      return CONSERVATIVE;
    case "aggressive":
      return AGGRESSIVE;
    default:
      return BASE;
  }
}

/** Compute scalar diff vs base — for showing "+22% vs base growth" labels. */
export function diffVsBase(
  current: FinanceAssumptions,
  base: FinanceAssumptions = BASE,
): Partial<Record<keyof FinanceAssumptions, number>> {
  const diff: Partial<Record<keyof FinanceAssumptions, number>> = {};
  (Object.keys(base) as (keyof FinanceAssumptions)[]).forEach((k) => {
    const c = current[k];
    const b = base[k];
    if (b !== 0) diff[k] = ((c - b) / b) * 100;
  });
  return diff;
}
