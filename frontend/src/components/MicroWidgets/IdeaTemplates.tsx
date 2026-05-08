/**
 * IdeaTemplates — 5 realistic founder ideas to seed the input.
 *
 * Anti-slop:
 *  - Real metrics ($189, 18% take rate, 47.2% conversion)
 *  - Real targets (pre-Series A, 12 metro areas, school districts)
 *  - No "Acme" / "Nexus" / "Flow" company names
 *  - Asymmetric layout (1 large + 4 small) — no 5-equal-cards-row
 */
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

import { IDEA_TEMPLATES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { track, Events } from "@/lib/analytics";

interface Props {
  onPick: (idea: string) => void;
  className?: string;
}

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export function IdeaTemplates({ onPick, className }: Props) {
  const [hero, ...rest] = IDEA_TEMPLATES;
  if (!hero) return null;

  const handlePick = (id: string, body: string) => {
    track(Events.TEMPLATE_PICKED, { template_id: id });
    onPick(body);
  };

  return (
    <section
      aria-label="Example ideas"
      className={cn(
        "grid grid-cols-1 gap-3 md:grid-cols-3 md:grid-rows-[auto_auto]",
        className,
      )}
    >
      <motion.button
        type="button"
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        onClick={() => handlePick(hero.id, hero.body)}
        className="group grid gap-3 rounded-bento border border-ink-800 bg-ink-900/40 p-5 text-left transition hover:border-accent-500/40 hover:bg-ink-900/60 md:col-span-2 md:row-span-2 focus-ring"
      >
        <div className="text-[11px] uppercase tracking-widest text-accent-500">
          {hero.category}
        </div>
        <div className="font-display text-xl text-ink-50">{hero.title}</div>
        <div className="text-sm text-ink-400">{hero.body}</div>
        <div className="mt-auto inline-flex items-center gap-1 text-xs text-ink-300 group-hover:text-accent-500">
          Use this idea <ArrowUpRight className="h-3 w-3" aria-hidden />
        </div>
      </motion.button>

      {rest.map((tpl, i) => (
        <motion.button
          key={tpl.id}
          type="button"
          layout
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0.05 * (i + 1) }}
          onClick={() => handlePick(tpl.id, tpl.body)}
          className="group grid grid-cols-[1fr_auto] items-start gap-3 rounded-2xl border border-ink-800 bg-ink-900/30 p-4 text-left transition hover:border-accent-500/40 hover:bg-ink-900/60 focus-ring"
        >
          <div className="grid gap-1">
            <div className="text-[10px] uppercase tracking-widest text-accent-500/80">
              {tpl.category}
            </div>
            <div className="text-sm font-semibold text-ink-50">{tpl.title}</div>
          </div>
          <ArrowUpRight
            className="h-4 w-4 translate-y-0.5 text-ink-500 transition group-hover:text-accent-500"
            aria-hidden
          />
        </motion.button>
      ))}
    </section>
  );
}
