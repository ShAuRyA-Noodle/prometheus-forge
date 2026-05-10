/**
 * DeployButton — opens DomainPicker, calls api.deploy, surfaces live URL.
 *
 * Behaviour:
 *  - Click → opens Radix Dialog containing DomainPicker.
 *  - User picks a domain → confirms → api.deploy fires.
 *  - On `live` status, we show the URL with a copy button.
 *  - On `queued`, we show a "we'll email you" message.
 */
import { useCallback, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, ExternalLink, Globe, Rocket, X } from "lucide-react";

import { api, APIError, type DeployResponse } from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { track, Events } from "../../lib/analytics";
import { DomainPicker, type DomainSelection } from "./DomainPicker";
import { Spinner } from "../MicroWidgets/Spinner";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface DeployButtonProps {
  sessionId: string;
  /** Optional brand name → seeds DomainPicker slug. */
  brandName?: string;
  className?: string;
}

export function DeployButton({
  sessionId,
  brandName,
  className,
}: DeployButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deployed, setDeployed] = useState<DeployResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { success, error: errorToast } = useToast();

  const deploy = useCallback(
    async (selection: DomainSelection) => {
      if (selection.premium && selection.priceUsd) {
        const ok = window.confirm(
          `This is a premium domain — it costs $${selection.priceUsd}/yr to register. Continue?`,
        );
        if (!ok) return;
      }
      setBusy(true);
      setError(null);
      track(Events.DEPLOY_TRIGGERED, { domain: selection.domain });
      try {
        const res = await api.deploy({
          session_id: sessionId,
          ...(selection.free ? {} : { custom_domain: selection.domain }),
        });
        setDeployed(res);
        success(
          res.status === "live" ? "Landing page deployed" : "Deploy queued",
          res.status === "live" ? res.deploy_url : "We will notify you when it goes live.",
        );
      } catch (e) {
        const msg =
          e instanceof APIError ? e.message : e instanceof Error ? e.message : "Deploy failed";
        setError(msg);
        errorToast("Deploy failed", msg);
      } finally {
        setBusy(false);
      }
    },
    [sessionId, success, errorToast],
  );

  const copy = useCallback(async () => {
    if (!deployed?.deploy_url) return;
    try {
      await navigator.clipboard.writeText(deployed.deploy_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      errorToast("Clipboard blocked", "Select and copy manually.");
    }
  }, [deployed, errorToast]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "grid grid-cols-[auto_1fr] items-center gap-2 rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-accent-400 focus-ring",
          className,
        )}
      >
        <Rocket className="h-4 w-4" />
        Deploy
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <AnimatePresence>
          {open && (
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
                  className="fixed left-1/2 top-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-bento border border-ink-800 bg-ink-900/95 p-5 shadow-bento backdrop-blur"
                >
                  <header className="grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-ink-800 pb-4">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-500/15 text-accent-500">
                      <Rocket className="h-4 w-4" />
                    </span>
                    <div>
                      <Dialog.Title className="font-display text-xl text-ink-50">
                        Deploy landing page
                      </Dialog.Title>
                      <Dialog.Description className="mt-1 text-sm text-ink-400">
                        Pick a domain. We push to Cloudflare Pages with HTTPS in seconds.
                      </Dialog.Description>
                    </div>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="rounded-full p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100 focus-ring"
                        aria-label="Close deploy dialog"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </header>

                  {!deployed ? (
                    <div className="mt-4 grid gap-3">
                      <DomainPicker {...(brandName ? { initialName: brandName } : {})} onSelect={(s) => void deploy(s)} />
                      {busy && (
                        <div
                          role="status"
                          aria-live="polite"
                          className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-xl border border-ink-800 bg-ink-950/40 px-3 py-2 text-xs text-ink-300"
                        >
                          <Spinner size={12} />
                          Deploying — pinning HTTPS, warming the CDN…
                        </div>
                      )}
                      {error && (
                        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                          {error}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-4">
                      <div className="grid gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                        <span className="text-[10px] uppercase tracking-widest text-emerald-300">
                          {deployed.status === "live" ? "Live" : "Queued"}
                        </span>
                        <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
                          <Globe className="h-4 w-4 text-emerald-300" />
                          <code className="truncate font-mono text-sm text-ink-100">
                            {deployed.deploy_url}
                          </code>
                          <button
                            type="button"
                            onClick={copy}
                            className="grid grid-cols-[auto_1fr] items-center gap-1 rounded-md bg-ink-800 px-3 py-1.5 text-xs text-ink-100 hover:bg-ink-700 focus-ring"
                          >
                            {copied ? (
                              <Check className="h-3.5 w-3.5 text-emerald-300" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            {copied ? "Copied" : "Copy"}
                          </button>
                          <a
                            href={deployed.deploy_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="grid grid-cols-[1fr_auto] items-center gap-1 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-accent-400 focus-ring"
                          >
                            Open
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDeployed(null);
                          setError(null);
                        }}
                        className="justify-self-start rounded-full border border-ink-800 bg-ink-900/60 px-4 py-1.5 text-xs text-ink-200 hover:bg-ink-900 focus-ring"
                      >
                        Deploy another domain
                      </button>
                    </div>
                  )}
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </>
  );
}
