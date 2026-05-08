/**
 * deckExport — client helpers for exporting the editable deck.
 *
 * Calls the backend's export endpoint, which renders the live editor state
 * to PDF, PPTX, or a fresh Google Slides copy in the user's Drive
 * (drive.file scope). Returns a download URL or external URL the UI can open.
 */
import type { PitchDeckResult, PitchSlide } from "../types/agents";

export type ExportFormat = "pdf" | "pptx" | "gslides";

export interface ExportRequest {
  session_id: string;
  format: ExportFormat;
  slides: PitchSlide[];
  brand_overrides?: {
    primary_hex?: string;
    accent_hex?: string;
    heading_font?: string;
    body_font?: string;
  };
}

export interface ExportResponse {
  format: ExportFormat;
  url: string;
  expires_at: string | null;
  mime_type: string;
}

export async function exportDeck(req: ExportRequest): Promise<ExportResponse> {
  const res = await fetch("/api/export/deck", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Export failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as ExportResponse;
}

export async function downloadAndSave(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

export function deckFilename(deck: PitchDeckResult, fmt: ExportFormat, brandName: string): string {
  const safe = brandName.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) || "deck";
  const ext = fmt === "pdf" ? "pdf" : fmt === "pptx" ? "pptx" : "url";
  return `${safe}_pitch_deck_${deck.slides.length}slides.${ext}`;
}

/** Open a Google Slides copy in a new tab — drive.file scope, user-owned. */
export async function openInGoogleSlides(req: ExportRequest): Promise<string> {
  const result = await exportDeck({ ...req, format: "gslides" });
  window.open(result.url, "_blank", "noopener,noreferrer");
  return result.url;
}
