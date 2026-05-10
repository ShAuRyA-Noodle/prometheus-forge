/**
 * SettingsPage — profile, locale, consent, email prefs, API keys, danger zone.
 *
 * Anchors:
 *  #profile     — display name, email, locale, region
 *  #consent     — marketing / retention / analytics / GDPR
 *  #emails      — completion, digests, investor alerts
 *  #api         — Pro+ API keys
 *  #connections — Google, GitHub
 *  #privacy     — GDPR data export
 *  #danger      — account deletion (type-confirmation)
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as Switch from "@radix-ui/react-switch";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Download,
  Github,
  Globe,
  KeyRound,
  Languages,
  Link2,
  Mail,
  ShieldAlert,
  Sparkles,
  UserCircle2,
  X,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { useTier } from "@/lib/billing";
import { Spinner } from "@/components/MicroWidgets/Spinner";
import { cn } from "@/lib/cn";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

const LOCALES: { code: string; label: string }[] = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Español (España)" },
  { code: "es-MX", label: "Español (México)" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "it-IT", label: "Italiano" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "nl-NL", label: "Nederlands" },
  { code: "sv-SE", label: "Svenska" },
  { code: "da-DK", label: "Dansk" },
  { code: "no-NO", label: "Norsk" },
  { code: "fi-FI", label: "Suomi" },
  { code: "pl-PL", label: "Polski" },
  { code: "cs-CZ", label: "Čeština" },
  { code: "tr-TR", label: "Türkçe" },
  { code: "ru-RU", label: "Русский" },
  { code: "uk-UA", label: "Українська" },
  { code: "ar-SA", label: "العربية" },
  { code: "he-IL", label: "עברית" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "bn-IN", label: "বাংলা" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "th-TH", label: "ไทย" },
  { code: "vi-VN", label: "Tiếng Việt" },
  { code: "id-ID", label: "Bahasa Indonesia" },
  { code: "zh-CN", label: "中文（简体）" },
  { code: "zh-TW", label: "中文（繁體）" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
];

const REGIONS: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "EU", label: "European Union" },
  { code: "UK", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "IN", label: "India" },
  { code: "JP", label: "Japan" },
  { code: "BR", label: "Brazil" },
  { code: "OTHER", label: "Other" },
];

interface EmailPrefs {
  completion: boolean;
  weekly_digest: boolean;
  investor_alerts: boolean;
  marketing: boolean;
}

interface ConsentState {
  marketing: boolean;
  retention_extended: boolean;
  analytics: boolean;
  gdpr_outside_eu: boolean;
}

export function SettingsPage(): JSX.Element {
  const { uid, email, displayName, tier, refreshProfile, signOut } = useAuth();
  const { error: errorToast, success } = useToast();
  const { hasTier, requireTier } = useTier();

  const [name, setName] = useState(displayName ?? "");
  const [locale, setLocale] = useState("en-US");
  const [region, setRegion] = useState("US");
  const [consent, setConsent] = useState<ConsentState>({
    marketing: false,
    retention_extended: false,
    analytics: true,
    gdpr_outside_eu: false,
  });
  const [emails, setEmails] = useState<EmailPrefs>({
    completion: true,
    weekly_digest: true,
    investor_alerts: false,
    marketing: false,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    setName(displayName ?? "");
  }, [displayName]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ display_name: name, locale, region, consent, emails }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      success("Profile saved");
      await refreshProfile();
    } catch (e) {
      errorToast("Could not save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const requestExport = async () => {
    try {
      const res = await fetch("/api/me/export", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      success(
        "GDPR export requested",
        "We'll email a download link within 24 hours. Idea text + artifacts only.",
      );
    } catch (e) {
      errorToast("Could not request export", e instanceof Error ? e.message : "Try again.");
    }
  };

  const generateApiKey = async () => {
    if (!hasTier("founder")) {
      requireTier("founder", "API keys are a Founder-tier feature.");
      return;
    }
    setKeyBusy(true);
    try {
      const res = await fetch("/api/me/api-keys", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { token?: string };
      if (!data.token) throw new Error("No token returned");
      setApiKey(data.token);
    } catch (e) {
      errorToast("Could not create key", e instanceof Error ? e.message : "Try again.");
    } finally {
      setKeyBusy(false);
    }
  };

  return (
    <main role="main" className="min-h-[100dvh] bg-ink-950 text-ink-100">
      <header className="sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink-900 bg-ink-950/80 px-4 py-3 backdrop-blur md:px-6">
        <Link to="/" className="grid grid-cols-[auto_1fr] items-center gap-2 font-display text-base text-ink-50 focus-ring">
          <Sparkles className="h-4 w-4 text-accent-500" />
          PROMETHEUS
        </Link>
        <h1 className="font-display text-base text-ink-50 justify-self-center">Settings</h1>
        <Link to="/billing" className="text-xs text-ink-400 hover:text-ink-100 focus-ring">
          Billing
        </Link>
      </header>

      <div className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-8 md:px-6">
        <SectionLayout
          id="profile"
          icon={UserCircle2}
          title="Profile"
          subtitle="How we display you across runs and shared previews."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Display name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus-ring"
                aria-label="Display name"
                data-mask
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email ?? ""}
                readOnly
                className="w-full cursor-not-allowed rounded-md border border-ink-800 bg-ink-950/40 px-3 py-2 text-sm text-ink-400"
                aria-label="Email"
                data-mask
              />
            </Field>
            <Field label="Locale">
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus-ring"
                aria-label="Locale"
              >
                {LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Region">
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus-ring"
                aria-label="Region"
              >
                {REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={savingProfile}
            className="grid grid-cols-[1fr_auto] items-center justify-self-start gap-2 rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-accent-400 focus-ring disabled:opacity-60"
          >
            <span>{savingProfile ? "Saving…" : "Save profile"}</span>
            {savingProfile && <Spinner size={14} />}
          </button>
        </SectionLayout>

        <SectionLayout
          id="consent"
          icon={ShieldAlert}
          title="Privacy &amp; consent"
          subtitle="Granular toggles. We honor each one server-side."
        >
          <ToggleRow
            label="Marketing emails"
            description="Occasional product updates. You can also unsubscribe via any email footer."
            checked={consent.marketing}
            onChange={(v) => setConsent({ ...consent, marketing: v })}
          />
          <ToggleRow
            label="Extended retention (90 days)"
            description="Default deletion is 30 days. Opt in to keep idea text for 90 days for branching."
            checked={consent.retention_extended}
            onChange={(v) => setConsent({ ...consent, retention_extended: v })}
          />
          <ToggleRow
            label="Product analytics"
            description="PostHog, masked inputs only. Powers usage dashboards and bug reports."
            checked={consent.analytics}
            onChange={(v) => setConsent({ ...consent, analytics: v })}
          />
          <ToggleRow
            label="GDPR processing outside EU"
            description="Required for users in EU/UK who are OK with US-based processing."
            checked={consent.gdpr_outside_eu}
            onChange={(v) => setConsent({ ...consent, gdpr_outside_eu: v })}
          />
        </SectionLayout>

        <SectionLayout
          id="emails"
          icon={Mail}
          title="Email preferences"
          subtitle="Choose what hits your inbox."
        >
          <ToggleRow
            label="Run completion"
            description="When a generation finishes, we ping you with a link."
            checked={emails.completion}
            onChange={(v) => setEmails({ ...emails, completion: v })}
          />
          <ToggleRow
            label="Weekly digest"
            description="Watch-the-market diffs across your saved companies, every Monday."
            checked={emails.weekly_digest}
            onChange={(v) => setEmails({ ...emails, weekly_digest: v })}
          />
          <ToggleRow
            label="Investor alerts"
            description="When someone opens your shared deck (Operator+ tier)."
            checked={emails.investor_alerts}
            onChange={(v) => setEmails({ ...emails, investor_alerts: v })}
          />
          <ToggleRow
            label="Marketing"
            description="New features, occasional founder stories. Off by default."
            checked={emails.marketing}
            onChange={(v) => setEmails({ ...emails, marketing: v })}
          />
        </SectionLayout>

        <SectionLayout
          id="api"
          icon={KeyRound}
          title="API keys"
          subtitle="Programmatic access to /api/generate and /api/sessions. Pro tier and above."
        >
          {tier === "anonymous" || tier === "free" ? (
            <p className="rounded-2xl border border-ink-800 bg-ink-950/40 p-4 text-sm text-ink-300">
              Upgrade to Founder or Operator to issue keys.{" "}
              <Link to="/billing" className="text-accent-500 underline-offset-2 hover:underline">
                See pricing →
              </Link>
            </p>
          ) : apiKey ? (
            <div className="grid gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <span className="grid grid-cols-[auto_1fr] items-center gap-2 text-[11px] uppercase tracking-widest text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                Save this — we won't show it again
              </span>
              <code className="block break-all rounded-md bg-ink-950 px-3 py-2 font-mono text-xs text-ink-50">
                {apiKey}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(apiKey);
                  success("Copied", "Stash it in 1Password / your secret manager.");
                }}
                className="justify-self-start rounded-full border border-ink-800 bg-ink-900 px-3 py-1.5 text-xs text-ink-100 hover:bg-ink-800 focus-ring"
              >
                Copy to clipboard
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void generateApiKey()}
              disabled={keyBusy}
              className="grid grid-cols-[auto_1fr_auto] items-center justify-self-start gap-2 rounded-full border border-ink-800 bg-ink-900 px-4 py-2 text-sm text-ink-100 hover:bg-ink-800 focus-ring disabled:opacity-60"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{keyBusy ? "Generating…" : "Generate new key"}</span>
              {keyBusy && <Spinner size={14} />}
            </button>
          )}
        </SectionLayout>

        <SectionLayout
          id="connections"
          icon={Link2}
          title="Connected accounts"
          subtitle="Used to own files at creation (drive.file scope only)."
        >
          <ConnectionRow
            icon={Globe}
            name="Google"
            description="Google Drive, Sheets, Slides, Docs (drive.file scope only)."
            connected={Boolean(email)}
          />
          <ConnectionRow
            icon={Github}
            name="GitHub"
            description="Optional — for SOC 2 evidence collection on your repos."
            connected={false}
          />
        </SectionLayout>

        <SectionLayout
          id="privacy"
          icon={Languages}
          title="Data &amp; privacy"
          subtitle="GDPR / CCPA tools."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => void requestExport()}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl border border-ink-800 bg-ink-900/40 p-4 text-left hover:border-accent-500/40 focus-ring"
            >
              <Download className="h-4 w-4 text-accent-500" />
              <div>
                <p className="text-sm font-semibold text-ink-100">Export my data</p>
                <p className="text-xs text-ink-400">
                  Idea text, artifacts, sessions, branches. Email link within 24h.
                </p>
              </div>
              <span aria-hidden className="text-ink-500">
                →
              </span>
            </button>
            <Link
              to="/billing"
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl border border-ink-800 bg-ink-900/40 p-4 text-left hover:border-accent-500/40 focus-ring"
            >
              <ShieldAlert className="h-4 w-4 text-accent-500" />
              <div>
                <p className="text-sm font-semibold text-ink-100">Manage subscription</p>
                <p className="text-xs text-ink-400">Stripe portal — change card, pause, cancel.</p>
              </div>
              <span aria-hidden className="text-ink-500">
                →
              </span>
            </Link>
          </div>
        </SectionLayout>

        <SectionLayout
          id="danger"
          icon={AlertTriangle}
          title="Danger zone"
          subtitle="One-way doors. Read carefully."
          danger
        >
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="grid grid-cols-[1fr_auto] items-center justify-self-start gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/15 focus-ring"
          >
            Delete account
            <span aria-hidden>→</span>
          </button>
        </SectionLayout>
      </div>

      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        confirmString={(displayName ?? email ?? uid ?? "account").slice(0, 32)}
        onConfirm={async () => {
          try {
            const res = await fetch("/api/me", { method: "DELETE", credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            success("Account scheduled for deletion", "All data wipes within 7 days.");
            await signOut();
          } catch (e) {
            errorToast("Deletion failed", e instanceof Error ? e.message : "Try again.");
          }
        }}
      />
    </main>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionLayout({
  id,
  icon: Icon,
  title,
  subtitle,
  children,
  danger,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  danger?: boolean;
}): JSX.Element {
  return (
    <motion.section
      id={id}
      layout
      transition={SPRING}
      className={cn(
        "grid gap-4 rounded-bento border bg-ink-900/30 p-6 shadow-bento",
        danger ? "border-rose-500/30" : "border-ink-800",
      )}
    >
      <header className="grid grid-cols-[auto_1fr] items-center gap-3">
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full",
            danger ? "bg-rose-500/15 text-rose-300" : "bg-accent-500/15 text-accent-500",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display text-lg text-ink-50">{title}</h2>
          {subtitle && <p className="text-sm text-ink-400">{subtitle}</p>}
        </div>
      </header>
      {children}
    </motion.section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-ink-500">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <label className="grid grid-cols-[1fr_auto] items-start gap-3 rounded-2xl border border-ink-800 bg-ink-950/40 p-3">
      <div>
        <div className="text-sm font-semibold text-ink-100">{label}</div>
        <p className="text-xs text-ink-400">{description}</p>
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="relative h-5 w-9 rounded-full bg-ink-800 transition data-[state=checked]:bg-accent-500"
      >
        <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-ink-50 transition data-[state=checked]:translate-x-[18px]" />
      </Switch.Root>
    </label>
  );
}

function ConnectionRow({
  icon: Icon,
  name,
  description,
  connected,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  description: string;
  connected: boolean;
}): JSX.Element {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-ink-800 bg-ink-950/40 p-3">
      <Icon className="h-4 w-4 text-ink-300" />
      <div>
        <p className="text-sm font-semibold text-ink-100">{name}</p>
        <p className="text-xs text-ink-400">{description}</p>
      </div>
      <span
        className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
          connected
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-ink-800 bg-ink-900 text-ink-400",
        )}
      >
        {connected ? "Connected" : "Connect"}
      </span>
    </div>
  );
}

function DeleteAccountDialog({
  open,
  onOpenChange,
  confirmString,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  confirmString: string;
  onConfirm: () => void | Promise<void>;
}): JSX.Element {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTyped("");
      // Focus input when dialog opens.
      const t = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const matches = typed === confirmString;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={SPRING}
                className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-bento border border-rose-500/40 bg-ink-900/95 p-6 shadow-bento backdrop-blur"
              >
                <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-rose-500/15 text-rose-300">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div>
                    <Dialog.Title className="font-display text-xl text-ink-50">
                      Delete this account?
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-ink-400">
                      Sessions, branches, deployed landing pages, and your idea history are
                      destroyed within 7 days. This is irreversible.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="rounded-full p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100 focus-ring"
                      aria-label="Cancel deletion"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>
                <div className="mt-5 grid gap-2">
                  <p className="text-xs text-ink-300">
                    Type{" "}
                    <code className="rounded bg-ink-950 px-1.5 py-0.5 font-mono text-[11px] text-ink-100">
                      {confirmString}
                    </code>{" "}
                    to confirm.
                  </p>
                  <input
                    ref={inputRef}
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    className="w-full rounded-md border border-rose-500/40 bg-ink-950 px-3 py-2 font-mono text-sm text-ink-100 focus-ring"
                    aria-label="Type confirmation string"
                    data-mask
                  />
                </div>
                <div className="mt-6 grid grid-cols-[auto_1fr] gap-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="rounded-full border border-ink-800 bg-ink-900/60 px-4 py-2 text-sm text-ink-200 hover:bg-ink-900 focus-ring"
                    >
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    disabled={!matches || busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await onConfirm();
                        onOpenChange(false);
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-rose-400 focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? "Deleting…" : "Permanently delete account"}
                  </button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export default SettingsPage;
