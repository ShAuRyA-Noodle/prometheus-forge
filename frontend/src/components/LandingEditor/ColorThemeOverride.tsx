/**
 * ColorThemeOverride — per-section color overrides.
 *
 * Lets the user override the brand bg/fg/accent on a specific section (e.g.
 * make the pricing section dark while the rest stays light). Surfaces WCAG
 * contrast ratio + AA pass/fail in real time.
 */
import { useMemo } from "react";
import { Eye, EyeOff, Wand2 } from "lucide-react";

import {
  contrastRatio,
  isValidHex,
  normalizeHex,
  pickReadableForeground,
  wcagAA,
} from "../../lib/colorMath";
import { cn } from "../../lib/cn";

export interface ColorOverrideValue {
  bg?: string;
  fg?: string;
  accent?: string;
}

export interface ColorThemeOverrideProps {
  sectionId: string;
  sectionLabel: string;
  value: ColorOverrideValue;
  onChange: (next: ColorOverrideValue) => void;
  /** Default brand tokens — used to render "inherit" placeholders. */
  brandDefaults: { bg: string; fg: string; accent: string };
  className?: string;
}

export function ColorThemeOverride({
  sectionId,
  sectionLabel,
  value,
  onChange,
  brandDefaults,
  className,
}: ColorThemeOverrideProps): JSX.Element {
  const effectiveBg = normalizeHex(value.bg ?? brandDefaults.bg);
  const effectiveFg = normalizeHex(value.fg ?? brandDefaults.fg);
  const effectiveAccent = normalizeHex(value.accent ?? brandDefaults.accent);

  const ratio = useMemo(() => contrastRatio(effectiveFg, effectiveBg), [effectiveFg, effectiveBg]);
  const passesAA = useMemo(() => wcagAA(effectiveFg, effectiveBg, false), [effectiveFg, effectiveBg]);

  const overrideCount =
    (value.bg ? 1 : 0) + (value.fg ? 1 : 0) + (value.accent ? 1 : 0);

  return (
    <section
      aria-labelledby={`color-override-${sectionId}`}
      className={cn(
        "grid gap-3 rounded-2xl border border-ink-800 bg-ink-900/40 p-4",
        className,
      )}
    >
      <header className="grid grid-cols-[1fr_auto] items-baseline gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-ink-500">
            Section colors
          </p>
          <h3 id={`color-override-${sectionId}`} className="font-display text-sm text-ink-100">
            Override for {sectionLabel}
          </h3>
        </div>
        {overrideCount > 0 && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-[11px] text-ink-400 underline-offset-2 hover:text-ink-100 hover:underline focus-ring"
          >
            Reset to brand
          </button>
        )}
      </header>

      <div className="grid grid-cols-3 gap-3">
        <ColorField
          label="Background"
          value={value.bg}
          fallback={brandDefaults.bg}
          onChange={(bg) => onChange(omitOrSet(value, "bg", bg))}
        />
        <ColorField
          label="Text"
          value={value.fg}
          fallback={brandDefaults.fg}
          onChange={(fg) => onChange(omitOrSet(value, "fg", fg))}
        />
        <ColorField
          label="Accent"
          value={value.accent}
          fallback={brandDefaults.accent}
          onChange={(accent) => onChange(omitOrSet(value, "accent", accent))}
        />
      </div>

      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            fg: pickReadableForeground(effectiveBg),
          })
        }
        className="grid grid-cols-[auto_1fr] items-center justify-self-start gap-2 rounded-full border border-ink-800 bg-ink-950/40 px-3 py-1.5 text-[11px] text-ink-200 hover:bg-ink-900 focus-ring"
      >
        <Wand2 className="h-3 w-3" />
        Auto-pick legible text
      </button>

      <div
        aria-live="polite"
        className={cn(
          "grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl border px-3 py-2 text-[12px]",
          passesAA
            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
            : "border-amber-500/30 bg-amber-500/5 text-amber-200",
        )}
      >
        {passesAA ? (
          <Eye className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <EyeOff className="h-3.5 w-3.5" aria-hidden />
        )}
        <span>
          Contrast {ratio.toFixed(2)}× ·{" "}
          {passesAA ? "Passes WCAG AA for body text." : "Below WCAG AA — body text will strain."}
        </span>
        <PreviewSwatch bg={effectiveBg} fg={effectiveFg} accent={effectiveAccent} />
      </div>
    </section>
  );
}

function omitOrSet(
  value: ColorOverrideValue,
  key: keyof ColorOverrideValue,
  next: string | undefined,
): ColorOverrideValue {
  const out: ColorOverrideValue = { ...value };
  if (next === undefined) {
    delete out[key];
  } else {
    out[key] = next;
  }
  return out;
}

interface ColorFieldProps {
  label: string;
  value: string | undefined;
  fallback: string;
  onChange: (next: string | undefined) => void;
}

function ColorField({ label, value, fallback, onChange }: ColorFieldProps): JSX.Element {
  const display = normalizeHex(value ?? fallback);
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-ink-500">{label}</span>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-ink-800 bg-ink-950 px-2 py-1.5">
        <input
          type="color"
          value={display}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} color picker`}
          className="h-6 w-6 cursor-pointer rounded border border-ink-800 bg-transparent"
        />
        <input
          type="text"
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (!v) {
              onChange(undefined);
              return;
            }
            if (isValidHex(v)) onChange(normalizeHex(v));
            else onChange(v); // allow editing in-progress
          }}
          maxLength={7}
          placeholder={fallback}
          className="w-full bg-transparent font-mono text-xs text-ink-100 placeholder:text-ink-500 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Reset ${label} to brand default`}
            className="rounded p-0.5 text-ink-500 hover:bg-ink-800 hover:text-ink-200 focus-ring"
          >
            <span aria-hidden>×</span>
          </button>
        )}
      </div>
    </label>
  );
}

function PreviewSwatch({
  bg,
  fg,
  accent,
}: {
  bg: string;
  fg: string;
  accent: string;
}): JSX.Element {
  return (
    <span
      className="grid grid-cols-3 overflow-hidden rounded-md ring-1 ring-ink-800"
      style={{ height: 22, width: 56 }}
      aria-hidden
    >
      <span style={{ background: bg }} />
      <span style={{ background: fg }} />
      <span style={{ background: accent }} />
    </span>
  );
}
