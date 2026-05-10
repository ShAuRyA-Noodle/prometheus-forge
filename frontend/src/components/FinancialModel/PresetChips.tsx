/**
 * PresetChips — Conservative / Base / Aggressive snap-to chips that swap the
 * full assumption set in one click. The host listens for `onSelect` and runs
 * `recomputeDebounced` with the new assumptions.
 */
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { PRESETS, type PresetName } from "../../lib/financePresets";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface PresetChipsProps {
  active: PresetName | "custom";
  onSelect: (name: PresetName) => void;
  className?: string;
}

export function PresetChips({ active, onSelect, className }: PresetChipsProps): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="Scenario preset"
      className={cn(
        "inline-grid grid-cols-3 rounded-xl border border-ink-800 bg-ink-900/60 p-1",
        className,
      )}
    >
      {PRESETS.map((p) => {
        const isActive = active === p.name;
        return (
          <button
            key={p.name}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onSelect(p.name)}
            title={p.description}
            className={cn(
              "relative grid grid-cols-[auto_1fr] items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
              isActive ? "text-ink-50" : "text-ink-400 hover:text-ink-200",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="preset-pill"
                transition={SPRING}
                className="absolute inset-0 -z-0 rounded-lg bg-accent/20 ring-1 ring-accent/40"
              />
            )}
            <Check
              size={11}
              aria-hidden="true"
              className={cn("relative z-[1]", isActive ? "opacity-100" : "opacity-0")}
            />
            <span className="relative z-[1]">{p.label}</span>
          </button>
        );
      })}
      {active === "custom" && (
        <span className="col-span-3 px-3 py-1 text-center text-[10.5px] uppercase tracking-widest text-ink-500">
          Custom assumptions
        </span>
      )}
    </div>
  );
}
