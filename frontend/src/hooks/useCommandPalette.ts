/**
 * useCommandPalette — global cmdk store.
 *
 * Components register actions during their lifecycle (`registerActions`).
 * <CommandPalette/> opens via Cmd-K and renders all currently-registered
 * actions, grouped by section.
 */
import { useEffect } from "react";
import { create } from "zustand";

import { track, Events } from "@/lib/analytics";

export interface CommandAction {
  id: string;
  section: string; // e.g. "Generation", "Navigation", "Account"
  label: string;
  description?: string;
  shortcut?: string;
  /** lucide-react icon name (optional). */
  icon?: string;
  perform: () => void | Promise<void>;
  /** If true, only show when matched directly by search. */
  hidden?: boolean;
}

interface CmdState {
  open: boolean;
  query: string;
  actions: CommandAction[];
  setOpen: (v: boolean) => void;
  toggle: () => void;
  setQuery: (q: string) => void;
  registerActions: (actions: CommandAction[]) => () => void;
}

export const useCommandPaletteStore = create<CmdState>((set, get) => ({
  open: false,
  query: "",
  actions: [],
  setOpen: (v) => {
    if (v) track(Events.CMD_PALETTE_OPENED);
    set({ open: v, query: v ? "" : get().query });
  },
  toggle: () => {
    const next = !get().open;
    if (next) track(Events.CMD_PALETTE_OPENED);
    set({ open: next, query: "" });
  },
  setQuery: (q) => set({ query: q }),
  registerActions: (actions) => {
    set((s) => ({ actions: [...s.actions, ...actions] }));
    return () => {
      const ids = new Set(actions.map((a) => a.id));
      set((s) => ({ actions: s.actions.filter((a) => !ids.has(a.id)) }));
    };
  },
}));

/**
 * Hook for components to register their actions for the current view.
 * Auto-cleanup on unmount.
 */
export function useRegisterCommands(actions: CommandAction[]): void {
  const register = useCommandPaletteStore((s) => s.registerActions);
  useEffect(() => {
    const unregister = register(actions);
    return unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(actions.map((a) => a.id))]);
}

export function useCommandPalette(): {
  open: boolean;
  query: string;
  actions: CommandAction[];
  setOpen: (v: boolean) => void;
  toggle: () => void;
  setQuery: (q: string) => void;
} {
  const open = useCommandPaletteStore((s) => s.open);
  const query = useCommandPaletteStore((s) => s.query);
  const actions = useCommandPaletteStore((s) => s.actions);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const toggle = useCommandPaletteStore((s) => s.toggle);
  const setQuery = useCommandPaletteStore((s) => s.setQuery);
  return { open, query, actions, setOpen, toggle, setQuery };
}
