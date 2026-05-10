/**
 * DomainPicker — domain availability lookup with TLD chips.
 *
 * - Free `*.prometheus.app` subdomain always available.
 * - Real-time .com / .ai / .app / .io / .co checks via debounced
 *   api.checkDomain wrapper (availabilityClient).
 * - Premium domains show price hint when registrar returns one.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Globe, Loader2, ShoppingCart, X } from "lucide-react";

import {
  TLD_OPTIONS,
  checkDomainDebounced,
  toSlug,
  type TLD,
} from "../../lib/availabilityClient";
import type { DomainCheckResponse } from "../../lib/api";
import { cn } from "../../lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

export interface DomainSelection {
  /** Final domain (e.g. "myapp.com" or "myapp.prometheus.app"). */
  domain: string;
  /** Was this a free subdomain (no purchase needed)? */
  free: boolean;
  /** Premium domain — needs registrar checkout. */
  premium: boolean;
  /** Price quote in USD if premium. */
  priceUsd: number | null;
}

export interface DomainPickerProps {
  /** Optional brand name to seed the slug. */
  initialName?: string;
  onSelect: (selection: DomainSelection) => void;
  className?: string;
}

export function DomainPicker({
  initialName,
  onSelect,
  className,
}: DomainPickerProps): JSX.Element {
  const [slug, setSlug] = useState<string>(() => toSlug(initialName ?? ""));
  const [tld, setTld] = useState<TLD | "subdomain">("subdomain");
  const [results, setResults] = useState<Record<TLD, DomainCheckResponse | null>>({
    ".com": null,
    ".ai": null,
    ".app": null,
    ".io": null,
    ".co": null,
  });
  const [busy, setBusy] = useState<Record<TLD, boolean>>({
    ".com": false,
    ".ai": false,
    ".app": false,
    ".io": false,
    ".co": false,
  });

  // Re-run lookups whenever slug changes.
  useEffect(() => {
    if (slug.length < 3) {
      setResults({ ".com": null, ".ai": null, ".app": null, ".io": null, ".co": null });
      return;
    }
    let cancelled = false;
    for (const ext of TLD_OPTIONS) {
      setBusy((b) => ({ ...b, [ext]: true }));
      checkDomainDebounced(`${slug}${ext}`)
        .then((res) => {
          if (cancelled) return;
          setResults((r) => ({ ...r, [ext]: res }));
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          if (e instanceof DOMException && e.name === "AbortError") return;
          setResults((r) => ({ ...r, [ext]: null }));
        })
        .finally(() => {
          if (cancelled) return;
          setBusy((b) => ({ ...b, [ext]: false }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const selection: DomainSelection = useMemo(() => {
    if (tld === "subdomain") {
      return {
        domain: `${slug || "your-app"}.prometheus.app`,
        free: true,
        premium: false,
        priceUsd: null,
      };
    }
    const res = results[tld];
    return {
      domain: `${slug}${tld}`,
      free: false,
      premium: Boolean(res?.premium),
      priceUsd: res?.price_usd ?? null,
    };
  }, [tld, slug, results]);

  return (
    <section
      aria-label="Domain picker"
      className={cn("grid gap-3 rounded-2xl border border-ink-800 bg-ink-900/40 p-4", className)}
    >
      <div className="grid grid-cols-[auto_1fr] items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-500/15 text-accent-500">
          <Globe className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-ink-500">Domain</p>
          <p className="text-sm text-ink-100">Where this lives on the open web.</p>
        </div>
      </div>

      <label className="grid gap-1">
        <span className="text-[10px] uppercase tracking-widest text-ink-500">Subdomain / brand slug</span>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(toSlug(e.target.value))}
          placeholder="your-brand"
          maxLength={63}
          className="w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 font-mono text-sm text-ink-100 placeholder:text-ink-500 focus-ring"
          aria-label="Domain slug"
        />
      </label>

      {/* Free subdomain card */}
      <button
        type="button"
        onClick={() => setTld("subdomain")}
        className={cn(
          "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border bg-ink-950/40 p-3 text-left focus-ring",
          tld === "subdomain"
            ? "border-accent-500/50 ring-1 ring-accent-500/20"
            : "border-ink-800 hover:border-ink-700",
        )}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
          <Check className="h-3.5 w-3.5" />
        </span>
        <div>
          <span className="font-mono text-[13px] text-ink-100">
            {slug || "your-brand"}.prometheus.app
          </span>
          <p className="text-[11px] text-ink-400">Free, instant, HTTPS by default.</p>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
          Free
        </span>
      </button>

      {/* TLDs */}
      <div className="grid gap-2">
        {TLD_OPTIONS.map((ext) => {
          const r = results[ext];
          const isBusy = busy[ext];
          const active = tld === ext;
          return (
            <motion.button
              key={ext}
              layout
              transition={SPRING}
              type="button"
              onClick={() => setTld(ext)}
              disabled={r != null && !r.available && !r.premium}
              className={cn(
                "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border bg-ink-950/40 p-3 text-left focus-ring disabled:cursor-not-allowed disabled:opacity-40",
                active
                  ? "border-accent-500/50 ring-1 ring-accent-500/20"
                  : "border-ink-800 hover:border-ink-700",
              )}
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin text-ink-500" />
              ) : r?.available ? (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : r ? (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-rose-500/15 text-rose-300">
                  <X className="h-3.5 w-3.5" />
                </span>
              ) : (
                <span className="h-7 w-7 rounded-full border border-dashed border-ink-700" />
              )}
              <div>
                <span className="font-mono text-[13px] text-ink-100">
                  {slug || "your-brand"}
                  <span className="text-ink-400">{ext}</span>
                </span>
                <p className="text-[11px] text-ink-400">
                  {isBusy
                    ? "Checking…"
                    : r?.available
                      ? r.premium
                        ? "Premium domain — requires checkout."
                        : "Available · register on checkout."
                      : r
                        ? "Taken — pick another."
                        : "Type a slug to check availability."}
                </p>
              </div>
              {r?.price_usd != null && (
                <span className="grid grid-cols-[auto_1fr] items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
                  <ShoppingCart className="h-3 w-3" />
                  ${r.price_usd}/yr
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      <footer className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-ink-800 bg-ink-950/40 px-3 py-2 text-[12px]">
        <span className="text-ink-400">
          Selected:{" "}
          <span className="font-mono text-ink-100">{selection.domain}</span>
        </span>
        <button
          type="button"
          onClick={() => onSelect(selection)}
          disabled={!slug}
          className="rounded-full bg-accent-500 px-3 py-1.5 text-[11px] font-semibold text-ink-950 hover:bg-accent-400 focus-ring disabled:opacity-50"
        >
          Use this domain
        </button>
      </footer>
    </section>
  );
}
