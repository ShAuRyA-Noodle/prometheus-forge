/**
 * useExport — wraps api.exportArtifact.
 * Manages loading state, surfaces toast on completion, opens URL in new tab.
 */
import { useState } from "react";

import { api, type ExportRequest, type ExportResponse, APIError } from "@/lib/api";
import { useToast } from "./useToast";
import { track, Events } from "@/lib/analytics";

export interface UseExport {
  busy: boolean;
  lastResult: ExportResponse | null;
  error: string | null;
  trigger: (req: ExportRequest) => Promise<ExportResponse | null>;
}

export function useExport(): UseExport {
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ExportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { success, error: errorToast } = useToast();

  const trigger = async (req: ExportRequest) => {
    setBusy(true);
    setError(null);
    track(Events.EXPORT_TRIGGERED, { target: req.target, artifact: req.artifact });
    try {
      const res = await api.exportArtifact(req);
      setLastResult(res);
      if (res.status === "ready" && res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
        success("Export ready", `${req.artifact} → ${req.target}`);
      } else {
        success("Export queued", "We will notify you when it's ready.");
      }
      return res;
    } catch (err) {
      const msg =
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Export failed";
      setError(msg);
      errorToast("Export failed", msg);
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { busy, lastResult, error, trigger };
}
