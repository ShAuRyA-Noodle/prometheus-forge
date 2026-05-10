/**
 * useExport — busy state, success toast, error toast, opens URL on ready.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const exportArtifact = vi.fn();
const success = vi.fn();
const errorToast = vi.fn();
const trackMock = vi.fn();
const openMock = vi.fn();

vi.mock("@/lib/api", () => ({
  api: { exportArtifact: (req: unknown) => exportArtifact(req) },
  APIError: class APIError extends Error {},
}));

vi.mock("@/lib/analytics", () => ({
  track: trackMock,
  Events: { EXPORT_TRIGGERED: "export_triggered" },
}));

vi.mock("../useToast", () => ({
  useToast: () => ({
    success,
    error: errorToast,
    warning: vi.fn(),
    toast: vi.fn(),
    dismiss: vi.fn(),
    clear: vi.fn(),
    toasts: [],
  }),
}));

import { useExport } from "../useExport";

beforeEach(() => {
  exportArtifact.mockReset();
  success.mockClear();
  errorToast.mockClear();
  trackMock.mockClear();
  openMock.mockClear();
  vi.stubGlobal("open", openMock);
});

describe("useExport", () => {
  it("opens URL on ready response", async () => {
    exportArtifact.mockResolvedValue({ status: "ready", url: "https://example.com/x.pdf" });

    const { result } = renderHook(() => useExport());

    await act(async () => {
      await result.current.trigger({ session_id: "s", target: "pdf", artifact: "deck" });
    });

    expect(openMock).toHaveBeenCalledWith(
      "https://example.com/x.pdf",
      "_blank",
      "noopener,noreferrer",
    );
    expect(success).toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
    expect(trackMock).toHaveBeenCalledWith("export_triggered", expect.any(Object));
  });

  it("queued response shows queued toast", async () => {
    exportArtifact.mockResolvedValue({ status: "queued", url: null, job_id: "j1" });
    const { result } = renderHook(() => useExport());
    await act(async () => {
      await result.current.trigger({ session_id: "s", target: "slides", artifact: "deck" });
    });
    expect(success).toHaveBeenCalledWith("Export queued", expect.any(String));
    expect(openMock).not.toHaveBeenCalled();
  });

  it("error toast on failure", async () => {
    exportArtifact.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useExport());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.trigger({ session_id: "s", target: "pdf", artifact: "deck" });
    });
    expect(returned).toBeNull();
    expect(errorToast).toHaveBeenCalledWith("Export failed", "boom");
    expect(result.current.error).toBe("boom");
  });
});
