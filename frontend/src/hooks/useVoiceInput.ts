/**
 * useVoiceInput — MediaRecorder API + AnalyserNode for live waveform.
 *
 * NOT Web Speech API (too inconsistent across browsers; broken on iOS Safari
 * for our flow). Records WebM/Opus, posts to /api/speech/transcribe (Deepgram
 * server-side), returns transcript + metadata.
 *
 * Surfaces:
 *  - state machine: idle | requesting | recording | stopping | transcribing | error
 *  - waveformData: Float32Array refresh per frame for canvas drawing
 *  - durationS: live elapsed seconds
 *  - hard cap at MAX_VOICE_DURATION_S (auto-stops + transcribes)
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { api, APIError } from "@/lib/api";
import { MAX_VOICE_DURATION_S } from "@/lib/constants";
import { track, Events } from "@/lib/analytics";
import type { TranscribeResponse } from "@/lib/api";

export type VoiceState =
  | "idle"
  | "requesting"
  | "recording"
  | "stopping"
  | "transcribing"
  | "error";

export interface UseVoiceInput {
  state: VoiceState;
  durationS: number;
  /** Latest waveform samples [-1, 1]. */
  waveformData: Float32Array;
  /** Most-recent transcript result. */
  result: TranscribeResponse | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => void;
  reset: () => void;
  supported: boolean;
}

const SAMPLE_BUCKETS = 64;

function isSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== "undefined"
  );
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/ogg;codecs=opus",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export function useVoiceInput(): UseVoiceInput {
  const [state, setState] = useState<VoiceState>("idle");
  const [durationS, setDurationS] = useState(0);
  const [waveformData, setWaveformData] = useState<Float32Array>(
    () => new Float32Array(SAMPLE_BUCKETS),
  );
  const [result, setResult] = useState<TranscribeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef<boolean>(false);
  const supported = isSupported();

  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (tickerRef.current !== null) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* noop */
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  useEffect(
    () => () => {
      teardown();
    },
    [teardown],
  );

  const start = useCallback(async () => {
    if (state === "recording" || state === "requesting") return;
    setError(null);
    setResult(null);
    setDurationS(0);
    setState("requesting");

    if (!supported) {
      setState("error");
      setError(
        "Voice input isn't supported in this browser. Try Chrome, Safari 14+, or Firefox.",
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (err) {
      setState("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access blocked. Enable it in your browser settings to record."
          : "Could not access microphone.",
      );
      return;
    }

    streamRef.current = stream;
    cancelledRef.current = false;

    // Audio analyser for waveform.
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      setState("error");
      setError("AudioContext unavailable.");
      teardown();
      return;
    }
    const audioCtx = new Ctx();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    analyserRef.current = analyser;

    const sampleArray = new Float32Array(analyser.fftSize);
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getFloatTimeDomainData(sampleArray);
      // bucket into SAMPLE_BUCKETS for canvas drawing
      const bucketSize = Math.floor(sampleArray.length / SAMPLE_BUCKETS);
      const out = new Float32Array(SAMPLE_BUCKETS);
      for (let b = 0; b < SAMPLE_BUCKETS; b++) {
        let sum = 0;
        const start = b * bucketSize;
        for (let i = 0; i < bucketSize; i++) {
          const idx = start + i;
          const sample = sampleArray[idx];
          if (typeof sample === "number") sum += Math.abs(sample);
        }
        out[b] = sum / bucketSize;
      }
      setWaveformData(out);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Recorder.
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "MediaRecorder init failed.");
      teardown();
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    });
    recorder.addEventListener("stop", () => {
      void finalize();
    });
    recorder.addEventListener("error", () => {
      setState("error");
      setError("Recorder error. Try again.");
      teardown();
    });

    startedAtRef.current = Date.now();
    tickerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setDurationS(elapsed);
      if (elapsed >= MAX_VOICE_DURATION_S) {
        void stop();
      }
    }, 100);

    recorder.start(250); // emit chunks every 250ms
    setState("recording");
    track(Events.VOICE_RECORDED, { phase: "started" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, supported, teardown]);

  const finalize = useCallback(async () => {
    if (cancelledRef.current) {
      teardown();
      setState("idle");
      return;
    }
    setState("transcribing");
    const mime = recorderRef.current?.mimeType ?? "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    teardown();

    if (blob.size < 1000) {
      setState("error");
      setError("Recording was too short. Speak for at least a couple of seconds.");
      return;
    }
    try {
      const res = await api.transcribeAudio(blob);
      setResult(res);
      setState("idle");
      track(Events.VOICE_RECORDED, {
        phase: "transcribed",
        duration_s: res.duration_s,
        provider: res.provider,
      });
    } catch (err) {
      setState("error");
      setError(
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Transcription failed.",
      );
    }
  }, [teardown]);

  const stop = useCallback(async () => {
    if (state !== "recording") return;
    setState("stopping");
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop(); // triggers finalize via "stop" listener
    }
  }, [state]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      teardown();
      setState("idle");
    }
  }, [teardown]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setDurationS(0);
    setState("idle");
  }, []);

  return {
    state,
    durationS,
    waveformData,
    result,
    error,
    start,
    stop,
    cancel,
    reset,
    supported,
  };
}
