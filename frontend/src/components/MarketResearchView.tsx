/**
 * MarketResearchView — TAM / SAM / SOM tiles, CAGR sparkline, demographics,
 * timing score gauge, sources list.
 */
import { motion } from "framer-motion";
import { ExternalLink, Target, TrendingUp, Users } from "lucide-react";

import { cn } from "@/lib/cn";
import { DataPoint, formatCurrency } from "./DataPoint";
import type { MarketResearchResult } from "@/types/agents";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface MarketResearchViewProps {
  market: MarketResearchResult;
  className?: string;
}

export function MarketResearchView({ market, className }: MarketResearchViewProps): JSX.Element {
  const tamValue = typeof market.tam.value === "number" ? market.tam.value : 0;
  const samValue = typeof market.sam.value === "number" ? market.sam.value : 0;
  const somValue = typeof market.som.value === "number" ? market.som.value : 0;

  return (
    <section className={cn("grid gap-6", className)} aria-label="Market research">
      <div className="grid gap-4 md:grid-cols-3">
        <Tile primary>
          <div className="text-[10px] uppercase tracking-widest text-accent-500">Total addressable</div>
          <DataPoint point={market.tam} size="xl" hideUnit />
          <Bar pct={100} />
        </Tile>
        <Tile>
          <div className="text-[10px] uppercase tracking-widest text-ink-500">Serviceable addressable</div>
          <DataPoint point={market.sam} size="lg" hideUnit />
          <Bar pct={tamValue > 0 ? Math.min(100, (samValue / tamValue) * 100) : 0} />
        </Tile>
        <Tile>
          <div className="text-[10px] uppercase tracking-widest text-ink-500">Serviceable obtainable</div>
          <DataPoint point={market.som} size="lg" hideUnit />
          <Bar pct={tamValue > 0 ? Math.min(100, (somValue / tamValue) * 100) : 0} />
        </Tile>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Tile>
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent-500" />
            <span className="text-[10px] uppercase tracking-widest text-ink-500">Industry trends</span>
          </div>
          <ul className="mt-3 grid gap-2">
            {market.industry_trends.map((t, i) => (
              <li key={i} className="grid grid-cols-[auto_1fr] items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent-500/15 text-[9px] font-bold text-accent-500">
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Tile>

        <Tile>
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <Users className="h-4 w-4 text-accent-500" />
            <span className="text-[10px] uppercase tracking-widest text-ink-500">Target demographics</span>
          </div>
          <ul className="mt-3 grid gap-1.5">
            {market.target_demographics.map((d, i) => (
              <li key={i} className="rounded-md border border-ink-800 bg-ink-950/40 px-3 py-1.5 text-sm text-ink-200">
                {d}
              </li>
            ))}
          </ul>
        </Tile>
      </div>

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <TimingGauge score={market.market_timing_score} />
        <Tile>
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <Target className="h-4 w-4 text-accent-500" />
            <span className="text-[10px] uppercase tracking-widest text-ink-500">Why now (rationale)</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-200">{market.market_timing_rationale}</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-widest text-ink-500">CAGR</span>
            <DataPoint point={market.cagr} size="md" />
          </div>
        </Tile>
      </div>

      {market.sources.length > 0 && (
        <Tile>
          <div className="text-[10px] uppercase tracking-widest text-ink-500">
            Sources ({market.sources.length})
          </div>
          <ul className="mt-3 grid gap-2">
            {market.sources.map((s, i) => (
              <li key={i}>
                <a
                  href={String(s.source_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-md border border-ink-800 bg-ink-950/40 p-3 transition hover:border-accent-500/40 focus-ring"
                >
                  <div className="grid gap-0.5">
                    <span className="text-[11px] uppercase tracking-wider text-accent-500">
                      {s.publisher ?? new URL(String(s.source_url)).hostname}
                    </span>
                    <p className="line-clamp-2 text-sm text-ink-200">{s.text}</p>
                  </div>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 text-ink-500" />
                </a>
              </li>
            ))}
          </ul>
        </Tile>
      )}

      <p className="text-[11px] text-ink-500">
        TAM bar shows full market. SAM and SOM are scaled relative to TAM ({formatCurrency(tamValue)}).
      </p>
    </section>
  );
}

function Tile({ primary, children }: { primary?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className={cn(
        "grid gap-2 rounded-bento border bg-ink-900/40 p-5 shadow-bento",
        primary ? "border-accent-500/30" : "border-ink-800",
      )}
    >
      {children}
    </motion.article>
  );
}

function Bar({ pct }: { pct: number }): JSX.Element {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-900">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(2, pct)}%` }}
        transition={SPRING}
        className="h-full rounded-full bg-accent-500"
      />
    </div>
  );
}

function TimingGauge({ score }: { score: number }): JSX.Element {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (score / 10) * c;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING}
      className="grid place-items-center rounded-bento border border-ink-800 bg-ink-900/30 p-5"
      aria-label={`Market timing: ${score.toFixed(1)} / 10`}
    >
      <div className="relative grid h-24 w-24 place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#27272A" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="#FF5A1F"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="grid place-items-center">
          <span className="font-display text-2xl tabular-nums text-ink-50">{score.toFixed(1)}</span>
          <span className="text-[9px] uppercase tracking-wider text-ink-500">timing</span>
        </div>
      </div>
    </motion.div>
  );
}
