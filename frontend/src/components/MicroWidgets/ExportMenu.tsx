/**
 * ExportMenu — multi-target export dropdown.
 * Powered by Radix DropdownMenu + useExport hook.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, FileDown, FileSpreadsheet, FileText, Presentation } from "lucide-react";

import { cn } from "@/lib/cn";
import { useExport } from "@/hooks/useExport";
import { Spinner } from "./Spinner";
import type { ExportRequest } from "@/lib/api";

interface Props {
  sessionId: string;
  className?: string;
  /** Default artifact when target alone is picked. */
  defaultArtifact?: ExportRequest["artifact"];
}

interface Item {
  id: string;
  label: string;
  artifact: ExportRequest["artifact"];
  target: ExportRequest["target"];
  icon: typeof FileDown;
}

const ITEMS: readonly Item[] = [
  { id: "deck-pdf", label: "Deck → PDF", artifact: "deck", target: "pdf", icon: FileText },
  { id: "deck-slides", label: "Deck → Google Slides", artifact: "deck", target: "slides", icon: Presentation },
  { id: "summary-docs", label: "Summary → Google Docs", artifact: "summary", target: "docs", icon: FileText },
  { id: "summary-pdf", label: "Summary → PDF", artifact: "summary", target: "pdf", icon: FileText },
  { id: "model-sheets", label: "Financials → Google Sheets", artifact: "model", target: "sheets", icon: FileSpreadsheet },
  { id: "model-pdf", label: "Financials → PDF", artifact: "model", target: "pdf", icon: FileText },
  { id: "all-zip", label: "Everything → .zip", artifact: "all", target: "zip", icon: FileDown },
] as const;

export function ExportMenu({ sessionId, className }: Props) {
  const { trigger, busy } = useExport();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-full border border-ink-800 bg-ink-900/60 px-4 py-2 text-sm text-ink-100 hover:border-ink-600 hover:bg-ink-900 focus-ring",
          className,
        )}
        aria-label="Export options"
      >
        {busy ? <Spinner size={14} /> : <FileDown className="h-4 w-4" />}
        <span>Export</span>
        <ChevronDown className="h-4 w-4 text-ink-500" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 grid min-w-[260px] gap-0.5 rounded-2xl border border-ink-800 bg-ink-900/95 p-1.5 shadow-bento backdrop-blur"
        >
          {ITEMS.map((it) => (
            <DropdownMenu.Item
              key={it.id}
              onSelect={() =>
                void trigger({
                  session_id: sessionId,
                  artifact: it.artifact,
                  target: it.target,
                })
              }
              className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-200 outline-none data-[highlighted]:bg-ink-800 data-[highlighted]:text-ink-50 focus-ring"
            >
              <it.icon className="h-4 w-4 text-ink-500" aria-hidden />
              <span>{it.label}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
