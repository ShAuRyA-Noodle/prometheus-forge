/**
 * ArticulationStep — Pre-Wave articulation overlay.
 *
 * Shown when ArticulationOutput has `clarifying_questions` or low confidence.
 * User reviews polished idea, accepts/edits, or keeps original.
 *
 * Calls back to parent which decides whether to call /api/articulation again
 * or proceed to /api/generate.
 */
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Check, MessageSquareText, Pencil, RotateCcw, X } from "lucide-react";

import type { ArticulationOutput } from "@/types/agents";
import { cn } from "@/lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface ArticulationStepProps {
  open: boolean;
  original: string;
  output: ArticulationOutput | null;
  onAccept: (polished: string, answers: Record<string, string>) => void;
  onKeepOriginal: () => void;
  onCancel: () => void;
}

export function ArticulationStep({
  open,
  original,
  output,
  onAccept,
  onKeepOriginal,
  onCancel,
}: ArticulationStepProps): JSX.Element {
  const [polished, setPolished] = useState<string>("");
  const [editing, setEditing] = useState<boolean>(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    setPolished(output?.polished_idea ?? original);
    setAnswers({});
  }, [output, original]);

  if (!output) return <></>;

  const confidencePct = Math.round(output.confidence * 100);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onCancel()}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={SPRING}
                className="fixed left-1/2 top-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-bento border border-ink-800 bg-ink-900/95 p-6 shadow-bento backdrop-blur"
              >
                <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-500/15 text-accent-500">
                    <MessageSquareText className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <Dialog.Title className="font-display text-xl text-ink-50">
                      Sharpen this before the swarm starts?
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-ink-400">
                      We rephrased your idea for the agents. Confidence{" "}
                      <span className="text-ink-200">{confidencePct}%</span>. Edit if it's off, or keep yours.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="rounded-full p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100 focus-ring"
                      aria-label="Cancel articulation"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="mt-5 grid gap-4">
                  <div className="grid gap-1.5">
                    <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px] uppercase tracking-widest text-ink-500">
                      <span>Polished idea</span>
                      <button
                        type="button"
                        onClick={() => setEditing((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-full border border-ink-800 px-2 py-0.5 text-[10px] text-ink-300 hover:bg-ink-800 focus-ring"
                      >
                        <Pencil className="h-3 w-3" />
                        {editing ? "Lock" : "Edit"}
                      </button>
                    </div>
                    {editing ? (
                      <textarea
                        value={polished}
                        onChange={(e) => setPolished(e.target.value.slice(0, 600))}
                        rows={5}
                        className="w-full resize-none rounded-2xl border border-accent-500/40 bg-ink-950 p-3 text-sm leading-relaxed text-ink-50 focus:outline-none focus:ring-2 focus:ring-accent-500/60"
                        data-mask
                      />
                    ) : (
                      <p className="rounded-2xl border border-ink-800 bg-ink-950/60 p-3 text-sm leading-relaxed text-ink-100">
                        {polished}
                      </p>
                    )}
                  </div>

                  {output.clarifying_questions.length > 0 && (
                    <div className="grid gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-ink-500">
                        Clarifying questions ({output.clarifying_questions.length})
                      </span>
                      {output.clarifying_questions.map((q, i) => (
                        <label key={i} className="grid gap-1">
                          <span className="text-xs text-ink-300">{q}</span>
                          <input
                            type="text"
                            value={answers[q] ?? ""}
                            onChange={(e) => setAnswers((p) => ({ ...p, [q]: e.target.value }))}
                            className="rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-accent-500/60"
                            placeholder="Optional answer"
                            data-mask
                          />
                        </label>
                      ))}
                    </div>
                  )}

                  {output.assumptions.length > 0 && (
                    <div className="grid gap-1 rounded-xl border border-ink-800/70 bg-ink-950/40 p-3 text-[12px]">
                      <span className="text-[10px] uppercase tracking-widest text-ink-500">
                        Assumptions we'll lock in
                      </span>
                      <ul className="grid gap-0.5">
                        {output.assumptions.map((a, i) => (
                          <li key={i} className="grid grid-cols-[auto_1fr] items-start gap-2 text-ink-200">
                            <Check className="mt-0.5 h-3 w-3 text-accent-500" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto_1fr]">
                  <button
                    type="button"
                    onClick={onKeepOriginal}
                    className={cn(
                      "grid grid-cols-[auto_1fr] items-center gap-2 rounded-full border border-ink-800 bg-ink-900/60 px-4 py-2.5 text-sm text-ink-200 hover:bg-ink-900 focus-ring",
                    )}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Use my original wording
                  </button>
                  <button
                    type="button"
                    onClick={() => onAccept(polished, answers)}
                    className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-accent-400 focus-ring"
                  >
                    <span>Use polished</span>
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
