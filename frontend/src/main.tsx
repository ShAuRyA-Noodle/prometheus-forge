/**
 * main.tsx — React 18 entry.
 *
 * Wraps the app in: BrowserRouter + Tooltip provider (Radix) + Toast (handled
 * by <Toaster/> inside App, since the Provider lives in Toaster itself) +
 * ErrorBoundary + Suspense. Bootstraps PostHog and Firebase auth state.
 */
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Tooltip from "@radix-ui/react-tooltip";

import { App } from "./App";
import { ErrorBoundary } from "@/components/MicroWidgets/ErrorBoundary";
import { Spinner } from "@/components/MicroWidgets/Spinner";
import { initAnalytics } from "@/lib/analytics";
import { bootstrapAuth } from "@/lib/auth";
import "./index.css";

// Side-effect bootstrap. PostHog skips silently if VITE_POSTHOG_KEY missing.
initAnalytics();
bootstrapAuth();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found in index.html");
}

const root = createRoot(container);

root.render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Tooltip.Provider delayDuration={250} skipDelayDuration={150}>
          <Suspense
            fallback={
              <div
                role="status"
                aria-label="Loading PROMETHEUS"
                className="grid min-h-[100dvh] place-items-center bg-ink-950 text-ink-400"
              >
                <Spinner size={28} />
              </div>
            }
          >
            <App />
          </Suspense>
        </Tooltip.Provider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
