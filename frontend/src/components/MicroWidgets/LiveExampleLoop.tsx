/**
 * LiveExampleLoop — 30s pre-recorded loop of a real generation playing.
 *
 * Plays muted/inline/loop video. Falls back to skeleton if no asset.
 * Source asset path is configurable via VITE_DEMO_VIDEO_URL.
 */
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { Skeleton } from "./Skeleton";

interface Props {
  className?: string;
  posterUrl?: string;
  videoUrl?: string;
}

export function LiveExampleLoop({
  className,
  posterUrl = "/demo-loop-poster.webp",
  videoUrl = import.meta.env.VITE_DEMO_VIDEO_URL ?? "/demo-loop.mp4",
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Pause when not visible to save power.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) void v.play().catch(() => undefined);
          else v.pause();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-bento border border-ink-800 bg-ink-900/40 shadow-bento",
        className,
      )}
      aria-label="Pre-recorded 30-second product demo"
    >
      {!loaded && !errored ? (
        <Skeleton rounded="bento" className="aspect-video w-full" />
      ) : null}
      {errored ? (
        <div className="grid aspect-video w-full place-items-center text-sm text-ink-500">
          Demo loop unavailable.
        </div>
      ) : (
        <video
          ref={ref}
          className={cn(
            "block aspect-video w-full object-cover transition-opacity",
            loaded ? "opacity-100" : "opacity-0",
          )}
          src={videoUrl}
          poster={posterUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}
