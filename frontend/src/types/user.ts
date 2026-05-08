/**
 * User + subscription types.
 */
import { z } from "zod";

export const SubscriptionTierSchema = z.enum([
  "anonymous",
  "free",
  "founder",
  "operator",
  "studio",
  "enterprise",
]);
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

export const TIER_RANK: Record<SubscriptionTier, number> = {
  anonymous: 0,
  free: 1,
  founder: 2,
  operator: 3,
  studio: 4,
  enterprise: 5,
};

export const UserSchema = z.object({
  uid: z.string(),
  email: z.string().email().nullable().optional(),
  display_name: z.string().nullable().optional(),
  photo_url: z.string().url().nullable().optional(),
  tier: SubscriptionTierSchema.default("anonymous"),
  is_anonymous: z.boolean().default(false),
  created_at: z.string().datetime(),
  locale: z.string().default("en-US"),
  region: z.string().default("US"),
  consent: z
    .object({
      marketing: z.boolean().default(false),
      analytics: z.boolean().default(true),
      research: z.boolean().default(false),
    })
    .default({ marketing: false, analytics: true, research: false }),
  posthog_id: z.string().nullable().optional(),
  stripe_customer_id: z.string().nullable().optional(),
  monthly_cost_usd: z.number().default(0),
  monthly_cost_cap_usd: z.number().default(10),
});
export type User = z.infer<typeof UserSchema>;
