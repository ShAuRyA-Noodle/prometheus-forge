/**
 * Billing types — tier definitions, invoices, usage.
 */
import { z } from "zod";

import { SubscriptionTierSchema, type SubscriptionTier } from "./user";

export interface TierDefinition {
  id: SubscriptionTier;
  label: string;
  price_usd_monthly: number;
  blurb: string;
  features: string[];
  monthly_generation_cap: number;
  cost_cap_usd: number;
  highlight?: boolean;
  cta: string;
}

export const TIERS: readonly TierDefinition[] = [
  {
    id: "free",
    label: "Free",
    price_usd_monthly: 0,
    blurb: "Try one full pipeline. See the entire experience before committing.",
    features: [
      "1 generation / month",
      "All 13 agents",
      "Watermarked share links",
      "Export PDF only",
    ],
    monthly_generation_cap: 1,
    cost_cap_usd: 2.5,
    cta: "Start free",
  },
  {
    id: "founder",
    label: "Founder",
    price_usd_monthly: 39,
    blurb: "For solo founders shipping their first or third company.",
    features: [
      "12 generations / month",
      "Branching + regen",
      "Slides + Sheets export",
      "Public share links, no watermark",
      "Cmd-K everywhere",
    ],
    monthly_generation_cap: 12,
    cost_cap_usd: 30,
    highlight: true,
    cta: "Become a Founder",
  },
  {
    id: "operator",
    label: "Operator",
    price_usd_monthly: 99,
    blurb: "Run multiple companies. Watch the market. Iterate weekly.",
    features: [
      "60 generations / month",
      "Watch-the-market alerts",
      "Custom domain on landing pages",
      "Cohort dashboards (up to 5)",
      "Priority queue",
    ],
    monthly_generation_cap: 60,
    cost_cap_usd: 150,
    cta: "Upgrade to Operator",
  },
  {
    id: "studio",
    label: "Studio",
    price_usd_monthly: 499,
    blurb: "For accelerators and venture studios. White-labeled, audited, exportable.",
    features: [
      "Unlimited generations (fair-use)",
      "White-label cohort branding",
      "SSO + SAML",
      "Anonymized cohort CSV export",
      "Dedicated Slack channel",
    ],
    monthly_generation_cap: 1000,
    cost_cap_usd: 2000,
    cta: "Talk to studio sales",
  },
] as const;

export const InvoiceSchema = z.object({
  id: z.string(),
  amount_usd: z.number(),
  status: z.enum(["paid", "open", "void", "uncollectible"]),
  invoiced_at: z.string().datetime(),
  hosted_invoice_url: z.string().url().nullable().optional(),
  pdf_url: z.string().url().nullable().optional(),
  description: z.string().nullable().optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const UsageSnapshotSchema = z.object({
  tier: SubscriptionTierSchema,
  generations_this_month: z.number().int(),
  generations_cap: z.number().int(),
  cost_this_month_usd: z.number(),
  cost_cap_usd: z.number(),
  next_reset_at: z.string().datetime(),
});
export type UsageSnapshot = z.infer<typeof UsageSnapshotSchema>;
