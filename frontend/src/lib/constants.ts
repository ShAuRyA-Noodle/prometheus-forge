/**
 * Frontend constants — single source of truth for agent display, wave assignments,
 * status colors, modes, marketplace job types. Mirrors backend session_models.py.
 */

import type { AgentName, AgentStatusValue, Wave } from "@/types/session";

export const AGENT_DISPLAY_NAMES: Record<AgentName, string> = {
  idea_parser: "Idea Parser",
  articulation: "Articulation",
  market_research: "Market Research",
  competitive_analysis: "Competitive Analysis",
  business_model: "Business Model",
  brand_identity: "Brand Identity",
  risk_analysis: "Risk Analysis",
  tech_architecture: "Tech Architecture",
  financial_model: "Financial Model",
  landing_page: "Landing Page",
  legal_documents: "Legal Documents",
  go_to_market: "Go-to-Market",
  pitch_deck: "Pitch Deck",
  executive_summary: "Executive Summary",
};

export const AGENT_SHORT_LABELS: Record<AgentName, string> = {
  idea_parser: "Parse",
  articulation: "Articulate",
  market_research: "Market",
  competitive_analysis: "Compete",
  business_model: "Model",
  brand_identity: "Brand",
  risk_analysis: "Risk",
  tech_architecture: "Tech",
  financial_model: "Finance",
  landing_page: "Landing",
  legal_documents: "Legal",
  go_to_market: "GTM",
  pitch_deck: "Deck",
  executive_summary: "Summary",
};

export const AGENT_DESCRIPTIONS: Record<AgentName, string> = {
  idea_parser: "Extract industry, product type, target market, regulatory flags.",
  articulation: "Polish the input. Surface clarifying questions before the pipeline runs.",
  market_research: "TAM / SAM / SOM with cited sources via Gemini grounded search.",
  competitive_analysis: "Real competitors with funding, employees, positioning gaps.",
  business_model: "Revenue model, pricing tiers, unit economics, BMC.",
  brand_identity: "Name (USPTO + domain checked), palette, type, logo concept.",
  risk_analysis: "Probability x impact matrix across 8 risk categories.",
  tech_architecture: "Stack, MVP scope, infra cost, mermaid diagram.",
  financial_model: "Deterministic engine — projections, runway, breakeven, P&L.",
  landing_page: "Sanitized HTML + CSS, Imagen hero, deployable preview.",
  legal_documents: "Termly / iubenda template-fill — never raw LLM legal text.",
  go_to_market: "Channels, CAC estimates, 90-day plan, partnerships.",
  pitch_deck: "10-14 slides, speaker notes, Imagen visuals, Slides export.",
  executive_summary: "One-pager that ties every artifact together.",
};

export const WAVE_AGENTS: Record<Wave, AgentName[]> = {
  pre: ["idea_parser", "articulation"],
  wave_1: [
    "market_research",
    "competitive_analysis",
    "business_model",
    "brand_identity",
    "risk_analysis",
    "tech_architecture",
  ],
  wave_2: ["financial_model", "landing_page", "legal_documents", "go_to_market"],
  wave_3: ["pitch_deck", "executive_summary"],
};

export const AGENT_WAVE: Record<AgentName, Wave> = {
  idea_parser: "pre",
  articulation: "pre",
  market_research: "wave_1",
  competitive_analysis: "wave_1",
  business_model: "wave_1",
  brand_identity: "wave_1",
  risk_analysis: "wave_1",
  tech_architecture: "wave_1",
  financial_model: "wave_2",
  landing_page: "wave_2",
  legal_documents: "wave_2",
  go_to_market: "wave_2",
  pitch_deck: "wave_3",
  executive_summary: "wave_3",
};

export const WAVE_LABELS: Record<Wave, string> = {
  pre: "Pre-flight",
  wave_1: "Wave 1 — Foundation",
  wave_2: "Wave 2 — Build",
  wave_3: "Wave 3 — Synthesis",
};

export const STATUS_COLORS: Record<
  AgentStatusValue,
  { bg: string; ring: string; text: string; dot: string }
> = {
  pending: {
    bg: "bg-ink-900/40",
    ring: "ring-ink-800",
    text: "text-ink-400",
    dot: "bg-ink-600",
  },
  running: {
    bg: "bg-accent-500/10",
    ring: "ring-accent-500/40",
    text: "text-accent-300",
    dot: "bg-accent-500",
  },
  completed: {
    bg: "bg-success/10",
    ring: "ring-success/30",
    text: "text-success",
    dot: "bg-success",
  },
  error: {
    bg: "bg-danger/10",
    ring: "ring-danger/40",
    text: "text-danger",
    dot: "bg-danger",
  },
  gate_rejected: {
    bg: "bg-warning/10",
    ring: "ring-warning/40",
    text: "text-warning",
    dot: "bg-warning",
  },
  safety_blocked: {
    bg: "bg-danger/15",
    ring: "ring-danger/50",
    text: "text-danger",
    dot: "bg-danger",
  },
  skipped: {
    bg: "bg-ink-900/20",
    ring: "ring-ink-800",
    text: "text-ink-500",
    dot: "bg-ink-700",
  },
};

export const STATUS_LABEL: Record<AgentStatusValue, string> = {
  pending: "Queued",
  running: "Running",
  completed: "Done",
  error: "Failed",
  gate_rejected: "Gate rejected",
  safety_blocked: "Blocked",
  skipped: "Skipped",
};

// Generation modes — used in input UI and on the homepage.
export const MODES = [
  {
    id: "voice",
    label: "Whisper an idea",
    description: "Tap, speak for up to 60 seconds. We transcribe and articulate before agents run.",
  },
  {
    id: "text",
    label: "Type it out",
    description: "Up to 2,000 characters. Suggestion chips below the field.",
  },
  {
    id: "template",
    label: "Use a template",
    description: "Five real founder ideas across SaaS, marketplace, hardware, services, social.",
  },
] as const satisfies ReadonlyArray<{ id: string; label: string; description: string }>;

// Marketplace expert services — shown post-generation as upgrade paths.
export const MARKETPLACE_JOB_TYPES = [
  {
    id: "lawyer_review",
    label: "Lawyer review of generated docs",
    base_price_usd: 480,
    sla_hours: 48,
    blurb: "Bar-licensed attorney reviews ToS, Privacy, incorporation checklist for your jurisdiction.",
  },
  {
    id: "designer_polish",
    label: "Designer polish on landing + deck",
    base_price_usd: 320,
    sla_hours: 72,
    blurb: "Senior product designer refines visuals, fixes any AI-tells, exports source files.",
  },
  {
    id: "fractional_cfo",
    label: "Fractional CFO model review",
    base_price_usd: 540,
    sla_hours: 96,
    blurb: "Operating CFO pressure-tests assumptions, rebuilds the model in your accounting style.",
  },
  {
    id: "growth_consult",
    label: "Growth strategist 60-min call",
    base_price_usd: 280,
    sla_hours: 120,
    blurb: "Specialist in your category — we match by industry, not random.",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  base_price_usd: number;
  sla_hours: number;
  blurb: string;
}>;

// Curated example ideas — realistic, NOT "Acme/Nexus/Flow" slop.
export const IDEA_TEMPLATES = [
  {
    id: "saas_compliance",
    category: "B2B SaaS",
    title: "SOC 2 evidence collection for pre-Series-A startups",
    body: "A platform that auto-collects evidence from AWS, GitHub, Okta, Linear and assembles a SOC 2 Type II package without an auditor handoff. Target ARR $20-80k per startup, sub-10-person engineering teams pre-Series A.",
  },
  {
    id: "marketplace_repair",
    category: "Marketplace",
    title: "Same-day appliance repair booked from a photo",
    body: "Take a photo of a broken washing machine, app diagnoses likely fault and books a vetted technician within 4 hours in 12 metro areas. 18% take rate, repair partners pay no listing fees.",
  },
  {
    id: "hardware_air",
    category: "Hardware",
    title: "Indoor air-quality sensor for school classrooms",
    body: "Wall-mounted CO2 / PM2.5 / VOC sensor with district-level dashboard for facility managers. Sold via Title IV-A federal funding. Hardware $189 per unit, $9/mo per classroom subscription.",
  },
  {
    id: "service_legal",
    category: "Services",
    title: "Visa renewal as a managed service for tech employers",
    body: "Hire a foreign engineer in 14 days. Handles H-1B / O-1 / TN paperwork end-to-end with flat fee per case. White-glove for Series A-C, replaces $35k Fragomen retainer with $4,200 per filing.",
  },
  {
    id: "social_creators",
    category: "Social",
    title: "Anonymous peer review for first-time podcasters",
    body: "Upload a draft episode, three vetted creators in your category leave timestamped voice notes within 24 hours. Reciprocal — every review you give earns you one. Premium tier brings paid expert reviewers.",
  },
] as const;

// Trust signal copy — for homepage and footer. Realistic, not vague.
export const TRUST_SIGNALS = [
  {
    label: "Idea text retention",
    value: "30 days, then deleted",
  },
  {
    label: "Sources cited",
    value: "Statista, Crunchbase, USPTO, public filings",
  },
  {
    label: "Sandboxed render",
    value: "All HTML rendered in sandboxed iframe",
  },
  {
    label: "Auth & ownership",
    value: "Your Google account owns generated files",
  },
] as const;

// SSE event names — must mirror backend.
export const SSE_EVENTS = {
  AGENT_STARTED: "agent.started",
  AGENT_PROGRESS: "agent.progress",
  AGENT_REASONING: "agent.reasoning",
  AGENT_COMPLETED: "agent.completed",
  AGENT_ERROR: "agent.error",
  GATE_PASSED: "gate.passed",
  GATE_REJECTED: "gate.rejected",
  SESSION_COMPLETED: "session.completed",
  SESSION_ERROR: "session.error",
  SESSION_HEARTBEAT: "session.heartbeat",
  COST_UPDATE: "cost.update",
} as const;

// Cost cap (matches backend MAX_COST_USD_PER_SESSION default).
export const MAX_COST_USD_PER_SESSION = 2.5;
export const MAX_IDEA_LENGTH = 2000;
export const MAX_VOICE_DURATION_S = 60;
