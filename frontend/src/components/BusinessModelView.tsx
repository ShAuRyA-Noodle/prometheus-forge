/**
 * BusinessModelView — pricing tiers, unit economics, business model canvas.
 */
import { motion } from "framer-motion";
import { CircleDollarSign, Repeat, Users } from "lucide-react";

import { cn } from "@/lib/cn";
import { DataPoint } from "./DataPoint";
import type { BusinessModelResult } from "@/types/agents";

const SPRING = { type: "spring" as const, stiffness: 100, damping: 20 };

interface BusinessModelViewProps {
  model: BusinessModelResult;
  className?: string;
}

const CANVAS_ORDER: { key: string; label: string }[] = [
  { key: "key_partners", label: "Key Partners" },
  { key: "key_activities", label: "Key Activities" },
  { key: "value_propositions", label: "Value Propositions" },
  { key: "customer_relationships", label: "Customer Relationships" },
  { key: "customer_segments", label: "Customer Segments" },
  { key: "key_resources", label: "Key Resources" },
  { key: "channels", label: "Channels" },
  { key: "cost_structure", label: "Cost Structure" },
  { key: "revenue_streams", label: "Revenue Streams" },
];

export function BusinessModelView({ model, className }: BusinessModelViewProps): JSX.Element {
  return (
    <section className={cn("grid gap-6", className)} aria-label="Business model">
      <header className="grid gap-2">
        <span className="text-[11px] uppercase tracking-widest text-accent-500">
          Revenue model
        </span>
        <p className="font-display text-2xl text-ink-50">{model.revenue_model}</p>
        <p className="text-sm text-ink-400">
          Primary stream: <span className="text-ink-100">{model.primary_revenue_stream}</span>
        </p>
      </header>

      {/* Pricing tiers */}
      <div>
        <span className="text-[11px] uppercase tracking-widest text-ink-500">Pricing tiers</span>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {model.pricing_tiers.map((t, i) => (
            <motion.article
              key={t.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: i * 0.04 }}
              className={cn(
                "grid gap-2 rounded-bento border bg-ink-900/40 p-4 shadow-bento",
                i === 1 ? "border-accent-500/40" : "border-ink-800",
              )}
            >
              <header className="grid gap-0.5">
                <h3 className="font-display text-lg text-ink-50">{t.name}</h3>
                <span className="text-[10px] uppercase tracking-wider text-ink-500">
                  {t.target_segment}
                </span>
              </header>
              <div className="font-display text-3xl text-ink-50">
                ${t.price_usd_monthly}
                <span className="text-sm text-ink-500"> / mo</span>
              </div>
              <ul className="grid gap-1.5 text-sm text-ink-300">
                {t.features.map((f, j) => (
                  <li key={j} className="grid grid-cols-[auto_1fr] gap-1.5">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-accent-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </div>
      </div>

      {/* Unit economics */}
      <div>
        <span className="text-[11px] uppercase tracking-widest text-ink-500">Unit economics</span>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Metric icon={Users} label="CAC" point={model.unit_economics.cac_usd} />
          <Metric icon={CircleDollarSign} label="LTV" point={model.unit_economics.ltv_usd} />
          <Metric icon={Repeat} label="Payback" point={model.unit_economics.payback_months} />
          <RatioCard ratio={model.unit_economics.ltv_cac_ratio} />
        </div>
        <div className="mt-3 rounded-2xl border border-ink-800 bg-ink-900/30 p-4">
          <DataPoint point={model.unit_economics.gross_margin_pct} label="Gross margin" size="md" />
        </div>
      </div>

      {/* Canvas */}
      <div>
        <span className="text-[11px] uppercase tracking-widest text-ink-500">
          Business model canvas
        </span>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {CANVAS_ORDER.map(({ key, label }) => {
            const items = model.business_model_canvas[key] ?? [];
            return (
              <article
                key={key}
                className="grid min-h-[120px] gap-1.5 rounded-2xl border border-ink-800 bg-ink-900/30 p-3"
              >
                <span className="text-[10px] uppercase tracking-wider text-ink-500">{label}</span>
                <ul className="grid gap-0.5 text-[12.5px] text-ink-200">
                  {items.length > 0 ? (
                    items.map((it, i) => (
                      <li key={i} className="grid grid-cols-[auto_1fr] items-start gap-1.5">
                        <span className="mt-1 h-1 w-1 rounded-full bg-accent-500/60" />
                        <span>{it}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-ink-500">—</li>
                  )}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  point,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  point: BusinessModelResult["unit_economics"]["cac_usd"];
}): JSX.Element {
  return (
    <article className="grid gap-2 rounded-2xl border border-ink-800 bg-ink-900/40 p-4">
      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-accent-500" />
        <span className="text-[10px] uppercase tracking-wider text-ink-500">{label}</span>
      </div>
      <DataPoint point={point} size="lg" />
    </article>
  );
}

function RatioCard({ ratio }: { ratio: number }): JSX.Element {
  const healthy = ratio >= 3;
  return (
    <article
      className={cn(
        "grid gap-1 rounded-2xl border p-4",
        healthy ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5",
      )}
    >
      <span className="text-[10px] uppercase tracking-wider text-ink-500">LTV / CAC</span>
      <span className="font-display text-3xl tabular-nums text-ink-50">{ratio.toFixed(2)}×</span>
      <span className={cn("text-[11px]", healthy ? "text-emerald-300" : "text-amber-300")}>
        {healthy ? "Healthy (≥ 3×)" : "Below SaaS benchmark"}
      </span>
    </article>
  );
}
