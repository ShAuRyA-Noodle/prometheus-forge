/**
 * CommandPalette — global Cmd-K palette built on cmdk.
 *
 * Default categories (always present):
 *   Navigation, AI commands, Artifact actions, Account
 *
 * Components register transient actions via useRegisterCommands() — those
 * appear above defaults on the appropriate page (e.g. ResultsPage adds
 * "Regenerate pitch deck", "Branch to enterprise pivot").
 */
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo } from "react";
import {
  Building2,
  CreditCard,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useAuth } from "@/hooks/useAuth";
import { useCommandPalette, type CommandAction } from "@/hooks/useCommandPalette";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export function CommandPalette(): JSX.Element {
  const navigate = useNavigate();
  const { open, query, actions, setOpen, setQuery } = useCommandPalette();
  const { signOut } = useAuth();

  // Default actions (always available).
  const defaults = useMemo<CommandAction[]>(
    () => [
      {
        id: "nav.home",
        section: "Navigation",
        label: "Go to Home",
        icon: "LayoutDashboard",
        shortcut: "G H",
        perform: () => navigate("/"),
      },
      {
        id: "nav.companies",
        section: "Navigation",
        label: "My Companies",
        icon: "Building2",
        shortcut: "G C",
        perform: () => navigate("/companies"),
      },
      {
        id: "nav.billing",
        section: "Navigation",
        label: "Billing",
        icon: "CreditCard",
        shortcut: "G B",
        perform: () => navigate("/billing"),
      },
      {
        id: "nav.settings",
        section: "Navigation",
        label: "Settings",
        icon: "Settings",
        shortcut: "G S",
        perform: () => navigate("/settings"),
      },
      {
        id: "account.signout",
        section: "Account",
        label: "Sign out",
        icon: "LogOut",
        perform: async () => {
          await signOut();
          navigate("/");
        },
      },
      {
        id: "account.gdpr",
        section: "Account",
        label: "Request data export (GDPR)",
        icon: "KeyRound",
        perform: () => navigate("/settings#privacy"),
      },
      {
        id: "account.delete",
        section: "Account",
        label: "Delete account",
        icon: "Trash2",
        perform: () => navigate("/settings#danger"),
      },
      {
        id: "account.locale",
        section: "Account",
        label: "Change locale",
        icon: "Globe",
        perform: () => navigate("/settings#locale"),
      },
    ],
    [navigate, signOut],
  );

  const merged = useMemo(() => {
    const seen = new Set<string>();
    const out: CommandAction[] = [];
    for (const a of [...actions, ...defaults]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      if (a.hidden && !query) continue;
      out.push(a);
    }
    return out;
  }, [actions, defaults, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, CommandAction[]> = {};
    for (const a of merged) {
      groups[a.section] ??= [];
      groups[a.section]!.push(a);
    }
    return groups;
  }, [merged]);

  // Reset query whenever palette closes.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open, setQuery]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cmd-palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[80] grid place-items-start bg-ink-950/80 px-4 pt-[15vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Command palette"
            className="w-full max-w-[640px] overflow-hidden rounded-bento border border-ink-800 bg-ink-900/95 shadow-bento backdrop-blur"
          >
            <Command
              loop
              className="grid grid-rows-[auto_auto_1fr]"
              filter={(value, search) =>
                value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
              }
            >
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-ink-800 px-4 py-3">
                <Search className="h-4 w-4 text-ink-500" aria-hidden />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search commands…"
                  className="bg-transparent font-sans text-base text-ink-100 placeholder:text-ink-500 focus:outline-none"
                  data-mask
                />
                <kbd className="hidden rounded border border-ink-800 bg-ink-950 px-2 py-0.5 font-mono text-[10px] text-ink-500 sm:block">
                  Esc
                </kbd>
              </div>

              <Command.List className="max-h-[60vh] overflow-y-auto p-1.5 [scrollbar-width:thin]">
                <Command.Empty className="grid place-items-center py-8 text-sm text-ink-500">
                  No commands match "{query}".
                </Command.Empty>

                {Object.entries(grouped).map(([section, items]) => (
                  <Command.Group
                    key={section}
                    heading={section}
                    className="px-1.5 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-ink-500"
                  >
                    {items.map((a) => (
                      <Command.Item
                        key={a.id}
                        value={`${a.label} ${a.description ?? ""}`}
                        onSelect={() => {
                          void a.perform();
                          setOpen(false);
                        }}
                        className={cn(
                          "grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-200 outline-none",
                          "data-[selected=true]:bg-ink-800 data-[selected=true]:text-ink-50",
                        )}
                      >
                        <CommandIcon name={a.icon} />
                        <div className="grid gap-0.5">
                          <span>{a.label}</span>
                          {a.description && (
                            <span className="text-[11px] text-ink-500">{a.description}</span>
                          )}
                        </div>
                        {a.shortcut && (
                          <span className="font-mono text-[10px] text-ink-500">{a.shortcut}</span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>

              <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-ink-800 px-4 py-2 text-[10px] text-ink-500">
                <span>↑ ↓ to navigate · ↵ to run</span>
                <kbd className="rounded border border-ink-800 bg-ink-950 px-1.5 py-0.5 font-mono">
                  Cmd K
                </kbd>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Building2,
  CreditCard,
  Settings,
  LogOut,
  KeyRound,
  Trash2,
  Globe,
};

function CommandIcon({ name }: { name: string | undefined }): JSX.Element {
  const Icon = name ? ICON_MAP[name] : null;
  if (!Icon) return <span className="h-4 w-4" aria-hidden />;
  return <Icon className="h-4 w-4 text-ink-400" />;
}
