/**
 * CompaniesPage — bento grid of the user's saved companies.
 *
 * - Search input filters by name/industry.
 * - Filter chips by status (running / completed / partial / archived).
 * - Each card shows: name, tagline, last updated, status pill, latest 3 branches.
 * - Empty state seeds with featured templates.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Building2,
  ChevronRight,
  Filter,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

import { api, APIError, type CompanySummary } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/MicroWidgets/Spinner";
import { EmptyState } from "@/components/MicroWidgets/EmptyState";
import { IDEA_TEMPLATES } from "@/lib/constants";
import { cn } from "@/lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

type StatusFilter = "all" | "completed" | "partial" | "running" | "error";

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All",
  completed: "Done",
  partial: "Partial",
  running: "Running",
  error: "Errored",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  partial: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  running: "bg-accent-500/15 text-accent-500 border-accent-500/30",
  error: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  queued: "bg-ink-800 text-ink-300 border-ink-700",
  canceled: "bg-ink-800 text-ink-400 border-ink-700",
  budget_exceeded: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  safety_blocked: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function CompaniesPage(): JSX.Element {
  const navigate = useNavigate();
  const { error: errorToast } = useToast();
  const { uid, loading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (authLoading) return;
    if (!uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .myCompanies()
      .then((res) => {
        if (cancelled) return;
        setCompanies(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          e instanceof APIError ? e.message : e instanceof Error ? e.message : "Could not load companies";
        errorToast("Could not load companies", msg);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, authLoading, errorToast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (filter !== "all" && c.latest_status !== filter) return false;
      if (!q) return true;
      const haystack = [c.company_name, c.industry ?? "", c.one_liner ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [companies, search, filter]);

  return (
    <main role="main" className="min-h-[100dvh] bg-ink-950 text-ink-100">
      <header className="sticky top-0 z-30 grid grid-cols-[1fr_auto] items-center gap-4 border-b border-ink-900 bg-ink-950/80 px-4 py-3 backdrop-blur md:px-6">
        <Link to="/" className="grid grid-cols-[auto_1fr] items-center gap-2 font-display text-lg text-ink-50 focus-ring">
          <Sparkles className="h-4 w-4 text-accent-500" />
          PROMETHEUS
        </Link>
        <Link
          to="/"
          className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-full bg-accent-500 px-4 py-1.5 text-xs font-semibold text-ink-950 hover:bg-accent-400 focus-ring"
        >
          <span>New company</span>
          <Plus className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 md:px-6">
        <section className="grid gap-2">
          <p className="text-[11px] uppercase tracking-widest text-accent-500">Workspace</p>
          <h1 className="font-display text-4xl text-ink-50 md:text-5xl">Companies</h1>
          <p className="text-base text-ink-400">
            Every run is a company. Click in to keep editing, branch from a hypothesis, or
            spin up a fresh one.
          </p>
        </section>

        <section className="grid grid-cols-[1fr_auto] items-center gap-3" aria-label="Filter and search">
          <label className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-full border border-ink-800 bg-ink-900/40 px-4 py-2 focus-within:border-accent-500/40">
            <Search className="h-3.5 w-3.5 text-ink-500" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, industry, or tagline…"
              className="w-full bg-transparent text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none"
              aria-label="Search companies"
              data-mask
            />
          </label>
          <div className="hidden items-center gap-1 rounded-full border border-ink-800 bg-ink-900/40 p-1 sm:inline-flex">
            <Filter className="ml-2 h-3.5 w-3.5 text-ink-500" aria-hidden />
            {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium transition focus-ring",
                  filter === f
                    ? "bg-accent-500 text-ink-950"
                    : "text-ink-300 hover:text-ink-100",
                )}
              >
                {STATUS_LABELS[f]}
              </button>
            ))}
          </div>
        </section>

        {loading ? (
          <div className="grid place-items-center rounded-bento border border-ink-800 bg-ink-900/30 py-20">
            <Spinner size={20} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyCompaniesState />
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c, i) => (
              <motion.li
                key={c.company_id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: i * 0.02 }}
              >
                <CompanyCard
                  company={c}
                  onOpen={() => navigate(`/companies/${encodeURIComponent(c.company_id)}`)}
                />
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function CompanyCard({
  company,
  onOpen,
}: {
  company: CompanySummary;
  onOpen: () => void;
}): JSX.Element {
  const statusClass = STATUS_COLORS[company.latest_status] ?? STATUS_COLORS.queued ?? "";
  return (
    <article className="group grid h-full grid-rows-[auto_1fr_auto] gap-3 rounded-bento border border-ink-800 bg-ink-900/40 p-5 shadow-bento transition hover:border-accent-500/40">
      <header className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-800 text-ink-300">
          <Building2 className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display text-lg text-ink-50">{company.company_name}</h2>
          {company.industry && (
            <p className="text-[11px] uppercase tracking-widest text-ink-500">{company.industry}</p>
          )}
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
            statusClass,
          )}
        >
          {company.latest_status}
        </span>
      </header>

      {company.one_liner && (
        <p className="text-sm leading-relaxed text-ink-300 line-clamp-3">{company.one_liner}</p>
      )}

      <footer className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-ink-800 pt-3 text-[11px]">
        <div className="grid gap-0.5">
          <span className="text-ink-500">{company.branch_count} branches</span>
          <time className="font-mono tabular-nums text-ink-500">
            updated {new Date(company.updated_at).toLocaleDateString()}
          </time>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="grid grid-cols-[1fr_auto] items-center gap-1 rounded-full border border-ink-800 bg-ink-900/60 px-3 py-1.5 text-xs text-ink-200 transition group-hover:border-accent-500/40 group-hover:text-accent-500 focus-ring"
        >
          Open
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </footer>
    </article>
  );
}

function EmptyCompaniesState(): JSX.Element {
  return (
    <section className="grid gap-4">
      <EmptyState
        icon={Building2}
        title="No companies yet."
        description="Each run lands here as a company. Try one of these to start, or whisper your own idea."
      />
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {IDEA_TEMPLATES.map((t) => (
          <li key={t.id}>
            <Link
              to="/"
              state={{ idea: t.body }}
              className="grid h-full grid-rows-[auto_1fr_auto] gap-2 rounded-2xl border border-ink-800 bg-ink-900/30 p-4 transition hover:border-accent-500/40 focus-ring"
            >
              <span className="text-[10px] uppercase tracking-widest text-accent-500">{t.category}</span>
              <span className="text-sm font-semibold text-ink-100">{t.title}</span>
              <span className="line-clamp-2 text-xs text-ink-400">{t.body}</span>
              <span className="grid grid-cols-[1fr_auto] items-center gap-1 text-xs text-ink-300">
                Use this idea
                <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default CompaniesPage;
