/**
 * TypographyPreview — heading + body specimens with a curated alt-pair picker.
 *
 * Loads Google Fonts on demand via a per-pair link injection. Specimen text
 * uses real brand voice / tagline copy when available so users can see how
 * the typography reads in context.
 */
import { useEffect } from "react";
import { motion } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Type } from "lucide-react";
import type { Typography } from "../../types/agents";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface TypographyPreviewProps {
  typography: Typography;
  /** Sample text drawn from brand voice / tagline. */
  specimenHeading: string;
  specimenBody: string;
  onChange: (typography: Typography) => void;
  className?: string;
}

interface FontPair {
  id: string;
  label: string;
  heading_font: string;
  body_font: string;
  heading_url: string;
  body_url: string;
}

const PAIRS: FontPair[] = [
  {
    id: "cabinet-geist",
    label: "Cabinet Grotesk × Geist",
    heading_font: "Cabinet Grotesk",
    body_font: "Geist",
    heading_url:
      "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&display=swap",
    body_url: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&display=swap",
  },
  {
    id: "fraunces-inter-tight",
    label: "Fraunces × Inter Tight",
    heading_font: "Fraunces",
    body_font: "Inter Tight",
    heading_url:
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap",
    body_url: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;700&display=swap",
  },
  {
    id: "instrument-serif-host-grotesk",
    label: "Instrument Serif × Host Grotesk",
    heading_font: "Instrument Serif",
    body_font: "Host Grotesk",
    heading_url:
      "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap",
    body_url: "https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@400;500;700&display=swap",
  },
  {
    id: "space-grotesk-jetbrains",
    label: "Space Grotesk × JetBrains Mono",
    heading_font: "Space Grotesk",
    body_font: "JetBrains Mono",
    heading_url:
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap",
    body_url:
      "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap",
  },
  {
    id: "playfair-jetbrains",
    label: "Playfair × Source Sans 3",
    heading_font: "Playfair Display",
    body_font: "Source Sans 3",
    heading_url:
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap",
    body_url:
      "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;700&display=swap",
  },
];

function injectFontLink(url: string | undefined): void {
  if (!url) return;
  const exists = document.querySelector(`link[data-pm-font="${CSS.escape(url)}"]`);
  if (exists) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.dataset.pmFont = url;
  document.head.appendChild(link);
}

export function TypographyPreview({
  typography,
  specimenHeading,
  specimenBody,
  onChange,
  className,
}: TypographyPreviewProps): JSX.Element {
  useEffect(() => {
    injectFontLink(typography.heading_google_font_url ?? undefined);
    injectFontLink(typography.body_google_font_url ?? undefined);
  }, [typography.heading_google_font_url, typography.body_google_font_url]);

  const headingStack = `'${typography.heading_font}', Cabinet Grotesk, system-ui, sans-serif`;
  const bodyStack = `'${typography.body_font}', Geist, system-ui, sans-serif`;

  return (
    <section className={cn("flex flex-col gap-3", className)} aria-label="Typography preview">
      <header className="grid grid-cols-[1fr_auto] items-center gap-2">
        <div>
          <h2 className="font-display text-sm font-medium text-ink-100">Typography</h2>
          <p className="text-[11px] uppercase tracking-widest text-ink-500">
            {typography.heading_font} × {typography.body_font}
          </p>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2.5 py-1.5 text-[12px] text-ink-200 hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <Type size={12} />
              Pair
              <ChevronDown size={12} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 w-72 rounded-xl border border-ink-700/80 bg-ink-900/95 p-1 text-xs text-ink-100 shadow-bento backdrop-blur"
            >
              {PAIRS.map((p) => (
                <DropdownMenu.Item
                  key={p.id}
                  onSelect={() =>
                    onChange({
                      heading_font: p.heading_font,
                      body_font: p.body_font,
                      heading_google_font_url: p.heading_url,
                      body_google_font_url: p.body_url,
                    })
                  }
                  className="cursor-pointer rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-ink-800"
                >
                  {p.label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>
      <motion.div
        layout
        transition={SPRING}
        className="rounded-2xl border border-ink-800 bg-ink-900/40 p-5"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
          Heading · {typography.heading_font}
        </p>
        <p
          className="mt-2 break-words text-3xl text-ink-50"
          style={{ fontFamily: headingStack, lineHeight: 1.1, letterSpacing: "-0.01em" }}
        >
          {specimenHeading}
        </p>
        <p className="mt-5 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
          Body · {typography.body_font}
        </p>
        <p
          className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-200"
          style={{ fontFamily: bodyStack }}
        >
          {specimenBody}
        </p>
      </motion.div>
    </section>
  );
}
