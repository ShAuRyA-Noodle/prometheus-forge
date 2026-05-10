/**
 * SharePage — public read-only artifact viewer.
 *
 * Resolves a shareToken via /api/share/{token} to a session id + artifact type.
 * Renders an unauthenticated, read-only view:
 *   - summary  → executive summary text + one-liner
 *   - deck     → DeckEditor in read-only mode
 *   - landing  → SandboxedIframe with composed HTML (allow-forms only)
 *
 * Posts a view-tracking pixel (anonymous) to /api/share/{token}/view on mount.
 * Footer watermark: "Made with PROMETHEUS".
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, Eye, ScrollText, Sparkles } from "lucide-react";
import { z } from "zod";

import { SandboxedIframe } from "@/components/Sandbox/SandboxedIframe";
import { PurifiedHTML } from "@/components/Sandbox/PurifiedHTML";
import { Spinner } from "@/components/MicroWidgets/Spinner";
import {
  composeLandingHtml,
  seedLandingDoc,
  type LandingDoc,
} from "@/lib/composeLandingHtml";
import {
  BrandIdentityResultSchema,
  ExecutiveSummaryResultSchema,
  LandingPageResultSchema,
  PitchDeckResultSchema,
  type BrandIdentityResult,
  type BusinessModelResult,
  type ExecutiveSummaryResult,
  type LandingPageResult,
  type PitchDeckResult,
} from "@/types/agents";

type Artifact = "summary" | "deck" | "landing";

const ResolveSchema = z.object({
  share_token: z.string(),
  session_id: z.string(),
  artifact: z.enum(["summary", "deck", "landing"]),
  expires_at: z.string().datetime().nullable().optional(),
  watermarked: z.boolean().default(true),
  // Eager bundles — back-end may inline artifact for speed.
  payload: z
    .object({
      executive_summary: ExecutiveSummaryResultSchema.optional(),
      pitch_deck: PitchDeckResultSchema.optional(),
      landing_page: LandingPageResultSchema.optional(),
      brand_identity: BrandIdentityResultSchema.optional(),
    })
    .default({}),
});
type ResolveResponse = z.infer<typeof ResolveSchema>;

export function SharePage(): JSX.Element {
  const { shareToken = "" } = useParams<{ shareToken: string }>();
  const [resolved, setResolved] = useState<ResolveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Resolve.
  useEffect(() => {
    if (!shareToken) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/share/${encodeURIComponent(shareToken)}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "This share link doesn't exist." : `HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        const parsed = ResolveSchema.safeParse(j);
        if (!parsed.success) throw new Error("Server response malformed");
        if (cancelled) return;
        setResolved(parsed.data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not resolve share link");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  // View tracking pixel.
  useEffect(() => {
    if (!resolved || !shareToken) return;
    fetch(`/api/share/${encodeURIComponent(shareToken)}/view`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referrer: typeof document !== "undefined" ? document.referrer : null,
        viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
      }),
    }).catch(() => undefined);
  }, [resolved, shareToken]);

  if (loading) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-ink-950 text-ink-400">
        <Spinner size={28} />
      </main>
    );
  }

  if (error || !resolved) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-ink-950 px-4 text-ink-200">
        <section className="grid max-w-md gap-3 rounded-bento border border-ink-800 bg-ink-900/40 p-8 text-center shadow-bento">
          <h1 className="font-display text-2xl text-ink-50">Link unavailable</h1>
          <p className="text-sm text-ink-400">
            {error ?? "This share link may have expired or been revoked."}
          </p>
          <Link
            to="/"
            className="mx-auto rounded-full border border-ink-800 bg-ink-900/60 px-4 py-2 text-sm text-ink-200 hover:bg-ink-900 focus-ring"
          >
            <ChevronLeft className="-ml-1 mr-1 inline-block h-3.5 w-3.5" />
            Visit PROMETHEUS
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main role="main" className="grid min-h-[100dvh] grid-rows-[1fr_auto] bg-ink-950 text-ink-100">
      <ShareViewer
        artifact={resolved.artifact}
        payload={resolved.payload}
        sessionId={resolved.session_id}
      />
      <Watermark show={resolved.watermarked} />
    </main>
  );
}

function ShareViewer({
  artifact,
  payload,
  sessionId,
}: {
  artifact: Artifact;
  payload: ResolveResponse["payload"];
  sessionId: string;
}): JSX.Element {
  if (artifact === "summary") {
    return <SummaryView exec={payload.executive_summary ?? null} brand={payload.brand_identity ?? null} />;
  }
  if (artifact === "deck") {
    return <DeckView deck={payload.pitch_deck ?? null} brand={payload.brand_identity ?? null} sessionId={sessionId} />;
  }
  return <LandingView landing={payload.landing_page ?? null} brand={payload.brand_identity ?? null} />;
}

// ─── Summary ────────────────────────────────────────────────────────────────

function SummaryView({
  exec,
  brand,
}: {
  exec: ExecutiveSummaryResult | null;
  brand: BrandIdentityResult | null;
}): JSX.Element {
  if (!exec) {
    return (
      <section className="grid place-items-center px-4 py-12 text-sm text-ink-400">
        Executive summary unavailable.
      </section>
    );
  }
  const accent = brand?.color_palette.find((c) => c.role === "accent" || c.role === "primary")?.hex ?? "#FF5A1F";
  return (
    <article className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-12 md:px-6">
      <header className="grid gap-3">
        <span
          className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-widest"
          style={{
            borderColor: `${accent}55`,
            color: accent,
          }}
        >
          <ScrollText className="h-3 w-3" />
          Executive summary
        </span>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="font-display text-5xl leading-[1.05] text-ink-50 md:text-6xl"
        >
          {brand?.company_name ?? exec.one_liner}
        </motion.h1>
        {brand?.tagline && (
          <p className="text-xl text-ink-300">{brand.tagline}</p>
        )}
      </header>
      <PurifiedHTML
        html={exec.summary_text.replaceAll("\n", "<br/>")}
        className="text-base leading-relaxed text-ink-200"
      />
      <section aria-label="Highlights" className="grid gap-3">
        <span className="text-[11px] uppercase tracking-widest text-ink-500">Highlights</span>
        <ul className="grid gap-1.5">
          {exec.key_highlights.map((h) => (
            <li
              key={h}
              className="grid grid-cols-[auto_1fr] items-start gap-2 rounded-2xl border border-ink-800 bg-ink-900/40 p-3 text-sm text-ink-200"
            >
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
              {h}
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-3 rounded-bento border border-ink-800 bg-ink-900/30 p-5">
        <span className="text-[11px] uppercase tracking-widest text-ink-500">Pitch · 30s</span>
        <p className="text-base text-ink-200">{exec.elevator_pitch_30s}</p>
        <span className="text-[11px] uppercase tracking-widest text-ink-500">Pitch · 60s</span>
        <p className="text-sm text-ink-300">{exec.elevator_pitch_60s}</p>
      </section>
    </article>
  );
}

// ─── Deck ───────────────────────────────────────────────────────────────────

function DeckView({
  deck,
  brand,
  sessionId,
}: {
  deck: PitchDeckResult | null;
  brand: BrandIdentityResult | null;
  sessionId: string;
}): JSX.Element {
  const [activeIdx, setActiveIdx] = useState(0);

  if (!deck) {
    return (
      <section className="grid place-items-center px-4 py-12 text-sm text-ink-400">
        Pitch deck unavailable.
      </section>
    );
  }

  const slide = deck.slides[activeIdx] ?? deck.slides[0];
  if (!slide) {
    return (
      <section className="grid place-items-center px-4 py-12 text-sm text-ink-400">
        Empty deck.
      </section>
    );
  }
  const accent =
    brand?.color_palette.find((c) => c.role === "accent" || c.role === "primary")?.hex ?? "#FF5A1F";

  return (
    <article className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-8 md:px-6">
      <header className="grid grid-cols-[1fr_auto] items-center gap-3">
        <div>
          <span className="text-[11px] uppercase tracking-widest text-ink-500">
            Pitch deck · {deck.slides.length} slides
          </span>
          <h1 className="font-display text-3xl text-ink-50">
            {brand?.company_name ?? "Untitled"}
          </h1>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-ink-400">
          {sessionId.slice(0, 8)}…
        </span>
      </header>
      <motion.section
        key={slide.slide_number}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="aspect-video w-full overflow-hidden rounded-bento border border-ink-800 bg-ink-950 p-10 shadow-bento"
        style={{ background: `linear-gradient(180deg, ${accent}10 0%, transparent 70%)` }}
      >
        <span className="text-[10px] uppercase tracking-widest text-ink-500">
          Slide {slide.slide_number} · {slide.layout}
        </span>
        <h2 className="mt-2 font-display text-4xl leading-tight text-ink-50">{slide.title}</h2>
        <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-300">
          {slide.body}
        </p>
        {slide.image_url && (
          <img
            src={slide.image_url}
            alt=""
            loading="lazy"
            className="mt-6 max-h-64 rounded-md object-cover"
          />
        )}
      </motion.section>
      <ol className="flex gap-2 overflow-x-auto pb-2">
        {deck.slides.map((s, i) => (
          <li key={s.slide_number}>
            <button
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-current={i === activeIdx}
              className={`grid h-16 w-28 shrink-0 grid-rows-[auto_1fr] gap-0.5 rounded-md border p-2 text-left transition focus-ring ${
                i === activeIdx
                  ? "border-accent-500/50 bg-accent-500/10 text-ink-50"
                  : "border-ink-800 bg-ink-900/40 text-ink-300 hover:border-ink-700"
              }`}
            >
              <span className="font-mono text-[8px] uppercase tracking-widest text-ink-500">
                {s.slide_number} · {s.layout}
              </span>
              <span className="line-clamp-2 text-[10px] leading-tight">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </article>
  );
}

// ─── Landing ────────────────────────────────────────────────────────────────

function LandingView({
  landing,
  brand,
}: {
  landing: LandingPageResult | null;
  brand: BrandIdentityResult | null;
}): JSX.Element {
  const composed = useMemo(() => {
    if (!landing) return null;
    // Compose from the structured doc seed when we don't have edits.
    const dummyBusiness: BusinessModelResult | null = null;
    const doc: LandingDoc = seedLandingDoc(landing, brand ?? null, dummyBusiness);
    return composeLandingHtml(doc, brand ?? null);
  }, [landing, brand]);

  if (!landing || !composed) {
    return (
      <section className="grid place-items-center px-4 py-12 text-sm text-ink-400">
        Landing page unavailable.
      </section>
    );
  }
  return (
    <article className="grid h-full gap-2 px-2 py-2">
      <SandboxedIframe
        html={composed.html}
        css={composed.css}
        sandbox="allow-forms"
        title={landing.title}
        aspect="16/10"
        className="min-h-[80dvh]"
      />
    </article>
  );
}

// ─── Watermark ──────────────────────────────────────────────────────────────

function Watermark({ show }: { show: boolean }): JSX.Element {
  if (!show) return <></>;
  return (
    <footer
      role="contentinfo"
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-ink-800 bg-ink-950/80 px-4 py-2 text-[11px] text-ink-500 backdrop-blur"
    >
      <span className="grid grid-cols-[auto_1fr] items-center gap-1.5 justify-self-start">
        <Eye className="h-3 w-3" />
        Anonymous view tracking
      </span>
      <a
        href="/"
        className="grid grid-cols-[auto_1fr] items-center gap-1.5 rounded-full border border-ink-800 bg-ink-900/60 px-3 py-1 text-ink-300 hover:text-ink-50 focus-ring"
      >
        <Sparkles className="h-3 w-3 text-accent-500" />
        Made with PROMETHEUS
      </a>
      <span className="justify-self-end">Read-only preview</span>
    </footer>
  );
}

export default SharePage;
