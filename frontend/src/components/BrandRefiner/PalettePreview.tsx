/**
 * PalettePreview — interactive swatch grid for the brand color palette.
 *
 * Each swatch:
 *   - hex value (click to copy)
 *   - role chip (primary / accent / etc.)
 *   - lock toggle (when locked, regen leaves it untouched)
 *   - WCAG AA pill — contrast on white + black
 *   - native <input type="color"> for direct override
 *
 * "Rebalance unlocked" button reseeds unlocked entries by deriving
 * them from the locked anchor colors.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Lock, LockOpen, RefreshCcw } from "lucide-react";
import type { ColorEntry } from "../../types/agents";
import {
  contrastRatio,
  hexToHsl,
  hslToHex,
  normalizeHex,
  pickReadableForeground,
  wcagAA,
} from "../../lib/colorMath";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface PalettePreviewProps {
  palette: ColorEntry[];
  /** Which roles user has locked. */
  lockedRoles: Set<ColorEntry["role"]>;
  onPaletteChange: (palette: ColorEntry[]) => void;
  onToggleLock: (role: ColorEntry["role"]) => void;
  className?: string;
}

const ROLE_LABELS: Record<ColorEntry["role"], string> = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
  neutral_dark: "Neutral dark",
  neutral_light: "Neutral light",
  background: "Background",
  text: "Text",
};

export function PalettePreview({
  palette,
  lockedRoles,
  onPaletteChange,
  onToggleLock,
  className,
}: PalettePreviewProps): JSX.Element {
  return (
    <section
      className={cn("flex flex-col gap-3", className)}
      aria-label="Brand color palette"
    >
      <header className="grid grid-cols-[1fr_auto] items-center gap-2">
        <div>
          <h2 className="font-display text-sm font-medium text-ink-100">Palette</h2>
          <p className="text-[11px] uppercase tracking-widest text-ink-500">
            Lock anchors, rebalance the rest
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPaletteChange(rebalance(palette, lockedRoles))}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2.5 py-1.5 text-[12px] text-ink-200 hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <RefreshCcw size={12} aria-hidden="true" />
          Rebalance unlocked
        </button>
      </header>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {palette.map((c, idx) => (
          <Swatch
            key={`${c.role}-${idx}`}
            entry={c}
            locked={lockedRoles.has(c.role)}
            onChangeHex={(hex) => {
              const next = palette.map((p, i) => (i === idx ? annotate({ ...p, hex }) : p));
              onPaletteChange(next);
            }}
            onToggleLock={() => onToggleLock(c.role)}
          />
        ))}
      </div>
    </section>
  );
}

interface SwatchProps {
  entry: ColorEntry;
  locked: boolean;
  onChangeHex: (hex: string) => void;
  onToggleLock: () => void;
}

function Swatch({ entry, locked, onChangeHex, onToggleLock }: SwatchProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const hex = normalizeHex(entry.hex);
  const fgOnSwatch = pickReadableForeground(hex);

  const contrastWhite = useMemo(() => contrastRatio("#FFFFFF", hex), [hex]);
  const contrastBlack = useMemo(() => contrastRatio("#000000", hex), [hex]);
  const aaWhite = wcagAA("#FFFFFF", hex);
  const aaBlack = wcagAA("#000000", hex);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {
      /* noop — clipboard may be blocked in iframe */
    }
  };

  return (
    <motion.article
      layout
      transition={SPRING}
      className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40"
    >
      <div
        className="grid h-28 grid-rows-[1fr_auto] p-3"
        style={{ backgroundColor: hex, color: fgOnSwatch }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
            {ROLE_LABELS[entry.role]}
          </span>
          <button
            type="button"
            onClick={onToggleLock}
            aria-pressed={locked}
            aria-label={locked ? "Unlock color" : "Lock color"}
            className={cn(
              "rounded-md border px-1 py-0.5 text-[10px] uppercase tracking-wider transition-colors",
              locked ? "border-current bg-current/10" : "border-current/40 hover:bg-current/10",
            )}
          >
            {locked ? <Lock size={11} /> : <LockOpen size={11} />}
          </button>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="grid grid-cols-[auto_1fr] items-center gap-1.5 self-end justify-self-start rounded-md border border-current/30 bg-current/5 px-2 py-1 text-[12px] font-mono uppercase tracking-wider transition-colors hover:bg-current/15"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          <span>{hex.toUpperCase()}</span>
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-ink-800 bg-ink-950/40 px-3 py-2">
        <div className="grid grid-cols-2 gap-1 text-[10px] text-ink-400">
          <ContrastPill label="on #FFF" ratio={contrastWhite} pass={aaWhite} />
          <ContrastPill label="on #000" ratio={contrastBlack} pass={aaBlack} />
        </div>
        <input
          type="color"
          aria-label={`Edit ${ROLE_LABELS[entry.role]} color`}
          value={hex}
          onChange={(e) => onChangeHex(normalizeHex(e.target.value))}
          className="h-7 w-10 cursor-pointer rounded-md border border-ink-800 bg-transparent p-0"
        />
      </div>
    </motion.article>
  );
}

function ContrastPill({
  label,
  ratio,
  pass,
}: {
  label: string;
  ratio: number;
  pass: boolean;
}): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-between gap-1 rounded-md border px-1.5 py-0.5 font-mono",
        pass
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-rose-500/30 bg-rose-500/10 text-rose-300",
      )}
      title={`${label} contrast ${ratio.toFixed(2)} — ${pass ? "AA" : "below AA"}`}
    >
      <span>{label}</span>
      <span>{ratio.toFixed(1)}</span>
    </span>
  );
}

function annotate(entry: ColorEntry): ColorEntry {
  return {
    ...entry,
    contrast_on_white: contrastRatio("#FFFFFF", entry.hex),
    contrast_on_black: contrastRatio("#000000", entry.hex),
    wcag_aa_normal: wcagAA("#FFFFFF", entry.hex) || wcagAA("#000000", entry.hex),
  };
}

/** Rotate hue + tweak lightness for any unlocked entry, anchored to locked ones. */
function rebalance(
  palette: ColorEntry[],
  locked: Set<ColorEntry["role"]>,
): ColorEntry[] {
  const anchor = palette.find((p) => locked.has(p.role)) ?? palette[0];
  const anchorHex = normalizeHex(anchor?.hex ?? "#FF5A1F");
  const { h: anchorH } = hexToHsl(anchorHex);
  return palette.map((entry, idx) => {
    if (locked.has(entry.role)) return entry;
    const offset = [0, 30, -30, 60, -60, 12, -12][idx % 7] ?? 0;
    const lightness =
      entry.role === "background"
        ? 96
        : entry.role === "text"
          ? 12
          : entry.role === "neutral_dark"
            ? 22
            : entry.role === "neutral_light"
              ? 90
              : entry.role === "secondary"
                ? 64
                : 50;
    const sat = entry.role === "background" || entry.role.startsWith("neutral") ? 8 : 70;
    const hex = hslToHex(anchorH + offset, sat, lightness);
    return annotate({ ...entry, hex });
  });
}
