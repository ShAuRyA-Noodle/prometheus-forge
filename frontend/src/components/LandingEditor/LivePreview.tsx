/**
 * LivePreview — sandboxed preview of LandingDoc.
 *
 * - Composes via composeLandingHtml (also runs DOMPurify).
 * - Renders into SandboxedIframe with sandbox="allow-forms" only.
 * - Debounces re-render on edits (300ms) so typing doesn't flash.
 * - Viewport switcher: desktop / tablet / mobile.
 */
import { useEffect, useMemo, useState } from "react";
import { Laptop, Monitor, Smartphone, Tablet } from "lucide-react";

import { SandboxedIframe } from "../Sandbox/SandboxedIframe";
import {
  composeLandingHtml,
  type LandingDoc,
} from "../../lib/composeLandingHtml";
import type { BrandIdentityResult } from "../../types/agents";
import { cn } from "../../lib/cn";

type Viewport = "desktop" | "laptop" | "tablet" | "mobile";

const VIEWPORT_WIDTHS: Record<Viewport, number> = {
  desktop: 1280,
  laptop: 1024,
  tablet: 768,
  mobile: 390,
};

const VIEWPORT_ICONS: Record<Viewport, React.ComponentType<{ className?: string }>> = {
  desktop: Monitor,
  laptop: Laptop,
  tablet: Tablet,
  mobile: Smartphone,
};

export interface LivePreviewProps {
  doc: LandingDoc;
  brand: BrandIdentityResult | null;
  className?: string;
  /** Debounce in ms before recomposing. Defaults to 300. */
  debounceMs?: number;
}

export function LivePreview({
  doc,
  brand,
  className,
  debounceMs = 300,
}: LivePreviewProps): JSX.Element {
  const [debouncedDoc, setDebouncedDoc] = useState<LandingDoc>(doc);
  const [viewport, setViewport] = useState<Viewport>("desktop");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedDoc(doc), debounceMs);
    return () => window.clearTimeout(t);
  }, [doc, debounceMs]);

  const composed = useMemo(
    () => composeLandingHtml(debouncedDoc, brand),
    [debouncedDoc, brand],
  );

  const width = VIEWPORT_WIDTHS[viewport];

  return (
    <section
      aria-label="Live preview"
      className={cn(
        "grid h-full grid-rows-[auto_1fr] gap-3 rounded-bento border border-ink-800 bg-ink-950/40 p-3",
        className,
      )}
    >
      <header className="grid grid-cols-[1fr_auto] items-center gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-ink-500">Preview</p>
          <p className="font-display text-sm text-ink-100">{debouncedDoc.title}</p>
        </div>
        <div role="radiogroup" aria-label="Viewport size" className="inline-flex gap-0.5 rounded-full border border-ink-800 bg-ink-900 p-1">
          {(Object.keys(VIEWPORT_WIDTHS) as Viewport[]).map((v) => {
            const Icon = VIEWPORT_ICONS[v];
            const active = viewport === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setViewport(v)}
                className={cn(
                  "grid grid-cols-[auto_1fr] items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition focus-ring",
                  active ? "bg-accent-500 text-ink-950" : "text-ink-400 hover:text-ink-200",
                )}
                aria-label={`${v} viewport`}
              >
                <Icon className="h-3 w-3" />
                <span className="uppercase tracking-wider">{v}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="overflow-auto rounded-2xl border border-ink-800 bg-ink-900/30 p-3 [scrollbar-width:thin]">
        <div
          style={{ width: `${width}px`, maxWidth: "100%" }}
          className="mx-auto"
        >
          <SandboxedIframe
            html={composed.html}
            css={composed.css}
            sandbox="allow-forms"
            title={debouncedDoc.title}
            aspect="16/10"
          />
        </div>
      </div>
    </section>
  );
}
