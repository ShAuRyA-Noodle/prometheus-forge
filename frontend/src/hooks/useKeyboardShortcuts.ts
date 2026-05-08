/**
 * useKeyboardShortcuts — Cmd-K, ?, /, Esc handlers + arbitrary key bindings.
 *
 * Skips matches when focus is in an input/textarea/contenteditable to avoid
 * stealing typing. Exception: explicit `allowInInput: true`.
 */
import { useEffect } from "react";

export interface ShortcutBinding {
  key: string; // e.g. "k", "/", "?"
  meta?: boolean; // ⌘ or Ctrl
  shift?: boolean;
  alt?: boolean;
  preventDefault?: boolean;
  allowInInput?: boolean;
  handler: (e: KeyboardEvent) => void;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useKeyboardShortcuts(bindings: ShortcutBinding[]): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inEditable = isEditable(e.target);
      for (const b of bindings) {
        if (e.key.toLowerCase() !== b.key.toLowerCase()) continue;
        const metaPressed = e.metaKey || e.ctrlKey;
        if (b.meta !== undefined && b.meta !== metaPressed) continue;
        if (b.shift !== undefined && b.shift !== e.shiftKey) continue;
        if (b.alt !== undefined && b.alt !== e.altKey) continue;
        if (inEditable && !b.allowInInput && b.meta !== true) continue;
        if (b.preventDefault !== false) e.preventDefault();
        b.handler(e);
        break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bindings]);
}
