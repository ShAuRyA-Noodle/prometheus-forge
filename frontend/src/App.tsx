/**
 * App.tsx — top-level router + global UI shell.
 *
 * - Defines all routes
 * - Mounts global components: <CommandPalette/>, <Toaster/>, <PaywallModal/>
 * - Cmd-K (or Ctrl-K) toggles the palette
 * - "?" shortcut (when not in input) opens the keyboard help (proxies into
 *   the palette filtered by "shortcut")
 */
import { lazy, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import { CommandPalette } from "@/components/CommandPalette";
import { PaywallModal } from "@/components/MicroWidgets/PaywallModal";
import { Toaster } from "@/components/MicroWidgets/Toaster";
import { useCommandPalette } from "@/hooks/useCommandPalette";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { pageview } from "@/lib/analytics";

// Code-split route components — they tend to pull in heavy editors/charts.
const HomePage = lazy(() => import("@/pages/HomePage").then((m) => ({ default: m.HomePage })));
const GeneratePage = lazy(() =>
  import("@/pages/GeneratePage").then((m) => ({ default: m.GeneratePage })),
);
const ResultsPage = lazy(() =>
  import("@/pages/ResultsPage").then((m) => ({ default: m.ResultsPage })),
);
const CompaniesPage = lazy(() =>
  import("@/pages/CompaniesPage").then((m) => ({ default: m.CompaniesPage })),
);
const CompanyPage = lazy(() =>
  import("@/pages/CompanyPage").then((m) => ({ default: m.CompanyPage })),
);
const BillingPage = lazy(() =>
  import("@/pages/BillingPage").then((m) => ({ default: m.BillingPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const CohortPage = lazy(() =>
  import("@/pages/CohortPage").then((m) => ({ default: m.CohortPage })),
);
const SharePage = lazy(() => import("@/pages/SharePage").then((m) => ({ default: m.SharePage })));
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

export function App(): JSX.Element {
  const { toggle, setOpen } = useCommandPalette();
  const location = useLocation();

  // SPA pageview tracking — manual since we disabled posthog auto-pageview.
  useEffect(() => {
    pageview(location.pathname + location.search);
  }, [location.pathname, location.search]);

  useKeyboardShortcuts([
    { key: "k", meta: true, allowInInput: true, handler: () => toggle() },
    { key: "/", handler: () => setOpen(true) },
    { key: "?", shift: true, handler: () => setOpen(true) },
    { key: "Escape", allowInInput: true, handler: () => setOpen(false) },
  ]);

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/generate/:sessionId" element={<GeneratePage />} />
        <Route path="/results/:sessionId" element={<ResultsPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/companies/:companyId" element={<CompanyPage />} />
        <Route path="/companies/:companyId/branches/:branchId" element={<CompanyPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/cohort/:cohortId" element={<CohortPage />} />
        <Route path="/share/:shareToken" element={<SharePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <CommandPalette />
      <PaywallModal />
      <Toaster />
    </>
  );
}
