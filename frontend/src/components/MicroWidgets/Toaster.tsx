/**
 * Toaster — Radix Toast root + viewport, wired to useToast store.
 * Animations via Framer (transform + opacity only).
 */
import * as Toast from "@radix-ui/react-toast";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

import { cn } from "@/lib/cn";
import { useToast, type ToastKind } from "@/hooks/useToast";

const KIND_STYLES: Record<ToastKind, { ring: string; icon: JSX.Element }> = {
  default: {
    ring: "ring-ink-700",
    icon: <Info className="h-4 w-4 text-ink-200" />,
  },
  success: {
    ring: "ring-success/40",
    icon: <CheckCircle2 className="h-4 w-4 text-success" />,
  },
  warning: {
    ring: "ring-warning/40",
    icon: <AlertTriangle className="h-4 w-4 text-warning" />,
  },
  error: {
    ring: "ring-danger/40",
    icon: <XCircle className="h-4 w-4 text-danger" />,
  },
};

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <Toast.Provider swipeDirection="right" duration={5000}>
      <AnimatePresence>
        {toasts.map((t) => (
          <Toast.Root
            key={t.id}
            duration={t.durationMs}
            onOpenChange={(open) => {
              if (!open) dismiss(t.id);
            }}
            asChild
            forceMount
          >
            <motion.div
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={SPRING}
              className={cn(
                "pointer-events-auto grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-2xl bg-ink-900 px-4 py-3 shadow-bento ring-1",
                KIND_STYLES[t.kind].ring,
              )}
            >
              <div className="mt-0.5">{KIND_STYLES[t.kind].icon}</div>
              <div className="grid gap-1">
                <Toast.Title className="text-sm font-semibold text-ink-50">
                  {t.title}
                </Toast.Title>
                {t.description ? (
                  <Toast.Description className="text-xs text-ink-400">
                    {t.description}
                  </Toast.Description>
                ) : null}
              </div>
              <Toast.Close
                aria-label="Dismiss"
                className="rounded-full p-1 text-ink-500 hover:bg-ink-800 hover:text-ink-200 focus-ring"
              >
                <span aria-hidden="true">×</span>
              </Toast.Close>
            </motion.div>
          </Toast.Root>
        ))}
      </AnimatePresence>
      <Toast.Viewport className="fixed bottom-4 right-4 z-[60] grid w-[min(360px,calc(100vw-2rem))] gap-2" />
    </Toast.Provider>
  );
}
