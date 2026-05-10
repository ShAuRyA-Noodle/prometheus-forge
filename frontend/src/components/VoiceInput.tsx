/**
 * VoiceInput — large mic button + live waveform + transcribe→generate handoff.
 *
 * - MediaRecorder via useVoiceInput hook (NOT Web Speech).
 * - Live waveform via AnalyserNode buckets.
 * - Pre-input strip describes the deal honestly: "You speak. 12 agents work for
 *   ~75-120s. You walk away with brand, deck, model, landing, legal."
 * - Auto-saves transcript draft to localStorage.
 * - Stop button reveals after 1s of audio.
 * - On transcribe success, calls onTranscript(text).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Mic, Square, X, Loader2, AlertTriangle } from "lucide-react";

import { useVoiceInput } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/cn";
import { MAX_VOICE_DURATION_S } from "@/lib/constants";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };
const DRAFT_KEY = "prometheus.voice_draft";

export interface VoiceInputProps {
  /** Called with the final transcript text once transcription completes. */
  onTranscript: (text: string) => void;
  className?: string;
  disabled?: boolean;
}

export function VoiceInput({ onTranscript, className, disabled }: VoiceInputProps): JSX.Element {
  const prefersReduced = useReducedMotion();
  const v = useVoiceInput();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showStop, setShowStop] = useState(false);

  // Reveal stop button after 1s of recording.
  useEffect(() => {
    if (v.state !== "recording") {
      setShowStop(false);
      return;
    }
    const t = window.setTimeout(() => setShowStop(true), 1000);
    return () => window.clearTimeout(t);
  }, [v.state]);

  // Draft persistence on every transcript update.
  useEffect(() => {
    if (v.result?.transcript) {
      try {
        localStorage.setItem(DRAFT_KEY, v.result.transcript);
      } catch {
        /* quota / private mode — ignore */
      }
      onTranscript(v.result.transcript);
    }
  }, [v.result, onTranscript]);

  // Waveform draw loop. Pulls from waveformData each frame the data updates.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const data = v.waveformData;
      if (!data || data.length === 0) return;
      const barCount = data.length;
      const gap = 2;
      const barW = Math.max(2, (w - gap * (barCount - 1)) / barCount);
      const mid = h / 2;
      ctx.fillStyle = v.state === "recording" ? "#FF5A1F" : "#3F3F46";
      for (let i = 0; i < barCount; i++) {
        const sample = data[i] ?? 0;
        const amp = Math.min(1, sample * 4); // visual amp boost
        const barH = Math.max(2, amp * h * 0.9);
        const x = i * (barW + gap);
        ctx.fillRect(x, mid - barH / 2, barW, barH);
      }
    };
    draw();
  }, [v.waveformData, v.state]);

  const isBusy = v.state === "requesting" || v.state === "transcribing" || v.state === "stopping";
  const isRecording = v.state === "recording";

  const onPress = async () => {
    if (disabled) return;
    if (isRecording) {
      await v.stop();
    } else if (v.state === "idle" || v.state === "error") {
      await v.start();
    }
  };

  const elapsedPct = useMemo(
    () => Math.min(100, (v.durationS / MAX_VOICE_DURATION_S) * 100),
    [v.durationS],
  );

  return (
    <section
      aria-label="Voice idea input"
      className={cn(
        "grid w-full gap-4 rounded-bento border border-ink-800 bg-ink-900/40 p-6 shadow-bento",
        className,
      )}
    >
      <div className="grid gap-1">
        <p className="text-[11px] uppercase tracking-widest text-accent-500">
          The deal, plainly
        </p>
        <p className="text-sm text-ink-300 md:text-base">
          You speak. 12 agents work for ~75-120s. You walk away with brand, deck,
          model, landing, legal.
        </p>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <motion.button
          type="button"
          onClick={onPress}
          disabled={disabled || isBusy}
          aria-pressed={isRecording}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          whileTap={prefersReduced ? undefined : { scale: 0.96 }}
          transition={SPRING}
          className={cn(
            "grid h-20 w-20 place-items-center rounded-full focus-ring transition-colors",
            isRecording
              ? "bg-accent-500 text-ink-950 shadow-[0_0_0_8px_rgba(255,90,31,0.18)]"
              : "bg-ink-800 text-ink-100 hover:bg-ink-700",
            (disabled || isBusy) && "opacity-50 cursor-not-allowed",
          )}
        >
          {isBusy ? (
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          ) : isRecording ? (
            showStop ? (
              <Square className="h-6 w-6 fill-current" aria-hidden />
            ) : (
              <span className="block h-3 w-3 animate-breathe rounded-full bg-ink-950" />
            )
          ) : (
            <Mic className="h-6 w-6" aria-hidden />
          )}
        </motion.button>

        <div className="grid gap-2">
          <canvas
            ref={canvasRef}
            width={420}
            height={56}
            className="h-14 w-full rounded-md bg-ink-950/60"
            aria-hidden="true"
          />
          <div
            className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs text-ink-400"
            aria-live="polite"
          >
            <div className="grid gap-1">
              <div className="h-1 w-full overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full bg-accent-500 transition-[width]"
                  style={{ width: `${elapsedPct}%` }}
                />
              </div>
              <span>
                {isRecording
                  ? `Listening… ${v.durationS.toFixed(0)}s / ${MAX_VOICE_DURATION_S}s`
                  : v.state === "transcribing"
                    ? "Transcribing… (Deepgram)"
                    : v.state === "requesting"
                      ? "Requesting microphone…"
                      : "Tap the mic to begin"}
              </span>
            </div>
            {isRecording && (
              <button
                type="button"
                onClick={() => v.cancel()}
                className="rounded-full border border-ink-800 px-2 py-1 text-[11px] text-ink-300 hover:bg-ink-800 focus-ring"
                aria-label="Cancel recording without transcription"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => v.reset()}
          disabled={v.state === "idle" || isRecording}
          className="rounded-full p-2 text-ink-500 hover:bg-ink-800 hover:text-ink-200 focus-ring disabled:opacity-30"
          aria-label="Reset voice state"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {v.error && (
        <div className="grid grid-cols-[auto_1fr] items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5" aria-hidden />
          <span>{v.error}</span>
        </div>
      )}

      {v.result?.transcript && (
        <div className="grid gap-1 rounded-md border border-ink-800 bg-ink-950/40 p-3 text-sm text-ink-200">
          <span className="text-[10px] uppercase tracking-widest text-ink-500">
            Transcript
          </span>
          <p className="leading-relaxed text-ink-100">{v.result.transcript}</p>
        </div>
      )}

      {!v.supported && (
        <p className="text-[11px] text-ink-500">
          Voice unavailable on this browser. Use the text mode instead.
        </p>
      )}
    </section>
  );
}
