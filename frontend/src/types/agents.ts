/**
 * Agent output schemas — TypeScript + Zod mirror of backend/models/agent_schemas.py.
 * Used to validate API responses at runtime and to type artifact rendering.
 */
import { z } from "zod";

// ─── Pre-Wave ────────────────────────────────────────────────────────────────

export const ParsedIdeaSchema = z.object({
  idea_summary: z.string().min(20).max(500),
  industry: z.enum([
    "fintech",
    "healthtech",
    "edtech",
    "saas",
    "ecommerce",
    "marketplace",
    "social",
    "ai_ml",
    "sustainability",
    "logistics",
    "entertainment",
    "consumer_hardware",
    "developer_tools",
    "enterprise_saas",
    "other",
  ]),
  product_type: z.enum([
    "saas",
    "marketplace",
    "mobile_app",
    "hardware",
    "api_service",
    "platform",
    "content",
    "physical_product",
    "service",
    "other",
  ]),
  target_market: z.string().min(5).max(300),
  geography: z.string().default("Global"),
  key_differentiator: z.string().min(5).max(400),
  data_collection: z.boolean().default(false),
  regulated_data: z.boolean().default(false),
  brand_personality_hints: z.string().max(300).default(""),
  moderation_flags: z.array(z.string()).default([]),
});
export type ParsedIdea = z.infer<typeof ParsedIdeaSchema>;

export const ArticulationOutputSchema = z.object({
  polished_idea: z.string().min(20).max(600),
  clarifying_questions: z.array(z.string()).max(3).default([]),
  assumptions: z.array(z.string()).max(5).default([]),
  confidence: z.number().min(0).max(1),
});
export type ArticulationOutput = z.infer<typeof ArticulationOutputSchema>;

// ─── Citation primitives ─────────────────────────────────────────────────────

export const CitationSchema = z.object({
  text: z.string(),
  source_url: z.string().url(),
  publisher: z.string().nullable().optional(),
  accessed_at: z.string().nullable().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const ConfidenceLevelSchema = z.enum(["sourced", "derived", "estimated", "inferred"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const DataPointSchema = z.object({
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  unit: z.string().nullable().optional(),
  confidence: ConfidenceLevelSchema,
  source: CitationSchema.nullable().optional(),
  derivation: z.string().nullable().optional(),
});
export type DataPoint = z.infer<typeof DataPointSchema>;

// ─── Wave 1 ──────────────────────────────────────────────────────────────────

export const MarketResearchResultSchema = z.object({
  tam: DataPointSchema,
  sam: DataPointSchema,
  som: DataPointSchema,
  cagr: DataPointSchema,
  industry_trends: z.array(z.string()).min(3).max(7),
  target_demographics: z.array(z.string()).min(2).max(6),
  market_timing_score: z.number().min(0).max(10),
  market_timing_rationale: z.string(),
  sources: z.array(CitationSchema).min(3),
});
export type MarketResearchResult = z.infer<typeof MarketResearchResultSchema>;

export const CompetitorEntrySchema = z.object({
  name: z.string(),
  url: z.string().url().nullable().optional(),
  description: z.string(),
  funding: DataPointSchema.nullable().optional(),
  revenue: DataPointSchema.nullable().optional(),
  employee_count: DataPointSchema.nullable().optional(),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  data_disclosed: z.boolean().default(true),
});
export type CompetitorEntry = z.infer<typeof CompetitorEntrySchema>;

export const CompetitiveAnalysisResultSchema = z.object({
  competitors: z.array(CompetitorEntrySchema).min(3).max(10),
  feature_matrix: z.record(z.string(), z.record(z.string(), z.union([z.boolean(), z.string()]))),
  positioning_gaps: z.array(z.string()).min(2),
  market_concentration: z.enum(["fragmented", "moderate", "concentrated", "monopolized"]),
  sources: z.array(CitationSchema).min(3),
});
export type CompetitiveAnalysisResult = z.infer<typeof CompetitiveAnalysisResultSchema>;

export const PricingTierSchema = z.object({
  name: z.string(),
  price_usd_monthly: z.number(),
  features: z.array(z.string()),
  target_segment: z.string(),
});
export type PricingTier = z.infer<typeof PricingTierSchema>;

export const UnitEconomicsSchema = z.object({
  cac_usd: DataPointSchema,
  ltv_usd: DataPointSchema,
  gross_margin_pct: DataPointSchema,
  payback_months: DataPointSchema,
  ltv_cac_ratio: z.number(),
});
export type UnitEconomics = z.infer<typeof UnitEconomicsSchema>;

export const BusinessModelResultSchema = z.object({
  revenue_model: z.string(),
  pricing_tiers: z.array(PricingTierSchema).min(2).max(4),
  unit_economics: UnitEconomicsSchema,
  business_model_canvas: z.record(z.string(), z.array(z.string())),
  primary_revenue_stream: z.string(),
});
export type BusinessModelResult = z.infer<typeof BusinessModelResultSchema>;

export const ColorEntrySchema = z.object({
  name: z.string(),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  role: z.enum([
    "primary",
    "secondary",
    "accent",
    "neutral_dark",
    "neutral_light",
    "background",
    "text",
  ]),
  contrast_on_white: z.number().nullable().optional(),
  contrast_on_black: z.number().nullable().optional(),
  wcag_aa_normal: z.boolean().nullable().optional(),
});
export type ColorEntry = z.infer<typeof ColorEntrySchema>;

export const TypographySchema = z.object({
  heading_font: z.string(),
  body_font: z.string(),
  heading_google_font_url: z.string().url().nullable().optional(),
  body_google_font_url: z.string().url().nullable().optional(),
});
export type Typography = z.infer<typeof TypographySchema>;

export const NameCandidateSchema = z.object({
  name: z.string(),
  rationale: z.string(),
  domain_com_available: z.boolean().nullable().optional(),
  uspto_conflicts: z.array(z.string()).default([]),
  handle_x_available: z.boolean().nullable().optional(),
  handle_instagram_available: z.boolean().nullable().optional(),
});
export type NameCandidate = z.infer<typeof NameCandidateSchema>;

export const BrandIdentityResultSchema = z.object({
  company_name: z.string(),
  name_alternatives: z.array(NameCandidateSchema).max(5).default([]),
  tagline: z.string().max(120),
  brand_voice_traits: z.array(z.string()).min(3).max(5),
  brand_voice_sample_copy: z.string(),
  color_palette: z.array(ColorEntrySchema).min(3).max(5),
  typography: TypographySchema,
  logo_concept_description: z.string(),
  logo_image_url: z.string().url().nullable().optional(),
  logo_svg_sanitized: z.string().nullable().optional(),
  industry_keywords: z.array(z.string()).max(10).default([]),
});
export type BrandIdentityResult = z.infer<typeof BrandIdentityResultSchema>;

export const RiskEntrySchema = z.object({
  category: z.enum([
    "market",
    "execution",
    "regulatory",
    "technical",
    "financial",
    "team",
    "ip",
    "macro",
  ]),
  description: z.string(),
  probability: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
  mitigation: z.string(),
});
export type RiskEntry = z.infer<typeof RiskEntrySchema>;

export const RiskAnalysisResultSchema = z.object({
  risk_matrix: z.array(RiskEntrySchema).min(5).max(12),
  regulatory_considerations: z.record(z.string(), z.array(z.string())),
  worst_case_scenario: z.string(),
  pivot_options: z.array(z.string()).min(2).max(4),
});
export type RiskAnalysisResult = z.infer<typeof RiskAnalysisResultSchema>;

export const TechArchitectureResultSchema = z.object({
  recommended_stack: z.record(z.string(), z.string()),
  architecture_diagram_mermaid: z.string(),
  mvp_core_features: z.array(z.string()).min(3),
  mvp_nice_to_have: z.array(z.string()).default([]),
  estimated_dev_weeks: z.number().int().min(1).max(104),
  estimated_team_size: z.number().int().min(1).max(20),
  monthly_infra_cost_usd_estimate: DataPointSchema,
  security_considerations: z.array(z.string()).min(3),
});
export type TechArchitectureResult = z.infer<typeof TechArchitectureResultSchema>;

// ─── Wave 2 ──────────────────────────────────────────────────────────────────

export const FinancialProjectionRowSchema = z.object({
  year: z.number().int(),
  revenue_usd: z.number(),
  cogs_usd: z.number(),
  gross_profit_usd: z.number(),
  opex_usd: z.number(),
  ebitda_usd: z.number(),
  headcount: z.number().int(),
  cash_usd: z.number(),
});
export type FinancialProjectionRow = z.infer<typeof FinancialProjectionRowSchema>;

export const FinancialModelResultSchema = z.object({
  assumptions: z.record(z.string(), z.unknown()),
  projections: z.array(FinancialProjectionRowSchema).min(3).max(5),
  funding_seed_usd: z.number(),
  runway_months: z.number(),
  breakeven_month: z.number().int().nullable().optional(),
  key_metrics: z.record(z.string(), z.number()),
  sheets_id: z.string().nullable().optional(),
  sheets_url: z.string().url().nullable().optional(),
  reconciliation_passed: z.boolean(),
});
export type FinancialModelResult = z.infer<typeof FinancialModelResultSchema>;

export const LandingPageResultSchema = z.object({
  html_sanitized: z.string(),
  css: z.string(),
  title: z.string(),
  meta_description: z.string(),
  og_tags: z.record(z.string(), z.string()),
  hero_image_url: z.string().url().nullable().optional(),
  feature_image_urls: z.array(z.string().url()).default([]),
  deploy_url: z.string().url().nullable().optional(),
  custom_domain: z.string().nullable().optional(),
  layouts_alternative: z.array(z.string()).max(2).default([]),
});
export type LandingPageResult = z.infer<typeof LandingPageResultSchema>;

export const LegalDocumentsResultSchema = z.object({
  tos_template_id: z.string(),
  tos_doc_id: z.string().nullable().optional(),
  tos_doc_url: z.string().url().nullable().optional(),
  privacy_template_id: z.string(),
  privacy_doc_id: z.string().nullable().optional(),
  privacy_doc_url: z.string().url().nullable().optional(),
  incorporation_checklist: z.array(z.record(z.string(), z.string())),
  jurisdictions_covered: z.array(z.string()),
  lawyer_review_cta: z.boolean().default(true),
});
export type LegalDocumentsResult = z.infer<typeof LegalDocumentsResultSchema>;

export const GoToMarketResultSchema = z.object({
  launch_strategy_type: z.enum([
    "soft_launch",
    "product_hunt",
    "press",
    "community_first",
    "founder_led",
  ]),
  launch_phases: z.array(z.record(z.string(), z.string())),
  marketing_channels: z.array(z.record(z.string(), z.unknown())),
  first_90_days_plan: z.record(z.string(), z.array(z.string())),
  kpis: z.record(z.string(), z.record(z.string(), z.number())),
  partnerships: z.array(z.string()).default([]),
});
export type GoToMarketResult = z.infer<typeof GoToMarketResultSchema>;

// ─── Wave 3 ──────────────────────────────────────────────────────────────────

export const PitchSlideSchema = z.object({
  slide_number: z.number().int(),
  layout: z.enum([
    "title",
    "problem",
    "solution",
    "market",
    "business_model",
    "traction",
    "competition",
    "gtm",
    "financials",
    "team",
    "ask",
    "contact",
  ]),
  title: z.string(),
  body: z.string(),
  speaker_notes: z.string(),
  image_url: z.string().url().nullable().optional(),
});
export type PitchSlide = z.infer<typeof PitchSlideSchema>;

export const PitchDeckResultSchema = z.object({
  slides: z.array(PitchSlideSchema).min(10).max(14),
  presentation_id: z.string().nullable().optional(),
  presentation_url: z.string().url().nullable().optional(),
  pdf_url: z.string().url().nullable().optional(),
});
export type PitchDeckResult = z.infer<typeof PitchDeckResultSchema>;

export const ExecutiveSummaryResultSchema = z.object({
  summary_text: z.string().min(400).max(900),
  one_liner: z.string().max(160),
  elevator_pitch_30s: z.string(),
  elevator_pitch_60s: z.string(),
  key_highlights: z.array(z.string()).min(3).max(6),
  coherence_score: z.number().min(0).max(1),
  doc_id: z.string().nullable().optional(),
  doc_url: z.string().url().nullable().optional(),
});
export type ExecutiveSummaryResult = z.infer<typeof ExecutiveSummaryResultSchema>;

// ─── Aggregate ───────────────────────────────────────────────────────────────

export interface AgentResults {
  parsed_idea?: ParsedIdea;
  articulation?: ArticulationOutput;
  market_research?: MarketResearchResult;
  competitive_analysis?: CompetitiveAnalysisResult;
  business_model?: BusinessModelResult;
  brand_identity?: BrandIdentityResult;
  risk_analysis?: RiskAnalysisResult;
  tech_architecture?: TechArchitectureResult;
  financial_model?: FinancialModelResult;
  landing_page?: LandingPageResult;
  legal_documents?: LegalDocumentsResult;
  go_to_market?: GoToMarketResult;
  pitch_deck?: PitchDeckResult;
  executive_summary?: ExecutiveSummaryResult;
}
