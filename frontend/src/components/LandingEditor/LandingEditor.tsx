/**
 * LandingEditor — top-level orchestrator for editing a generated landing page.
 *
 * Layout (CSS Grid):
 *   ┌────────┬─────────────────┬──────────────┐
 *   │  220px │      1fr        │   ~480px     │
 *   │ Sec.   │  SectionEditor  │ LivePreview  │
 *   │ List   │  (stacked)      │ + Deploy     │
 *   └────────┴─────────────────┴──────────────┘
 *
 * Mobile (<1024px): collapses to single column with a "preview" toggle.
 *
 * The editor accepts EITHER a `LandingPageResult` (then composes a seed
 * `LandingDoc`) or a pre-existing `LandingDoc`. State is fully controlled —
 * caller owns persistence.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

import { SectionList } from "./SectionList";
import { SectionEditor } from "./SectionEditor";
import { LivePreview } from "./LivePreview";
import { DeployButton } from "./DeployButton";
import { ColorThemeOverride } from "./ColorThemeOverride";
import {
  resolveBrandTokens,
  seedLandingDoc,
  type LandingDoc,
  type LandingSection,
  type LandingSectionType,
} from "../../lib/composeLandingHtml";
import type {
  BrandIdentityResult,
  BusinessModelResult,
  LandingPageResult,
} from "../../types/agents";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface LandingEditorProps {
  sessionId: string;
  /** Either a fresh agent result (seeds a doc) or a pre-existing doc. */
  result?: LandingPageResult | null;
  initialDoc?: LandingDoc | null;
  brand?: BrandIdentityResult | null;
  business?: BusinessModelResult | null;
  /** Persist callback — fires whenever the doc changes (debounced upstream). */
  onChange?: (doc: LandingDoc) => void;
  className?: string;
  /**
   * Lazy-load fallback shape kept compatible with ResultsView's `<LandingEditorView html={..} css={..}/>`
   * — when a raw html/css pair is provided, we render read-only preview only.
   */
  html?: string;
  css?: string;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptySectionOfType(type: LandingSectionType): LandingSection {
  const id = makeId();
  switch (type) {
    case "hero":
      return {
        id,
        type,
        data: {
          variant: "asymmetric",
          headline: "New hero headline",
          subheadline: "One supporting line.",
          cta_label: "Get started",
          cta_href: "#signup",
          background_pattern: "none",
        },
      };
    case "features":
      return {
        id,
        type,
        data: {
          headline: "What you'll ship",
          features: [{ title: "New feature", description: "Why it matters." }],
        },
      };
    case "pricing":
      return {
        id,
        type,
        data: {
          headline: "Pricing",
          tiers: [
            {
              name: "Starter",
              price_usd_monthly: 0,
              features: ["Core features"],
              target_segment: "Solo founders",
              cta_label: "Start free",
              cta_href: "#signup",
            },
          ],
        },
      };
    case "testimonials":
      return { id, type, data: { headline: "What teams say", testimonials: [] } };
    case "faq":
      return { id, type, data: { headline: "Common questions", entries: [] } };
    case "cta":
      return {
        id,
        type,
        data: {
          headline: "Ready when you are.",
          body: "Spin up the package in 90 seconds.",
          cta_label: "Start now",
          cta_href: "#signup",
        },
      };
    case "footer":
      return {
        id,
        type,
        data: { company_name: "Untitled", columns: [], copyright: "" },
      };
  }
}

export function LandingEditor({
  sessionId,
  result,
  initialDoc,
  brand,
  business,
  onChange,
  className,
  html,
  css,
}: LandingEditorProps): JSX.Element {
  // Seed doc from props.
  const seeded = useMemo<LandingDoc | null>(() => {
    if (initialDoc) return initialDoc;
    if (result) return seedLandingDoc(result, brand ?? null, business ?? null);
    return null;
  }, [initialDoc, result, brand, business]);

  const [doc, setDoc] = useState<LandingDoc | null>(seeded);
  const [selectedId, setSelectedId] = useState<string | null>(
    seeded?.sections[0]?.id ?? null,
  );
  const [showPreviewMobile, setShowPreviewMobile] = useState(false);

  useEffect(() => {
    if (seeded && !doc) {
      setDoc(seeded);
      setSelectedId(seeded.sections[0]?.id ?? null);
    }
  }, [seeded, doc]);

  useEffect(() => {
    if (doc && onChange) onChange(doc);
  }, [doc, onChange]);

  // Read-only fallback (when ResultsView calls with html/css only).
  if (!doc && (html || css)) {
    const compatHtml = html ?? "";
    const compatCss = css ?? "";
    return (
      <div className={cn("grid gap-2", className)}>
        <p className="text-[11px] uppercase tracking-widest text-ink-500">
          Preview only — open the full editor from the deck/landing tab to edit.
        </p>
        <iframe
          srcDoc={`<!doctype html><html><head><style>${compatCss.replace(/<\//g, "")}</style></head><body>${compatHtml}</body></html>`}
          sandbox="allow-forms"
          title="Landing preview"
          className="block h-[480px] w-full rounded-bento border border-ink-800 bg-ink-950"
        />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="grid place-items-center rounded-bento border border-ink-800 bg-ink-900/40 p-12 text-sm text-ink-400">
        Landing page hasn't generated yet.
      </div>
    );
  }

  const selected = doc.sections.find((s) => s.id === selectedId) ?? doc.sections[0];

  // ─── Mutators ──────────────────────────────────────────────────────────────
  const replaceSection = (next: LandingSection) => {
    setDoc((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) => (s.id === next.id ? next : s)),
      };
    });
  };

  const reorderSections = (from: number, to: number) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const next = [...prev.sections];
      const [moved] = next.splice(from, 1);
      if (!moved) return prev;
      next.splice(to, 0, moved);
      return { ...prev, sections: next };
    });
  };

  const addSection = (type: LandingSectionType) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const newSection = emptySectionOfType(type);
      // Insert before footer if present, otherwise append.
      const footerIdx = prev.sections.findIndex((s) => s.type === "footer");
      const sections = [...prev.sections];
      if (footerIdx >= 0) {
        sections.splice(footerIdx, 0, newSection);
      } else {
        sections.push(newSection);
      }
      return { ...prev, sections };
    });
    // Note: caller can select the new section by id post-mount; for now we keep current focus.
  };

  const removeSection = (id: string) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const sections = prev.sections.filter((s) => s.id !== id);
      return { ...prev, sections };
    });
    if (selectedId === id) setSelectedId(doc.sections[0]?.id ?? null);
  };

  const setColorOverride = (id: string, override: { bg?: string; fg?: string; accent?: string }) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const next = { ...(prev.section_color_overrides ?? {}) };
      if (Object.keys(override).length === 0) {
        delete next[id];
      } else {
        next[id] = override;
      }
      return { ...prev, section_color_overrides: next };
    });
  };

  const tokens = resolveBrandTokens(brand ?? null);

  return (
    <section
      aria-label="Landing editor"
      className={cn(
        "grid h-[calc(100dvh-8rem)] min-h-[640px] w-full overflow-hidden rounded-bento border border-ink-800",
        "grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_minmax(380px,480px)]",
        className,
      )}
    >
      <div className="hidden lg:block">
        <SectionList
          sections={doc.sections}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onReorder={reorderSections}
          onAdd={addSection}
          onRemove={removeSection}
        />
      </div>

      <div className="grid h-full grid-rows-[auto_1fr] overflow-hidden">
        <header className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-ink-800 bg-ink-950/60 px-4 py-3">
          <div className="grid gap-1">
            <input
              type="text"
              value={doc.title}
              onChange={(e) => setDoc({ ...doc, title: e.target.value })}
              maxLength={80}
              aria-label="Page title"
              placeholder="Page title"
              className="w-full bg-transparent font-display text-base text-ink-50 placeholder:text-ink-500 focus:outline-none"
            />
            <input
              type="text"
              value={doc.meta_description}
              onChange={(e) => setDoc({ ...doc, meta_description: e.target.value })}
              maxLength={200}
              aria-label="Meta description"
              placeholder="Meta description"
              className="w-full bg-transparent text-xs text-ink-400 placeholder:text-ink-600 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreviewMobile((v) => !v)}
              className="grid grid-cols-[auto_1fr] items-center gap-1 rounded-full border border-ink-800 bg-ink-900/60 px-3 py-1.5 text-xs text-ink-200 lg:hidden focus-ring"
              aria-pressed={showPreviewMobile}
            >
              {showPreviewMobile ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {showPreviewMobile ? "Editor" : "Preview"}
            </button>
            <DeployButton sessionId={sessionId} {...(brand?.company_name ? { brandName: brand.company_name } : {})} />
          </div>
        </header>

        <div className="overflow-y-auto p-5 [scrollbar-width:thin]">
          {showPreviewMobile ? (
            <LivePreview doc={doc} brand={brand ?? null} className="h-[70dvh] lg:hidden" />
          ) : (
            <motion.div layout transition={SPRING} className="grid gap-5">
              {selected && (
                <SectionEditor
                  sessionId={sessionId}
                  section={selected}
                  onChange={replaceSection}
                />
              )}
              {selected && (
                <ColorThemeOverride
                  sectionId={selected.id}
                  sectionLabel={selected.type}
                  value={doc.section_color_overrides?.[selected.id] ?? {}}
                  onChange={(o) => setColorOverride(selected.id, o)}
                  brandDefaults={{
                    bg: tokens.bg,
                    fg: tokens.fg,
                    accent: tokens.accent,
                  }}
                />
              )}
            </motion.div>
          )}
        </div>
      </div>

      <div className="hidden lg:block">
        <LivePreview doc={doc} brand={brand ?? null} className="h-full" />
      </div>
    </section>
  );
}

export default LandingEditor;
