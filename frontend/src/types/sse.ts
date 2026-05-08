/**
 * SSE event union types — wire format from backend stream.
 * Each `type` discriminates the payload.
 */
import { z } from "zod";

import { AgentNameSchema, AgentStatusValueSchema } from "./session";

export const SseAgentStartedSchema = z.object({
  type: z.literal("agent.started"),
  session_id: z.string(),
  agent: AgentNameSchema,
  at: z.string().datetime(),
});

export const SseAgentProgressSchema = z.object({
  type: z.literal("agent.progress"),
  session_id: z.string(),
  agent: AgentNameSchema,
  pct: z.number().min(0).max(1),
  message: z.string().optional(),
  at: z.string().datetime(),
});

export const SseAgentReasoningSchema = z.object({
  type: z.literal("agent.reasoning"),
  session_id: z.string(),
  agent: AgentNameSchema,
  // Cursor-style streaming fragment.
  delta: z.string(),
  // Cumulative seq id, used for ordering on the client.
  seq: z.number().int().nonnegative(),
  at: z.string().datetime(),
});

export const SseAgentCompletedSchema = z.object({
  type: z.literal("agent.completed"),
  session_id: z.string(),
  agent: AgentNameSchema,
  duration_ms: z.number().int().nonnegative(),
  output_ref: z.string(),
  at: z.string().datetime(),
});

export const SseAgentErrorSchema = z.object({
  type: z.literal("agent.error"),
  session_id: z.string(),
  agent: AgentNameSchema,
  status: AgentStatusValueSchema,
  error_code: z.string(),
  error_message: z.string(),
  at: z.string().datetime(),
});

export const SseGatePassedSchema = z.object({
  type: z.literal("gate.passed"),
  session_id: z.string(),
  gate_name: z.string(),
  at: z.string().datetime(),
});

export const SseGateRejectedSchema = z.object({
  type: z.literal("gate.rejected"),
  session_id: z.string(),
  gate_name: z.string(),
  reason: z.string(),
  agents_to_retry: z.array(AgentNameSchema).default([]),
  at: z.string().datetime(),
});

export const SseSessionCompletedSchema = z.object({
  type: z.literal("session.completed"),
  session_id: z.string(),
  at: z.string().datetime(),
});

export const SseSessionErrorSchema = z.object({
  type: z.literal("session.error"),
  session_id: z.string(),
  error_code: z.string(),
  error_message: z.string(),
  at: z.string().datetime(),
});

export const SseSessionHeartbeatSchema = z.object({
  type: z.literal("session.heartbeat"),
  session_id: z.string(),
  at: z.string().datetime(),
});

export const SseCostUpdateSchema = z.object({
  type: z.literal("cost.update"),
  session_id: z.string(),
  total_cost_usd: z.number().nonnegative(),
  at: z.string().datetime(),
});

export const SseEventSchema = z.discriminatedUnion("type", [
  SseAgentStartedSchema,
  SseAgentProgressSchema,
  SseAgentReasoningSchema,
  SseAgentCompletedSchema,
  SseAgentErrorSchema,
  SseGatePassedSchema,
  SseGateRejectedSchema,
  SseSessionCompletedSchema,
  SseSessionErrorSchema,
  SseSessionHeartbeatSchema,
  SseCostUpdateSchema,
]);
export type SseEvent = z.infer<typeof SseEventSchema>;

export type SseEventType = SseEvent["type"];

export type SseEventByType<T extends SseEventType> = Extract<SseEvent, { type: T }>;
