/**
 * LogoPreview — renders an Imagen URL or sanitized SVG logo across three
 * background contexts (light, dark, monochrome) so the user can spot poor
 * legibility before shipping.
 *
 * SVG paths come from BrandIdentityResult.logo_svg_sanitized. Server has
 * already run nh3/bleach; we run DOMPurify too via PurifiedHTML.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageIcon, Loader2, RotateCw } from "lucide-react";
import type { BrandIdentityResult } from "../../types/agents";
import { PurifiedHTML } from "../Sandbox/PurifiedHTML";
import { RegenSteering } from "./RegenSteering";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface LogoPreviewProps {
  brand: BrandIdentityResult;
  busy?: boolean;
  onRegenerate: (steering: string) => Promise<void> | void;
  className?: string;
}

type Variant = "light" | "dark" | "mono";

const VARIANT_BG: Record<Variant, string> = {
  light: "#FAFAFA",
  dark: "#0A0A0B",
  mono: "#27272A",
};

export function LogoPreview({
  brand,
  busy = false,
  onRegenerate,
  className,
}: LogoPreviewProps): JSX.Element {
  const [variant, setVariant] = useState<Variant>("light");
  const hasImage = Boolean(brand.logo_image_url);
  const hasSvg = Boolean(brand.logo_svg_sanitized);

  return (
    <section
      className={cn("flex flex-col gap-3", className)}
      aria-label="Logo preview"
    >
      <header className="grid grid-cols-[1fr_auto] items-center gap-2">
        <div>
          <h2 className="font-display text-sm font-medium text-ink-100">Logo</h2>
          <p className="text-[11px] uppercase tracking-widest text-ink-500">
            {brand.logo_concept_description.slice(0, 84)}
            {brand.logo_concept_description.length > 84 ? "…" : ""}
          </p>
        </div>
        <div role="tablist" className="grid grid-cols-3 rounded-md border border-ink-800 bg-ink-900 p-0.5">
          {(Object.keys(VARIANT_BG) as Variant[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={variant === v}
              onClick={() => setVariant(v)}
              className={cn(
                "rounded px-2 py-1 text-[11px] uppercase tracking-wider transition-colors",
                variant === v ? "bg-ink-800 text-ink-50" : "text-ink-400 hover:text-ink-200",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </header>
      <motion.div
        layout
        transition={SPRING}
        className="relative grid place-items-center overflow-hidden rounded-2xl border border-ink-800 p-8"
        style={{ backgroundColor: VARIANT_BG[variant], minHeight: 240 }}
      >
        <AnimatePresence mode="wait">
          {busy ? (
            <motion.div
              key="busy"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-[auto_1fr] items-center gap-2 text-ink-300"
            >
              <Loader2 size={16} className="animate-[spin_1.4s_linear_infinite]" />
              <span className="text-sm">Regenerating…</span>
            </motion.div>
          ) : hasSvg ? (
            <motion.div
              key={`svg-${variant}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING}
              className={cn("grid place-items-center", variant === "mono" && "[&_*]:!fill-ink-100 [&_*]:!stroke-ink-100")}
              style={{ maxWidth: 240, maxHeight: 180 }}
            >
              <PurifiedHTML
                html={brand.logo_svg_sanitized ?? ""}
                prose={false}
                ariaLabel={`${brand.company_name} logo`}
                className="[&_svg]:max-h-[160px] [&_svg]:max-w-[220px]"
              />
            </motion.div>
          ) : hasImage ? (
            <motion.img
              key={`img-${variant}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING}
              src={brand.logo_image_url ?? undefined}
              alt={`${brand.company_name} logo`}
              loading="lazy"
              decoding="async"
              className="max-h-[180px] max-w-[240px] object-contain"
              style={variant === "mono" ? { filter: "grayscale(1) brightness(2)" } : undefined}
            />
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-[auto_1fr] items-center gap-2 text-ink-400"
            >
              <ImageIcon size={16} />
              <span className="text-sm">No logo yet — regenerate to fetch one.</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <RegenSteering
        agent="brand_identity"
        placeholder="more geometric, warmer, sharper monogram…"
        onSubmit={(steering) => onRegenerate(steering)}
        primaryLabel={
          <span className="grid grid-cols-[auto_1fr] items-center gap-2">
            <RotateCw size={12} />
            Regenerate logo
          </span>
        }
      />
    </section>
  );
}
