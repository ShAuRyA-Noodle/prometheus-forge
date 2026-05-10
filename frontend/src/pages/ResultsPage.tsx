/**
 * ResultsPage — once a session is completed, this is the editable surface.
 *
 * Layout (desktop):
 *   ┌──────────────────────────────────────┬──────────────────┐
 *   │  ResultsView (tabbed editor)         │ Sticky right rail│
 *   │  - Summary / Brand / Deck / Model    │ - Deploy         │
 *   │  - Landing / Market / Competitive    │ - Export         │
 *   │  - Business / GTM / Legal / Risk     │ - Share          │
 *   │  - Tech                              │ - Branch         │
 *   │                                      │ - Regen          │
 *   └──────────────────────────────────────┴──────────────────┘
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  CostMeter footer                                        │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Right rail collapses below center on <lg.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CircleDollarSign,
  GitBranchPlus,
  RefreshCw,
  Rocket,
  Share2,
  Sparkles,
} from "lucide-react";

import { ResultsView } from "@/components/ResultsView";
import { ExportMenu } from "@/components/MicroWidgets/ExportMenu";
import { ShareDialog } from "@/components/MicroWidgets/ShareDialog";
import { RegenSteeringDialog } from "@/components/RegenSteeringDialog";
import { Spinner } from "@/components/MicroWidgets/Spinner";
import { useSession } from "@/hooks/useSession";
import { useBranching } from "@/hooks/useBranching";
import { useToast } from "@/hooks/useToast";
import { useRegisterCommands, type CommandAction } from "@/hooks/useCommandPalette";
import { api, APIError } from "@/lib/api";
import { track, Events } from "@/lib/analytics";
import { MAX_COST_USD_PER_SESSION } from "@/lib/constants";
import type {
  AgentResults,
  BrandIdentityResult,
  BusinessModelResult,
  CompetitiveAnalysisResult,
  ExecutiveSummaryResult,
  FinancialModelResult,
  GoToMarketResult,
  LandingPageResult,
  LegalDocumentsResult,
  MarketResearchResult,
  PitchDeckResult,
  RiskAnalysisResult,
  TechArchitectureResult,
} from "@/types/agents";
import { cn } from "@/lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export function ResultsPage(): JSX.Element {
  const { sessionId = null } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { error: errorToast, success } = useToast();

  const { session, artifacts, loading, liveCostUsd } = useSession(sessionId ?? null);
  const { createBranch, creating: branchCreating } = useBranching(sessionId ?? null);

  const [shareOpen, setShareOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  const results: AgentResults = useMemo(
    () => ({
      brand_identity: artifacts.brand_identity as BrandIdentityResult | undefined,
      market_research: artifacts.market_research as MarketResearchResult | undefined,
      competitive_analysis: artifacts.competitive_analysis as CompetitiveAnalysisResult | undefined,
      business_model: artifacts.business_model as BusinessModelResult | undefined,
      risk_analysis: artifacts.risk_analysis as RiskAnalysisResult | undefined,
      tech_architecture: artifacts.tech_architecture as TechArchitectureResult | undefined,
      financial_model: artifacts.financial_model as FinancialModelResult | undefined,
      landing_page: artifacts.landing_page as LandingPageResult | undefined,
      legal_documents: artifacts.legal_documents as LegalDocumentsResult | undefined,
      go_to_market: artifacts.go_to_market as GoToMarketResult | undefined,
      pitch_deck: artifacts.pitch_deck as PitchDeckResult | undefined,
      executive_summary: artifacts.executive_summary as ExecutiveSummaryResult | undefined,
    }),
    [artifacts],
  );

  const handleBranch = useCallback(async () => {
    if (!sessionId) return;
    const name = window.prompt(
      "Branch name (e.g. \"Pivot to enterprise\"):",
      "Variation",
    );
    if (!name) return;
    const newId = await createBranch({
      parent_session_id: sessionId,
      branch_name: name,
    });
    if (newId) navigate(`/generate/${encodeURIComponent(newId)}`);
  }, [sessionId, createBranch, navigate]);

  const handleRegenSubmit = useCallback(
    async ({ steering, propagateDownstream }: { steering: string; propagateDownstream: boolean }) => {
      if (!sessionId) return;
      setRegenBusy(true);
      track(Events.REGEN_TRIGGERED, { session_id: sessionId, propagate: propagateDownstream });
      try {
        const res = await api.regen({
          session_id: sessionId,
          agents: ["pitch_deck", "executive_summary"],
          reason: steering,
        });
        success("Regeneration queued");
        navigate(`/generate/${encodeURIComponent(res.session_id)}`);
      } catch (e) {
        const msg =
          e instanceof APIError ? e.message : e instanceof Error ? e.message : "Regen failed";
        errorToast("Could not regenerate", msg);
      } finally {
        setRegenBusy(false);
        setRegenOpen(false);
      }
    },
    [sessionId, errorToast, success, navigate],
  );

  // Register commands for this view.
  const cmdActions = useMemo<CommandAction[]>(
    () =>
      sessionId
        ? [
            {
              id: "results.share",
              section: "Artifact actions",
              label: "Share a public preview",
              icon: "Share2",
              shortcut: "S",
              perform: () => setShareOpen(true),
            },
            {
              id: "results.branch",
              section: "Artifact actions",
              label: "Branch this run",
              icon: "GitBranchPlus",
              shortcut: "B",
              perform: () => void handleBranch(),
            },
            {
              id: "results.regen",
              section: "AI commands",
              label: "Regenerate with steering",
              icon: "RefreshCw",
              shortcut: "R",
              perform: () => setRegenOpen(true),
            },
          ]
        : [],
    [sessionId, handleBranch],
  );
  useRegisterCommands(cmdActions);

  if (!sessionId) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-ink-950 text-ink-400">
        Missing session id.
      </main>
    );
  }

  if (loading && !session) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-ink-950 text-ink-400">
        <Spinner size={28} />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-ink-950 text-ink-400">
        Session not found.
      </main>
    );
  }

  const cost = liveCostUsd ?? session.cost.total_cost_usd;
  const costPct = Math.min(100, (cost / MAX_COST_USD_PER_SESSION) * 100);

  return (
    <main role="main" className="min-h-[100dvh] bg-ink-950 text-ink-100">
      {/* Top strip */}
      <header className="sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink-900 bg-ink-950/80 px-4 py-3 backdrop-blur md:px-6">
        <button
          type="button"
          onClick={() => navigate("/companies")}
          className="grid grid-cols-[auto_1fr] items-center gap-1.5 rounded-full border border-ink-800 bg-ink-900/60 px-3 py-1.5 text-xs text-ink-200 hover:bg-ink-900 focus-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Companies
        </button>
        <div className="grid gap-0.5 text-center">
          <span className="text-[10px] uppercase tracking-widest text-ink-500">Run</span>
          <span className="font-display text-sm text-ink-50">
            {session.company_name ?? results.brand_identity?.company_name ?? "Untitled"}
          </span>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-ink-300">
          {session.session_id.slice(0, 8)}…
        </span>
      </header>

      <div className="grid grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          aria-label="Generated artifacts"
        >
          <ResultsView sessionId={sessionId} results={results} />
        </motion.section>

        <motion.aside
          layout
          transition={SPRING}
          aria-label="Quick actions"
          className="grid h-fit gap-3 lg:sticky lg:top-[5rem]"
        >
          <ActionCard
            icon={Rocket}
            label="Deploy landing"
            description="Push to Cloudflare Pages with a free subdomain or your own."
            disabled={!results.landing_page}
            onClick={() => {
              // Deploy is owned by LandingEditor — surface the landing tab.
              window.location.hash = "landing";
              const el = document.getElementById("panel-landing");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
          />
          <div className="grid gap-1.5 rounded-2xl border border-ink-800 bg-ink-900/40 p-3">
            <span className="text-[10px] uppercase tracking-widest text-ink-500">Export</span>
            <ExportMenu sessionId={sessionId} />
          </div>
          <ActionCard
            icon={Share2}
            label="Share preview"
            description="Read-only signed URL. Tracking is opt-in."
            onClick={() => setShareOpen(true)}
          />
          <ActionCard
            icon={GitBranchPlus}
            label="Branch this run"
            description="Fork to explore variations side-by-side."
            disabled={branchCreating}
            onClick={() => void handleBranch()}
          />
          <ActionCard
            icon={RefreshCw}
            label="Regenerate with steering"
            description="Re-run synthesis agents with a steering note."
            onClick={() => setRegenOpen(true)}
          />

          {/* Cost meter */}
          <div className="grid gap-1.5 rounded-2xl border border-ink-800 bg-ink-900/40 p-4">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[11px] uppercase tracking-widest text-ink-500">
              <CircleDollarSign className="h-3.5 w-3.5" />
              <span>Cost telemetry</span>
              <span className="font-mono tabular-nums text-ink-200">
                ${cost.toFixed(2)} <span className="text-ink-500">/ ${MAX_COST_USD_PER_SESSION.toFixed(2)}</span>
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Cost usage"
              aria-valuemin={0}
              aria-valuemax={MAX_COST_USD_PER_SESSION}
              aria-valuenow={cost}
              className="h-1 overflow-hidden rounded-full bg-ink-800"
            >
              <div
                className="h-full rounded-full bg-accent-500 transition-[width]"
                style={{ width: `${costPct}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px] text-ink-500">
              <span>{session.cost.grounding_calls} grounded calls</span>
              <span className="text-right">{session.cost.image_generations} images</span>
              <span>{session.cost.total_input_tokens.toLocaleString()} in</span>
              <span className="text-right">{session.cost.total_output_tokens.toLocaleString()} out</span>
            </div>
          </div>

          <p className="rounded-xl border border-ink-800 bg-ink-950/40 p-3 text-[11px] text-ink-500">
            <Sparkles className="mr-1 inline-block h-3 w-3 text-accent-500" />
            <span>Cmd-K → palette · S share · B branch · R regen</span>
          </p>
        </motion.aside>
      </div>

      <ShareDialog sessionId={sessionId} open={shareOpen} onOpenChange={setShareOpen} />
      <RegenSteeringDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        scopeLabel="pitch deck + summary"
        description="Steering text propagates to deck and exec summary. Cost ≈ $0.20–$0.40."
        busy={regenBusy}
        onSubmit={(s) => void handleRegenSubmit(s)}
      />
    </main>
  );
}

function ActionCard({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid grid-cols-[auto_1fr] items-start gap-3 rounded-2xl border border-ink-800 bg-ink-900/40 p-3 text-left transition hover:border-accent-500/40 focus-ring",
        disabled && "cursor-not-allowed opacity-50 hover:border-ink-800",
      )}
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-500/15 text-accent-500">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="grid gap-0.5">
        <span className="text-sm font-semibold text-ink-100">{label}</span>
        <span className="text-[11px] text-ink-400">{description}</span>
      </div>
    </button>
  );
}

export default ResultsPage;
