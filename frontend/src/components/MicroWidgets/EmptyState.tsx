/**
 * EmptyState — generic "nothing here yet" component.
 * Avoids generic stock illustration. Single-color icon, asymmetric layout.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-bento border border-ink-800 bg-ink-900/30 p-10 text-center",
        className,
      )}
    >
      <div className="mx-auto grid max-w-md gap-3">
        {Icon ? (
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-ink-900 text-ink-400">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        ) : null}
        <h3 className="font-display text-lg text-ink-100">{title}</h3>
        {description ? (
          <p className="text-sm text-ink-400">{description}</p>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}
