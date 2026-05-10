/**
 * FinancialModel — top-level orchestrator for the live financial editor.
 *
 * Layout (CSS Grid, asymmetric, responsive):
 *   ┌────────────────────────────────────────────────────────┐
 *   │  ScenarioSliders + PresetChips                         │
 *   ├──────────────────────────────┬─────────────────────────┤
 *   │  ProjectionChart             │  KeyMetricCards         │
 *   ├──────────────────────────────┴─────────────────────────┤
 *   │  PnLTable                                              │
 *   ├──────────────────────────────┬─────────────────────────┤
 *   │  AssumptionsPanel            │  SensitivityTable       │
 *   └──────────────────────────────┴─────────────────────────┘
 *
 * Recompute strategy:
 *  - Slider changes update local state instantly.
 *  - `recomputeDebounced` (300ms) hits the deterministic finance engine.
 *  - On success, swap projections + key_metrics; never block UI on the call.
 *  - Aborted (superseded) recomputes silently no-op.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react";

import {
  deriveAssumptionsFromResult,
  recomputeDebounced,
  type FinanceAssumptions,
} from "../../lib/financeEngineClient";
import {
  BASE,
  CONSERVATIVE,
  AGGRESSIVE,
  type PresetName,
} from "../../lib/financePresets";
import { ScenarioSliders } from "./ScenarioSliders";
import { ProjectionChart } from "./ProjectionChart";
import { KeyMetricCards } from "./KeyMetricCards";
import { PnLTable } from "./PnLTable";
import { AssumptionsPanel } from "./AssumptionsPanel";
import { SensitivityTable } from "./SensitivityTable";
import type {
  BrandIdentityResult,
  BusinessModelResult,
  FinancialModelResult,
} from "../../types/agents";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface FinancialModelProps {
  /** Initial result from agent run. May be replaced when recompute completes. */
  result: FinancialModelResult;
  /** Optional session id — required for server recompute. When absent, sliders
   * are read-only (results are still rendered). */
  sessionId?: string;
  /** Used for derived metrics (CAC / LTV / margin). */
  business?: BusinessModelResult | null;
  /** Used for accent color in chart. */
  brand?: BrandIdentityResult | null;
  /** Fired when the user accepts a new model — host can persist via API. */
  onAccept?: (next: FinancialModelResult) => void | Promise<void>;
  className?: string;
}

function isApproxEqual(a: FinanceAssumptions, b: FinanceAssumptions): boolean {
  return (Object.keys(a) as (keyof FinanceAssumptions)[]).every((k) => {
    const av = a[k];
    const bv = b[k];
    return Math.abs(av - bv) < Math.max(1e-6, Math.abs(av) * 1e-4);
  });
}

function detectPreset(a: FinanceAssumptions): PresetName | "custom" {
  if (isApproxEqual(a, BASE)) return "base";
  if (isApproxEqual(a, CONSERVATIVE)) return "conservative";
  if (isApproxEqual(a, AGGRESSIVE)) return "aggressive";
  return "custom";
}

export function FinancialModel({
  result,
  sessionId,
  business,
  brand,
  onAccept,
  className,
}: FinancialModelProps): JSX.Element {
  const initialAssumptions = useMemo(() => deriveAssumptionsFromResult(result), [result]);
  const [assumptions, setAssumptions] = useState<FinanceAssumptions>(initialAssumptions);
  const [liveResult, setLiveResult] = useState<FinancialModelResult>(result);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const llmAssumptionsRef = useRef<FinanceAssumptions>(initialAssumptions);

  // Reset when prop result changes (e.g. branch swap).
  useEffect(() => {
    const next = deriveAssumptionsFromResult(result);
    llmAssumptionsRef.current = next;
    setAssumptions(next);
    setLiveResult(result);
    setRecomputeError(null);
  }, [result]);

  // Trigger debounced recompute whenever assumptions change.
  useEffect(() => {
    if (!sessionId) return;
    if (isApproxEqual(assumptions, deriveAssumptionsFromResult(liveResult))) return;
    setRecomputing(true);
    setRecomputeError(null);
    recomputeDebounced({ session_id: sessionId, assumptions })
      .then((r) => {
        setLiveResult(r);
        setRecomputing(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        const msg = e instanceof Error ? e.message : "Recompute failed";
        setRecomputeError(msg);
        setRecomputing(false);
      });
  }, [assumptions, sessionId, liveResult]);

  const activePreset = useMemo(() => detectPreset(assumptions), [assumptions]);

  const handlePreset = useCallback((name: PresetName) => {
    const next =
      name === "conservative" ? CONSERVATIVE : name === "aggressive" ? AGGRESSIVE : BASE;
    setAssumptions(next);
  }, []);

  const handleAccept = useCallback(async () => {
    if (!onAccept) return;
    setAccepting(true);
    try {
      await onAccept(liveResult);
    } finally {
      setAccepting(false);
    }
  }, [liveResult, onAccept]);

  const handleResetAll = useCallback(() => {
    setAssumptions(llmAssumptionsRef.current);
  }, []);

  const accent = useMemo(() => {
    const palette = brand?.color_palette ?? [];
    const role = palette.find((c) => c.role === "accent" || c.role === "primary");
    return role?.hex ?? "#FF5A1F";
  }, [brand]);

  return (
    <section
      aria-label="Financial model"
      className={cn(
        "grid w-full gap-4",
        // 12-col bento with row-spans for asymmetry
        "grid-cols-1 lg:grid-cols-12",
        className,
      )}
    >
      <div className="lg:col-span-12">
        <ScenarioSliders
          assumptions={assumptions}
          activePreset={activePreset}
          onChange={setAssumptions}
          onPreset={handlePreset}
          llmAssumptions={llmAssumptionsRef.current}
        />
      </div>

      <motion.div
        layout
        transition={SPRING}
        className="grid gap-4 lg:col-span-7"
      >
        <ProjectionChart result={liveResult} accentColor={accent} />
        <PnLTable rows={liveResult.projections} />
      </motion.div>

      <motion.div layout transition={SPRING} className="grid gap-4 lg:col-span-5">
        <KeyMetricCards finance={liveResult} business={business ?? null} />
        <AssumptionsPanel
          current={assumptions}
          llm={llmAssumptionsRef.current}
          onChange={setAssumptions}
          defaultOpen={false}
        />
      </motion.div>

      <div className="lg:col-span-12">
        <SensitivityTable base={assumptions} />
      </div>

      {/* Footer status / accept bar */}
      <footer
        className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/40 px-4 py-3 lg:col-span-12"
        aria-live="polite"
      >
        <div className="grid grid-cols-[auto_1fr] items-center gap-2 text-[12px] text-ink-400">
          {recomputing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
              <span>Recomputing model on the deterministic engine…</span>
            </>
          ) : recomputeError ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden />
              <span className="text-rose-300">{recomputeError}</span>
            </>
          ) : liveResult.reconciliation_passed ? (
            <>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
              <span>
                Model balanced — every line reconciles to revenue minus burn. Live preset:{" "}
                <span className="text-ink-100">{activePreset}</span>.
              </span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
              <span>Reconciliation pending — drag a slider to recompute.</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetAll}
            className="grid grid-cols-[auto_1fr] items-center gap-1.5 rounded-full border border-ink-800 bg-ink-900/60 px-3 py-1.5 text-xs text-ink-200 hover:bg-ink-900 focus-ring"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Reset to LLM
          </button>
          {onAccept && (
            <button
              type="button"
              onClick={() => void handleAccept()}
              disabled={accepting || recomputing}
              className="rounded-full bg-accent-500 px-4 py-1.5 text-xs font-semibold text-ink-950 hover:bg-accent-400 focus-ring disabled:opacity-60"
            >
              {accepting ? "Saving…" : "Accept changes"}
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}

// Default export so React.lazy(() => import("./FinancialModel")) works.
export default FinancialModel;
