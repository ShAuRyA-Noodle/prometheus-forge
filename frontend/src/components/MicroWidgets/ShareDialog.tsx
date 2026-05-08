/**
 * ShareDialog — public preview share link with optional analytics opt-in.
 *
 * Generates a signed URL via api.createShareLink, shows it for copy,
 * surfaces a "track views" toggle (off by default), and an "open preview"
 * button.
 */
import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, ExternalLink, Share2, X } from "lucide-react";
import { useState } from "react";

import { api, APIError, type ShareLinkResponse } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { track, Events } from "@/lib/analytics";
import { cn } from "@/lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface Props {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Artifact = "summary" | "deck" | "landing";

const ARTIFACT_LABELS: Record<Artifact, string> = {
  summary: "Executive summary",
  deck: "Pitch deck",
  landing: "Landing page",
};

export function ShareDialog({ sessionId, open, onOpenChange }: Props) {
  const [artifact, setArtifact] = useState<Artifact>("summary");
  const [analytics, setAnalytics] = useState<boolean>(false);
  const [link, setLink] = useState<ShareLinkResponse | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const { error: errorToast, success } = useToast();

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.createShareLink(sessionId, artifact);
      setLink(res);
      track(Events.SHARE_LINK_CREATED, { artifact, analytics_opt_in: analytics });
      success("Share link ready");
    } catch (err) {
      const msg =
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create share link";
      errorToast("Share failed", msg);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      errorToast("Clipboard blocked", "Select and copy manually.");
    }
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
                <div className="grid grid-cols-[1fr_auto] items-start gap-4">
                  <div>
                    <Dialog.Title className="grid grid-cols-[auto_1fr] items-center gap-2 font-display text-xl text-ink-50">
                      <Share2 className="h-4 w-4 text-accent-500" />
                      Share a public preview
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-ink-400">
                      Read-only signed URL. Idea text is not exposed.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="rounded-full p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100 focus-ring"
                      aria-label="Close share dialog"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="mt-5 grid gap-4">
                  <div>
                    <div className="mb-1.5 text-[11px] uppercase tracking-widest text-ink-500">
                      Artifact
                    </div>
                    <div className="grid grid-cols-3 gap-1 rounded-full border border-ink-800 bg-ink-950 p-1">
                      {(Object.keys(ARTIFACT_LABELS) as Artifact[]).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setArtifact(a)}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-medium transition focus-ring",
                            artifact === a
                              ? "bg-accent-500 text-ink-950"
                              : "text-ink-300 hover:bg-ink-900",
                          )}
                        >
                          {ARTIFACT_LABELS[a]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="grid grid-cols-[1fr_auto] items-start gap-3 rounded-2xl border border-ink-800 bg-ink-950/40 p-4">
                    <div>
                      <div className="text-sm font-semibold text-ink-100">
                        Track views (anonymized)
                      </div>
                      <div className="mt-0.5 text-xs text-ink-400">
                        Counts visits, region, device. No idea text. Opt-in.
                      </div>
                    </div>
                    <Switch.Root
                      checked={analytics}
                      onCheckedChange={setAnalytics}
                      className="relative h-5 w-9 rounded-full bg-ink-800 transition data-[state=checked]:bg-accent-500"
                      aria-label="Track views"
                    >
                      <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-ink-50 transition data-[state=checked]:translate-x-[18px]" />
                    </Switch.Root>
                  </label>

                  {link ? (
                    <div className="grid gap-2 rounded-2xl border border-ink-800 bg-ink-950/40 p-4">
                      <div className="text-[11px] uppercase tracking-widest text-ink-500">
                        Share link
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                        <input
                          readOnly
                          value={link.share_url}
                          className="truncate rounded-md bg-ink-900 px-3 py-2 text-xs text-ink-200 focus-ring"
                        />
                        <button
                          type="button"
                          onClick={copy}
                          className="grid grid-cols-[auto_1fr] items-center gap-1.5 rounded-md bg-ink-800 px-3 py-2 text-xs text-ink-100 hover:bg-ink-700 focus-ring"
                        >
                          {copied ? (
                            <Check className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {copied ? "Copied" : "Copy"}
                        </button>
                        <a
                          href={link.share_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md bg-accent-500 px-3 py-2 text-xs font-semibold text-ink-950 hover:bg-accent-400 focus-ring inline-flex items-center gap-1"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      {link.expires_at ? (
                        <div className="text-[11px] text-ink-500">
                          Expires {new Date(link.expires_at).toLocaleString()}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={generate}
                      disabled={busy}
                      className="rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-accent-400 focus-ring disabled:opacity-60"
                    >
                      {busy ? "Generating link…" : "Generate share link"}
                    </button>
                  )}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
