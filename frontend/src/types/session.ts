/**
 * Session types — TypeScript mirror of backend/models/session_models.py.
 * Keep in lockstep with that file. Zod runtime schemas live alongside.
 */
import { z } from "zod";

export const AgentNameSchema = z.enum([
  "idea_parser",
  "articulation",
  "market_research",
  "competitive_analysis",
  "business_model",
  "brand_identity",
  "risk_analysis",
  "tech_architecture",
  "financial_model",
  "landing_page",
  "legal_documents",
  "go_to_market",
  "pitch_deck",
  "executive_summary",
]);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const WaveSchema = z.enum(["pre", "wave_1", "wave_2", "wave_3"]);
export type Wave = z.infer<typeof WaveSchema>;

export const AgentStatusValueSchema = z.enum([
  "pending",
  "running",
  "completed",
  "error",
  "gate_rejected",
  "safety_blocked",
  "skipped",
]);
export type AgentStatusValue = z.infer<typeof AgentStatusValueSchema>;

export const SessionStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "partial",
  "error",
  "canceled",
  "safety_blocked",
  "budget_exceeded",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const AgentRecordSchema = z.object({
  name: AgentNameSchema,
  wave: WaveSchema,
  status: AgentStatusValueSchema.default("pending"),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  duration_ms: z.number().int().nullable().optional(),
  input_tokens: z.number().int().default(0),
  output_tokens: z.number().int().default(0),
  cost_usd: z.number().default(0),
  retry_count: z.number().int().default(0),
  error_message: z.string().nullable().optional(),
  output_ref: z.string().nullable().optional(),
});
export type AgentRecord = z.infer<typeof AgentRecordSchema>;

export const CostTelemetrySchema = z.object({
  total_input_tokens: z.number().int().default(0),
  total_output_tokens: z.number().int().default(0),
  total_cost_usd: z.number().default(0),
  grounding_calls: z.number().int().default(0),
  workspace_api_calls: z.number().int().default(0),
  image_generations: z.number().int().default(0),
});
export type CostTelemetry = z.infer<typeof CostTelemetrySchema>;

export const SessionSchema = z.object({
  session_id: z.string(),
  user_uid: z.string(),
  company_id: z.string().nullable().optional(),
  branch_id: z.string().nullable().optional(),
  parent_session_id: z.string().nullable().optional(),
  idempotency_key: z.string(),
  idea_text_hash: z.string(),
  idea_text: z.string(),
  status: SessionStatusSchema.default("queued"),
  created_at: z.string().datetime(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  canceled_at: z.string().datetime().nullable().optional(),
  agents: z.record(AgentNameSchema, AgentRecordSchema).default({}),
  cost: CostTelemetrySchema.default({
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost_usd: 0,
    grounding_calls: 0,
    workspace_api_calls: 0,
    image_generations: 0,
  }),
  company_name: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Session = z.infer<typeof SessionSchema>;
