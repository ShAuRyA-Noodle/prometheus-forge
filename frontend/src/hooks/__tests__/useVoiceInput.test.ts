/**
 * useVoiceInput — exercises state machine using a MediaRecorder mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: {
    transcribeAudio: vi.fn().mockResolvedValue({
      transcript: "hello world",
      duration_s: 1.2,
      provider: "deepgram",
    }),
  },
  APIError: class APIError extends Error {},
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  Events: { VOICE_RECORDED: "voice_recorded" },
}));

vi.mock("@/lib/constants", () => ({
  MAX_VOICE_DURATION_S: 30,
}));

class MockMediaRecorder {
  static isTypeSupported = (_t: string): boolean => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  private listeners = new Map<string, EventListener[]>();
  constructor(_stream: MediaStream, _opts?: { mimeType?: string }) {
    void _stream;
    void _opts;
  }
  addEventListener(type: string, listener: EventListener): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(listener);
    this.listeners.set(type, arr);
  }
  removeEventListener(): void {
    /* noop */
  }
  start(_chunkMs?: number): void {
    void _chunkMs;
    this.state = "recording";
    queueMicrotask(() => {
      const blob = new Blob([new Uint8Array(2048)], { type: "audio/webm" });
      const ev = { data: blob } as unknown as Event;
      this.listeners.get("dataavailable")?.forEach((l) => l(ev));
    });
  }
  stop(): void {
    this.state = "inactive";
    queueMicrotask(() => {
      this.listeners.get("stop")?.forEach((l) => l(new Event("stop")));
    });
  }
}

class MockAudioContext {
  createMediaStreamSource(): { connect: (dest: AnalyserNode) => void } {
    return { connect: () => undefined };
  }
  createAnalyser(): AnalyserNode {
    return {
      fftSize: 1024,
      smoothingTimeConstant: 0.7,
      getFloatTimeDomainData: (arr: Float32Array) => {
        arr.fill(0.1);
      },
    } as unknown as AnalyserNode;
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

beforeEach(() => {
  (globalThis as unknown as { MediaRecorder: typeof MockMediaRecorder }).MediaRecorder =
    MockMediaRecorder;
  (window as unknown as { AudioContext: typeof MockAudioContext }).AudioContext =
    MockAudioContext;

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: () => undefined }],
      } as unknown as MediaStream),
    },
  });

  // requestAnimationFrame polyfill that fires immediately.
  (globalThis as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame =
    (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    };
  (globalThis as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame =
    () => undefined;
});

import { useVoiceInput } from "../useVoiceInput";

describe("useVoiceInput", () => {
  it("starts in idle and reports support", () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.state).toBe("idle");
    expect(result.current.supported).toBe(true);
  });

  it("transitions idle → recording on start()", async () => {
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("recording");
  });

  it("stop() drives finalize → idle with transcript", async () => {
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(result.current.result?.transcript).toBe("hello world");
  });

  it("cancel() returns to idle without transcribing", async () => {
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.cancel();
    });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(result.current.result).toBeNull();
  });

  it("surfaces NotAllowedError as friendly message", async () => {
    (navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new DOMException("denied"), { name: "NotAllowedError" }),
    );
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/Microphone/);
  });
});
