/**
 * useToast — Radix Toast wrapper.
 *
 * Toaster lives in App.tsx. This hook lets any component fire toasts via
 * a zustand store. Keep the API tiny: kind + title + description.
 */
import { create } from "zustand";

export type ToastKind = "default" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  durationMs: number;
}

interface ToastStore {
  toasts: Toast[];
  show: (
    input: Omit<Toast, "id" | "durationMs"> & { durationMs?: number },
  ) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (input) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const t: Toast = {
      id,
      durationMs: input.durationMs ?? 4500,
      kind: input.kind,
      title: input.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
    };
    set((s) => ({ toasts: [...s.toasts, t] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export function useToast(): {
  toasts: Toast[];
  toast: (
    input: Omit<Toast, "id" | "durationMs"> & { durationMs?: number },
  ) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
} {
  const toasts = useToastStore((s) => s.toasts);
  const show = useToastStore((s) => s.show);
  const dismiss = useToastStore((s) => s.dismiss);
  const clear = useToastStore((s) => s.clear);

  return {
    toasts,
    toast: show,
    success: (title, description) =>
      show(description !== undefined ? { kind: "success", title, description } : { kind: "success", title }),
    error: (title, description) =>
      show(description !== undefined ? { kind: "error", title, description } : { kind: "error", title }),
    warning: (title, description) =>
      show(description !== undefined ? { kind: "warning", title, description } : { kind: "warning", title }),
    dismiss,
    clear,
  };
}
