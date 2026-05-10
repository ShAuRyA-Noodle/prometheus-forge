/**
 * LegalDocsView — ToS + Privacy + incorporation checklist with prominent
 * "Have a lawyer review" CTA.
 *
 * Hard rule: agent never writes legal text from scratch. We surface
 * template-fill + lawyer review CTA + Marketplace upgrade.
 */
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Gavel,
  Scale,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useToast } from "@/hooks/useToast";
import { api, APIError } from "@/lib/api";
import { useState } from "react";
import type { LegalDocumentsResult } from "@/types/agents";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface LegalDocsViewProps {
  legal: LegalDocumentsResult;
  sessionId: string;
  className?: string;
}

export function LegalDocsView({ legal, sessionId, className }: LegalDocsViewProps): JSX.Element {
  const { success, error } = useToast();
  const [busy, setBusy] = useState(false);

  const orderLawyer = async () => {
    setBusy(true);
    try {
      const res = await api.marketplaceOrder({
        session_id: sessionId,
        job_type: "lawyer_review",
        notes: "Review generated ToS, Privacy, incorporation checklist.",
      });
      success("Lawyer review queued", `Order ${res.order_id.slice(0, 8)}…`);
    } catch (err) {
      error(
        "Could not place order",
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Network error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cn("grid gap-6", className)} aria-label="Legal documents">
      {/* Lawyer banner — prominent */}
      <motion.aside
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-bento border border-danger/40 bg-danger/10 p-5"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-danger/20 text-danger">
          <AlertTriangle className="h-4 w-4" aria-hidden />
        </span>
        <div className="grid gap-1">
          <h3 className="font-display text-lg text-red-100">Have a lawyer review these documents.</h3>
          <p className="text-sm text-red-200/90">
            These are template-filled, jurisdiction-aware drafts from Termly / iubenda — not custom
            legal advice. Use them as a starting point. PROMETHEUS does not provide legal advice.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href="https://www.legalzoom.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-red-300/40 bg-red-500/10 px-3 py-1 text-xs text-red-100 hover:bg-red-500/20 focus-ring"
            >
              LegalZoom <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://www.atrium.co"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-red-300/40 bg-red-500/10 px-3 py-1 text-xs text-red-100 hover:bg-red-500/20 focus-ring"
            >
              Atrium <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={orderLawyer}
          disabled={busy}
          className="grid grid-cols-[auto_1fr] items-center gap-2 self-start rounded-full bg-danger px-4 py-2 text-xs font-semibold text-ink-50 hover:bg-red-700 focus-ring disabled:opacity-60"
        >
          <Gavel className="h-3.5 w-3.5" />
          {busy ? "Ordering…" : "Hire reviewer · $480"}
        </button>
      </motion.aside>

      {/* Doc cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <DocCard
          icon={Scale}
          label="Terms of Service"
          templateId={legal.tos_template_id}
          docUrl={legal.tos_doc_url ?? null}
        />
        <DocCard
          icon={ShieldCheck}
          label="Privacy Policy"
          templateId={legal.privacy_template_id}
          docUrl={legal.privacy_doc_url ?? null}
        />
      </div>

      {/* Jurisdiction badges */}
      <div className="grid gap-2">
        <span className="text-[11px] uppercase tracking-widest text-ink-500">
          Jurisdictions covered
        </span>
        <div className="flex flex-wrap gap-1.5">
          {legal.jurisdictions_covered.map((j) => (
            <span
              key={j}
              className="rounded-full border border-ink-800 bg-ink-900/40 px-3 py-1 text-xs text-ink-200"
            >
              {j}
            </span>
          ))}
        </div>
      </div>

      {/* Incorporation checklist */}
      <div>
        <span className="text-[11px] uppercase tracking-widest text-ink-500">
          Incorporation checklist
        </span>
        <ul className="mt-3 grid gap-2">
          {legal.incorporation_checklist.map((item, i) => {
            const title = (item.title ?? item.task ?? Object.values(item)[0]) as string;
            const detail = (item.detail ?? item.description ?? "") as string;
            return (
              <li
                key={i}
                className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-2xl border border-ink-800 bg-ink-900/30 p-3"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-accent-500" aria-hidden />
                <div>
                  <div className="text-sm font-semibold text-ink-100">{title}</div>
                  {detail && <div className="mt-0.5 text-xs text-ink-400">{detail}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function DocCard({
  icon: Icon,
  label,
  templateId,
  docUrl,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  templateId: string;
  docUrl: string | null;
}): JSX.Element {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="grid gap-3 rounded-bento border border-ink-800 bg-ink-900/40 p-5 shadow-bento"
    >
      <header className="grid grid-cols-[auto_1fr] items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-800 text-ink-300">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="font-display text-lg text-ink-50">{label}</h3>
      </header>
      <p className="font-mono text-[11px] text-ink-500">template: {templateId}</p>
      {docUrl ? (
        <a
          href={docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 self-start rounded-full bg-accent-500 px-4 py-2 text-xs font-semibold text-ink-950 hover:bg-accent-400 focus-ring"
        >
          <FileText className="h-3.5 w-3.5" />
          Open in Google Docs
        </a>
      ) : (
        <p className="text-xs text-ink-500">Document export not yet ready.</p>
      )}
    </motion.article>
  );
}
