/**
 * SandboxedIframe — secure iframe for agent-emitted HTML.
 *
 * Hard rules (enforced by this component):
 *  - sandbox attribute is always present.
 *  - Default sandbox flags = "allow-forms" only. `allow-scripts` is FORBIDDEN.
 *  - `allow-same-origin` is FORBIDDEN. Origin is always opaque.
 *  - srcDoc is built via buildSandboxedDoc() which injects strict CSP meta.
 *  - referrerPolicy = no-referrer.
 *
 * Used for: landing-page preview, slide preview-as-HTML, executive summary
 * if it contains rich HTML, anything emitted by agents.
 */
import { useMemo } from "react";
import { buildSandboxedDoc } from "../../lib/purify";
import { cn } from "../../lib/cn";

type AllowedFlag = "allow-forms" | "allow-popups-to-escape-sandbox";

export interface SandboxedIframeProps {
  html: string;
  css?: string;
  /**
   * Defaults to "allow-forms". Caller may opt-in to `allow-popups-to-escape-sandbox`
   * but `allow-scripts`, `allow-same-origin`, and `allow-top-navigation` are
   * always rejected.
   */
  sandbox?: AllowedFlag | `${AllowedFlag} ${AllowedFlag}`;
  title: string;
  className?: string;
  /** Set explicit aspect ratio (default 16/10 — landing page hero). */
  aspect?: string;
  width?: string | number;
  height?: string | number;
  onLoad?: () => void;
}

const FORBIDDEN = new Set([
  "allow-scripts",
  "allow-same-origin",
  "allow-top-navigation",
  "allow-top-navigation-by-user-activation",
  "allow-modals",
  "allow-pointer-lock",
  "allow-presentation",
  "allow-storage-access-by-user-activation",
]);

function safeSandbox(input: string | undefined): string {
  const flags = (input ?? "allow-forms")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !FORBIDDEN.has(f));
  return flags.length > 0 ? flags.join(" ") : "allow-forms";
}

export function SandboxedIframe({
  html,
  css,
  sandbox,
  title,
  className,
  aspect,
  width,
  height,
  onLoad,
}: SandboxedIframeProps): JSX.Element {
  const srcDoc = useMemo(() => buildSandboxedDoc(html, css ?? ""), [html, css]);
  const sandboxFlags = safeSandbox(sandbox);

  return (
    <div
      className={cn("relative isolate overflow-hidden rounded-2xl border border-ink-800 bg-ink-950", className)}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      <iframe
        srcDoc={srcDoc}
        sandbox={sandboxFlags}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
        allow=""
        onLoad={onLoad}
        width={width ?? "100%"}
        height={height ?? "100%"}
        className="block h-full w-full bg-ink-950"
      />
    </div>
  );
}
