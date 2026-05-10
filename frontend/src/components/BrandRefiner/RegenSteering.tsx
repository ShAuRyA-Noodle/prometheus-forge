/**
 * RegenSteering — small inline steering input that fires `api.regen` for a
 * specific agent (brand_identity, landing_page, financial_model). The host
 * decides what to do with the diff result; we just collect the steering
 * string + the propagate-downstream toggle.
 *
 * Designed to live next to the artifact it edits (logo, palette, hero, etc.)
 * — sized to fit a 280-360px column.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Send } from "lucide-react";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface RegenSteeringProps {
  agent: string;
  placeholder?: string;
  onSubmit: (steering: string, opts: { propagate_downstream: boolean }) => Promise<void> | void;
  primaryLabel?: React.ReactNode;
  /** Show "propagate downstream" toggle (default true). */
  showPropagate?: boolean;
  className?: string;
}

const SUGGESTIONS_BY_AGENT: Record<string, string[]> = {
  brand_identity: [
    "more geometric",
    "warmer + softer",
    "playful but professional",
    "monogram with a serif feel",
  ],
  landing_page: [
    "make the hero feel more confident",
    "cut copy by 30%",
    "swap to a centered layout",
  ],
  financial_model: [
    "model conservative growth",
    "extend runway by 6 months",
    "make pricing simpler — 2 tiers",
  ],
};

export function RegenSteering({
  agent,
  placeholder = "Tell me what to change…",
  onSubmit,
  primaryLabel,
  showPropagate = true,
  className,
}: RegenSteeringProps): JSX.Element {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [propagate, setPropagate] = useState(true);
  const suggestions = SUGGESTIONS_BY_AGENT[agent] ?? [];

  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onSubmit(text, { propagate_downstream: propagate });
      setDraft("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      layout
      transition={SPRING}
      className={cn(
        "rounded-2xl border border-ink-800 bg-ink-900/40 p-3",
        className,
      )}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="grid gap-2"
      >
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            aria-label={`Steering for ${agent.replace(/_/g, " ")}`}
            maxLength={240}
            className="rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-[13px] text-ink-100 placeholder:text-ink-600 focus:border-accent/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-medium text-ink-950 transition-colors hover:bg-accent-400 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 size={12} className="animate-[spin_1.4s_linear_infinite]" />
            ) : (
              <Send size={12} />
            )}
            <span>{primaryLabel ?? "Apply"}</span>
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDraft(s)}
                className="rounded-full border border-ink-800 bg-ink-950 px-2 py-0.5 text-[10.5px] text-ink-400 transition-colors hover:border-accent/40 hover:text-ink-100"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {showPropagate && (
          <label className="flex items-center gap-2 text-[11px] text-ink-400">
            <input
              type="checkbox"
              checked={propagate}
              onChange={(e) => setPropagate(e.target.checked)}
              className="h-3 w-3 accent-accent"
            />
            Propagate to downstream agents
          </label>
        )}
      </form>
    </motion.div>
  );
}
