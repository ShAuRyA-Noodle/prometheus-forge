# PROMETHEUS — 6-Month Roadmap

> **Tagline:** "From whispered idea to operating company — in 75 seconds, in six months, in two years."

This document is the executable plan from **M0 (pre-launch waitlist)** through **M6 (cohort sales close)**, plus the Year-2 vision tease. It is dollar-anchored, KPI-targeted, and risk-mitigated. Each month section follows the same shape: **Theme → Features → KPIs → Team Focus → Risks → Hiring**.

---

## North Star

> **By M6 we have 5,000+ signed-up founders, 1,200+ paying users, $46K MRR, 6 cohort licenses sold, NPS ≥ 50, D7 retention ≥ 35%, and a Year-2 product wedge (Living Co-Pilot + real incorporation pipeline) demonstrably in private alpha.**

Counter-metrics we refuse to optimize against:
- DAU (a generator is not a DAU product; it is a "second-generation" product)
- Vanity downloads / waitlist gross signups (we measure activated waitlist → paid funnel)
- LLM token consumption (we measure cost-per-completed-package, not call volume)

---

## KPI Definitions (used throughout)

| KPI | Definition | M6 Target |
|---|---|---|
| **D7 retention** | % of users who returned for a second pipeline run within 7 days of first | 35% |
| **Time to second generation** | Median hours between first and second run | < 48 h |
| **NPS** | Standard 0–10 promoter / detractor split, surveyed at run-complete + 7d post | ≥ 50 |
| **Paid conversion** | % of activated free users (≥ 1 full run) → paid within 14 d | 8% |
| **Generations / user / week** | Mean of paid users only | 4.5 |
| **Weekly active companies** | Distinct `company_id` with ≥ 1 run in trailing 7d | 1,800 |
| **MRR** | Stripe gross MRR (post refunds, pre-tax) | $46K |
| **Cohort revenue** | Cumulative non-MRR contract revenue | $80K |
| **Coherence score (avg)** | Mean `executive_summary.coherence_score` across runs | 0.74 |
| **Pipeline pass rate** | Runs reaching `COMPLETED` (not `PARTIAL` / `FAILED`) | 96% |
| **Cost per run (p50)** | Real Gemini + Imagen + integration cost | $0.60 |
| **Gross margin** | `(MRR - infra_cost - integration_cost - Stripe_fees) / MRR` | 68% |

---

## Pre-Launch — M0 (Weeks −8 to 0)

### Theme
**"Quiet build. Loud waitlist. No demoware."**

V1 was a demo. M0 is the production build of V2. We do not ship a public product yet. We ship a **waitlist landing page**, a **closed alpha cohort of 100 founders**, and the **internal anti-fakery audit closed at zero P0/P1**.

### Features (must-ship)
- Waitlist landing on `prometheus.app` (Cloudflare Pages, single page, ink+accent design system, no AI-tells)
  - Mic-prominent hero, single text input ("whisper your idea — see how PROMETHEUS thinks"), email capture
  - **No fake stats.** "We're not live yet" honesty banner. Privacy + Terms (Termly) at the foot.
- Backend gateway + worker + 13 agents at code-complete with `mypy --strict` clean
- All 31 V1 audit findings closed (P0+P1) with linked PRs
- 50 golden ideas seeded in `backend/tests/golden/ideas.json`
- Closed alpha invite flow: 200 invites sent → 100 founders activated → 30 days of dogfood
- Discord server (private) for alpha cohort + #weekly-bug-bash + #wins channel
- Internal status page + Slack PagerDuty integration
- Analytics: PostHog events instrumented (run-start, run-complete, gate-failure, cost-overrun, share-click)

### KPIs (M0 exit criteria)
| Metric | Target |
|---|---|
| Waitlist signups | 3,500 |
| Alpha founders activated | 100 (50% of invites) |
| Alpha runs completed | 600+ |
| Coherence score (alpha avg) | ≥ 0.65 |
| Pipeline pass rate | ≥ 90% |
| Cost per run (p50) | ≤ $0.95 |
| P0 / P1 audit findings open | 0 |
| Coverage (backend) | ≥ 70% |
| Coverage (frontend hooks) | ≥ 60% |

### Team Focus
- **Backend (2):** orchestrator + gates + finance engine + sanitization + safety pre-filter; achieve `ruff` + `mypy --strict` clean
- **Frontend (1):** progressive canvas + reasoning sidebar + landing page; ship the design system from `taste-design-frontend/SKILL.md`
- **Growth (founder, 0.5 FTE):** waitlist mechanics, content (3 essays — see Channels), invite-list curation
- **Legal (consultant, 0.1 FTE):** Termly contract, ToS / Privacy first pass, lawyer-review CTA wording
- **Sales:** none — too early

### Risks + Mitigations
| Risk | Mitigation |
|---|---|
| Alpha cohort gets a half-baked product → trashes us in public | NDA in alpha invite; private Discord; 2-day review window before any external mention |
| Audit findings re-open during build | CI gate enforces all V1 findings have a regression test; weekly audit-board review |
| Workspace OAuth UX confusing to founders | "Why we ask" inline explainer + screencast + drive.file scope (least-priv) |
| Imagen rate limits hit during dogfood spike | Pre-warm cache with golden idea images; fall-back to gradient hero |

### Hiring
- 0 hires. Contractor only: legal consultant (1099, 5h/wk).

### Cut-if-behind markers
- ⚠️ Cut: marketplace teasers, branded export, watched-market dashboard. They belong M3+.
- ⚠️ Cut: in-app deck editor (Tiptap). Falls back to "Open in Google Slides" for alpha.
- 🛑 **Do NOT cut:** validation gates, idempotency, cost cap, sandboxed iframes, lawyer-review CTA, Workload Identity Federation. These are V2's reason to exist.

---

## M1 — Public Alpha (Weeks 1–4)

### Theme
**"Open the doors quietly. Earn the second generation."**

We turn on signup. Free tier (Whisper) caps at 1 run/month and locks Wave 2/3 behind a paywall. Public alpha targets activated waitlist members + founder communities (IndieHackers, r/startups). No paid ads yet. We are buying signal, not scale.

### Features
- Public signup live with Firebase Auth + Google OAuth (`drive.file` scope only)
- Pricing tiers active: Whisper (free), Founder ($29), Founder Pro ($79). Stripe Checkout + Customer Portal
- Streaming reasoning sidebar **fully populated** (every agent emits ≤ 50 events, ≤ 200 chars each)
- Progressive canvas with all 13 agent cards rendering
- "Open in Google Slides" / "Open in Google Sheets" / "Open in Google Docs" buttons (drive.file owned by user)
- Share-link (read-only, share-token) for all runs
- DSAR endpoints (`/api/me/data`, `/api/me/delete`)
- Status page public at `status.prometheus.app`

### KPIs
| Metric | Target |
|---|---|
| Public signups | 800 |
| Free runs completed | 1,200 |
| Paid conversions (Founder + Pro) | 70 |
| MRR | $2,500 |
| D7 retention | 22% |
| Time to second generation (median) | < 96 h |
| NPS (in-app survey) | ≥ 35 |
| Pipeline pass rate | 92% |
| Coherence avg | 0.68 |

### Team Focus
- **Backend (2):** Stripe billing, DSAR endpoints, rate limit hardening, observability dashboards (Cloud Trace + Cloud Logging)
- **Frontend (1):** in-app editors v0 (Tiptap deck only — landing block editor stubbed for M2)
- **Growth (1, new):** content (5 essays — Maya's actual journey, "we removed the 88% stat", "real cost per run"), Discord onboarding, IndieHackers AMAs
- **Legal:** review of Termly templates per jurisdiction (US-only at M1; UK/CA in M2)
- **Sales:** none — still too early

### Risks + Mitigations
| Risk | Mitigation |
|---|---|
| Public signup → bot signup wave | reCAPTCHA Enterprise on signup + email verification + Cloud Armor edge rules |
| Stripe webhook flakiness | Idempotency table on `billing_events/{event_id}`; replay tool in `scripts/` |
| Free-tier abuse (multi-account farming) | Per-IP + per-fingerprint rate limit; manual review queue at > 2σ above median |
| First public negative review | Pre-emptive blog post: "What PROMETHEUS does and does NOT do" — set expectations |

### Hiring
- **+1 Growth lead** (full-time, founder-led referral). Background: B2C content + community for a previous tools company. Comp: 0.4–0.6% equity + base.

### Cut-if-behind
- ⚠️ Cut: full landing page block editor (ship a stub: "Section editor coming M2")
- ⚠️ Cut: branching UI (data model lands in M1 backend, UI ships M3)
- 🛑 Do NOT cut: Stripe billing + DSAR (compliance-critical)

---

## M2 — Product Hunt Launch (Weeks 5–8)

### Theme
**"The launch. Earn 10K signups in 48 hours without a single fabricated stat."**

Product Hunt is the single biggest signup spike of the year. We launch on a Tuesday at 12:01 AM Pacific. Pre-launch we line up: 30 hunters, 5 makers (founders we've helped in alpha — paid testimonials are forbidden, but their stories aren't), and a maker comment thread that's actually useful (not the typical "gigantic threadsplosion of emojis"). The launch page links to Maya's real 30-day journey doc.

### Features
- **Landing page block editor** (in-app, Monaco diff for HTML, sandboxed iframe preview, "Try another hero image" Imagen swap)
- **Cmd-K palette** v0 (navigation only — actions like `regenerate market` ship M3)
- **Mobile voice** via Deepgram Nova-2 (works on iOS Safari)
- **Watched-market** flag in Founder Pro (data model + cron skeleton; UI ships M4)
- **Branded export** (PPTX/DOCX/XLSX with user's brand colors auto-applied)
- **Launch page polish:** real Maya screenshots, real coherence score, real cost telemetry charts
- **Press kit** at `prometheus.app/press` — logos, screenshots, founder bio
- Internal: load test (Locust) at 10× expected peak (~500 concurrent generations)

### KPIs
| Metric | Target |
|---|---|
| PH rank (launch day) | Top 5 |
| Launch-week signups | 9,000 |
| Launch-week activated (≥ 1 run) | 4,000 |
| Launch-week paid conversions | 320 |
| MRR (end of M2) | $12K |
| D7 retention (launch cohort) | 28% |
| NPS (launch cohort) | 42 |
| Pipeline pass rate during peak | ≥ 90% (degraded mode acceptable) |
| Cost per run (p50, peak) | ≤ $0.75 |

### Team Focus
- **Backend (2):** load test pass at 10× peak; degraded mode (Flash-only fallback if Pro quota throttled); Cloud Tasks DLQ depth alarm
- **Frontend (1 + 1 contractor):** Cmd-K + landing editor; Maya screencast embed on launch page
- **Growth (1 + founder):** Product Hunt prep, hunter outreach, IndieHackers + Hacker News + Twitter coordinated launch
- **Legal:** UK + CA jurisdictions added to Termly template fill
- **Sales:** none — still too early; founder fields inbound

### Risks + Mitigations
| Risk | Mitigation |
|---|---|
| Launch-day pipeline melts under traffic | Pre-warm Cloud Run min instances to 5; Locust dress rehearsal at 12× peak; degraded mode auto-engage at p95 > 180 s |
| Gemini quota exhausted | Multi-region failover (us-central1 → us-east4); Vertex Quota Reservation purchased for launch week |
| Negative review goes viral on HN | Pre-written response template + founder personal handle ready; ship-fix culture |
| Stripe fraud spike (bot signups + chargebacks) | 3DS required; manual review for high-risk countries; Stripe Radar tuned |

### Hiring
- **+1 Senior backend engineer** (start week 4 of M2). Focus: reliability + cost control. Comp: 0.4–0.7% equity + base.
- **+1 Frontend contractor** (1099, 12-week scope) — block editor + Cmd-K.

### Cut-if-behind
- ⚠️ Cut: branded export to corporate templates (M3 Team tier feature)
- ⚠️ Cut: branching side-by-side UI (data already exists; ship UI M3)
- 🛑 Do NOT cut: load test (a melted launch day is unrecoverable PR)

---

## M3 — Paid GA + Accelerator Outreach (Weeks 9–12)

### Theme
**"Land the first ten cohorts. Build the second-generation loop."**

Free + Founder + Founder Pro converted at M2. M3 is about (a) pushing paid retention past 12 weeks, (b) opening **accelerator/cohort outreach** (YC + Techstars + 500 Global + On Deck + Antler), (c) shipping **branching** + **cmd-K actions** + **per-agent regen with steering** — the second-generation loop.

### Features
- **Branching UI** — fork a run with a steering note ("pivot to enterprise"), side-by-side compare across all 13 agents
- **Per-agent regen with steering** — `POST /api/session/{id}/regen` with `agent=X` + `steering="X"`; downstream agents only re-run on user opt-in
- **Cmd-K actions** — `regenerate market research`, `branch to enterprise pivot`, `change company name to X`
- **Team tier** ($149/mo, 5 seats) live — admin dashboard, audit log, SSO via Google Workspace
- **Cohort tier** in private beta with 3 design partners (one accelerator, one university, one corporate innovation team)
- **Branded export** to corporate templates (Team + Cohort)
- **Investor analytics** on share-link views (open rate, slide depth, time on slide) — Founder Pro+

### KPIs
| Metric | Target |
|---|---|
| Cumulative signups | 18,000 |
| MRR (end of M3) | $24K |
| Cohort design partners signed | 3 |
| D7 retention | 30% |
| D30 retention | 19% |
| Generations / paid user / week | 3.2 |
| Time to second generation | < 72 h |
| NPS | 45 |
| Pipeline pass rate | 94% |
| Coherence avg | 0.71 |

### Team Focus
- **Backend (3):** team tier (multi-tenant queries, audit log), branching backend, regen-with-steering, accelerator outreach engineering support (custom domain whitelist for cohort orgs)
- **Frontend (2):** branching UI, Cmd-K actions, admin dashboard, branded export
- **Growth (1):** content series "Inside YC W24 — 14 portfolio companies use PROMETHEUS"; blog the cohort case studies (with permission)
- **Sales (1, new — first hire):** outbound to 60+ accelerators, 30+ university entrepreneurship programs, 10+ corporate innovation directors. ICP doc + pricing playbook authored
- **Legal:** EU jurisdictions (GDPR-compliant Privacy via iubenda)

### Risks + Mitigations
| Risk | Mitigation |
|---|---|
| Cohort sales cycle is slow (weeks → months) | Land 3 design partners with a free pilot; convert to paid at M5; cycle time becomes case study |
| Branching UX is confusing (compare view is a hard problem) | Ship Maya-tested side-by-side flow; user research session weekly |
| Audit log scope creep (compliance ask vs. simplicity) | Ship minimal v1 (who, what, when); promise "more on request" |
| Accelerators expect white-label | Ship "powered by PROMETHEUS" toggle in M3; full white-label M5 |

### Hiring
- **+1 Sales lead** (founder-network referral; first sales hire). Comp: 0.5–0.8% equity + base + cohort commission. ICP: ex-AE at a dev tools or B2B SaaS company that sold into accelerators.
- **+1 Backend engineer #2** (deferred from M2 due to budget).

### Cut-if-behind
- ⚠️ Cut: investor analytics (M4)
- ⚠️ Cut: branded export beyond logo + palette (M4)
- 🛑 Do NOT cut: accelerator outreach. Time-window matters; YC W25 timing.

---

## M4 — Watched Market + Scale Push (Weeks 13–16)

### Theme
**"PROMETHEUS becomes a verb. Founders run a weekly diff against their market."**

The watched-market dashboard is the **second-generation loop's** structural feature: a Founder Pro user runs the pipeline at week 0; we re-run market + competitive every Sunday and email a diff. This is the difference between a generator and an operating layer.

### Features
- **Watched-market dashboard** — weekly cron (`workers/retention_diff.py`), email digest via Resend ("TAM updated +1.4%; new competitor; two new sources")
- **Branching side-by-side compare** in full UI — diff every agent's output between branches
- **Investor analytics** on share-link views (PostHog events tied to `share_token` reads)
- **Mobile push notifications** via FCM ("Your watch report is in")
- **Public roadmap** at `prometheus.app/roadmap` (transparency wins community)
- **Weekly newsletter** "PROMETHEUS Wire" — top 3 ideas this week, top 3 industries, market-watch insights from anonymized data

### KPIs
| Metric | Target |
|---|---|
| Cumulative signups | 28,000 |
| MRR | $34K |
| Founder Pro / Founder ratio | 0.45 (i.e., 45% of paid are Pro) |
| Watched-market opt-in rate (Pro users) | 70% |
| Watched-market email weekly open rate | 55% |
| D30 retention | 24% |
| Generations / paid user / week | 4.1 |
| NPS | 48 |
| Pipeline pass rate | 95% |

### Team Focus
- **Backend (3):** retention_diff cron, FCM, investor analytics, market-watch UI backend (compare two snapshots structurally)
- **Frontend (2):** watched-market dashboard, branching compare view, mobile push UX, public roadmap page
- **Growth (1):** newsletter launch (target 5,000 subscribers by M4 end), SEO for "TAM template" / "pitch deck for healthcare AI" / "fundable startup ideas"
- **Sales (1):** close 6 cohort design partners (3 accelerators + 2 universities + 1 corporate); first $25K in cohort revenue
- **Legal:** APAC jurisdiction prep (DPDP India, PIPL China — research only; ship M6+)

### Risks + Mitigations
| Risk | Mitigation |
|---|---|
| Watched-market diff is noisy (too many false positives) | Diff threshold tuning per metric: TAM ±2% threshold; competitor must be top-10 SimilarWeb to count |
| Cron cost amplification (re-running for 5K Pro users weekly) | Spread cron across 7 days by user `uid % 7`; cache market by industry-cluster |
| Email deliverability drop (spam filter) | Resend reputation warm-up; SPF/DKIM/DMARC verified; one-click unsubscribe |
| Sales cycle drags into M5 | M3 design partners convert to paid in M4; M4 outreach lands in M5/M6 |

### Hiring
- **+1 Frontend engineer** (close the FE backlog).
- **+1 Sales SDR** (founder-led screening, contractor → FTE).

### Cut-if-behind
- ⚠️ Cut: investor analytics → keep it as basic share-link click count
- ⚠️ Cut: APAC research → push to Year 2
- 🛑 Do NOT cut: watched-market. This is the differentiator.

---

## M5 — Marketplace Alpha + Cohort Sales Push (Weeks 17–20)

### Theme
**"Founders meet operators. Decks, copy, deploy — done by humans, paid through PROMETHEUS."**

The marketplace is a two-sided flywheel: pre-vetted operators (deck polishers, copywriters, devs, designers, finance modellers, lawyers) bid on user briefs. PROMETHEUS takes a 20% rake. Stripe escrow holds funds; release on user approval. This is the wedge into the **Living Co-Pilot** vision.

### Features
- **Marketplace alpha** — 50 hand-vetted operators across 6 categories; bid + escrow + dispute via Stripe Connect
- **"Hire an operator" CTA** on every artifact card (deck → "polish this for $400", landing → "ship to my domain for $250")
- **Enterprise tier** v0 ($50K/yr+) — white-label, SSO via Okta/Azure AD, audit log, internal-only deploy mode (no public hosting)
- **Cohort onboarding flow** — bulk seat provisioning, cohort admin, branded portal `cohort.prometheus.app/yc-w25`
- **First Year-2 wedge:** **real LLC filing** in private alpha (Stripe Atlas API integration) for 25 hand-picked Founder Pro users

### KPIs
| Metric | Target |
|---|---|
| Cumulative signups | 38,000 |
| MRR | $40K |
| Marketplace GMV (M5) | $20K |
| Marketplace operators onboarded | 50 |
| Cohort licenses sold | 4 |
| Cohort revenue (M5) | $35K (cumulative $60K) |
| Enterprise pipeline (qualified) | 8 |
| LLC alpha filings completed | 15 |

### Team Focus
- **Backend (3):** Stripe Connect, operator onboarding, dispute API, Stripe Atlas API integration
- **Frontend (2):** operator portal, marketplace browse + bid, cohort admin
- **Growth (1):** marketplace operator recruitment (essay: "Want to make $500-$5K/job helping founders? Apply."); cohort case studies
- **Sales (2):** cohort closes; first 2 enterprise paid pilots (with Stripe Radar lookalike of M3 design partners)
- **Legal:** Stripe Connect compliance; marketplace ToS (the platform-vs-merchant distinction); operator IP assignment

### Risks + Mitigations
| Risk | Mitigation |
|---|---|
| Bad operator delivers garbage → user dispute | Hand-vetting only at alpha (not open marketplace); reviews after release; refund path mandatory |
| Stripe Connect compliance complexity | Engage Stripe Connect AM; KYB flow on operator signup; 1099 generation automated |
| Cannibalization of Founder Pro (users use marketplace instead of upgrading) | Marketplace is post-purchase; operators see the user's PROMETHEUS deck — selling Pro to non-users via marketplace landings |
| LLC alpha goes wrong (legal liability if filing fails) | Hand-pick 25 users; manual review at every step; Stripe Atlas already does the legal work; PROMETHEUS just orchestrates |

### Hiring
- **+1 Backend engineer #3** (focus: Stripe Connect, payments).
- **+1 Customer Success** (cohort onboarding + dispute first responder).

### Cut-if-behind
- ⚠️ Cut: enterprise tier UI polish (private demos OK in M5; ship UI M6)
- ⚠️ Cut: open marketplace browse (alpha = invite operators per brief)
- 🛑 Do NOT cut: cohort sales. Time-window matters.

---

## M6 — Cohort Sales Close + Year-2 Vision Tease (Weeks 21–24)

### Theme
**"Close the season. Tease the future. Earn the next round."**

M6 is the close. Cohort sales (YC W25 + 3 universities + 2 accelerators + 1 corporate) close at M6. We publish the **Year-2 vision** — Living Co-Pilot, real incorporation pipeline, multilingual rollout, EU region — to investors and a 25-page founder essay on the public blog. We close a $4–7M Series A or extend Seed to $5M.

### Features
- **Cohort onboarding** at scale (15+ live cohorts on the platform)
- **Enterprise SSO** (Okta + Azure AD) GA
- **Multilingual** prompt + UI for ES + FR + DE + JA (closed alpha — release blog M6+1)
- **Year-2 vision tease:** private demo of Living Co-Pilot (continuous market-watch + auto-suggested actions); real incorporation pipeline (Stripe Atlas + real bank account opening + Mercury); EU-region Firestore mirror live
- **Public roadmap** updated with Year 2 H1 commitments
- **Annual review** essay: "PROMETHEUS Year 1 — what we shipped, what we cut, what's next"
- Internal: pre-mortem on M6+ scale; SOC 2 Type 1 readiness assessment kicked off

### KPIs (M6 exit)
| Metric | Target |
|---|---|
| Cumulative signups | 50,000 |
| Activated users (≥ 1 run) | 22,000 |
| Paying users | 1,200 |
| MRR | $46K |
| Cohort revenue (cumulative) | $80K |
| Marketplace GMV (cumulative) | $65K (PROMETHEUS take $13K) |
| Enterprise paid pilots | 4 |
| D7 retention | 35% |
| D30 retention | 23% |
| Time to second generation | < 48 h |
| NPS | 50 |
| Coherence avg | 0.74 |
| Pipeline pass rate | 96% |
| Cost per run (p50) | $0.60 |
| Gross margin | 68% |

### Team Focus
- **Backend (3):** EU-region mirror, multilingual i18n, SOC 2 prep (audit logs, access reviews, IR runbook drills)
- **Frontend (2):** multilingual UI (ES/FR/DE/JA), cohort admin polish, enterprise admin
- **Growth (1):** Year-2 essay launch, founder bio in major outlets (TechCrunch, The Information), investor update doc
- **Sales (2 + 1 SDR):** close season; Series A diligence support
- **Legal:** SOC 2 Type 1 prep; enterprise MSAs

### Risks + Mitigations
| Risk | Mitigation |
|---|---|
| Series A doesn't close (market freeze) | Default-alive cash plan: 18-month runway at M6 burn; Founder Pro pricing test +20% if needed |
| SOC 2 prep distracts from product | Engage Vanta or Drata to automate; engineering time-box at 10% during M6 |
| Multilingual launch goes wrong (mistranslation in legal docs) | Multilingual is UI-only at M6; legal docs ship locale-specific via Termly/iubenda; alpha cohort screens output |
| Cohort partners don't renew | NPS surveys 30/60/90 on cohort users; CS owns retention; Cohort = land + expand model |

### Hiring
- **+1 Engineering manager** (rolls up the 4 engineers; founder steps out of code review path)
- **+1 SDR** (sales scale-up)
- **+1 Designer** (taste-skill custodian; reports to founder)

### Cut-if-behind
- ⚠️ Cut: multilingual public release (alpha is enough to demo; ship Year 2 H1)
- ⚠️ Cut: SOC 2 Type 1 (delay to Year 2 H1; document readiness only)
- 🛑 Do NOT cut: cohort sales close. Year ROI math depends on it.

---

## Channels Strategy (Cumulative Across M0–M6)

### M0–M1: Pull (waitlist + content)
- 3 essays: "We removed the 88% stat", "Inside the V1 audit (31 P0/P1 findings)", "What a real cost-per-run looks like"
- IndieHackers AMA (founder)
- r/startups + r/Entrepreneur AMA

### M2: Spike (Product Hunt)
- Launch Tuesday 12:01 AM PT
- Hunters: 30 (curated)
- Makers + first 5 alpha founders comment with their actual journeys
- Coordinated tweet thread + LinkedIn post + HN Show post

### M3: Outbound (accelerators)
- 60+ accelerators contacted (YC + Techstars + 500 Global + On Deck + Antler + 80% of top-50 Crunchbase accelerators)
- 30+ universities (Stanford StartX, MIT Sandbox, Berkeley Skydeck, IE, INSEAD, IIT-Madras Incubation Cell)
- 10+ corporate innovation directors (Fortune 500 inbound list via PR)
- Sales playbook: 4-touch cadence (intro email → case study Maya → demo offer → pilot pricing)

### M4: Inbound (content + SEO)
- Newsletter (PROMETHEUS Wire) → 5K subs
- SEO ranking for "TAM template", "pitch deck for healthcare AI", "fundable startup ideas in 2026"
- Substack guest posts on First Round Review, a16z, Stratechery

### M5: Marketplace flywheel
- Operator essays ("How Maria made $4,200 last month polishing decks")
- User → operator referral pricing

### M6: PR + Series A
- TechCrunch + The Information feature articles
- Founder podcast tour (Lenny's Podcast, This Week in Startups, Acquired)
- Investor update + Year-2 essay — public

---

## Hiring Plan Summary

| Month | Headcount net change | Cumulative |
|---|---|---|
| M0 | 3 (founder + 2 engineers) | 3 |
| M1 | +1 Growth | 4 |
| M2 | +1 Backend Sr. + 1 FE contractor | 5 + 1 c |
| M3 | +1 Backend, +1 Sales | 7 + 1 c |
| M4 | +1 FE, +1 SDR | 9 + 1 c |
| M5 | +1 Backend, +1 CS | 11 + 1 c |
| M6 | +1 EM, +1 SDR, +1 Designer | 14 + 1 c |

**M6 burn:** ~$210K/mo (14 FTE × $15K loaded). MRR $46K → 22% gross-revenue offset. Series A closes M6+1 to fund Year 2.

---

## Year-2 Vision (M7–M18 tease)

> **"PROMETHEUS becomes the operating layer. Generation is the on-ramp."**

### Wedge: Living Co-Pilot
- Continuous market-watch (daily, not weekly)
- Auto-suggested actions ("file LLC", "open business bank account", "hire first GTM contractor")
- Slack / Linear integration — PROMETHEUS becomes a teammate

### Wedge: Real Incorporation Pipeline
- Stripe Atlas (LLC + Delaware C-Corp) — GA after M5 alpha
- Mercury / Brex bank account opening (API)
- EIN + state registration automation
- First Stripe payment account provisioning end-to-end

### Wedge: Multilingual Rollout
- ES + FR + DE + JA + PT + Hindi (UI + agent prompts + legal templates)
- Region-specific LLM tuning (Gemini regions: us, eu, asia)
- Local accelerator partnerships (Latitud LATAM, China Accelerator, Antler SEA)

### Wedge: EU Region
- Firestore EU multi-region
- Region-pinning per `users/{uid}.region`
- DPA + GDPR Article 28 documentation
- SOC 2 Type 2 + ISO 27001 in Year 2 H2

### Year-2 KPI Targets (H2 end)
- Signups: 250K cumulative
- Paying users: 9K
- MRR: $400K
- Cohort revenue (cumulative): $1.2M
- Marketplace GMV (cumulative): $1.8M (PROMETHEUS take $360K)
- Enterprise paid: 22 contracts ($1.1M ARR)
- Living Co-Pilot DAU: 1,500

---

## Closing

> **PROMETHEUS V2 is the operating layer between an idea and a company. The 6-month roadmap is how we earn the right to be that layer. The Year-2 vision is what we become.**

Each month has a single theme and a single counter-metric we refuse to optimize against. Each ship is gated by KPI exit criteria, not calendar alone. Each hire matches a current bottleneck, not an aspirational org chart. Each risk has a written mitigation. The plan is dollar-anchored, time-anchored, and judgment-anchored.

**The orchestration is the product. The ship is the test.**

— PROMETHEUS Team
