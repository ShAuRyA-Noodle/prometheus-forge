/**
 * Hero — homepage hero, asymmetric layout.
 *
 * Anti-slop:
 *  - No 3-equal-cards-row.
 *  - No purple/blue gradients.
 *  - No Inter font.
 *  - One bold display line, supporting line, single asymmetric callout.
 */
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface Props {
  className?: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  secondaryLabel?: string;
  onSecondaryClick?: () => void;
}

export function Hero({
  className,
  ctaLabel = "Whisper an idea",
  onCtaClick,
  secondaryLabel = "Watch a 30-second example",
  onSecondaryClick,
}: Props) {
  return (
    <section
      aria-labelledby="hero-title"
      className={cn(
        "grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-end",
        className,
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="grid gap-5"
      >
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-ink-800 bg-ink-900/40 px-3 py-1 text-xs text-ink-300">
          <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-accent-500" />
          12 agents. ~75-120 seconds. Cited sources.
        </div>

        <h1
          id="hero-title"
          className="font-display text-5xl leading-[0.95] tracking-tight text-ink-50 sm:text-6xl md:text-[5.5rem]"
        >
          Whisper an idea.
          <br />
          <span className="text-ink-400">Get a company.</span>
        </h1>

        <p className="max-w-xl text-base text-ink-300 md:text-lg">
          Voice or text. We articulate, then a swarm builds the brand, deck,
          financial model, landing page, and legal docs while you watch each
          agent reason in real time.
        </p>

        <div className="grid w-full grid-cols-1 gap-3 sm:flex sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onCtaClick}
            className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-full bg-accent-500 px-6 py-3 text-base font-semibold text-ink-950 transition hover:bg-accent-400 focus-ring"
          >
            <span>{ctaLabel}</span>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onSecondaryClick}
            className="rounded-full border border-ink-800 bg-ink-900/40 px-5 py-3 text-sm text-ink-200 transition hover:border-ink-600 hover:bg-ink-900/70 focus-ring"
          >
            {secondaryLabel}
          </button>
        </div>
      </motion.div>

      {/* Single asymmetric callout — NOT a row of 3 features. */}
      <motion.aside
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...SPRING, delay: 0.06 }}
        className="grid gap-4 rounded-bento border border-ink-800 bg-ink-900/40 p-6 shadow-bento"
        aria-label="Live pipeline preview"
      >
        <div className="text-xs uppercase tracking-widest text-accent-500">
          Live, while you sip coffee
        </div>
        <div className="font-display text-2xl text-ink-50">
          Wave 1 — Foundation
        </div>
        <ul className="grid gap-2 text-sm text-ink-200">
          <li className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-accent-500" />
            Market research
            <span className="text-xs text-ink-500">12.4s</span>
          </li>
          <li className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-accent-500" />
            Competitive
            <span className="text-xs text-ink-500">9.2s</span>
          </li>
          <li className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-ink-500">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Brand identity
            <span className="text-xs">3.8s</span>
          </li>
          <li className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-ink-500">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Tech architecture
            <span className="text-xs">4.1s</span>
          </li>
        </ul>
        <div className="mt-2 grid grid-cols-[1fr_auto] items-end">
          <div className="grid gap-0.5">
            <div className="text-[11px] uppercase tracking-widest text-ink-500">
              Pipeline cost so far
            </div>
            <div className="font-mono text-sm text-ink-50">$0.42</div>
          </div>
          <div className="text-xs text-ink-500">cap $2.50</div>
        </div>
      </motion.aside>
    </section>
  );
}
