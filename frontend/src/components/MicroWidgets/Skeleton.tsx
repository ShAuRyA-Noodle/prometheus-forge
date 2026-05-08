/**
 * Skeleton — shimmer placeholder. Uses keyframes from tailwind config.
 * transform/opacity only.
 */
import { cn } from "@/lib/cn";

interface Props {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full" | "bento";
}

const ROUND_MAP: Record<NonNullable<Props["rounded"]>, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
  bento: "rounded-bento",
};

export function Skeleton({ className, rounded = "md" }: Props) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn(
        "relative overflow-hidden bg-ink-900/60",
        ROUND_MAP[rounded],
        className,
      )}
    >
      <div
        className="absolute inset-0 animate-shimmer"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent 0, rgba(255,255,255,0.06) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
        }}
      />
    </div>
  );
}
