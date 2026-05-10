/**
 * ExecutiveSummaryView — markdown-style render of the executive summary.
 *
 * Coherence gauge, one-liner hero, elevator pitch tabs, key highlights tiles.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Sparkles } from "lucide-react";

import { PurifiedHTML } from "./Sandbox/PurifiedHTML";
import { cn } from "@/lib/cn";
import type { ExecutiveSummaryResult } from "@/types/agents";

interface ExecutiveSummaryViewProps {
  exec: ExecutiveSummaryResult;
  className?: string;
}

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

function markdownToHTML(md: string): string {
  // Lightweight md → html. PurifiedHTML still runs DOMPurify on this.
  // Headings + paragraphs + bold + italics + lists + line breaks.
  const lines = md.split(/\n+/);
  const html: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    if (line.startsWith("### ")) html.push(`<h3>${inline(line.slice(4))}</h3>`);
    else if (line.startsWith("## ")) html.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith("# ")) html.push(`<h1>${inline(line.slice(2))}</h1>`);
    else html.push(`<p>${inline(line)}</p>`);
  }
  if (inList) html.push("</ul>");
  return html.join("\n");
}

function inline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function ExecutiveSummaryView({ exec, className }: ExecutiveSummaryViewProps): JSX.Element {
  const [pitchLen, setPitchLen] = useState<"30" | "60">("30");
  const html = markdownToHTML(exec.summary_text);
  const pct = Math.round(exec.coherence_score * 100);

  return (
    <section className={cn("grid gap-6", className)} aria-label="Executive summary">
      {/* Hero one-liner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="grid gap-3 rounded-bento border border-ink-800 bg-ink-900/40 p-7 shadow-bento"
      >
        <span className="text-[11px] uppercase tracking-widest text-accent-500">One-liner</span>
        <p className="font-display text-3xl leading-tight text-ink-50 md:text-4xl">
          {exec.one_liner}
        </p>
      </motion.div>

      {/* Highlights + coherence */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="grid gap-3">
          <span className="text-[11px] uppercase tracking-widest text-ink-500">Key highlights</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {exec.key_highlights.map((h, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: 0.04 * i }}
                className="grid grid-cols-[auto_1fr] items-start gap-2 rounded-2xl border border-ink-800 bg-ink-900/30 p-3 text-sm text-ink-200"
              >
                <span className="mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent-500/20 text-[9px] font-bold text-accent-500">
                  {i + 1}
                </span>
                <span>{h}</span>
              </motion.div>
            ))}
          </div>
        </div>
        <CoherenceGauge pct={pct} />
      </div>

      {/* Elevator pitch toggle */}
      <div className="grid gap-2 rounded-bento border border-ink-800 bg-ink-900/30 p-5">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-500">Elevator pitch</span>
          <div className="grid grid-cols-2 gap-1 rounded-full border border-ink-800 bg-ink-950 p-0.5">
            {(["30", "60"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPitchLen(v)}
                className={cn(
                  "rounded-full px-3 py-0.5 text-[11px] font-medium transition focus-ring",
                  pitchLen === v ? "bg-accent-500 text-ink-950" : "text-ink-400",
                )}
              >
                {v}s
              </button>
            ))}
          </div>
        </div>
        <p className="font-sans text-base leading-relaxed text-ink-100">
          {pitchLen === "30" ? exec.elevator_pitch_30s : exec.elevator_pitch_60s}
        </p>
      </div>

      {/* Body */}
      <div className="grid gap-2">
        <span className="text-[11px] uppercase tracking-widest text-ink-500">Full summary</span>
        <PurifiedHTML
          html={html}
          className="rounded-bento border border-ink-800 bg-ink-900/30 p-6 text-[14.5px] leading-relaxed text-ink-200 [&_h1]:mb-3 [&_h1]:font-display [&_h1]:text-2xl [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-xl [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-display [&_h3]:text-base [&_li]:my-1 [&_p]:my-2 [&_strong]:text-ink-50 [&_ul]:list-disc [&_ul]:pl-5"
        />
      </div>

      {exec.doc_url && (
        <a
          href={String(exec.doc_url)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-end rounded-full border border-ink-800 px-3 py-1.5 text-xs text-ink-300 hover:border-accent-500/40 hover:text-accent-500 focus-ring"
        >
          Open in Google Docs <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </section>
  );
}

function CoherenceGauge({ pct }: { pct: number }): JSX.Element {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING}
      className="grid place-items-center rounded-bento border border-ink-800 bg-ink-900/30 p-5"
      aria-label={`Coherence score: ${pct}%`}
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
          <span className="font-display text-2xl tabular-nums text-ink-50">{pct}</span>
          <span className="text-[9px] uppercase tracking-wider text-ink-500">coherence</span>
        </div>
      </div>
      <div className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-500">
        <Sparkles className="h-3 w-3 text-accent-500" /> cross-artifact alignment
      </div>
    </motion.div>
  );
}
