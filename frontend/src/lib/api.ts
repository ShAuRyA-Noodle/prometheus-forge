/**
 * Typed API client for PROMETHEUS backend.
 *
 * - Native fetch.
 * - Auto-attaches Bearer token from Firebase ID token (refreshes on 401).
 * - Idempotency-Key header on /api/generate (required by backend contract).
 * - Errors → typed `APIError` with `code` + `message` + `status`.
 * - Returns Zod-validated promises where the response is structured.
 */
import { z } from "zod";

import { getIdToken } from "./firebase";
import { SessionSchema, type Session } from "@/types/session";
import { UserSchema, type User } from "@/types/user";
import { UsageSnapshotSchema, type UsageSnapshot } from "@/types/billing";
import { ArticulationOutputSchema, type ArticulationOutput } from "@/types/agents";

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "/api";

// ─── Errors ──────────────────────────────────────────────────────────────────

export class APIError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(opts: { code: string; message: string; status: number; details?: unknown }) {
    super(opts.message);
    this.name = "APIError";
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
  }
}

// ─── Request types ───────────────────────────────────────────────────────────

export interface GenerateRequest {
  idea_text: string;
  geography?: string;
  locale?: string;
  voice_metadata?: {
    duration_s: number;
    accent_confidence?: number;
    transcript_provider?: string;
  };
  branch_from_session_id?: string;
  branch_overrides?: Record<string, unknown>;
}

export interface RegenRequest {
  session_id: string;
  agents: string[];
  reason?: string;
}

export interface BranchRequest {
  parent_session_id: string;
  branch_name?: string;
  overrides?: Record<string, unknown>;
}

export interface ExportRequest {
  session_id: string;
  target: "pdf" | "slides" | "sheets" | "docs" | "notion" | "zip";
  artifact: "deck" | "summary" | "model" | "landing" | "legal" | "all";
}

export interface DeployRequest {
  session_id: string;
  custom_domain?: string;
  password?: string;
}

export interface MarketplaceOrderRequest {
  session_id: string;
  job_type: string;
  notes?: string;
}

export interface CheckoutRequest {
  tier: string;
  return_url?: string;
}

// ─── Response Zod schemas ────────────────────────────────────────────────────

const GenerateResponseSchema = z.object({
  session_id: z.string(),
  status: z.string(),
  reused: z.boolean().default(false),
});
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

const TranscribeResponseSchema = z.object({
  transcript: z.string(),
  duration_s: z.number(),
  accent_confidence: z.number().nullable().optional(),
  language: z.string().nullable().optional(),
  provider: z.string(),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

const ExportResponseSchema = z.object({
  url: z.string().url().nullable().optional(),
  status: z.enum(["ready", "queued"]),
  job_id: z.string().nullable().optional(),
});
export type ExportResponse = z.infer<typeof ExportResponseSchema>;

const DeployResponseSchema = z.object({
  deploy_url: z.string().url(),
  custom_domain: z.string().nullable().optional(),
  status: z.enum(["live", "queued"]),
});
export type DeployResponse = z.infer<typeof DeployResponseSchema>;

const ShareLinkResponseSchema = z.object({
  share_token: z.string(),
  share_url: z.string().url(),
  expires_at: z.string().datetime().nullable().optional(),
});
export type ShareLinkResponse = z.infer<typeof ShareLinkResponseSchema>;

const CheckoutResponseSchema = z.object({
  url: z.string().url(),
  session_id: z.string(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

const MarketplaceOrderResponseSchema = z.object({
  order_id: z.string(),
  status: z.enum(["queued", "matched", "in_progress", "delivered", "canceled"]),
  estimated_delivery_at: z.string().datetime().nullable().optional(),
});
export type MarketplaceOrderResponse = z.infer<typeof MarketplaceOrderResponseSchema>;

const CompanySummarySchema = z.object({
  company_id: z.string(),
  company_name: z.string(),
  latest_session_id: z.string(),
  latest_status: z.string(),
  branch_count: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  industry: z.string().nullable().optional(),
  one_liner: z.string().nullable().optional(),
});
const MyCompaniesResponseSchema = z.object({
  companies: z.array(CompanySummarySchema),
});
export type CompanySummary = z.infer<typeof CompanySummarySchema>;

// ─── Core fetch helper ───────────────────────────────────────────────────────

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  // For idempotent posts (generate).
  idempotencyKey?: string;
  // Pre-formed FormData (for /transcribe).
  formData?: FormData;
  // signal for abort
  signal?: AbortSignal;
}

async function request<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  opts: RequestOpts = {},
): Promise<z.infer<TSchema>> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };

  const token = await getIdToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body,
      credentials: "include",
      signal: opts.signal ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new APIError({ code: "aborted", message: "Request aborted", status: 0 });
    }
    throw new APIError({
      code: "network_error",
      message: err instanceof Error ? err.message : "Network failure",
      status: 0,
    });
  }

  // 401 with refresh-once retry.
  if (res.status === 401 && !opts.headers?.["x-retried"]) {
    const refreshed = await getIdToken(true);
    if (refreshed) {
      return request(path, schema, {
        ...opts,
        headers: { ...(opts.headers ?? {}), "x-retried": "1" },
      });
    }
  }

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
  } else if (res.status !== 204) {
    payload = await res.text();
  }

  if (!res.ok) {
    const errBody =
      payload && typeof payload === "object" && payload !== null
        ? (payload as { code?: string; message?: string; detail?: string })
        : null;
    throw new APIError({
      code: errBody?.code ?? `http_${res.status}`,
      message: errBody?.message ?? errBody?.detail ?? res.statusText ?? "Request failed",
      status: res.status,
      details: payload,
    });
  }

  // Empty success.
  if (res.status === 204 || payload === null) {
    // schema must allow undefined / null
    return schema.parse(undefined);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new APIError({
      code: "invalid_response",
      message: "Server response failed schema validation",
      status: res.status,
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

// ─── Public methods ──────────────────────────────────────────────────────────

function genIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const api = {
  /** POST /api/generate — kicks off a session. Idempotent on Idempotency-Key. */
  async generate(
    req: GenerateRequest,
    opts: { idempotencyKey?: string } = {},
  ): Promise<GenerateResponse> {
    return request("/generate", GenerateResponseSchema, {
      method: "POST",
      body: req,
      idempotencyKey: opts.idempotencyKey ?? genIdempotencyKey(),
    });
  },

  /** GET /api/sessions/:id — fetch full session document. */
  async getSession(sessionId: string, signal?: AbortSignal): Promise<Session> {
    return request(`/sessions/${encodeURIComponent(sessionId)}`, SessionSchema, { signal });
  },

  /** POST /api/sessions/:id/cancel */
  async cancelSession(sessionId: string): Promise<void> {
    await request(`/sessions/${encodeURIComponent(sessionId)}/cancel`, z.unknown(), {
      method: "POST",
    });
  },

  /** POST /api/regen — re-run a subset of agents. */
  async regen(req: RegenRequest): Promise<GenerateResponse> {
    return request("/regen", GenerateResponseSchema, {
      method: "POST",
      body: req,
      idempotencyKey: genIdempotencyKey(),
    });
  },

  /** POST /api/branch — fork an existing session. */
  async branch(req: BranchRequest): Promise<GenerateResponse> {
    return request("/branch", GenerateResponseSchema, {
      method: "POST",
      body: req,
      idempotencyKey: genIdempotencyKey(),
    });
  },

  /** POST /api/export — request an export job. */
  async exportArtifact(req: ExportRequest): Promise<ExportResponse> {
    return request("/export", ExportResponseSchema, {
      method: "POST",
      body: req,
    });
  },

  /** POST /api/deploy — push a generated landing page to Cloudflare. */
  async deploy(req: DeployRequest): Promise<DeployResponse> {
    return request("/deploy", DeployResponseSchema, {
      method: "POST",
      body: req,
    });
  },

  /** POST /api/share — create signed share token. */
  async createShareLink(
    sessionId: string,
    artifact: "summary" | "deck" | "landing",
  ): Promise<ShareLinkResponse> {
    return request("/share", ShareLinkResponseSchema, {
      method: "POST",
      body: { session_id: sessionId, artifact },
    });
  },

  /** POST /api/speech/transcribe — multipart audio upload. */
  async transcribeAudio(blob: Blob, opts?: { languageHint?: string }): Promise<TranscribeResponse> {
    const fd = new FormData();
    fd.append("audio", blob, "speech.webm");
    if (opts?.languageHint) fd.append("language_hint", opts.languageHint);
    return request("/speech/transcribe", TranscribeResponseSchema, {
      method: "POST",
      formData: fd,
    });
  },

  /** GET /api/me */
  async me(): Promise<User> {
    return request("/me", UserSchema);
  },

  /** GET /api/me/companies */
  async myCompanies(): Promise<CompanySummary[]> {
    const res = await request("/me/companies", MyCompaniesResponseSchema);
    return res.companies;
  },

  /** GET /api/me/usage */
  async getUsage(): Promise<UsageSnapshot> {
    return request("/me/usage", UsageSnapshotSchema);
  },

  /** POST /api/marketplace/orders */
  async marketplaceOrder(req: MarketplaceOrderRequest): Promise<MarketplaceOrderResponse> {
    return request("/marketplace/orders", MarketplaceOrderResponseSchema, {
      method: "POST",
      body: req,
    });
  },

  /** POST /api/billing/checkout — Stripe Checkout session. */
  async checkout(req: CheckoutRequest): Promise<CheckoutResponse> {
    return request("/billing/checkout", CheckoutResponseSchema, {
      method: "POST",
      body: req,
    });
  },

  /** GET /api/billing/portal — Stripe portal redirect. */
  async billingPortal(): Promise<CheckoutResponse> {
    return request("/billing/portal", CheckoutResponseSchema);
  },

  /** POST /api/articulation — preview articulation step (Pre-Wave standalone). */
  async articulate(idea_text: string): Promise<ArticulationOutput> {
    return request("/articulation", ArticulationOutputSchema, {
      method: "POST",
      body: { idea_text },
    });
  },

  /** POST /api/sse-token — get short-lived token for EventSource (which can't set headers). */
  async getSseToken(sessionId: string): Promise<string> {
    const res = await request(
      "/sse-token",
      z.object({ token: z.string() }),
      { method: "POST", body: { session_id: sessionId } },
    );
    return res.token;
  },
};
