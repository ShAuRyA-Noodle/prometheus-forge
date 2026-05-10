# PROMETHEUS V2 — MASTER BLUEPRINT

> **Tagline:** "You whisper a startup idea. 90 seconds later you have a coherent company — built on real data, owned by you, ready to operate."

---

## Context

**Why a V2 rebuild.** The original PROMETHEUS V1 blueprint shipped a 12-agent Google ADK pipeline that produced an artifact bundle in ~75 seconds. It demoed beautifully. It also fabricated TAM numbers, hallucinated competitors, generated raw HTML/SVG that bypassed sanitization, asked a generative model to draft Terms of Service from scratch, owned every Drive file under a service account that no founder can transfer, used a single `drive` scope (over-permissioned), shipped without idempotency keys, lacked rate limits, exposed `idea_text` in Cloud Logging, and had no validation gate between waves. Internal red-team audit produced **31 P0/P1 findings**. V1 is a hackathon trophy. It is not a product.

**V2 is anti-fakery + top-0.01% UX.** Every artifact carries provenance. Every numeric claim is a `DataPoint` with `confidence ∈ {sourced, derived, estimated, inferred}` and an optional `Citation`. Every HTML/SVG fragment is sanitized server-side and re-sanitized client-side. Every Workspace file is owned by the user (OAuth `drive.file` scope only). Every wave terminates at a hard gate (Pydantic + Vertex Safety + USPTO/Domainr + WCAG). Every cost is metered per-session with a $2.50 hard cap and a Cloud Function kill-switch wired to a budget alert. Every prompt is versioned. Every legal document is template-fill (Termly / iubenda) plus a lawyer-review CTA — never raw LLM. Every iframe is `sandbox="allow-forms"` only with a strict CSP.

**The killer UX.** A streaming reasoning sidebar exposes what each agent is *thinking*. A progressive canvas drops artifacts in as they arrive — the user reads the brand identity while the financial model is still computing. An in-app deck editor (Tiptap), a financial scenario slider (Recharts + a deterministic Python finance engine), a brand refiner, a sandboxed landing-page preview, branching ("what if we pivoted to enterprise"), a "watched" market dashboard that re-runs weekly, a marketplace where pre-vetted operators bid on user briefs, a Cmd-K palette with everything reachable in two keystrokes, mobile-native voice via Deepgram Nova-2.

**The thesis.** Founders don't need a generator. They need an operating layer between an idea and a company.

---

## 1. Problem & Vision

### 1.1 The pain (dollar-anchored)

A solo founder building a company from scratch spends:

| Artifact | Time | Outsourced cost |
|---|---|---|
| Business plan | 20–40 h | $1,500 – $5,000 |
| Financial model (3-yr P&L + cash) | 10–20 h | $2,000 – $7,000 |
| Pitch deck (10–14 slides) | 15–30 h | $1,000 – $7,000 |
| Landing page (responsive, branded) | 10–20 h | $500 – $3,500 |
| Legal docs (ToS / Privacy, jurisdiction-aware) | 1–3 h coordination | $2,000 – $10,000 |
| Brand identity (name + palette + voice + logo) | 5–15 h | $500 – $5,000 |
| Market research (TAM/SAM/SOM grounded) | 20–40 h | $3,000 – $15,000 |
| GTM plan (90-day) | 10–20 h | $0 – $3,000 |
| Risk register | 4–8 h | — |
| Tech architecture | 4–10 h | — |
| Executive summary | 3–5 h | $300 – $1,000 |
| **Total** | **102–211 h** | **$10,800 – $56,500** |

The honest pain: most solo founders skip half of these and launch with gaps. The gap costs investor meetings, customer trust, and time-to-revenue.

### 1.2 Honest market sizing (no fabricated 88% stat)

V1 cited "137 million new businesses started globally per year" and "88% of startups using AI-generated decks report increased investor engagement." The 137M figure mis-counts informal sole-proprietorships. The 88% statistic does not exist in any peer-reviewed or industry source — it was generated. Both are removed from V2.

**Honest serviceable market:**

| Layer | Population | Source / derivation |
|---|---|---|
| Global new business registrations / yr | ~50–60 M | World Bank Doing Business Report, 2024 (registered formal businesses, not informal) |
| English-speaking, internet-comfortable, willing to use AI tools | ~5–8 M | Cross-ref of (US + UK + CA + AU + IN-tier-1 + EU-English) registrations × estimated tech-comfort 30–40% |
| Serviceable obtainable market (SOM) within 3 yrs | **~3–5 M** | Conversion rate 0.5–1% from awareness → trial × LTV-positive cohort |
| Adjacent: founder-track university programs / accelerator cohorts | ~150 K students/yr | YC + Techstars + 500 Global + ~500 university programs × cohort size |
| Adjacent: corporate innovation team intrapreneurs | ~250 K | Fortune 5000 × ~50 innovation seats |

**Realistic 3-year revenue scenarios** (covered fully in §13):

- Bear: 5,000 paid users × $29/mo blended = **$1.7 M ARR**
- Base: 18,000 paid + 6 cohort licenses + 800 marketplace jobs = **$8.4 M ARR**
- Bull: 60,000 paid + 30 cohort licenses + 4,000 marketplace jobs = **$28.6 M ARR**

### 1.3 Three personas with JTBD

**Maya (28, solo operator).** Just left a senior PM role at a fintech in NYC. Has $12k saved, two months to validate. Job-to-be-done: "When I have an idea on the subway, help me get to a credible artifact bundle by the time I'm home — so I can decide tomorrow whether to take a meeting with my cousin who'll write a $10k angel check." Surfaces matter: voice input on mobile, branded pitch deck within 2 minutes, real domain availability, 90-day GTM with realistic CAC. Pricing tolerance: $29/mo Founder.

**Daniel (41, accelerator director).** Runs a 24-week B2B accelerator with 12 cohorts/yr × 8 startups. Job-to-be-done: "When my batch lands on Day 1, I need every team to walk in with a coherent baseline package so we don't waste week 1 fixing decks." Surfaces matter: cohort dashboard, branded export, admin user management, 50 generations/cohort, lawyer-review CTA prominent (legal liability concern). Pricing tolerance: $5,000–$15,000/cohort.

**Priya (34, intrapreneur).** Director of innovation at a Fortune 1000 retail company. Job-to-be-done: "When the CEO asks 'what if we entered the secondhand market', I need a defensible internal pitch by Friday." Surfaces matter: branded export to corporate templates, no public hosting, SSO, audit log, internal-only mode. Pricing tolerance: $149/mo Team or $50,000 enterprise.

### 1.4 V2 vision

> PROMETHEUS V2 is the operating layer between an idea and a company.

A single voice or text input becomes — in 90 seconds, on real data, with provenance, owned by the user, editable in-app, branchable, deployable, payable — a coherent operating package. The 12-month roadmap extends from generation to **execution**: deploy the landing page to a real domain, file the LLC, set up Stripe, launch the first ad. The 24-month vision extends to a **living co-pilot**: weekly retention diff cron, watched market events, marketplace operator hand-offs.

### 1.5 Existing tools — gap reaffirmed (V2 framing)

| Tool | What it does | V2-relevant gap |
|---|---|---|
| PrometAI | Plan + research | No deck/legal/landing; no provenance; sequential |
| Upmetrics | Guided plan | Rigid Q&A; no parallel artifacts; no in-app editing |
| VentureKit | Quick plan | **Fabricates statistics**, no citations, ToS auto-drafted by LLM (legal liability) |
| Beautiful.ai | AI deck | Decks only; no plan/financials/legal; rigid templates; no brand carry-through |
| Tome / Gamma | AI deck | Beautiful but generic; no real market data; no editable financial model |
| Plus AI | Brief → slides | Thin; no brand consistency across artifacts |
| ValidatorAI | Idea scoring | Advisory only; no artifacts |
| ChatGPT + Canva (DIY) | Anything | No coherence between artifacts; no provenance; no ownership transfer; no idempotency |

**The unique insight (V2):** Startup creation is a **coordination + provenance + ownership** problem. The orchestration is the product. A pitch deck without the financial model's actual numbers, a financial model without the market research's actual TAM, a landing page without the brand's actual palette — these are the failure modes of every existing tool. V2 closes the loop with hard schemas, validation gates, deterministic finance, and ownership transfer at creation.

---

## 2. Core Technical Architecture

### 2.1 Component overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (browser, mobile web)                      │
│  ┌────────────────┐  ┌──────────────────────┐  ┌──────────────────────────┐  │
│  │ Voice/Text +   │  │ Streaming Reasoning   │  │ Progressive Canvas        │  │
│  │ Articulation   │  │ Sidebar (SSE)         │  │ (artifacts drop in)       │  │
│  │ (Deepgram +    │  │ + Cmd-K palette       │  │ + In-app editors          │  │
│  │  Web Speech)   │  │                       │  │ (Tiptap, Recharts)        │  │
│  └────────┬───────┘  └──────────────────────┘  └──────────────────────────┘  │
│           │ POST /api/generate                  ▲ Firestore onSnapshot         │
└───────────┼─────────────────────────────────────┼──────────────────────────────┘
            │ HTTPS + Idempotency-Key + Firebase Auth ID token                    │
            │                                                                     │
┌───────────▼─────────────────────────────────────┴──────────────────────────────┐
│                        GATEWAY  (Cloud Run, FastAPI)                            │
│   • verify Firebase JWT (httpx-firebase-admin)                                  │
│   • Vertex Safety pre-filter on idea_text                                       │
│   • Pydantic validation + 2000-char cap                                         │
│   • idempotency lookup in Firestore                                             │
│   • cost-budget pre-check (user tier × prior 24 h)                              │
│   • enqueue → Cloud Tasks                                                       │
│   • SSE bridge: GET /api/session/{id}/stream — proxies Firestore subcollection  │
│   • REST: GET/POST for branches, exports, deploy, billing                       │
└───────────┬──────────────────────────────────────────────────────────────────────┘
            │ Cloud Tasks (HTTPS, OIDC-signed)
            ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                  WORKER  (Cloud Run, FastAPI, no-cpu-throttling)                │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                       PROMETHEUS ORCHESTRATOR                              │  │
│  │  Pre-Wave   → idea_parser → articulation                                   │  │
│  │  Wave 1     → parallel(market, competitive, business, brand, risk, tech)  │  │
│  │  Gate 1     → schema + safety + USPTO + Domainr + WCAG                    │  │
│  │  Wave 2     → parallel(financial[engine], landing, legal[template], gtm)  │  │
│  │  Gate 2     → schema + reconciliation_passed + HTML sanitize + safety      │  │
│  │  Wave 3     → parallel(pitch_deck, executive_summary)                     │  │
│  │  Gate 3     → schema + coherence_score + cross-artifact name check         │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│   Each agent → Gemini 2.5 Pro/Flash with response_schema (structured output)    │
│   Wave 1 grounded: Pro + google_search ADK tool + USPTO/Domainr/Crunchbase      │
│   Wave 2 finance: deterministic Python engine; Gemini supplies assumptions only │
│   Wave 2 legal: Termly/iubenda template-fill; never LLM                         │
│   Wave 2 landing: Gemini → server-side sanitization (nh3) → CSP injection      │
│   Wave 3 deck: Gemini Pro + Imagen 3 hero per slide                             │
└───────────┬──────────────────────────────────────────────────────────────────────┘
            │ writes Firestore session state, SSE events, cost telemetry
            ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│  FIRESTORE (regional, EU mirror) │ users/{uid}/companies/{cid}/branches/{bid}/  │
│                                   │   runs/{rid} / agent_outputs/{name}          │
│                                   │ TTL 30 d on raw idea_text                    │
│                                   │ DSAR: full export on /api/me/data            │
└────────────────────────────────────────────────────────────────────────────────┘
            │
┌───────────┴──────────────┬─────────────────┬─────────────────┬─────────────────┐
│  Workspace (drive.file)  │  Cloudflare      │  Stripe         │  Resend         │
│  Slides + Docs + Sheets  │  Workers + DNS   │  subscription   │  transactional  │
│  user-owned at creation  │  + Registrar     │  + webhooks     │  email          │
└──────────────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### 2.2 Why this topology (vs V1)

| Property | V1 | V2 |
|---|---|---|
| Compute | FastAPI does everything inline | **Gateway** (fast, stateless) + **Worker** (long-running, Cloud Tasks queued) |
| Idempotency | Re-run produces a new session | **`Idempotency-Key` header** required; repeat = same session_id, no re-run |
| Auth | None | Firebase Auth + WIF for Google APIs |
| Persistence | `sessions/{id}` flat | `users/{uid}/companies/{cid}/branches/{bid}/runs/{rid}` |
| Streaming | Firestore listener only | SSE for reasoning + Firestore for artifacts |
| File ownership | Service account | **User (OAuth, drive.file scope)** |
| Cost cap | None | $2.50 / session enforced server-side; Cloud Function kill-switch on budget alert |
| Validation | Regex JSON repair | Gemini `response_schema` + Pydantic + retry-once |
| Inter-wave | None | **3 hard gates** (Pydantic + Vertex Safety + external checks) |
| Logs | `idea_text` in plaintext | Hashed; raw text only in Firestore (TTL 30d) |
| Deployable target | Cloud Run only | Cloud Run + Cloud Tasks + Cloud Armor + Workload Identity Federation |

### 2.3 Latency budget (per agent / wave)

| Phase | Component | p50 | p95 |
|---|---|---|---|
| Pre-Wave | Idea Parser (Flash) | 2.0 s | 3.5 s |
| Pre-Wave | Articulation (Flash) | 2.5 s | 4.0 s |
| Wave 1 | Market Research (Pro + grounding) | 18 s | 28 s |
| Wave 1 | Competitive Analysis (Pro + grounding) | 18 s | 28 s |
| Wave 1 | Business Model (Flash) | 8 s | 14 s |
| Wave 1 | Brand Identity (Flash) + USPTO + Domainr | 9 s | 16 s |
| Wave 1 | Risk Analysis (Flash) | 7 s | 12 s |
| Wave 1 | Tech Architecture (Flash) | 7 s | 12 s |
| Gate 1 | Pydantic + Vertex Safety + WCAG | 1.2 s | 2.5 s |
| Wave 2 | Financial Model (Pro + finance engine) | 10 s | 16 s |
| Wave 2 | Landing Page (Flash + Imagen × 2) | 14 s | 22 s |
| Wave 2 | Legal Documents (Termly template-fill) | 4 s | 8 s |
| Wave 2 | Go-to-Market (Flash) | 8 s | 14 s |
| Gate 2 | Pydantic + reconciliation + HTML sanitize | 1.0 s | 2.0 s |
| Wave 3 | Pitch Deck (Pro + Slides + Imagen × N) | 22 s | 35 s |
| Wave 3 | Executive Summary (Pro, all-context synthesis) | 14 s | 22 s |
| Gate 3 | Pydantic + coherence + cross-artifact | 0.8 s | 1.5 s |
| **Total wall-clock** | | **~78 s** | **~120 s** |

### 2.4 Cost-per-run summary (target $0.55–$0.85)

See §16 for the full table. Headline: a *full* run with grounding + Imagen heroes lands at **$0.55–$0.85**, vs V1's claimed $0.28 (which omitted grounding, Imagen, and retries). Gross margin at $29/mo Founder (10 runs/mo cap) = ~67%.

### 2.5 Idempotency & at-most-once

- `POST /api/generate` requires `Idempotency-Key` (UUIDv4 client-generated, 24-hour scope).
- Gateway looks up `idempotency_keys/{key}` → returns existing `session_id` if present, else creates and enqueues.
- Cloud Tasks task payload includes `session_id`; the worker is idempotent — if the session is already in `RUNNING` or terminal, it returns 200 immediately.
- Cloud Tasks retry on 5xx; not on 4xx (worker returns 4xx for terminal sessions).

### 2.6 Streaming reasoning (SSE)

The worker writes lightweight events to a Firestore subcollection `runs/{rid}/events` (event type, agent, timestamp, payload-hash, optional 200-char "thought"). The gateway exposes `GET /api/session/{id}/stream` as SSE — server-side it `onSnapshot`s the events subcollection and re-emits as `text/event-stream`. This gives:

- Sub-second visibility into agent state changes
- Streaming partial outputs for the synthesis agents (Wave 3) — the Executive Summary text streams token-by-token via the gateway's Gemini stream proxy
- A single retry-friendly stream that survives reconnects (`Last-Event-Id` pattern)

### 2.7 Workload Identity Federation

No `service-account.json` ships in any container. Cloud Run services run as service accounts (`gateway-sa@…`, `worker-sa@…`, `tasks-invoker-sa@…`) with least-privilege IAM. Local dev uses `gcloud auth application-default login`. CI uses GitHub OIDC → WIF → impersonate `ci-deploy-sa@…`. **Hard rule from CLAUDE.md: no service-account.json paths in Docker layers.**

### 2.8 Cloud Armor

Edge WAF rules (full list in `infrastructure/cloud-armor-rules.yaml`):

- OWASP CRS preset (XSS, SQLi, RCE, LFI)
- Rate limit: 60 req/min/IP on `/api/generate`, 600/min/IP on `/api/session/*`
- Geofence: optional country deny-list (default empty; configurable for compliance)
- Bot challenge: reCAPTCHA Enterprise on suspicious traffic
- ASN block-list for known abuse networks

---

## 3. The 13 Agents

Naming: `{role}_agent.py`, output state key `{role}_result`. All use `response_schema` (Pydantic v2 → Gemini structured output). Schemas live in `backend/models/agent_schemas.py` (single source of truth).

### Pre-Wave (sequential, ~5 s)

#### Agent P0: `idea_parser_agent` [Flash, 2 s]
- **Role:** Raw input → structured `ParsedIdea`
- **Input:** `idea_text` (<2000 chars, post-Vertex-Safety)
- **Output:** `ParsedIdea` (industry, product_type, target_market, geography, key_differentiator, data_collection, regulated_data, brand_personality_hints, moderation_flags)
- **Hard rule:** if regulated industry detected (medical device / financial advice / weapons / minors data), set `moderation_flags` and Wave 1 gate halts pipeline.
- **Cost:** ~$0.0010

#### Agent P1: `articulation_agent` [Flash, 2.5 s]
- **Role:** Polish raw input into a coherent prompt for downstream agents
- **Input:** `ParsedIdea`, original `idea_text`
- **Output:** `ArticulationOutput` (polished_idea, clarifying_questions[≤3], assumptions[≤5], confidence)
- **Behavior:** if confidence < 0.5, surface clarifying_questions to UI before continuing; user picks an interpretation.
- **Cost:** ~$0.0012

### Wave 1 (parallel, ~28 s, blocked by Gate 1)

#### Agent 1: `market_research_agent` [Pro + grounding, 18 s]
- **Output:** `MarketResearchResult` (TAM/SAM/SOM as `DataPoint` with `Citation`, CAGR, top-5 trends, 2–6 demographics, market_timing_score 0–10, ≥3 sources)
- **Tools:** ADK `google_search`, Crunchbase API (companies-of-record), Statista (segment estimates)
- **Gate check:** every numeric `DataPoint` has `confidence ∈ {sourced, derived}`; any "estimated"/"inferred" without a derivation string → schema invalid.
- **Cost:** ~$0.063 (Pro 4K in / 4K out + grounding $0.005)

#### Agent 2: `competitive_analysis_agent` [Pro + grounding, 18 s]
- **Output:** `CompetitiveAnalysisResult` (3–10 competitors with funding/revenue as `DataPoint` and `data_disclosed`, feature matrix, positioning gaps, market concentration)
- **Tools:** `google_search`, Crunchbase, SimilarWeb
- **Cost:** ~$0.072

#### Agent 3: `business_model_agent` [Flash, 8 s]
- **Output:** `BusinessModelResult` (revenue model, 2–4 pricing tiers, unit economics with CAC/LTV/margin/payback, 9-block canvas)
- **Cost:** ~$0.005

#### Agent 4: `brand_identity_agent` [Flash, 9 s]
- **Output:** `BrandIdentityResult` (company_name, name_alternatives ≤5 with availability, tagline ≤120 chars, 3–5 brand voice traits, 3–5 color palette, typography, logo concept + Imagen URL + sanitized SVG)
- **Tools:** USPTO TESS API (trademark conflicts), Domainr (domain availability), X/Instagram handle check, Imagen 3
- **Hard rule:** at least one `name_alternatives` entry must have `domain_com_available=True` and empty `uspto_conflicts`. If primary fails, swap.
- **Cost:** ~$0.014 (Flash $0.005 + USPTO $0.001 + Domainr $0.0005 + Imagen $0.008)

#### Agent 5: `risk_analysis_agent` [Flash, 7 s]
- **Output:** `RiskAnalysisResult` (5–12 RiskEntry with category/probability/impact/mitigation, regulatory considerations by jurisdiction, worst-case scenario, 2–4 pivot options)
- **Cost:** ~$0.004

#### Agent 6: `tech_architecture_agent` [Flash, 7 s]
- **Output:** `TechArchitectureResult` (recommended stack, Mermaid diagram, MVP core/nice-to-have, dev weeks, team size, infra cost as `DataPoint`, ≥3 security considerations)
- **Cost:** ~$0.005

### Gate 1 (~1.2 s)

- Pydantic re-validation of all 6 outputs (defense in depth — agents validate, but state may be mutated mid-flight)
- Vertex Safety on `market_timing_rationale`, `worst_case_scenario`
- USPTO conflict check on `company_name` (issue if `uspto_conflicts != []`)
- Domainr `.com` check (warning if unavailable, surfaces alternative)
- WCAG AA contrast: primary vs text, primary vs background ≥ 4.5
- `ParsedIdea.moderation_flags` empty (else `MODERATION_FLAGGED` blocks pipeline)

On failure: session → `PARTIAL`, downstream agents marked `SKIPPED`, user sees structured issues + retry CTAs.

### Wave 2 (parallel, ~22 s, blocked by Gate 2)

#### Agent 7: `financial_model_agent` [Pro + deterministic engine, 10 s]
- **Output:** `FinancialModelResult` (assumptions, 3–5 year projections, funding seed, runway months, breakeven month, key_metrics, sheets_id, sheets_url, **`reconciliation_passed`**)
- **Behavior:** Gemini supplies *assumptions only* (revenue model, churn, ARPU, CAC growth, hiring plan). The deterministic Python engine `services/finance_engine.py` runs the math: revenue = users × ARPU, gross = revenue − COGS, EBITDA = gross − OPEX, cash trajectory, IRR/NPV via `numpy_financial`. Reconciliation invariants enforced; `reconciliation_passed=False` → Gate 2 hard-blocks.
- **Workspace:** Sheets API creates a 3-tab spreadsheet (P&L, Cash Flow, Key Metrics) **owned by user via OAuth `drive.file`**.
- **Cost:** ~$0.045 (Pro 5K in / 4K out)

#### Agent 8: `landing_page_agent` [Flash + Imagen, 14 s]
- **Output:** `LandingPageResult` (`html_sanitized`, css, title, meta_description, og_tags, hero_image_url, feature_image_urls, deploy_url, custom_domain)
- **Behavior:** Gemini emits structured JSON of section blocks (hero, features, how-it-works, pricing, CTA, footer); the server templates HTML, `nh3.clean(...)` sanitizes, CSP header injected on serve. **No raw HTML from Gemini reaches the DOM.**
- **Imagen 3:** 1 hero image + up to 3 feature images.
- **Cost:** ~$0.039 (Flash $0.008 + Imagen × 4 $0.032)

#### Agent 9: `legal_documents_agent` [Termly/iubenda template-fill, 4 s]
- **Output:** `LegalDocumentsResult` (template IDs, doc IDs, doc URLs, incorporation checklist, jurisdictions covered, lawyer_review_cta=True always)
- **Behavior:** **NEVER calls Gemini for legal text.** Calls `services/legal_template_service.py` which calls Termly API (US/UK/CA) or iubenda API (EU/global) with brand variables. ToS + Privacy generated via API. Lawyer-review CTA always shown.
- **Cost:** ~$0.030 (Termly per-doc fee, billed to PROMETHEUS until user attaches own Termly account)

#### Agent 10: `go_to_market_agent` [Flash, 8 s]
- **Output:** `GoToMarketResult` (launch_strategy_type, launch_phases, marketing_channels with CAC, first_90_days plan, KPIs at 3mo/12mo, partnerships)
- **Cost:** ~$0.006

### Gate 2 (~1.0 s)

- Pydantic re-validation
- `FinancialModelResult.reconciliation_passed=True` (hard)
- Re-sanitize `landing_page_result.html_sanitized` (defense in depth, must not have changed)
- `LegalDocumentsResult.lawyer_review_cta=True` (hard)
- Vertex Safety on landing title/meta

### Wave 3 (parallel, ~22 s, blocked by Gate 3)

#### Agent 11: `pitch_deck_agent` [Pro + Slides + Imagen, 22 s]
- **Output:** `PitchDeckResult` (10–14 slides with layout/title/body/speaker_notes/image_url, presentation_id, presentation_url, pdf_url)
- **Pre-summarization:** Each upstream agent's result is condensed to ≤500 chars before being fed into the pitch deck prompt — keeps Pro context under 12K tokens.
- **Workspace:** Slides API creates presentation owned by user.
- **Imagen:** 1 image per slide that needs a hero (problem, solution, product shot).
- **Cost:** ~$0.085 (Pro 8K in / 6K out + Imagen × 4)

#### Agent 12: `executive_summary_agent` [Pro, 14 s]
- **Output:** `ExecutiveSummaryResult` (summary_text 90–800 words, one_liner ≤160 chars, elevator pitches, key_highlights, **`coherence_score` 0–1**, doc_id, doc_url)
- **Pre-summarization:** Same approach as deck — feed condensed summaries of all 11 prior agents.
- **Coherence score:** computed by self-evaluation prompt — Gemini reads the produced summary and scores how well it integrates the upstream outputs (1.0 = full integration with no contradictions). Threshold for warning at < 0.5 (Gate 3 surfaces as warning, not block, per audit decision).
- **Cost:** ~$0.052

### Gate 3 (~0.8 s)

- Pydantic re-validation
- `ExecutiveSummaryResult.coherence_score ≥ 0.5` (warning), ≥ 0.3 (hard error)
- Cross-artifact: `company_name` must appear in pitch deck title slide
- Vertex Safety on summary_text

### Agent registry summary

| Wave | Agent | Model | Grounded | Latency p50 | Cost |
|---|---|---|---|---|---|
| Pre | idea_parser | Flash | — | 2.0 s | $0.0010 |
| Pre | articulation | Flash | — | 2.5 s | $0.0012 |
| 1 | market_research | Pro | yes | 18 s | $0.063 |
| 1 | competitive_analysis | Pro | yes | 18 s | $0.072 |
| 1 | business_model | Flash | — | 8 s | $0.005 |
| 1 | brand_identity | Flash + Imagen | USPTO/Domainr | 9 s | $0.014 |
| 1 | risk_analysis | Flash | — | 7 s | $0.004 |
| 1 | tech_architecture | Flash | — | 7 s | $0.005 |
| 2 | financial_model | Pro + engine | — | 10 s | $0.045 |
| 2 | landing_page | Flash + Imagen | — | 14 s | $0.039 |
| 2 | legal_documents | Template-fill | Termly | 4 s | $0.030 |
| 2 | go_to_market | Flash | — | 8 s | $0.006 |
| 3 | pitch_deck | Pro + Slides + Imagen | — | 22 s | $0.085 |
| 3 | executive_summary | Pro | — | 14 s | $0.052 |
| **Subtotal** | | | | **~78 s** | **$0.42** |
| + retries (×1.15) + grounding ($0.01) + Imagen variance | | | | | **~$0.55–$0.85** |

---

## 4. Real-Data Integration Plan

V1 simulated reality. V2 calls the actual sources.

| Integration | Used by | Endpoint / SDK | Caching | Cost / call | Failure mode |
|---|---|---|---|---|---|
| **USPTO TESS** | `brand_identity_agent` | `https://tsdrapi.uspto.gov/ts/cd/casestatus/sn/{serial}` + free TESS XML search | 7-day Firestore cache by exact-string + soundex | $0.001 (proxy fee) | Cache stale → continue, surface warning |
| **Domainr** | `brand_identity_agent` | `https://api.domainr.com/v2/status?domain=` | 24-hour cache | $0.0005 | Skip → mark `domain_com_available=None` |
| **Crunchbase Basic** | `market_research`, `competitive_analysis` | REST API (org search, funding rounds) | 30-day per-company cache | $0.001/call | Fall back to grounded search; mark `data_disclosed=False` |
| **Statista** | `market_research` | API (paid; segment & industry summaries) | 30-day per-segment cache | $0.005/call | Fall back to grounded search |
| **SimilarWeb** | `competitive_analysis` | API (traffic estimates, source breakdown) | 30-day per-domain cache | $0.002/call | Skip; competitor entry `data_disclosed=False` |
| **Google Search (ADK)** | grounded agents | ADK built-in `google_search` tool | none (per-run) | $0.005/grounded call | Hard fail if no source citations returned (gate enforces ≥3 sources) |
| **Imagen 3** | `brand_identity`, `landing_page`, `pitch_deck` | Vertex AI Imagen | per-prompt-hash 7-day cache | $0.008/image | Fall back to abstract gradient hero (still on-brand) |
| **Recraft** | `brand_identity` (logo SVG) | REST API | per-prompt-hash 7-day cache | $0.020/SVG | Fall back to Imagen raster + `logo_svg_sanitized=None` |
| **Deepgram Nova-2** | `voice_input` (frontend) | WebSocket realtime | none | $0.0043/min | Browser-native Web Speech API fallback |
| **Termly** | `legal_documents_agent` | REST template-fill | per-jurisdiction-config cache | $0.005/doc (paid plan) | iubenda fallback; if both fail, deliver template stubs + lawyer-review CTA |
| **iubenda** | `legal_documents_agent` (EU/EEA) | REST template-fill | per-jurisdiction cache | $0.004/doc | Fall back to Termly |
| **Cloudflare Workers + Pages** | landing deploy | API (`/zones`, `/pages`) | none | free for 100K req/day | Skip auto-deploy; user gets HTML download |
| **Cloudflare Registrar** | domain purchase | Registrar API | none | wholesale ($8.57 .com) | Cancel + refund flow |
| **Stripe** | billing | SDK | n/a | 2.9% + 30c | Webhook retry; subscription state in Firestore mirror |
| **Resend** | transactional email | SDK | n/a | $0.0003/email | SendGrid fallback |
| **Google Workspace** | Slides/Docs/Sheets | googleapiclient | n/a | included | Retry with exp backoff; fallback to local PPTX/DOCX/XLSX export |

**Cache layer:** Firestore `caches/{integration}/{hash}` with TTL. Workers consult cache before hitting external API. Saves cost and latency on repeat brand names / repeat industries. Cache-hit is logged with `cache_hit=true` in cost telemetry (does not count against budget).

---

## 5. Frontend Architecture

### 5.1 Stack

| Layer | Tech | Why |
|---|---|---|
| Framework | React 18 + TS 5 strict | Hooks, function components, type-safe agent outputs |
| Build | Vite 5 | Instant HMR, sub-second cold start |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) | Token system, no runtime, JIT |
| Animation | Framer Motion 11 | Spring physics; transform+opacity only |
| State | Zustand + URL params | No Redux ceremony; URL is source of truth for share/branch |
| Data | Firebase JS SDK + custom SSE hook | Real-time agent state + streaming reasoning |
| Sanitization | DOMPurify | Mandatory for any agent-emitted HTML/SVG (centralized in `lib/purify.ts`) |
| Editor | Tiptap (deck), Recharts (financial slider), Monaco (landing HTML diff) | Best-in-class per surface |
| Voice | Deepgram Nova-2 WebSocket + Web Speech fallback | Cross-browser, mobile-friendly |
| Cmd-K | `cmdk` | Keyboard-first navigation |
| Analytics | PostHog (self-host option) | Funnel, retention, event |
| Auth | Firebase Auth + Google Sign-In | OAuth for Workspace scope |
| Payments | Stripe Elements + Customer Portal | Subscription, upgrade/downgrade |

### 5.2 Streaming Reasoning Sidebar

The reasoning sidebar is the killer UX element. It shows what each agent is *thinking*, in real time, as it runs.

```
┌────────────────────────────┐
│  [02:14] market_research   │
│  ▸ searching: TAM electric │
│   guitars North America     │
│  ▸ 4 sources found          │
│  ▸ extracting Yamaha 10K    │
│  ▸ derivation: SAM = TAM ×  │
│   addressable (online) ×    │
│   18% conversion intent     │
│  [02:36] ✓ market_research  │
└────────────────────────────┘
```

Each line is an SSE event. Events are short (≤200 chars), redacted of any sensitive prompt content, and capped at 50 events per agent (rate-limit at the worker).

### 5.3 Progressive Canvas

Artifacts render as soon as they arrive. The canvas is a 12-column CSS Grid:

- Brand card (Wave 1) — drops in at ~10 s with palette swatches and typography preview
- Market card (Wave 1) — TAM/SAM/SOM with citation tooltips
- Competitive card (Wave 1) — feature matrix
- Risk card / Tech card (Wave 1) — collapsible
- Financial card (Wave 2) — interactive Recharts P&L with assumption sliders
- Landing card (Wave 2) — sandboxed iframe preview with viewport toggle
- Legal card (Wave 2) — ToS/Privacy + lawyer-review CTA
- GTM card (Wave 2) — 90-day timeline
- Deck card (Wave 3) — Tiptap editor opens in side drawer
- Summary card (Wave 3) — full-width hero with coherence badge

### 5.4 In-app editors

**Deck editor.** Tiptap with custom slide-block schema. User edits speaker notes, body, regenerate single slide via "Regen with steering" → fires `POST /api/session/{id}/regen` with `agent=pitch_deck` + steering text. Regen propagates downstream only on user opt-in.

**Financial slider.** Recharts P&L chart bound to assumption fields (ARPU, churn, headcount per year). Slider triggers a debounced re-run of `services/finance_engine.py` on the server (no Gemini call — pure Python). Sub-100 ms response.

**Landing editor.** Section-by-section block editor. Each block is a typed React component. Users reorder, hide, edit copy. Regenerate hero image via "Try another" → fires Imagen with new prompt. Final HTML is re-sanitized server-side before save.

**Brand refiner.** Click a color swatch → palette generator surfaces alternatives (HCL color space, WCAG-aware). Type alternatives swap in via Google Fonts API.

### 5.5 Cmd-K palette

Single keystroke (`⌘K` / `Ctrl+K`) opens a fuzzy command palette:

- Navigation: "go to deck", "go to financials"
- Action: "regenerate market research", "branch to enterprise pivot"
- Search: "show all my companies", "find runs from last week"
- Edit: "change company name to X"
- Deploy: "deploy landing to my-domain.com"

### 5.6 Sandboxed iframes & CSP

Every agent-generated HTML — landing preview, deck slide preview, branded export preview — renders inside `<iframe sandbox="allow-forms" csp="default-src 'self'; img-src https: data:; style-src 'unsafe-inline'; ...">`. **Hard rule from CLAUDE.md: no `allow-scripts`, no `allow-same-origin`.** A reverse proxy injects CSP headers at serve time so the iframe can't be exploited even if the sandbox is bypassed.

### 5.7 Design system (taste-skill anchored)

- **Palette:** ink (background `#0F0F10` / surface `#1A1A1B`) + accent (`#FF5C28` orange or per-brand) + neutrals (`#E6E6E6` text, `#A1A1A1` secondary). **No purple/blue gradients.**
- **Typography:** Cabinet Grotesk (display) + Geist (body). **No Inter.**
- **Layout:** CSS Grid. Bento layout for results page. **No flex-math.**
- **Motion:** Framer Motion springs `stiffness: 100, damping: 20`. Animate `transform` + `opacity` only. **No fade-in-from-y-20 on every component.**
- **Sample data:** Real or `[ — ]`. **No "John Doe"**, no "99.99%", no "Acme/Nexus/Flow" placeholder names. (Real demo idea: "AI-native pet vital monitor for senior dogs" — generated outputs use a real synthetic brand the system invented.)
- **Sizing:** `min-h-[100dvh]` not `h-screen`. Mobile-first.

### 5.8 Mobile

- Native voice via Deepgram Nova-2 WebSocket (works on iOS Safari unlike Web Speech API)
- Bottom-sheet drawers for editors
- 1-column canvas
- Push notifications via FCM ("Your run is ready")

---

## 6. Backend Architecture

### 6.1 Process topology

```
     Browser
        │ HTTPS  (Idempotency-Key + Firebase JWT)
        ▼
   ┌─────────────────────┐
   │  GATEWAY            │  Cloud Run, 2 vCPU, 1 GiB, min=1, max=20, concurrency=80
   │  FastAPI            │  - auth middleware
   │                     │  - rate-limit middleware (Redis or Firestore)
   │                     │  - idempotency middleware
   │                     │  - body-size middleware (32 KB max)
   │                     │  - safety pre-filter middleware
   │                     │  - CORS (strict origin allow-list)
   │  Routes             │  /api/generate (POST)
   │                     │  /api/session/{id} (GET)
   │                     │  /api/session/{id}/stream (GET, SSE)
   │                     │  /api/session/{id}/regen (POST)
   │                     │  /api/session/{id}/branch (POST)
   │                     │  /api/session/{id}/export (POST)
   │                     │  /api/session/{id}/deploy (POST)
   │                     │  /api/billing/* (Stripe)
   │                     │  /api/me/* (DSAR, account)
   │                     │  /healthz (liveness)
   │                     │  /readyz (readiness)
   └────────┬────────────┘
            │ enqueue → Cloud Tasks (OIDC-signed, retry on 5xx)
            ▼
   ┌─────────────────────┐
   │  WORKER             │  Cloud Run, 4 vCPU, 4 GiB, min=0, max=50, no-cpu-throttling
   │  FastAPI            │  - single internal route POST /internal/run
   │                     │  - validates OIDC from Cloud Tasks invoker SA
   │                     │  - loads session, runs orchestrator
   │                     │  - writes Firestore + emits SSE events
   │                     │  - calls finance_engine, sanitization, legal_template_service
   │                     │  - cost telemetry, kills on budget breach
   └─────────────────────┘
```

### 6.2 Middleware stack (gateway, request order)

1. `RequestIdMiddleware` — assigns `X-Request-Id`, attaches to logger context
2. `CORSMiddleware` — strict origin allow-list (no wildcard)
3. `SizeLimitMiddleware` — 32 KB body cap (idea_text + idempotency-key + locale)
4. `AuthMiddleware` — verifies Firebase ID token, populates `request.state.user_uid`; routes marked `@anonymous` skip
5. `IdempotencyMiddleware` — only on `POST /api/generate`; looks up `idempotency_keys/{key}`
6. `RateLimitMiddleware` — sliding window per uid (3/h, 20/d) and per IP (60/m on /generate)
7. `SafetyMiddleware` — Vertex Safety pre-filter on `idea_text`; rejects in 4xx with categories
8. `CostBudgetMiddleware` — checks user's 24-hour spend against tier cap; rejects 429 if over
9. `OTelMiddleware` — emits trace span with attributes
10. Route handler

### 6.3 Outbox pattern

Every Firestore write that triggers a side effect (email, push, webhook) goes through an outbox subcollection `users/{uid}/outbox/{event_id}`. A separate Cloud Function (Eventarc trigger on outbox writes) processes events with retry semantics. This decouples user-visible writes from external API failures.

### 6.4 Observability

- **Tracing:** OpenTelemetry → Cloud Trace. Spans: `gateway.generate`, `worker.run`, per-agent, per-gate, per-external-call.
- **Logs:** structlog JSON → Cloud Logging. Hash idea_text. Include `session_id`, `user_uid`, `request_id`, `agent`, `cost_usd`.
- **Metrics:** Custom: `pipeline_duration_seconds`, `agent_duration_seconds{agent}`, `agent_cost_usd_total{agent}`, `gate_pass_rate{gate}`, `safety_block_total`, `idempotency_hit_total`.
- **Alerts:** SLOs — p95 < 120 s, error rate < 1%, gate pass rate > 95%, cost-per-session p95 < $1.00.

### 6.5 Sequence diagram — happy path

```
User    Gateway          Cloud Tasks    Worker        Firestore     Gemini       Workspace
 │ POST    │                 │             │              │            │              │
 │────────▶│ verify auth     │             │              │            │              │
 │         │ idempotency     │             │              │            │              │
 │         │ safety pre-filt │             │              │            │              │
 │         │ create Session  │────write───▶│              │            │              │
 │         │─enqueue task───▶│             │              │            │              │
 │◀────202 │                 │             │              │            │              │
 │ GET /stream                              │              │            │              │
 │────────▶│  SSE bridge     │             │              │            │              │
 │                            │             │              │            │              │
 │         │                 │──HTTP+OIDC─▶│              │            │              │
 │         │                 │             │ run pipeline  │            │              │
 │         │                 │             │  Pre-Wave    │            │              │
 │         │                 │             │   ──────────▶│            │              │
 │         │                 │             │   ──────────────────────▶ │              │
 │         │                 │             │   ◀────────────────────── │              │
 │         │                 │             │   ──write────▶│            │              │
 │  ◀ SSE event              │             │               │            │              │
 │         │                 │             │  Wave 1 (parallel ×6)      │              │
 │         │                 │             │   ──────────────────────▶  │              │
 │         │                 │             │  Gate 1                     │              │
 │         │                 │             │  Wave 2 (parallel ×4)      │              │
 │         │                 │             │   ────────────────────────────────────▶   │
 │         │                 │             │   ◀───────────────────────────────────    │
 │         │                 │             │  Gate 2                     │              │
 │         │                 │             │  Wave 3 (parallel ×2)      │              │
 │         │                 │             │  Gate 3                     │              │
 │         │                 │             │   ──final write─▶│           │              │
 │         │                 │◀──200───────│              │            │              │
 │  ◀ SSE complete           │             │              │            │              │
```

---

## 7. State & Persistence

### 7.1 Firestore schema

```
users/{uid}
  ├── profile (email, display_name, locale, plan, created_at)
  ├── stripe_customer_id
  ├── plan_tier: "whisper" | "founder" | "founder_pro" | "team" | "enterprise"
  ├── consents: { gdpr, ccpa, marketing }
  ├── settings (notifications, default_jurisdictions, branded_export)
  │
  ├── companies/{cid}
  │     ├── name (denormalized from Brand Identity)
  │     ├── slug
  │     ├── created_at
  │     ├── archived: bool
  │     ├── watched_market: bool
  │     │
  │     └── branches/{bid}
  │           ├── parent_branch_id (null if main)
  │           ├── steering_note ("pivot to enterprise")
  │           ├── created_at
  │           │
  │           └── runs/{rid}
  │                 ├── (Session model fields)
  │                 ├── idempotency_key
  │                 ├── idea_text (TTL 30d via Firestore TTL on `idea_text_expires_at`)
  │                 ├── idea_text_hash
  │                 ├── status, agents, cost
  │                 │
  │                 ├── agent_outputs/{agent_name}
  │                 │     ├── (full Pydantic JSON)
  │                 │     └── version_id
  │                 │
  │                 └── events/{event_id}
  │                       ├── ts, type, agent, payload_hash, thought
  │                       └── (TTL 7d)
  │
  └── outbox/{event_id} (TTL 24h after processed)

idempotency_keys/{key}
  ├── session_id, user_uid, created_at
  └── (TTL 24h)

caches/{integration}/{hash}
  ├── value, ttl_at, hit_count

share_tokens/{token}
  ├── run_id, scope ("read" | "deck-only"), expires_at

billing_events/{event_id}
  ├── stripe_event_id, type, processed_at
```

### 7.2 Firestore security rules (full file in `infrastructure/firestore.rules`)

- All reads/writes scoped to `request.auth.uid == uid`
- Server-side via Firebase Admin SDK bypasses rules (used by gateway/worker)
- Share tokens grant read-only access to a single run (scoped by token)
- Caches readable by all authenticated users (write only by service)
- `idempotency_keys` and `billing_events` server-only

### 7.3 TTL policies

- `idea_text` (raw): 30 days from creation
- Stream events: 7 days (logs only)
- Idempotency keys: 24 hours
- Caches: per-integration (7–30 days)
- Outbox processed events: 24 hours
- Share tokens: configurable, default 30 days

### 7.4 GDPR / CCPA / DPDP

- `GET /api/me/data` — full export (JSON) of all `users/{uid}/*` subcollections
- `POST /api/me/delete` — soft-delete sets `users/{uid}.deletion_requested_at`; hard-delete cron job runs nightly, purges Firestore + Workspace files (where token still valid) + Stripe customer
- `POST /api/me/consent` — records GDPR/CCPA/DPDP consent state with timestamp + IP
- EU-region Firestore mirror for EU users (configurable; uses `firestore.rules` `match /users/{uid} where region == 'eu'`)

---

## 8. Security Model (top-0.01% architecture)

### 8.1 Defense in depth

| Layer | Control |
|---|---|
| Edge | Cloud Armor (OWASP CRS, rate limit, geofence, ASN, reCAPTCHA) |
| Network | Cloud Run ingress = internal-and-cloud-load-balancing only; no direct public Cloud Run URL |
| Auth | Firebase Auth + Google Sign-In (OAuth `drive.file` scope only) |
| Identity | Workload Identity Federation; no service-account.json in containers |
| Application | Pydantic on input + output, idempotency, safety pre-filter, cost cap |
| Storage | Firestore rules (uid-scoped), TTL on PII, EU-region mirror |
| Output | DOMPurify (client) + nh3 (server) on every HTML/SVG; CSP headers; sandboxed iframes |
| Secrets | Secret Manager + IAM access; rotation playbook; never in env files in prod |
| Build | Distroless image, Sigstore-signed, SBOM in CI, vulnerability scan in CI |
| Runtime | min-priv IAM, read-only filesystem, non-root user, no shell |

### 8.2 Audit-finding → control map (excerpt)

| V1 finding | V2 control |
|---|---|
| Service account owns user files | OAuth `drive.file` at creation |
| Full `drive` scope | Only `drive.file` ever requested |
| Raw HTML to DOM | Server-side `nh3.clean()` + client-side DOMPurify |
| Iframe `allow-scripts` | `sandbox="allow-forms"` only |
| LLM drafts ToS | Termly/iubenda template-fill + lawyer-review CTA |
| Regex JSON repair | `response_schema` + Pydantic + retry-once |
| No idempotency | `Idempotency-Key` header required |
| `idea_text` in logs | Hash before log |
| No cost cap | $2.50 hard cap + budget kill-switch |
| No safety pre-filter | Vertex Safety on input |
| No rate limit | Per-uid + per-IP rate limit |
| No gates between waves | 3 hard gates (schema + safety + USPTO + WCAG + reconciliation + coherence) |
| Guessable session_id | UUIDv4 + Firestore rules uid-scope (IDOR-safe) |
| `service-account.json` in Docker | WIF + adc; never in image layers |

### 8.3 Pen-test scope

**In scope:**
- All `*.prometheus.app` endpoints
- All Cloud Run services (gateway, worker)
- Stripe webhook handlers
- Firestore data access patterns
- IAM role assumption paths

**Out of scope:**
- Third-party APIs (USPTO, Domainr, Crunchbase, Stripe, Cloudflare)
- DDoS testing without prior coordination
- Social engineering of staff

### 8.4 Bug bounty (HackerOne-style)

| Severity | Range |
|---|---|
| Critical (RCE, auth bypass, mass data exfil) | $5,000 – $15,000 |
| High (IDOR, privilege escalation, billing manipulation) | $1,500 – $5,000 |
| Medium (XSS, CSRF, info disclosure) | $300 – $1,500 |
| Low (best practice, low-impact) | $50 – $300 |

`security.txt` published at `/.well-known/security.txt` (see `docs/security.txt`).

### 8.5 Incident response runbook

See `docs/RUNBOOK.md`. Headline: P0 → page on-call within 5 minutes; status page updated within 15; mitigation deployed via traffic-revision split.

---

## 9. File & Folder Structure (V2 tree)

```
prometheus/
├── PROMETHEUS_BLUEPRINT_V2.md        ◄── this file
├── PROMETHEUS_ROADMAP.md
├── README.md
├── CLAUDE.md
├── .env.example
├── .gitignore
├── .dockerignore
│
├── backend/
│   ├── main.py                         # FastAPI gateway entrypoint
│   ├── worker.py                       # FastAPI worker entrypoint
│   ├── config.py                       # Pydantic Settings
│   ├── requirements.txt                # pinned + hashed
│   ├── Dockerfile                      # distroless multi-stage
│   ├── Dockerfile.worker
│   │
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── base.py                     # PrometheusAgent ABC
│   │   ├── orchestrator.py             # SequentialAgent[ParallelAgent[...]]
│   │   ├── gates.py                    # Wave gate functions
│   │   ├── _summarize.py               # pre-summarization for Wave 3
│   │   ├── idea_parser_agent.py
│   │   ├── articulation_agent.py
│   │   ├── market_research_agent.py
│   │   ├── competitive_analysis_agent.py
│   │   ├── business_model_agent.py
│   │   ├── brand_identity_agent.py
│   │   ├── risk_analysis_agent.py
│   │   ├── tech_architecture_agent.py
│   │   ├── financial_model_agent.py
│   │   ├── landing_page_agent.py
│   │   ├── legal_documents_agent.py
│   │   ├── go_to_market_agent.py
│   │   ├── pitch_deck_agent.py
│   │   └── executive_summary_agent.py
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── deps.py                     # FastAPI dependency injection (auth, settings)
│   │   ├── generate.py                 # POST /api/generate
│   │   ├── session.py                  # GET / regen / branch
│   │   ├── stream.py                   # SSE bridge
│   │   ├── export.py                   # POST /api/session/{id}/export
│   │   ├── deploy.py                   # POST /api/session/{id}/deploy
│   │   ├── billing.py                  # Stripe routes
│   │   ├── me.py                       # DSAR + account
│   │   └── health.py
│   │
│   ├── middleware/
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── idempotency.py
│   │   ├── rate_limit.py
│   │   ├── size_limit.py
│   │   ├── safety.py
│   │   ├── cost_budget.py
│   │   ├── otel.py
│   │   └── request_id.py
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── agent_schemas.py
│   │   ├── session_models.py
│   │   ├── request_models.py
│   │   └── response_models.py
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── gemini_client.py            # call_gemini_structured (response_schema)
│   │   ├── vertex_safety.py
│   │   ├── sanitization.py             # nh3 wrappers
│   │   ├── legal_template_service.py   # Termly + iubenda
│   │   ├── finance_engine.py           # deterministic P&L + cash + IRR
│   │   ├── workspace_oauth.py          # OAuth flow + drive.file scope
│   │   ├── slides_service.py
│   │   ├── docs_service.py
│   │   ├── sheets_service.py
│   │   ├── drive_service.py
│   │   ├── imagen_service.py
│   │   ├── recraft_service.py
│   │   ├── deepgram_service.py
│   │   ├── uspto_service.py
│   │   ├── domainr_service.py
│   │   ├── crunchbase_service.py
│   │   ├── statista_service.py
│   │   ├── similarweb_service.py
│   │   ├── cloudflare_service.py
│   │   ├── namecheap_service.py
│   │   ├── stripe_service.py
│   │   ├── resend_service.py
│   │   ├── firestore_service.py
│   │   ├── cache_service.py
│   │   ├── outbox_service.py
│   │   └── share_token_service.py
│   │
│   ├── prompts/                        # versioned prompt files (registry in docs/)
│   │   ├── idea_parser.txt
│   │   ├── articulation.txt
│   │   ├── market_research.txt
│   │   ├── competitive_analysis.txt
│   │   ├── business_model.txt
│   │   ├── brand_identity.txt
│   │   ├── risk_analysis.txt
│   │   ├── tech_architecture.txt
│   │   ├── financial_model.txt
│   │   ├── landing_page.txt
│   │   ├── legal_documents.txt
│   │   ├── go_to_market.txt
│   │   ├── pitch_deck.txt
│   │   └── executive_summary.txt
│   │
│   ├── workers/
│   │   ├── retention_diff.py           # weekly cron — recompute market vs. last week
│   │   ├── budget_killswitch.py        # Cloud Function on budget alert
│   │   ├── outbox_processor.py
│   │   └── gdpr_purge.py
│   │
│   └── tests/
│       ├── conftest.py
│       ├── golden/
│       │   └── ideas.json              # 50 golden ideas (regression)
│       ├── test_agents/                # 14 test files
│       ├── test_gates.py
│       ├── test_orchestrator.py
│       ├── test_services/              # services tests
│       ├── test_middleware/
│       └── test_e2e_pipeline.py        # gated by RUN_INTEGRATION=1
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.cjs
│   ├── tsconfig.json
│   ├── index.html
│   ├── public/                         # static assets only
│   │
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       │
│       ├── lib/
│       │   ├── firebase.ts
│       │   ├── api.ts
│       │   ├── purify.ts               # central DOMPurify wrapper
│       │   ├── sse.ts                  # custom SSE hook
│       │   ├── idempotency.ts          # generate Idempotency-Key
│       │   ├── tokens.ts               # design tokens
│       │   ├── analytics.ts            # PostHog
│       │   └── constants.ts
│       │
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useSessionListener.ts
│       │   ├── useSSEReasoning.ts
│       │   ├── useVoiceInput.ts        # Deepgram + Web Speech fallback
│       │   ├── useGenerate.ts
│       │   ├── useExport.ts
│       │   ├── useDeploy.ts
│       │   ├── useBranch.ts
│       │   ├── useFinanceSlider.ts
│       │   └── useCmdK.ts
│       │
│       ├── components/
│       │   ├── ProgressiveCanvas/
│       │   ├── ReasoningSidebar/
│       │   ├── DeckEditor/             # Tiptap-based
│       │   ├── LandingEditor/          # block editor + Monaco diff
│       │   ├── FinanceSlider/          # Recharts + assumption bindings
│       │   ├── BrandRefiner/
│       │   ├── MicroWidgets/           # AgentCard, GateBadge, CitationChip, etc.
│       │   ├── Sandbox/                # iframe wrapper with sandbox attrs
│       │   ├── CmdK/
│       │   ├── VoiceInput.tsx
│       │   └── TextInput.tsx
│       │
│       ├── pages/
│       │   ├── HomePage.tsx
│       │   ├── ArticulationPage.tsx
│       │   ├── GeneratePage.tsx
│       │   ├── ResultsPage.tsx
│       │   ├── BranchesPage.tsx
│       │   ├── WatchedDashboardPage.tsx
│       │   ├── MarketplacePage.tsx
│       │   ├── BillingPage.tsx
│       │   └── AccountPage.tsx
│       │
│       └── types/
│           ├── agents.ts               # mirror Pydantic
│           ├── session.ts
│           └── api.ts
│
├── infrastructure/
│   ├── cloudbuild.yaml                 # CI/CD trigger config
│   ├── cloud-run-gateway.yaml
│   ├── cloud-run-worker.yaml
│   ├── cloud-tasks-queue.yaml
│   ├── cloud-armor-rules.yaml
│   ├── cloud-scheduler.yaml            # weekly retention cron
│   ├── budget-alert.yaml
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   ├── cors.json
│   ├── secret-manager-setup.md
│   └── iam-roles.md
│
├── scripts/
│   ├── setup.sh
│   ├── dev.sh
│   ├── deploy.sh
│   ├── test.sh
│   ├── benchmark.sh
│   ├── seed-golden-ideas.sh
│   ├── local-emulator.sh
│   ├── migrate-firestore.sh
│   ├── rotate-keys.sh
│   ├── security-scan.sh
│   └── fetch-reference-blueprints.sh
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── DEPLOYMENT.md
│   ├── PROMPT_REGISTRY.md
│   ├── REAL_USER_JOURNEY.md
│   ├── CONTRIBUTING.md
│   ├── RUNBOOK.md
│   ├── security.txt
│   └── REFERENCE_CLAUDE_md_supplymind.md
│
├── reference_blueprints/
│   ├── README.md
│   ├── NEXUS_BLUEPRINT.md              # fetched via script
│   ├── SYMPHONY_BLUEPRINT.md
│   └── SUPPLYMIND_PHASES.md
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── cd.yml
│   │   ├── security-scan.yml
│   │   ├── golden-regression.yml
│   │   └── codeql.yml
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
│       ├── bug.md
│       ├── feature.md
│       └── security.md
│
└── .claude/
    ├── settings.json
    ├── settings.local.json
    ├── commands/
    │   ├── new-agent.md
    │   ├── new-component.md
    │   ├── deploy.md
    │   ├── test-all.md
    │   ├── context-prime.md
    │   ├── tdd.md
    │   ├── create-pr.md
    │   ├── audit.md
    │   ├── release.md
    │   ├── regen-prompt.md
    │   ├── seed-golden.md
    │   └── security-check.md
    └── skills/
        ├── adk-orchestrator/SKILL.md
        ├── prompt-tuner/SKILL.md
        ├── security-pre-commit/SKILL.md
        ├── finance-engine/SKILL.md
        ├── taste-design-frontend/SKILL.md
        └── test-driven/SKILL.md
```

---

## 10. Agent Prompt Engineering

### 10.1 Template (every prompt follows this shape)

```
ROLE
You are a {role}. Your task is to {task} for the following startup idea.

INPUTS
- polished_idea: {polished_idea}
- industry: {industry}
- product_type: {product_type}
- target_market: {target_market}
- key_differentiator: {key_differentiator}
- {wave-specific upstream summaries}

HARD RULES
1. Output ONLY a single JSON object that matches the schema below. No prose, no markdown, no code fences.
2. Do NOT fabricate statistics, citations, or names. If you cannot source a claim, set `confidence` to `"estimated"` or `"inferred"` and provide a `derivation` explaining how you arrived at it.
3. Use only data the system provided plus what {grounded_search_or_not} returns. Do not invent companies that do not exist.
4. {agent-specific anti-fabrication clauses}
5. Every numeric claim must be a `DataPoint` with `confidence` and (if sourced) a `Citation` with publisher and source_url.
6. Strings have hard length caps as specified in the schema. Do not exceed them.

SCHEMA (JSON Schema)
{response_schema_inline}

EXAMPLES
{1-2 inline examples — input + valid output}

EDGE CASES
- If a required field cannot be determined, return a clearly marked stub (e.g. `industry_keywords: []`) rather than fabricating.
- If grounded search returns no results, set `sources: []` and the agent's gate will fail (intended).

NOW PRODUCE THE JSON.
```

### 10.2 Anti-fabrication clauses (per-agent)

- **market_research:** "Do NOT make up TAM numbers. If you cannot source TAM directly, derive it (TAM = unit_count × ARPU × adoption) and state the derivation in `tam.derivation`. Set confidence to `derived`."
- **competitive_analysis:** "Do NOT invent companies. Only list competitors that appear in your grounded search results or in the user's brief. Set `data_disclosed=False` if revenue or funding is not publicly available."
- **brand_identity:** "Do NOT pick a name without checking USPTO and Domainr (the system runs these checks for you in `after_model`). Provide 3 alternatives so the system can swap if primary fails."
- **financial_model:** "Do NOT compute the projections. Output only assumptions; the deterministic finance engine computes the math."
- **legal_documents:** "Do NOT draft any legal text. Output only template variables; the legal template service does the rest."
- **pitch_deck:** "Speaker notes must reference specific numbers from the financial model and market research outputs above. If a number you'd like to cite is not in the inputs, omit it rather than inventing."

### 10.3 Pre-summarization (Wave 3 only)

Wave 3 agents read up to 10 upstream outputs. Raw concatenation balloons context to 15K+ tokens (cost amplifier + recall degradation). Solution: `backend/agents/_summarize.py` runs a Flash call with `response_schema={summary: str (max 500), key_numbers: list[DataPoint]}` per upstream agent, and the Wave 3 prompt includes only the summaries.

Net effect: pitch deck context drops from 15K → 4K tokens; cost drops from $0.18 → $0.08; coherence improves (less noise).

### 10.4 Prompt versioning

Every prompt is `prompts/{name}.txt`. Header includes `# version: 1.2.3`. PROMPT_REGISTRY.md tracks changes + golden regression scores. On change: PR runs golden regression, score delta posted as PR comment.

---

## 11. Production Deployment

See `docs/DEPLOYMENT.md` for full step-by-step. Headlines:

### 11.1 Cloud Run

Two services: `prometheus-gateway` and `prometheus-worker`, distinct service accounts, distinct images. Worker has `--no-cpu-throttling` so async wave-runners stay parallel.

```bash
gcloud run deploy prometheus-gateway \
  --image=us-central1-docker.pkg.dev/$PROJECT/containers/gateway:$SHA \
  --service-account=gateway-sa@$PROJECT.iam.gserviceaccount.com \
  --min-instances=1 --max-instances=20 --concurrency=80 \
  --memory=1Gi --cpu=2 --timeout=300 --region=us-central1 \
  --ingress=internal-and-cloud-load-balancing

gcloud run deploy prometheus-worker \
  --image=us-central1-docker.pkg.dev/$PROJECT/containers/worker:$SHA \
  --service-account=worker-sa@$PROJECT.iam.gserviceaccount.com \
  --min-instances=0 --max-instances=50 --concurrency=4 \
  --memory=4Gi --cpu=4 --no-cpu-throttling --timeout=900 --region=us-central1 \
  --ingress=internal --no-allow-unauthenticated
```

### 11.2 Cloud Tasks

Queue config in `infrastructure/cloud-tasks-queue.yaml`:
- max attempts 5, min backoff 10s, max backoff 60s
- DLQ subscription via Pub/Sub on permanent failure
- OIDC token authentication via `tasks-invoker-sa`

### 11.3 Cloud Armor

Attached to a Cloud Load Balancer in front of the gateway:
- OWASP CRS preset (level 1)
- Rate limit rule: per-IP 60 req/min on `/api/generate`
- Geofence: configurable
- reCAPTCHA on suspicious requests

### 11.4 Workload Identity Federation

CI uses GitHub OIDC → WIF identity pool → impersonates `ci-deploy-sa@…`. Local dev uses `gcloud auth application-default login`. Cloud Run services use attached service accounts with implicit ADC.

### 11.5 Secret Manager

All secrets in Secret Manager, mounted at runtime via Cloud Run secret mounts. Rotation playbook in `scripts/rotate-keys.sh`.

### 11.6 Budget alert + kill-switch

Budget at $X/mo; alert at 50/80/100% to a Pub/Sub topic. A Cloud Function subscriber at 100% sets a Firestore flag `system/global.kill_switch=true`. The cost-budget middleware short-circuits all generations while flag is set; admin manually clears.

### 11.7 Observability dashboards

- **Pipeline:** p50/p95 duration, gate pass rate per gate, cost per session
- **Agent:** per-agent duration, cost, retry rate, validation error rate
- **Business:** generations/day, conversion to paid, churn
- **Reliability:** error rate, 5xx rate, Cloud Tasks DLQ depth

### 11.8 Rollback

`gcloud run services update-traffic prometheus-gateway --to-revisions=PREV_REV=100 --region=us-central1`. Both services support traffic split for canaries (10/90 → 50/50 → 100/0).

---

## 12. Risks & Mitigations (V2)

Every V1 risk is replaced. New rows are audit-finding driven.

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Prompt injection via grounded search results | High | High | Sanitize search results before injection (strip HTML, tag-tokenize URLs); response_schema prevents instruction-following on returned content; output Pydantic validation rejects schema-violating output |
| Indirect injection via competitor website scraping | Medium | High | All scraped content runs through nh3.clean + LLM-as-allowlist (only structured fields extracted, no free-text field accepts user-content) |
| Cost amplification DoS (long idea_text + retries) | Medium | High | 2000-char input cap, 1 retry max, $2.50 hard cap per session, kill-switch on budget alert |
| IDOR via guessable session_id | Low | Critical | UUIDv4 + Firestore rules `match /users/{uid}/...` + share-token model for public reads |
| Compliance / legal liability (LLM-drafted ToS) | High | Critical | Termly/iubenda template-fill ONLY; lawyer-review CTA mandatory; warning banner on every legal doc |
| Anomaly-based abuse (single uid generates 100 runs/hour) | Medium | Medium | Per-uid rate limit (3/h, 20/d), anomaly detector flags > 2σ above 30-day median, manual review queue |
| Service account key leak | Medium | Critical | WIF only; no service-account.json; Sigstore-signed images; SBOM in CI; rotate on suspicion |
| Imagen produces NSFW or branded content | Low | High | Vertex Safety post-filter on every Imagen output; reject + fall back to gradient hero |
| Domain purchase + chargeback fraud | Medium | Medium | Stripe 3DS required; 24-hour delay before purchase; manual review for high-risk countries |
| GDPR / CCPA non-compliance | Medium | Critical | DSAR endpoints implemented; consent before data processing; EU-region Firestore mirror; deletion cron |
| Stripe webhook replay | Low | Medium | Verify signature + check `billing_events/{event_id}` idempotency table |
| Workspace API rate limit hit | Low | Medium | Exponential backoff + per-user pacing; fall back to local PPTX/DOCX/XLSX export |
| Gemini quota exhaustion | Low | High | Multi-region failover (us-central1 → us-east4); circuit breaker; degraded-mode (Flash-only) banner |
| Crunchbase / Statista API outage | Medium | Low | 30-day cache; fall back to grounded search; mark `data_disclosed=False` |
| Coherence collapse on long synthesis | Medium | Medium | Pre-summarization layer; coherence_score self-eval; warn user if < 0.5 |
| Frontend agent-output XSS | Low | Critical | DOMPurify + nh3 + sandboxed iframe + CSP header — three layers |
| User pastes secrets into idea_text (api keys) | Medium | Medium | Pre-filter regex strips `sk_live_*`, `AKIA…`, JWTs before persistence + log |
| Marketplace operator delivers bad work | Medium | Medium | Pre-vetted operator pool only; escrow on Stripe; rating + dispute flow |

---

## 13. Business Model & Pricing

### 13.1 Tiers

| Tier | Price | Quota | Features |
|---|---|---|---|
| **Whisper** (free) | $0 | 1 quick run / month | Pre-Wave + Wave 1 only (no deck/landing/legal); branded watermark |
| **Founder** | $29/mo | 10 full runs/mo | All 13 agents; Drive export; share-link; basic editor |
| **Founder Pro** | $79/mo | 30 runs/mo | + watched-market dashboard, branching, in-app deck/landing editors, investor analytics, custom domain deploy |
| **Team** | $149/mo | 5 seats × 30 runs each | + admin dashboard, audit log, SSO (Google Workspace), branded export to corporate templates |
| **Cohort** | $5K–$50K | per cohort, 50–500 runs | Accelerator/university — bulk seats, white-label |
| **Marketplace** | per job | — | 20% take-rate on operator delivery (deck polish, landing dev, etc.) |

### 13.2 Honest unit economics

Per run: $0.55–$0.85 real cost (see §16). Plus fixed: Cloud Run (~$200/mo), Firestore (~$50/mo at 100K runs/mo), Imagen (~$1500/mo at 100K runs), Workspace (free), Stripe (2.9%+30c).

| Tier | Price | Monthly cost (max usage) | Gross margin |
|---|---|---|---|
| Whisper | $0 | $0.05 (Wave 1 only, no Imagen) | — |
| Founder ($29) | $29 | $8.50 (10 × $0.85) | **70.7%** |
| Founder Pro ($79) | $79 | $25.50 (30 × $0.85) | **67.7%** |
| Team ($149/mo) | $149 | $42.50 (5 × 10 × $0.85, assume 10 not 30 avg) | **71.5%** |

Anchor: SaaS gross margin target 75%+. We're slightly under because of grounded search + Imagen, justified by superior output quality vs. competitors who skip grounding.

### 13.3 LTV / CAC

Bear scenario (Founder tier):
- LTV = $29 × 14 mo (avg retention) × 70% gross margin = **$284**
- CAC = $80 (mostly content marketing + Product Hunt)
- LTV / CAC = 3.55× (healthy)

Base scenario (mix of Founder + Pro):
- Blended LTV = $440
- CAC = $90
- LTV / CAC = 4.9×

### 13.4 ARR scenarios

| Scenario | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Bear | $90 K | $480 K | $1.7 M |
| Base | $260 K | $2.2 M | $8.4 M |
| Bull | $850 K | $7.5 M | $28.6 M |

### 13.5 Channels (priority-ranked)

1. **Product Hunt launch** (Month 2) — single biggest spike
2. **Content + SEO** ("how to write a pitch deck" → demo)
3. **Founder communities** (IndieHackers, r/startups, Twitter)
4. **Accelerator partnerships** (YC + Techstars + 500 Global + On Deck + Antler)
5. **University programs** (50+ entrepreneurship curricula)
6. **Outbound to corporate innovation teams** (Year 2)
7. **Marketplace flywheel** (Year 2)

---

## 14. Real-User Journey

> Maya, day 0 to day 90. Detailed 30-day version in `docs/REAL_USER_JOURNEY.md`.

**T-0 (Tuesday, 7:42 AM):** Maya clicks an Instagram ad on the subway. Lands on `prometheus.app`. Ink-and-accent landing page, no AI-tells. Big mic button: "Whisper your idea."

**T+10 s:** She hits the mic, speaks: "AI-native vital monitor for senior dogs — collar with ECG, alerts the vet before kidney failure shows up in bloodwork." Deepgram returns the transcript in 1.2 s.

**T+25 s:** Articulation Agent finishes; presents one clarifying question — "Geographic focus first?" She picks "US, then Canada." Generation begins.

**T+40 s:** Reasoning sidebar lights up. Wave 1 agents stream their thoughts. Brand card appears at T+58 s — name suggestion "Pulsefield", palette, typography.

**T+62 s:** USPTO TESS finds a conflict. The brand agent auto-swaps to alternative #2: "Rotunda" (a real word, no conflict, .com $11/yr).

**T+74 s:** Market Research card drops. TAM = $14.2B (cited Statista 2024 + Grand View Research), SAM = $2.1B (derived from US+CA pet wearable spend).

**T+86 s:** Wave 2 starts. Maya watches the financial slider populate — 3-year projections appear. She drags the ARPU slider from $19 → $29; Recharts re-renders in 80 ms (deterministic engine, no Gemini call).

**T+108 s:** Landing page renders in sandboxed iframe. She toggles mobile preview. Hero image (Imagen) shows a senior golden retriever in a softly-lit kitchen. On-brand.

**T+120 s:** Pitch deck card opens in side drawer. 12 slides, brand-correct, with speaker notes that reference the financial model's actual numbers.

**T+138 s:** Pipeline complete. Coherence score 0.78. Maya screenshots the deck title slide and texts her angel-investor cousin.

**T+5 days:** Cousin replies: "Looks legit. Coffee Tuesday?" Maya pays $29, upgrades to Founder.

**T+8 days:** First 90-day GTM action: launch a waitlist on Cloudflare Pages — Maya clicks "Deploy to my domain", buys "rotunda.vet" for $36 (registrar markup). Deploy completes in 30 seconds. Stripe captures.

**T+14 days:** Maya creates a branch: "what if we white-label to vets directly". Branch run produces a different financial model, GTM, and pitch deck. She compares side-by-side.

**T+30 days:** Watched-market dashboard emails her a weekly digest: "TAM updated to $14.4B (+1.4%). New competitor 'Whistle Health' launched ECG. Two new sources cite pet ECG market." Maya opens the comparison view; sees what's changed week-over-week.

**T+45 days:** Maya hires a marketplace operator (deck polisher, $400 fixed) via PROMETHEUS Marketplace. Stripe escrow holds funds. Operator delivers in 3 days. Maya releases.

**T+90 days:** Maya pitches a $300K seed round. Closes $250K in commitments. PROMETHEUS retained user.

---

## 15. Killer Differentiators

1. **Coherence score** — a quantitative measure of inter-artifact integration that no competitor surfaces. If your deck financials don't match your model, the score drops.
2. **Branching** — fork a run with a steering note; explore "what if" pivots with side-by-side compare.
3. **Watched market dashboard** — re-runs the market & competitive agents weekly; emails diff to Founder Pro+.
4. **Marketplace** — vetted operators bid on user briefs (deck polish, copywriting, deploy). 20% take-rate. Two-sided flywheel.
5. **Mobile-native voice** via Deepgram Nova-2 (works on iOS Safari, unlike Web Speech API).
6. **Cmd-K palette** — every action 2 keystrokes away.
7. **In-app editors** — no "export to Google Slides and edit there" friction. Tiptap deck, Recharts financial slider, Monaco landing diff.
8. **Real ownership** — every Workspace file owned by user at creation (OAuth `drive.file`).
9. **Real data with provenance** — every numeric `DataPoint` has confidence + (when sourced) a Citation.
10. **Deterministic finance engine** — sliders re-compute in 80 ms; no LLM doing arithmetic.

---

## 16. Real-Data API Costs & Honest Unit Economics

| Item | Calls/run | Unit cost | Cost/run |
|---|---|---|---|
| Gemini 2.5 Pro (input) | ~22K tokens | $1.25/1M | $0.0275 |
| Gemini 2.5 Pro (output) | ~17K tokens | $10/1M | $0.170 |
| Gemini 2.5 Flash (input) | ~16K tokens | $0.50/1M | $0.008 |
| Gemini 2.5 Flash (output) | ~22K tokens | $3/1M | $0.066 |
| Grounded search calls | 4–6 | $0.005/call | $0.020–$0.030 |
| Imagen 3 (heroes + slide imgs) | 5–8 | $0.008/img | $0.040–$0.064 |
| USPTO proxy | 1–3 | $0.001/call | $0.001–$0.003 |
| Domainr | 2–4 | $0.0005/call | $0.001–$0.002 |
| Crunchbase | 4–8 | $0.001/call | $0.004–$0.008 |
| Statista | 1–3 | $0.005/call | $0.005–$0.015 |
| SimilarWeb | 0–4 | $0.002/call | $0.000–$0.008 |
| Termly / iubenda | 2 docs | $0.005/doc | $0.010 |
| Workspace (Slides+Sheets+Docs) | 3 | included | $0 |
| Cloud Run + Cloud Tasks | per-run | amortized | $0.005 |
| Firestore writes | ~50 | included free tier | $0–$0.001 |
| **Subtotal (no retries, no premium imagen)** | | | **$0.41** |
| 1 retry on validation (×1.15) | | | $0.06 |
| Premium grounding (Pro tier) | | | $0.05 |
| **Total p50** | | | **$0.55** |
| **Total p95 (heavy retries, all integrations)** | | | **$0.85** |

V1 claimed $0.28/run. Honest restatement: V1 omitted grounding ($0.025), Imagen ($0.04+), retries ($0.05), and external data APIs ($0.025). V2 includes them all.

---

## 17. Compliance

| Regime | Surface | Control |
|---|---|---|
| GDPR (EU) | EU-region Firestore mirror; consent before processing; DSAR (`/api/me/data`); right to be forgotten (`/api/me/delete`) | Explicit on signup; cookie consent banner; 30-day TTL on raw idea_text |
| CCPA (CA) | Same as GDPR; "do not sell" toggle in account | Privacy policy explicitly addresses |
| DPDP (India) | Same as GDPR; data fiduciary registration (when crossing threshold) | Configurable IN-region storage |
| Content moderation | Vertex Safety pre-filter on `idea_text`; categories blocked: CSAM, weapons, IP infringement, fraud, regulated medical advice | Hard block at gateway; logged + flagged; user notified |
| Retention | TTL 30d on raw idea_text; 7d on stream events; 24h on idempotency keys | Firestore TTL policies |
| Lawful basis | Contract (paid) or consent (free) | Recorded in `users/{uid}/consents` |
| Children | 13+ minimum (US), 16+ EU; age-gate on signup | Date-of-birth field; no service to under-13 |
| PCI | Stripe handles cards; PROMETHEUS never sees PAN | Stripe Elements + webhooks |
| Lawyer-review CTA | Every legal artifact carries a banner | Hard-coded in `LegalDocumentsResult.lawyer_review_cta=True` |

---

## 18. Roadmap

See `PROMETHEUS_ROADMAP.md` for the 6-month plan and Year-2 vision.

Headline: M1 launch waitlist + close beta; M2 Product Hunt; M3 paid GA + accelerator outreach; M4 watched market + branching; M5 marketplace alpha; M6 cohort sales close + Year-2 vision tease (real incorporation pipeline).

---

## 19. Appendices

### 19.1 Tech stack (full)

| Layer | Tool | Version |
|---|---|---|
| Backend runtime | Python | 3.11 |
| Backend web | FastAPI | 0.115+ |
| Backend ASGI | uvicorn | 0.30+ |
| Backend orchestration | Google ADK | 1.0+ |
| Backend LLM client | google-genai | 1.0+ |
| Backend admin SDK | firebase-admin | 6.5+ |
| Backend Workspace | google-api-python-client | 2.140+ |
| Backend validation | pydantic | 2.8+ |
| Backend settings | pydantic-settings | 2.4+ |
| Backend HTML sanitize | nh3 | 0.2+ |
| Backend logging | structlog | 24+ |
| Backend HTTP client | httpx | 0.27+ |
| Backend tracing | opentelemetry-* | 1.27+ |
| Backend finance | numpy-financial | 1.0+ |
| Backend Stripe | stripe | 11+ |
| Backend tests | pytest, pytest-asyncio, hypothesis | latest |
| Frontend framework | React | 18 |
| Frontend lang | TypeScript | 5.x |
| Frontend build | Vite | 5.x |
| Frontend style | Tailwind | 4.x |
| Frontend animation | Framer Motion | 11.x |
| Frontend Firebase | firebase | 10.x |
| Frontend sanitize | DOMPurify | 3.x |
| Frontend deck editor | Tiptap | 2.x |
| Frontend charts | Recharts | 2.x |
| Frontend Cmd-K | cmdk | 1.x |
| Frontend voice | Deepgram SDK | latest |
| Frontend analytics | PostHog JS | 1.x |
| Frontend tests | Vitest, Playwright | latest |
| Infra build | Cloud Build | — |
| Infra runtime | Cloud Run | — |
| Infra queue | Cloud Tasks | — |
| Infra DB | Firestore | — |
| Infra WAF | Cloud Armor | — |
| Infra IAM | Workload Identity Federation | — |
| Infra secrets | Secret Manager | — |
| Infra deploy (frontend) | Firebase Hosting | — |
| Infra deploy (landing) | Cloudflare Pages + Workers | — |

### 19.2 Environment variables

See `.env.example` (already authored). Sensitive values in Secret Manager in prod.

### 19.3 API reference URLs

| API | URL |
|---|---|
| Gemini | https://ai.google.dev/gemini-api/docs |
| Google ADK | https://google.github.io/adk-docs/ |
| Vertex AI Safety | https://cloud.google.com/vertex-ai/docs/generative-ai/safety-filters |
| Slides | https://developers.google.com/workspace/slides/api |
| Docs | https://developers.google.com/workspace/docs/api |
| Sheets | https://developers.google.com/workspace/sheets/api |
| Drive | https://developers.google.com/drive/api |
| Cloud Run | https://cloud.google.com/run/docs |
| Cloud Tasks | https://cloud.google.com/tasks/docs |
| Cloud Armor | https://cloud.google.com/armor/docs |
| Firestore | https://firebase.google.com/docs/firestore |
| Imagen 3 | https://cloud.google.com/vertex-ai/generative-ai/docs/image |
| Deepgram | https://developers.deepgram.com |
| USPTO TESS | https://tsdrapi.uspto.gov |
| Domainr | https://domainr.com/docs/api |
| Crunchbase | https://data.crunchbase.com/docs |
| Termly | https://www.termly.io/api-docs |
| iubenda | https://www.iubenda.com/en/help/15212-api-documentation |
| Stripe | https://stripe.com/docs/api |
| Cloudflare | https://developers.cloudflare.com/api |
| PostHog | https://posthog.com/docs/api |

### 19.4 Sample CLAUDE.md (excerpt — full file checked into root)

See `/CLAUDE.md` at project root. Includes hard constraints, code conventions, naming, project structure, the 13 agents, dependencies, testing, environment, useful commands.

---

## Critical Files for Implementation

When picking up V2 work, start at:

1. **`backend/agents/orchestrator.py`** — wave topology, gate insertion, idempotency invariants, cost telemetry. This file is the production-grade replacement of V1's ADK-only orchestrator.
2. **`backend/agents/gates.py`** — three gate functions; failure surfaces to user as structured `GateResult` issues.
3. **`backend/agents/base.py`** — `PrometheusAgent` ABC; structured-output discipline; retry-once; safety-blocked path.
4. **`backend/models/agent_schemas.py`** — single source of truth for every agent's output. Used by `response_schema` AND validation gate AND TS mirror.
5. **`backend/services/finance_engine.py`** — deterministic Python P&L; LLM never does arithmetic.
6. **`backend/services/sanitization.py`** — server-side nh3 wrappers; mandatory for HTML/SVG outputs.
7. **`backend/services/legal_template_service.py`** — Termly + iubenda; legal docs NEVER touch Gemini.
8. **`backend/services/gemini_client.py`** — the one place that calls Gemini with `response_schema`; retry-once on validation.
9. **`backend/middleware/idempotency.py`, `cost_budget.py`, `safety.py`** — the three middleware that protect against fakery, abuse, and runaway cost.
10. **`frontend/src/lib/purify.ts`** — central DOMPurify wrapper.
11. **`frontend/src/components/Sandbox/`** — sandboxed iframe wrapper with CSP injection.
12. **`frontend/src/components/ProgressiveCanvas/`** — the killer UX layer.
13. **`frontend/src/components/ReasoningSidebar/`** — SSE-fed transparency layer.
14. **`infrastructure/firestore.rules`** — uid-scoped reads/writes.
15. **`infrastructure/cloud-armor-rules.yaml`** — edge WAF.
16. **`infrastructure/cloud-tasks-queue.yaml`** — DLQ + retry config.
17. **`docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/RUNBOOK.md`** — operations.

---

> **Closing:** "PROMETHEUS V1 was a hackathon trophy. V2 is the operating layer between an idea and a company. Every claim is provenanced. Every artifact is owned by you. Every cost is metered. Every wave is gated. Every iframe is sandboxed. Every prompt is versioned. The orchestration is the product."
