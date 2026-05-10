/**
 * RegenSteeringDialog — Radix Dialog for steering an agent re-run.
 *
 * Used by ResultsView, DeckEditor, BrandRefiner. User types a steering note,
 * picks scope (agent vs downstream-propagating), then submits. Parent calls
 * api.regen with the result.
 */
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, RefreshCw, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { Spinner } from "./MicroWidgets/Spinner";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface RegenSubmit {
  steering: string;
  propagateDownstream: boolean;
}

interface RegenSteeringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title of the artifact being steered (e.g. "Pitch deck"). */
  scopeLabel: string;
  /** Description shown above textarea. */
  description?: string;
  /** Default steering text — useful for "edit prior steering". */
  initialSteering?: string;
  /** Default value for propagate toggle (default true). */
  defaultPropagate?: boolean;
  busy?: boolean;
  onSubmit: (submit: RegenSubmit) => void | Promise<void>;
}

export function RegenSteeringDialog({
  open,
  onOpenChange,
  scopeLabel,
  description,
  initialSteering = "",
  defaultPropagate = true,
  busy = false,
  onSubmit,
}: RegenSteeringDialogProps): JSX.Element {
  const [steering, setSteering] = useState<string>(initialSteering);
  const [propagate, setPropagate] = useState<boolean>(defaultPropagate);

  useEffect(() => {
    if (open) {
      setSteering(initialSteering);
      setPropagate(defaultPropagate);
    }
  }, [open, initialSteering, defaultPropagate]);

  const submit = async () => {
    if (!steering.trim() || busy) return;
    await onSubmit({ steering: steering.trim(), propagateDownstream: propagate });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={SPRING}
                className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-bento border border-ink-800 bg-ink-900/95 p-6 shadow-bento backdrop-blur"
              >
                <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-500/15 text-accent-500">
                    <RefreshCw className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <Dialog.Title className="font-display text-xl text-ink-50">
                      Regenerate {scopeLabel}
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-ink-400">
                      {description ??
                        "Tell us what to change. The agent will re-run with this steering. Cost is added to your monthly cap."}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="rounded-full p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100 focus-ring"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="mt-5 grid gap-4">
                  <label className="grid gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-ink-500">
                      Steering note
                    </span>
                    <textarea
                      value={steering}
                      onChange={(e) => setSteering(e.target.value.slice(0, 800))}
                      rows={4}
                      placeholder="e.g. Pivot brand tone to clinical/professional. De-emphasize consumer language."
                      className="w-full resize-none rounded-2xl border border-ink-800 bg-ink-950 p-3 text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-accent-500/60"
                      autoFocus
                      data-mask
                    />
                    <span className="text-right text-[10px] tabular-nums text-ink-500">
                      {steering.length} / 800
                    </span>
                  </label>

                  <label className="grid grid-cols-[1fr_auto] items-start gap-3 rounded-xl border border-ink-800 bg-ink-950/40 p-3">
                    <div>
                      <div className="text-sm font-semibold text-ink-100">Propagate downstream</div>
                      <p className="mt-0.5 text-xs text-ink-400">
                        Re-run dependent agents (deck, summary, landing) when this regen completes.
                      </p>
                    </div>
                    <Switch.Root
                      checked={propagate}
                      onCheckedChange={setPropagate}
                      className="relative h-5 w-9 rounded-full bg-ink-800 transition data-[state=checked]:bg-accent-500"
                      aria-label="Propagate downstream"
                    >
                      <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-ink-50 transition data-[state=checked]:translate-x-[18px]" />
                    </Switch.Root>
                  </label>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="rounded-full border border-ink-800 bg-ink-900/60 px-4 py-2 text-sm text-ink-200 hover:bg-ink-900 focus-ring"
                    >
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={busy || !steering.trim()}
                    className={cn(
                      "grid grid-cols-[1fr_auto] items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition focus-ring",
                      busy || !steering.trim()
                        ? "bg-ink-800 text-ink-500 cursor-not-allowed"
                        : "bg-accent-500 text-ink-950 hover:bg-accent-400",
                    )}
                  >
                    <span>{busy ? "Queuing…" : "Re-run"}</span>
                    {busy ? <Spinner size={14} /> : <ArrowRight className="h-4 w-4" />}
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
