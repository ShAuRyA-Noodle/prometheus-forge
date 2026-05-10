/**
 * VoiceTraitsCard — shows brand voice traits as chips and renders the LLM-
 * generated sample copy in the body voice. Lets the user request a fresh
 * sample tuned to a specific surface (product page, social bio, support reply).
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, MessageSquare, Sparkles } from "lucide-react";
import type { BrandIdentityResult } from "../../types/agents";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface VoiceTraitsCardProps {
  brand: BrandIdentityResult;
  /** Re-roll the sample copy — host decides whether to call regen on the agent
   * or to just call a lightweight sample endpoint. */
  onRequestSample: (target: SampleSurface) => Promise<string> | string;
  className?: string;
}

export type SampleSurface = "product_page" | "social_bio" | "onboarding" | "support_reply";

const SURFACE_LABELS: Record<SampleSurface, string> = {
  product_page: "Product page",
  social_bio: "Social bio",
  onboarding: "Onboarding",
  support_reply: "Support reply",
};

export function VoiceTraitsCard({
  brand,
  onRequestSample,
  className,
}: VoiceTraitsCardProps): JSX.Element {
  const [sample, setSample] = useState<string>(brand.brand_voice_sample_copy);
  const [activeSurface, setActiveSurface] = useState<SampleSurface>("product_page");
  const [busy, setBusy] = useState(false);
  const bodyStack = `'${brand.typography.body_font}', Geist, system-ui, sans-serif`;

  const requestSample = async (surface: SampleSurface) => {
    setBusy(true);
    setActiveSurface(surface);
    try {
      const result = await onRequestSample(surface);
      if (typeof result === "string") setSample(result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cn("flex flex-col gap-3", className)} aria-label="Brand voice">
      <header>
        <h2 className="font-display text-sm font-medium text-ink-100">Voice</h2>
        <p className="text-[11px] uppercase tracking-widest text-ink-500">
          How the brand reads to a human
        </p>
      </header>
      <motion.div
        layout
        transition={SPRING}
        className="rounded-2xl border border-ink-800 bg-ink-900/40 p-4"
      >
        <ul className="flex flex-wrap gap-1.5">
          {brand.brand_voice_traits.map((t) => (
            <li
              key={t}
              className="rounded-full border border-accent/30 bg-accent/5 px-2 py-0.5 text-[11px] font-medium text-accent"
            >
              {t}
            </li>
          ))}
        </ul>
        <p
          className="mt-3 text-[14px] leading-relaxed text-ink-200"
          style={{ fontFamily: bodyStack }}
        >
          {sample}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="grid grid-cols-[auto_1fr] items-center gap-1 text-[10px] uppercase tracking-widest text-ink-500">
            <MessageSquare size={10} />
            Sample for
          </span>
          {(Object.keys(SURFACE_LABELS) as SampleSurface[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void requestSample(s)}
              disabled={busy && activeSurface === s}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                activeSurface === s
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-ink-800 text-ink-400 hover:border-ink-700 hover:text-ink-200",
              )}
            >
              {busy && activeSurface === s ? (
                <Loader2 size={10} className="animate-[spin_1.4s_linear_infinite]" />
              ) : (
                <Sparkles size={10} />
              )}
              {SURFACE_LABELS[s]}
            </button>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
