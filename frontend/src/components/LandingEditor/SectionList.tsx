/**
 * SectionList — vertical list of LandingDoc sections with drag-to-reorder.
 *
 * Native HTML5 drag-and-drop (no extra deps). Each row:
 *  - drag handle (GripVertical)
 *  - section type icon + title
 *  - "last edited" relative time
 *  - delete (only enabled when section is not locked)
 *
 * Selection state is owned by parent; this component only emits events.
 */
import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  GripVertical,
  Image as ImageIcon,
  LayoutTemplate,
  ListChecks,
  MessageSquare,
  Plus,
  Quote,
  Sparkles,
  Trash2,
} from "lucide-react";

import type { LandingSection, LandingSectionType } from "../../lib/composeLandingHtml";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

const SECTION_LABELS: Record<LandingSectionType, string> = {
  hero: "Hero",
  features: "Features",
  pricing: "Pricing",
  testimonials: "Testimonials",
  faq: "FAQ",
  cta: "Final CTA",
  footer: "Footer",
};

const SECTION_ICONS: Record<LandingSectionType, React.ComponentType<{ className?: string }>> = {
  hero: ImageIcon,
  features: LayoutTemplate,
  pricing: ListChecks,
  testimonials: Quote,
  faq: MessageSquare,
  cta: Sparkles,
  footer: LayoutTemplate,
};

const ADDABLE: LandingSectionType[] = [
  "hero",
  "features",
  "pricing",
  "testimonials",
  "faq",
  "cta",
];

export interface SectionListProps {
  sections: LandingSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onAdd: (type: LandingSectionType) => void;
  onRemove: (id: string) => void;
  className?: string;
}

function relativeTime(updatedAt?: number): string {
  if (!updatedAt) return "Untouched";
  const diff = Date.now() - updatedAt;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function SectionList({
  sections,
  selectedId,
  onSelect,
  onReorder,
  onAdd,
  onRemove,
  className,
}: SectionListProps): JSX.Element {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const presentTypes = useMemo(
    () => new Set(sections.map((s) => s.type)),
    [sections],
  );

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback(
    (idx: number, e: React.DragEvent<HTMLLIElement>) => {
      e.preventDefault();
      setHoverIdx(idx);
    },
    [],
  );

  const handleDrop = useCallback(
    (idx: number) => {
      if (dragIdx === null || dragIdx === idx) {
        setDragIdx(null);
        setHoverIdx(null);
        return;
      }
      onReorder(dragIdx, idx);
      setDragIdx(null);
      setHoverIdx(null);
    },
    [dragIdx, onReorder],
  );

  return (
    <aside
      aria-label="Landing sections"
      className={cn(
        "grid h-full grid-rows-[auto_1fr_auto] overflow-hidden border-r border-ink-800 bg-ink-950/60",
        className,
      )}
    >
      <header className="border-b border-ink-800 px-4 py-3">
        <p className="text-[10px] uppercase tracking-widest text-ink-500">Sections</p>
        <p className="font-display text-sm text-ink-100">
          {sections.length} on this page
        </p>
      </header>

      <ol
        role="list"
        className="overflow-y-auto px-2 py-2 [scrollbar-width:thin]"
      >
        {sections.map((s, idx) => {
          const Icon = SECTION_ICONS[s.type];
          const isSelected = s.id === selectedId;
          const isDragging = dragIdx === idx;
          const isHover = hoverIdx === idx && dragIdx !== null && dragIdx !== idx;
          return (
            <motion.li
              key={s.id}
              layout
              transition={SPRING}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(idx, e)}
              onDragEnd={() => {
                setDragIdx(null);
                setHoverIdx(null);
              }}
              onDrop={() => handleDrop(idx)}
              className={cn(
                "group mb-1.5 grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl border px-2 py-2 text-left",
                isSelected
                  ? "border-accent-500/50 bg-accent-500/10"
                  : "border-ink-800 bg-ink-900/40 hover:border-ink-700",
                isDragging && "opacity-40",
                isHover && "ring-2 ring-accent-500/40",
              )}
            >
              <button
                type="button"
                aria-label="Reorder section"
                className="cursor-grab text-ink-500 active:cursor-grabbing"
                draggable={false}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className="grid grid-cols-[auto_1fr] items-center gap-2 truncate text-left focus-ring"
              >
                <Icon className={cn("h-3.5 w-3.5", isSelected ? "text-accent-500" : "text-ink-400")} />
                <div className="grid gap-0">
                  <span
                    className={cn(
                      "truncate text-[13px]",
                      isSelected ? "text-ink-50 font-semibold" : "text-ink-100",
                    )}
                  >
                    {SECTION_LABELS[s.type]}
                  </span>
                  <span className="font-mono text-[10px] text-ink-500">
                    {relativeTime(s.updatedAt)}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                disabled={s.locked || s.type === "footer"}
                aria-label={`Remove ${SECTION_LABELS[s.type]}`}
                className="rounded-md p-1 text-ink-500 opacity-0 transition group-hover:opacity-100 hover:bg-ink-800 hover:text-rose-300 focus-ring disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </motion.li>
          );
        })}
      </ol>

      <footer className="border-t border-ink-800 p-2">
        <p className="px-2 pb-1 text-[10px] uppercase tracking-widest text-ink-500">Add section</p>
        <div className="grid grid-cols-2 gap-1">
          {ADDABLE.map((t) => {
            const Icon = SECTION_ICONS[t];
            const present = presentTypes.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => onAdd(t)}
                disabled={present && t !== "features"}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900/40 px-2 py-1.5 text-[11px] text-ink-200 transition hover:bg-ink-900 focus-ring disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Icon className="h-3 w-3 text-ink-500" />
                <span className="truncate text-left">{SECTION_LABELS[t]}</span>
                <Plus className="h-3 w-3 text-ink-500" />
              </button>
            );
          })}
        </div>
      </footer>
    </aside>
  );
}
