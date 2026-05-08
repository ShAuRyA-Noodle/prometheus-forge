/**
 * financeEngineClient — thin client over /api/finance/recompute.
 *
 * Calls the deterministic Python finance engine with the user's edited
 * assumptions and returns a fresh FinancialModelResult. Debounced (300ms)
 * so slider drags don't hammer the network.
 */
import type { FinancialModelResult } from "../types/agents";

export interface FinanceAssumptions {
  pricing_usd_monthly: number;
  cac_usd: number;
  monthly_churn_pct: number;
  initial_paying_customers: number;
  monthly_growth_rate_pct: number;
  starting_headcount: number;
  fully_loaded_salary_usd: number;
  gross_margin_pct: number;
  seed_amount_usd: number;
  monthly_other_opex_usd: number;
  projection_years: number;
}

export type ScenarioPreset = "conservative" | "base" | "aggressive";

export const DEFAULT_BOUNDS: Record<keyof FinanceAssumptions, { min: number; max: number; step: number }> = {
  pricing_usd_monthly: { min: 5, max: 5000, step: 1 },
  cac_usd: { min: 10, max: 5000, step: 5 },
  monthly_churn_pct: { min: 0, max: 30, step: 0.1 },
  initial_paying_customers: { min: 0, max: 10000, step: 5 },
  monthly_growth_rate_pct: { min: -5, max: 60, step: 0.5 },
  starting_headcount: { min: 1, max: 200, step: 1 },
  fully_loaded_salary_usd: { min: 30000, max: 400000, step: 1000 },
  gross_margin_pct: { min: 5, max: 95, step: 1 },
  seed_amount_usd: { min: 0, max: 50_000_000, step: 25_000 },
  monthly_other_opex_usd: { min: 0, max: 1_000_000, step: 500 },
  projection_years: { min: 1, max: 5, step: 1 },
};

interface RecomputeRequest {
  session_id: string;
  assumptions: FinanceAssumptions;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingResolve: ((v: FinancialModelResult) => void) | null = null;
let pendingReject: ((e: unknown) => void) | null = null;

async function postRecompute(req: RecomputeRequest, signal?: AbortSignal): Promise<FinancialModelResult> {
  const res = await fetch("/api/finance/recompute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Finance recompute failed: ${res.status}`);
  }
  return (await res.json()) as FinancialModelResult;
}

/**
 * Debounced recompute. Last call within 300ms wins.
 * Returns the FinancialModelResult once the trailing call resolves.
 */
export function recomputeDebounced(
  req: RecomputeRequest,
  delayMs: number = 300,
): Promise<FinancialModelResult> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    if (pendingReject) pendingReject(new DOMException("superseded", "AbortError"));
    pendingResolve = null;
    pendingReject = null;
  }
  return new Promise<FinancialModelResult>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const r = pendingResolve;
      const j = pendingReject;
      pendingResolve = null;
      pendingReject = null;
      postRecompute(req).then(
        (result) => r?.(result),
        (err) => j?.(err),
      );
    }, delayMs);
  });
}

/** Synchronous (non-debounced) call for explicit "Apply" actions. */
export function recompute(req: RecomputeRequest): Promise<FinancialModelResult> {
  return postRecompute(req);
}

export function presetAssumptions(preset: ScenarioPreset, base: FinanceAssumptions): FinanceAssumptions {
  switch (preset) {
    case "conservative":
      return {
        ...base,
        monthly_growth_rate_pct: Math.max(0.5, base.monthly_growth_rate_pct * 0.4),
        monthly_churn_pct: Math.min(15, base.monthly_churn_pct * 1.6),
        cac_usd: base.cac_usd * 1.4,
      };
    case "aggressive":
      return {
        ...base,
        monthly_growth_rate_pct: Math.min(50, base.monthly_growth_rate_pct * 1.8),
        monthly_churn_pct: Math.max(0.3, base.monthly_churn_pct * 0.6),
        cac_usd: base.cac_usd * 0.75,
      };
    case "base":
    default:
      return base;
  }
}

export function deriveAssumptionsFromResult(result: FinancialModelResult): FinanceAssumptions {
  const a = result.assumptions as Partial<FinanceAssumptions>;
  return {
    pricing_usd_monthly: a.pricing_usd_monthly ?? 49,
    cac_usd: a.cac_usd ?? 220,
    monthly_churn_pct: a.monthly_churn_pct ?? 3.2,
    initial_paying_customers: a.initial_paying_customers ?? 25,
    monthly_growth_rate_pct: a.monthly_growth_rate_pct ?? 12,
    starting_headcount: a.starting_headcount ?? 4,
    fully_loaded_salary_usd: a.fully_loaded_salary_usd ?? 145_000,
    gross_margin_pct: a.gross_margin_pct ?? 78,
    seed_amount_usd: a.seed_amount_usd ?? 1_500_000,
    monthly_other_opex_usd: a.monthly_other_opex_usd ?? 18_000,
    projection_years: a.projection_years ?? 3,
  };
}
