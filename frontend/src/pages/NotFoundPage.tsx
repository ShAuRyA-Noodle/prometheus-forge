/**
 * NotFoundPage — 404 fallback.
 *
 * Looks at the URL pattern and offers a relevant suggestion (e.g. "/companies/abc"
 * with no result → suggests "/companies"). Always offers home.
 */
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Compass } from "lucide-react";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface Suggestion {
  href: string;
  label: string;
  reason: string;
}

function suggestionFor(pathname: string): Suggestion | null {
  if (pathname.startsWith("/companies/")) {
    return {
      href: "/companies",
      label: "All companies",
      reason: "We can't find that company — its session may have been deleted.",
    };
  }
  if (pathname.startsWith("/results/")) {
    return {
      href: "/companies",
      label: "Open recent runs",
      reason: "That run isn't in your session list. It may have expired (30 days).",
    };
  }
  if (pathname.startsWith("/generate/")) {
    return {
      href: "/",
      label: "Start a fresh run",
      reason: "Generation sessions live for 30 days — older ones disappear.",
    };
  }
  if (pathname.startsWith("/cohort/")) {
    return {
      href: "/billing",
      label: "Upgrade to Studio",
      reason: "Cohort dashboards are a Studio-tier feature.",
    };
  }
  if (pathname.startsWith("/share/")) {
    return {
      href: "/",
      label: "Visit the homepage",
      reason: "This share link may have expired or been revoked by its owner.",
    };
  }
  return null;
}

export function NotFoundPage(): JSX.Element {
  const { pathname } = useLocation();
  const suggestion = suggestionFor(pathname);

  return (
    <main
      role="main"
      className="grid min-h-[100dvh] place-items-center bg-ink-950 px-6 py-12 text-ink-100"
    >
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="grid w-full max-w-xl gap-6 rounded-bento border border-ink-800 bg-ink-900/40 p-8 shadow-bento"
      >
        <header className="grid gap-2">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ink-800 bg-ink-950 px-3 py-1 text-[11px] uppercase tracking-widest text-accent-500">
            <Compass className="h-3 w-3" />
            404 — off-trail
          </span>
          <h1 className="font-display text-5xl leading-[0.95] text-ink-50">
            We don't have that page.
          </h1>
          <p className="text-base text-ink-400">
            <code className="rounded bg-ink-950 px-1.5 py-0.5 font-mono text-xs text-ink-300">
              {pathname}
            </code>{" "}
            doesn't exist (anymore). Here's where to go next.
          </p>
        </header>

        {suggestion && (
          <Link
            to={suggestion.href}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-accent-500/40 bg-accent-500/10 p-4 transition hover:bg-accent-500/15 focus-ring"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-500/20 text-accent-500">
              <ArrowLeft className="h-4 w-4 rotate-180" />
            </span>
            <div className="grid gap-0.5">
              <span className="font-semibold text-ink-50">{suggestion.label}</span>
              <span className="text-xs text-ink-400">{suggestion.reason}</span>
            </div>
            <ArrowLeft className="h-4 w-4 rotate-180 text-ink-400" />
          </Link>
        )}

        <Link
          to="/"
          className="inline-flex items-center gap-2 justify-self-start rounded-full border border-ink-800 bg-ink-900/60 px-4 py-2 text-sm text-ink-200 transition hover:bg-ink-900 focus-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </motion.section>
    </main>
  );
}

export default NotFoundPage;
