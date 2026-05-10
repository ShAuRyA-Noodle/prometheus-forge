/**
 * BranchingView — Linear-style branch tree visualization.
 *
 * Shows the parent session at the top and all branches below as cards.
 * Multi-select up to 2 branches → side-by-side compare via callback.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { GitBranch, GitCompare, Plus } from "lucide-react";

import { cn } from "@/lib/cn";
import { useBranching, type BranchSummary } from "@/hooks/useBranching";
import type { SessionStatus } from "@/types/session";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface BranchingViewProps {
  parentSessionId: string;
  parentName?: string;
  onCompare?: (sessionIds: [string, string]) => void;
  onOpen?: (sessionId: string) => void;
  onCreateBranch?: () => void;
  className?: string;
}

const STATUS_TINT: Record<SessionStatus, string> = {
  queued: "bg-ink-800 text-ink-300",
  running: "bg-accent-500/20 text-accent-300",
  completed: "bg-emerald-500/15 text-emerald-300",
  partial: "bg-amber-500/15 text-amber-300",
  error: "bg-red-500/15 text-red-300",
  canceled: "bg-ink-700 text-ink-400",
  safety_blocked: "bg-red-500/20 text-red-200",
  budget_exceeded: "bg-amber-500/20 text-amber-200",
};

export function BranchingView({
  parentSessionId,
  parentName,
  onCompare,
  onOpen,
  onCreateBranch,
  className,
}: BranchingViewProps): JSX.Element {
  const { branches, loading } = useBranching(parentSessionId);
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      if (s.length >= 2) return [s[1]!, id];
      return [...s, id];
    });
  };

  const compare = () => {
    if (selected.length !== 2 || !onCompare) return;
    onCompare([selected[0]!, selected[1]!]);
  };

  return (
    <section
      aria-label="Branches"
      className={cn(
        "grid gap-4 rounded-bento border border-ink-800 bg-ink-900/30 p-5",
        className,
      )}
    >
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-500/15 text-accent-500">
          <GitBranch className="h-4 w-4" />
        </span>
        <div className="grid gap-0.5">
          <span className="text-[11px] uppercase tracking-widest text-ink-500">
            Branches ({branches.length})
          </span>
          <span className="font-display text-lg text-ink-50">
            {parentName ?? "Original run"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selected.length === 2 && (
            <button
              type="button"
              onClick={compare}
              className="grid grid-cols-[auto_1fr] items-center gap-1.5 rounded-full bg-accent-500 px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-accent-400 focus-ring"
            >
              <GitCompare className="h-3.5 w-3.5" />
              Compare 2
            </button>
          )}
          {onCreateBranch && (
            <button
              type="button"
              onClick={onCreateBranch}
              className="grid grid-cols-[auto_1fr] items-center gap-1.5 rounded-full border border-ink-800 bg-ink-900/60 px-3 py-1.5 text-xs text-ink-200 hover:bg-ink-900 focus-ring"
            >
              <Plus className="h-3.5 w-3.5" />
              New branch
            </button>
          )}
        </div>
      </header>

      {/* Tree */}
      <div className="grid gap-2">
        {/* Parent node */}
        <button
          type="button"
          onClick={() => onOpen?.(parentSessionId)}
          className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/40 p-3 text-left transition hover:border-accent-500/40 focus-ring"
        >
          <span className="h-2 w-2 rounded-full bg-accent-500" />
          <span className="text-sm font-semibold text-ink-100">
            {parentName ?? "Parent run"}
          </span>
          <span className="font-mono text-[10px] text-ink-500">
            {parentSessionId.slice(0, 8)}…
          </span>
        </button>

        {loading && (
          <p className="text-xs text-ink-500">Loading branches…</p>
        )}

        {!loading && branches.length === 0 && (
          <p className="rounded-xl border border-dashed border-ink-800 bg-ink-950/40 px-4 py-6 text-center text-xs text-ink-500">
            No branches yet. Branch this run to explore "what if we pivot to enterprise?".
          </p>
        )}

        {branches.map((b, i) => (
          <BranchRow
            key={b.session_id}
            b={b}
            depth={1}
            index={i}
            selected={selected.includes(b.session_id)}
            onToggleSelect={() => toggleSelect(b.session_id)}
            onOpen={() => onOpen?.(b.session_id)}
          />
        ))}
      </div>
      {selected.length > 0 && (
        <p className="text-[11px] text-ink-500">
          {selected.length} of 2 selected for compare. Click again to deselect.
        </p>
      )}
    </section>
  );
}

function BranchRow({
  b,
  depth,
  index,
  selected,
  onToggleSelect,
  onOpen,
}: {
  b: BranchSummary;
  depth: number;
  index: number;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...SPRING, delay: index * 0.03 }}
      className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/30 p-3"
      style={{ marginLeft: depth * 18 }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select branch ${b.branch_name ?? b.session_id}`}
        className="h-3.5 w-3.5 accent-accent-500"
      />
      <button
        type="button"
        onClick={onOpen}
        className="grid grid-cols-[1fr_auto] items-center gap-2 truncate text-left focus-ring"
      >
        <span className="truncate text-sm text-ink-100">
          {b.branch_name ?? "Untitled branch"}
        </span>
        <span className="font-mono text-[10px] text-ink-500">
          {b.session_id.slice(0, 8)}…
        </span>
      </button>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
          STATUS_TINT[b.status],
        )}
      >
        {b.status}
      </span>
      <span className="font-mono text-[10px] tabular-nums text-ink-500">
        {new Date(b.created_at).toLocaleDateString()}
      </span>
    </motion.div>
  );
}
