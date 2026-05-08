/**
 * PaywallModal — opens when usePaywallStore.show is called.
 *
 * Shows tier comparison (only tiers >= required), with the matching tier
 * highlighted. CTA → Stripe Checkout via api.checkout, then resolve()
 * the pending action when user returns post-payment (handled at App level).
 */
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { api, APIError } from "@/lib/api";
import { TIERS, type TierDefinition } from "@/types/billing";
import { TIER_RANK } from "@/types/user";
import { cn } from "@/lib/cn";
import { usePaywallStore } from "@/lib/billing";
import { useToast } from "@/hooks/useToast";
import { track, Events } from "@/lib/analytics";
import { Spinner } from "./Spinner";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export function PaywallModal() {
  const open = usePaywallStore((s) => s.open);
  const reason = usePaywallStore((s) => s.reason);
  const requiredTier = usePaywallStore((s) => s.requiredTier);
  const close = usePaywallStore((s) => s.close);
  const { error: errorToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const visibleTiers: readonly TierDefinition[] = requiredTier
    ? TIERS.filter((t) => TIER_RANK[t.id] >= TIER_RANK[requiredTier])
    : TIERS;

  const startCheckout = async (tierId: string) => {
    setBusy(tierId);
    track(Events.PAYWALL_CONVERTED, { tier: tierId, reason });
    try {
      const res = await api.checkout({
        tier: tierId,
        return_url: typeof window !== "undefined" ? window.location.href : undefined,
      });
      window.location.assign(res.url);
    } catch (err) {
      const msg =
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not start checkout.";
      errorToast("Checkout error", msg);
      setBusy(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && close()}>
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
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={SPRING}
                className="fixed left-1/2 top-1/2 z-50 w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-bento border border-ink-800 bg-ink-900/90 p-6 shadow-bento backdrop-blur"
              >
                <div className="grid grid-cols-[1fr_auto] items-start gap-4">
                  <div>
                    <Dialog.Title className="font-display text-2xl text-ink-50">
                      <span className="inline-flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-accent-500" />
                        Unlock this feature
                      </span>
                    </Dialog.Title>
                    {reason ? (
                      <Dialog.Description className="mt-1 text-sm text-ink-400">
                        {reason}
                      </Dialog.Description>
                    ) : null}
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="rounded-full p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100 focus-ring"
                      aria-label="Close paywall"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <div
                  className={cn(
                    "mt-6 grid gap-3",
                    visibleTiers.length === 1
                      ? "grid-cols-1"
                      : visibleTiers.length === 2
                        ? "grid-cols-1 md:grid-cols-2"
                        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
                  )}
                >
                  {visibleTiers.map((t) => (
                    <article
                      key={t.id}
                      className={cn(
                        "grid gap-3 rounded-2xl border bg-ink-950/40 p-5 transition",
                        t.highlight
                          ? "border-accent-500/50 ring-1 ring-accent-500/20"
                          : "border-ink-800",
                      )}
                    >
                      <header>
                        <h3 className="font-display text-lg text-ink-50">{t.label}</h3>
                        <p className="text-xs text-ink-400">{t.blurb}</p>
                      </header>
                      <div className="font-display text-3xl text-ink-50">
                        ${t.price_usd_monthly}
                        <span className="text-sm text-ink-500"> / mo</span>
                      </div>
                      <ul className="grid gap-1.5 text-sm text-ink-300">
                        {t.features.map((f) => (
                          <li key={f} className="grid grid-cols-[auto_1fr] items-start gap-2">
                            <Check className="mt-0.5 h-4 w-4 text-accent-500" aria-hidden />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => startCheckout(t.id)}
                        className={cn(
                          "mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold focus-ring disabled:opacity-60",
                          t.highlight
                            ? "bg-accent-500 text-ink-950 hover:bg-accent-400"
                            : "bg-ink-800 text-ink-100 hover:bg-ink-700",
                        )}
                      >
                        <span aria-hidden="true" />
                        <span className="text-center">
                          {busy === t.id ? "Redirecting…" : t.cta}
                        </span>
                        <span aria-hidden="true">
                          {busy === t.id ? <Spinner size={14} /> : null}
                        </span>
                      </button>
                    </article>
                  ))}
                </div>

                <p className="mt-4 text-center text-xs text-ink-500">
                  Cancel any time. Idea text is deleted after 30 days. No card sharing.
                </p>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
