/**
 * BrandRefiner — full brand-identity editor.
 *
 * Layout (CSS Grid, 3 columns ≥1024px, single column <1024px):
 *   ┌───────────────┬───────────────────────┬─────────────┐
 *   │ NameCandidates │ Palette + Typography │  LogoPreview │
 *   │  300px         │       1fr            │   320px     │
 *   └───────────────┴───────────────────────┴─────────────┘
 *
 * Bottom action bar:
 *   - "Apply changes" (commits local edits to parent via onChange)
 *   - "Regenerate brand" (calls onRegen with steering)
 *   - lock toggles aggregate state in `lockedRoles` Set.
 *
 * The editor is fully controlled — parent passes `brand` + receives `onChange`
 * with the next snapshot. Local component state only tracks transient UI
 * (focused candidate, busy flags, lockedRoles).
 */
import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, RotateCw, Sparkles, Tag, X } from "lucide-react";
import type {
  BrandIdentityResult,
  ColorEntry,
  NameCandidate,
  Typography,
} from "../../types/agents";
import { NameCandidateList } from "./NameCandidateList";
import { PalettePreview } from "./PalettePreview";
import { TypographyPreview } from "./TypographyPreview";
import { LogoPreview } from "./LogoPreview";
import { RegenSteering } from "./RegenSteering";
import { VoiceTraitsCard, type SampleSurface } from "./VoiceTraitsCard";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface BrandRefinerProps {
  sessionId: string;
  brand: BrandIdentityResult;
  onChange: (brand: BrandIdentityResult) => void;
  /** Apply staged edits — typically persists to backend. */
  onApply?: (brand: BrandIdentityResult) => Promise<void> | void;
  /** Regenerate the brand_identity agent with steering. */
  onRegen: (args: {
    steering: string;
    propagate_downstream: boolean;
    locked_roles: ColorEntry["role"][];
  }) => Promise<BrandIdentityResult>;
  /** Generate a new sample copy for a specific surface. */
  onSampleRequest: (surface: SampleSurface) => Promise<string>;
  /** Regenerate logo via Imagen. */
  onLogoRegen: (steering: string) => Promise<BrandIdentityResult>;
  className?: string;
}

export function BrandRefiner({
  sessionId: _sessionId,
  brand,
  onChange,
  onApply,
  onRegen,
  onSampleRequest,
  onLogoRegen,
  className,
}: BrandRefinerProps): JSX.Element {
  const [lockedRoles, setLockedRoles] = useState<Set<ColorEntry["role"]>>(new Set());
  const [logoBusy, setLogoBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  const handlePaletteChange = useCallback(
    (palette: ColorEntry[]) => {
      onChange({ ...brand, color_palette: palette });
    },
    [brand, onChange],
  );

  const handleToggleLock = useCallback(
    (role: ColorEntry["role"]) => {
      setLockedRoles((prev) => {
        const next = new Set(prev);
        if (next.has(role)) next.delete(role);
        else next.add(role);
        return next;
      });
    },
    [],
  );

  const handleTypographyChange = useCallback(
    (typography: Typography) => {
      onChange({ ...brand, typography });
    },
    [brand, onChange],
  );

  const handleMakePrimary = useCallback(
    (name: string) => {
      if (!name || name === brand.company_name) return;
      // Move the new primary to the top of name_alternatives, demote old.
      const oldPrimary: NameCandidate = {
        name: brand.company_name,
        rationale: "Previous primary name.",
        domain_com_available: null,
        uspto_conflicts: [],
        handle_x_available: null,
        handle_instagram_available: null,
      };
      const filtered = brand.name_alternatives.filter((c) => c.name !== name);
      onChange({
        ...brand,
        company_name: name,
        name_alternatives: [oldPrimary, ...filtered].slice(0, 5),
      });
    },
    [brand, onChange],
  );

  const handleReorder = useCallback(
    (from: number, to: number) => {
      const next = [...brand.name_alternatives];
      const [moved] = next.splice(from, 1);
      if (!moved) return;
      next.splice(to, 0, moved);
      onChange({ ...brand, name_alternatives: next });
    },
    [brand, onChange],
  );

  const handleRemove = useCallback(
    (idx: number) => {
      const next = brand.name_alternatives.filter((_, i) => i !== idx);
      onChange({ ...brand, name_alternatives: next });
    },
    [brand, onChange],
  );

  const handleAddCustom = useCallback(
    (name: string) => {
      if (brand.name_alternatives.some((c) => c.name === name)) return;
      const newCandidate: NameCandidate = {
        name,
        rationale: "Custom name added by you.",
        domain_com_available: null,
        uspto_conflicts: [],
        handle_x_available: null,
        handle_instagram_available: null,
      };
      onChange({
        ...brand,
        name_alternatives: [newCandidate, ...brand.name_alternatives].slice(0, 5),
      });
    },
    [brand, onChange],
  );

  const handleApply = useCallback(async () => {
    if (!onApply) return;
    setApplyBusy(true);
    try {
      await onApply(brand);
    } finally {
      setApplyBusy(false);
    }
  }, [brand, onApply]);

  const handleRegen = useCallback(
    async (steering: string, opts: { propagate_downstream: boolean }) => {
      setRegenBusy(true);
      try {
        const next = await onRegen({
          steering,
          propagate_downstream: opts.propagate_downstream,
          locked_roles: Array.from(lockedRoles),
        });
        onChange(next);
      } finally {
        setRegenBusy(false);
      }
    },
    [lockedRoles, onChange, onRegen],
  );

  const handleLogoRegen = useCallback(
    async (steering: string) => {
      setLogoBusy(true);
      try {
        const next = await onLogoRegen(steering);
        onChange(next);
      } finally {
        setLogoBusy(false);
      }
    },
    [onChange, onLogoRegen],
  );

  const specimen = useMemo(
    () => ({
      heading: brand.tagline,
      body:
        brand.brand_voice_sample_copy ||
        "We help teams ship startups in the time it takes to read a TechCrunch article. Real data, owned files, no slop.",
    }),
    [brand.tagline, brand.brand_voice_sample_copy],
  );

  return (
    <div
      className={cn(
        "grid h-[100dvh] min-h-[100dvh] w-full grid-rows-[auto_1fr_auto] bg-ink-950 text-ink-100",
        className,
      )}
    >
      <BrandTopBar
        primaryName={brand.company_name}
        tagline={brand.tagline}
        onTaglineChange={(tagline) => onChange({ ...brand, tagline })}
      />
      <div className="grid h-full w-full overflow-hidden grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <div className="hidden lg:block">
          <NameCandidateList
            primaryName={brand.company_name}
            candidates={brand.name_alternatives}
            onMakePrimary={handleMakePrimary}
            onReorder={handleReorder}
            onRemove={handleRemove}
            onAddCustom={handleAddCustom}
          />
        </div>
        <div className="grid h-full grid-rows-[auto_1fr] gap-6 overflow-y-auto p-6 [scrollbar-width:thin]">
          <div className="lg:hidden">
            <NameCandidateList
              primaryName={brand.company_name}
              candidates={brand.name_alternatives}
              onMakePrimary={handleMakePrimary}
              onReorder={handleReorder}
              onRemove={handleRemove}
              onAddCustom={handleAddCustom}
              className="!h-auto"
            />
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <PalettePreview
              palette={brand.color_palette}
              lockedRoles={lockedRoles}
              onPaletteChange={handlePaletteChange}
              onToggleLock={handleToggleLock}
            />
            <TypographyPreview
              typography={brand.typography}
              specimenHeading={specimen.heading}
              specimenBody={specimen.body}
              onChange={handleTypographyChange}
            />
            <VoiceTraitsCard brand={brand} onRequestSample={onSampleRequest} />
            <KeywordsCard
              keywords={brand.industry_keywords}
              onChange={(industry_keywords) => onChange({ ...brand, industry_keywords })}
            />
          </div>
          <RegenSteering
            agent="brand_identity"
            placeholder="Steer the whole brand: mood, references, personality…"
            onSubmit={(steering, opts) => handleRegen(steering, opts)}
            primaryLabel={
              <span className="grid grid-cols-[auto_1fr] items-center gap-2">
                <Sparkles size={12} />
                {regenBusy ? "Regenerating…" : "Regenerate brand"}
              </span>
            }
          />
        </div>
        <div className="hidden lg:block border-l border-ink-800 bg-ink-950/60 p-4">
          <LogoPreview
            brand={brand}
            busy={logoBusy}
            onRegenerate={handleLogoRegen}
          />
        </div>
        <div className="lg:hidden border-t border-ink-800 bg-ink-950/60 p-4">
          <LogoPreview
            brand={brand}
            busy={logoBusy}
            onRegenerate={handleLogoRegen}
          />
        </div>
      </div>
      <BrandActionBar
        applyBusy={applyBusy}
        regenBusy={regenBusy}
        lockedCount={lockedRoles.size}
        onApply={onApply ? handleApply : undefined}
        onClearLocks={() => setLockedRoles(new Set())}
      />
    </div>
  );
}

interface BrandTopBarProps {
  primaryName: string;
  tagline: string;
  onTaglineChange: (tagline: string) => void;
}

function BrandTopBar({ primaryName, tagline, onTaglineChange }: BrandTopBarProps): JSX.Element {
  return (
    <header className="grid grid-cols-[auto_1fr] items-center gap-4 border-b border-ink-800 bg-ink-950/80 px-5 py-3 backdrop-blur">
      <div>
        <h1 className="font-display text-base font-medium text-ink-50">{primaryName}</h1>
        <p className="text-[11px] uppercase tracking-widest text-ink-500">Brand Refiner</p>
      </div>
      <input
        type="text"
        value={tagline}
        onChange={(e) => onTaglineChange(e.target.value.slice(0, 120))}
        maxLength={120}
        aria-label="Tagline"
        className="w-full max-w-2xl justify-self-end rounded-md border border-ink-800 bg-ink-900 px-3 py-1.5 text-[14px] text-ink-100 placeholder:text-ink-600 focus:border-accent/50 focus:outline-none"
        placeholder="Tagline"
      />
    </header>
  );
}

interface BrandActionBarProps {
  applyBusy: boolean;
  regenBusy: boolean;
  lockedCount: number;
  onApply?: () => void;
  onClearLocks: () => void;
}

function BrandActionBar({
  applyBusy,
  regenBusy,
  lockedCount,
  onApply,
  onClearLocks,
}: BrandActionBarProps): JSX.Element {
  return (
    <motion.footer
      layout
      transition={SPRING}
      className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-ink-800 bg-ink-950/80 px-5 py-3 backdrop-blur"
    >
      <div className="flex items-center gap-3 text-[12px] text-ink-400">
        <span className="grid grid-cols-[auto_1fr] items-center gap-1">
          <Tag size={11} />
          {lockedCount} colors locked
        </span>
        {lockedCount > 0 && (
          <button
            type="button"
            onClick={onClearLocks}
            className="text-ink-500 underline-offset-2 hover:text-ink-100 hover:underline"
          >
            Clear locks
          </button>
        )}
        {regenBusy && (
          <span className="grid grid-cols-[auto_1fr] items-center gap-1 text-amber-300">
            <RotateCw size={11} className="animate-[spin_1.4s_linear_infinite]" />
            Regenerating…
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onApply && (
          <button
            type="button"
            onClick={onApply}
            disabled={applyBusy}
            className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {applyBusy ? <X size={12} /> : <Check size={12} />}
            <span>{applyBusy ? "Saving…" : "Apply changes"}</span>
          </button>
        )}
      </div>
    </motion.footer>
  );
}

interface KeywordsCardProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
}

function KeywordsCard({ keywords, onChange }: KeywordsCardProps): JSX.Element {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t || keywords.includes(t)) return;
    onChange([...keywords, t].slice(0, 10));
    setDraft("");
  };
  return (
    <section className="flex flex-col gap-3" aria-label="Industry keywords">
      <header>
        <h2 className="font-display text-sm font-medium text-ink-100">Keywords</h2>
        <p className="text-[11px] uppercase tracking-widest text-ink-500">
          Used by SEO + landing meta
        </p>
      </header>
      <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-4">
        <ul className="flex flex-wrap gap-1.5">
          {keywords.map((k, i) => (
            <li
              key={`${k}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-ink-700 bg-ink-900 px-2 py-0.5 text-[11.5px] text-ink-200"
            >
              <span>{k}</span>
              <button
                type="button"
                onClick={() => onChange(keywords.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${k}`}
                className="text-ink-500 hover:text-rose-300"
              >
                <X size={10} />
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="mt-3 grid grid-cols-[1fr_auto] gap-2"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={32}
            placeholder="Add keyword…"
            aria-label="New keyword"
            className="rounded-lg border border-ink-800 bg-ink-950 px-3 py-1.5 text-[12.5px] text-ink-100 placeholder:text-ink-600 focus:border-accent/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || keywords.length >= 10}
            className="rounded-lg border border-ink-800 bg-ink-900 px-3 py-1.5 text-[12.5px] text-ink-100 hover:bg-ink-800 disabled:opacity-40"
          >
            Add
          </button>
        </form>
      </div>
    </section>
  );
}
