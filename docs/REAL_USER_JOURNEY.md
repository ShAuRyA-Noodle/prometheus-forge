# PROMETHEUS — Real User Journey (30 days × 3 personas)

> **Tagline:** "What happens, day-by-day, screen-by-screen, email-by-email, when a real founder uses PROMETHEUS."

---

## 0. Why this document

A roadmap describes what we *ship*. This describes what users *experience*. We track three personas across 30 days each:

- **Maya** (28, solo operator) — pet wearables, US east coast, $29 Founder
- **Daniel** (41, accelerator director) — runs a B2B accelerator, $25K cohort license
- **Priya** (34, intrapreneur) — director of innovation at a Fortune 1000 retail company, $149/mo Team

Each section gives:
- The **screen state** at each interaction
- The **email/notification** received
- The **decision** the user made
- The **PROMETHEUS surface** that made it possible

If a surface is missing or broken in the journey, it's a P1 in our backlog.

---

## 1. Maya — solo operator, day 0 to day 30

### Day 0 — Tuesday, 7:42 AM (Brooklyn-bound F train)

Maya scrolls Instagram on her morning commute. An ad: *"Whisper your idea. See PROMETHEUS think."* The image is a real screenshot — ink-and-accent, no AI clichés. She taps. Lands on `prometheus.app`.

**Screen state.** Single hero. Mic button. One line of copy: *"You whisper a startup idea. 90 seconds later you have a coherent company — built on real data, owned by you, ready to operate."* Below: *"No fabricated stats. No service-account-owned files. No regen loops you don't control."*

**Decision.** She taps the mic. Browser asks for microphone permission. She allows.

She speaks: *"AI-native vital monitor for senior dogs — collar with ECG, alerts the vet before kidney failure shows up in bloodwork."*

**Surface.** `frontend/src/components/VoiceInput.tsx` → Deepgram Nova-2 WebSocket → 1.2 s transcription → text appears in input box.

She edits: corrects "ECG" capitalization. Hits *Generate*.

### T+15 s — Articulation

The page transitions to a generation view. A box at top:

> *"I read this as: an AI-native pet wearable focused on early disease detection in senior dogs, US-first, B2C with vet-integration. Should I focus on US-only or include Canada from day 1?"*

Two big buttons: **"US first"** **"US + Canada"**.

**Decision.** She picks "US first."

**Surface.** `frontend/src/components/ArticulationStep.tsx`. Articulation Agent (Flash, 2.5s) ran.

### T+25 s — Pipeline starts

The right panel ("Reasoning") starts streaming:
```
[02:14] market_research
  ▸ searching: TAM electric pet wearables North America
  ▸ 4 sources found (Statista, Crunchbase, Grand View, Mordor)
  ▸ extracting Yamaha 10K (no — pet wearables segment)
  ▸ derivation: SAM = TAM × addressable (online) × 18% conversion intent
[02:36] ✓ market_research

[02:14] brand_identity
  ▸ parsing personality_hints: gentle, premium, vet-trusted
  ▸ Imagen prompt: "wearable for senior golden retriever, soft kitchen light, ..."
  ▸ checking USPTO: "Pulsefield" → 1 conflict (class 41, generic)
  ▸ swap to alternative: "Rotunda"
  ▸ Domainr: rotunda.vet $11/yr available
[02:23] ✓ brand_identity
```

**Surface.** `frontend/src/components/ReasoningSidebar/` + `useSSEReasoning.ts` hook. Server-Sent Events from Firestore subcollection `runs/{rid}/events`.

### T+58 s — Brand card drops

Center canvas: a card with the name **Rotunda**, a 5-color palette, type pairing (Cabinet Grotesk + Geist), tagline ("*Quiet vigilance for the dogs we've grown old with.*"), Imagen-generated logo concept (a sanitized SVG inside an iframe sandbox).

Maya clicks the palette swatches. **Brand Refiner** opens. She drags the accent slider 5° warmer. WCAG AA contrast indicator stays green. She accepts.

**Surface.** `frontend/src/components/BrandRefiner/` + `lib/purify.ts` (DOMPurify on the SVG before render).

### T+74 s — Market card drops

TAM = $14.2 B (cited Statista 2024 + Grand View Research). SAM = $2.1 B (derived from US+CA pet wearable spend). Citation chips on every number — hover tooltip shows *publisher, source_url, year*. Maya hovers; the citation looks real.

**Surface.** `frontend/src/components/MarketResearchView.tsx` + `MicroWidgets/CitationChip.tsx`.

### T+86 s — Wave 2 starts

The financial card appears with a 3-year projection. Maya drags the **ARPU slider** from $19 → $29; the Recharts chart re-renders in 80 ms — **no Gemini call**. She drags **monthly churn** from 4% → 6%; cash trajectory shifts.

**Surface.** `frontend/src/components/FinancialModel/` + `useFinanceSlider.ts` → `services/finance_engine.py` (deterministic Python, server-side).

### T+108 s — Landing card drops

Sandboxed iframe shows a landing page preview. Hero image: a senior golden retriever in a softly-lit kitchen wearing the collar. On-brand. Maya toggles mobile preview (375px). Looks fine.

She clicks **"Try another hero"**. Imagen runs again with a slightly varied prompt. Three options. She picks #2.

**Surface.** `frontend/src/components/Sandbox/` (iframe with `sandbox="allow-forms"` + CSP injected) + Imagen API.

### T+138 s — Pipeline complete

Coherence score: **0.78**. Pitch deck card opens in a side drawer (Tiptap editor). 12 slides. Maya scrolls through. Slide 5 (Financial Model): the speaker notes reference *"$2.1B SAM (Grand View Research, 2024)"* — a real number from the market card.

Maya screenshots slide 1 and texts her angel-investor cousin.

### T+5 days

Cousin replies: *"Looks legit. Coffee Tuesday?"*

Maya returns to PROMETHEUS. Hits **Upgrade**. Stripe Checkout → $29 Founder. Welcome email arrives (Resend).

**Email subject.** *"Welcome to Founder. Your seat saves the next idea."*

Maya generates 3 more ideas across the week — one for each pivot her cousin suggested. She likes the third the most.

### T+8 days

Cousin meeting. Cousin commits **$10K** in principle. Maya goes home, opens the third idea ("white-label collar to vets directly"), clicks **"Deploy to my domain"**.

Stripe Checkout for $36 (registrar markup). 3DS challenge clears. PROMETHEUS schedules the Cloudflare Registrar API call (24h delay buffer).

### T+9 days

Email: *"Your domain `rotunda-vet.com` is purchased and live."* Cloudflare Pages URL. Maya logs in, sees the deployed landing.

**Surface.** `backend/api/deploy.py` → Cloudflare Workers + Pages.

### T+14 days

Maya creates a **branch**: *"what if we white-label to vets directly"*. Branch run produces a different financial model, GTM, and pitch deck. She compares side-by-side using the diff viewer.

The white-label branch shows a 32-month payback vs. the B2C version's 19 months. Maya stays B2C.

**Surface.** `frontend/src/components/BranchingView.tsx`.

### T+30 days

Watched-market dashboard emails Maya the weekly digest:

**Email subject.** *"PROMETHEUS Wire — your Rotunda watch is in"*

> *"This week: TAM updated to $14.4B (+1.4%, Statista refresh). New competitor: Whistle Health launched a heart-monitor add-on for their existing collar. Two new sources cite pet ECG market. Your strategic position: still defensible — Whistle's product is generic-purpose; you're senior-dog-specific. Updated competitive analysis attached."*

Maya opens the dashboard, sees the diff. Highlights what changed week-over-week. She forwards the email to her cousin.

**Surface.** `backend/workers/retention_diff.py` + `frontend/src/components/MarketWatch.tsx`.

### Day 30 retrospective (what we did right / wrong)

**Right:**
- Voice-first input on mobile worked flawlessly
- USPTO swap was invisible — Maya never saw "Pulsefield"
- Coherence 0.78 was high enough to instil trust ("the deck cites the market numbers; the financials reflect the model")
- Branding refiner closed the "this looks generic" objection
- Watched-market kept her engaged at week 4 (when most generators get abandoned)

**Wrong (P1 backlog):**
- Articulation question (US-only vs. US+CA) felt rushed — needs a "tell me more" option
- The financial slider doesn't update the deck slides until you re-export — should propagate
- Watched-market email arrived at 3 AM her time; needs locale-aware delivery time

---

## 2. Daniel — accelerator director, day 0 to day 30

### Day 0 — Wednesday, 2:14 PM (his office, San Francisco)

Daniel reads our outbound email (Sales SDR sent it last week). He clicks the case study link. Lands on the Maya story (the same essay above, anonymized). Reads it twice.

He emails our sales lead: *"Can we do a pilot for our W26 cohort? 8 startups."*

### Day 2 — Discovery call

Sales lead does a 30-min discovery. Daniel's pain: *"Day 1 of cohort is 90% spent fixing decks that founders dragged in from ChatGPT + Canva. We waste a week."*

We propose: **Cohort license**, $5K for the W26 batch, 50 generations, branded portal at `cohort.prometheus.app/yourbatch-w26`, admin dashboard.

Daniel agrees in principle.

### Day 4 — Contract + onboarding

Daniel signs MSA + DPA (we're vendor-of-record under their umbrella). PROMETHEUS provisions:
- 8 cohort seats (one per startup)
- Branded portal with the accelerator logo
- Admin dashboard (Daniel sees: generations/seat, coherence avg, gate-fail rate)
- Resend tag for the cohort emails

### Day 7 — Cohort kickoff

8 startups arrive at the cohort venue Monday morning. Daniel introduces PROMETHEUS at 10 AM. Each founder logs in via Google SSO. Each runs their idea through the pipeline by lunch.

By 6 PM, **8 of 8 startups have a coherent baseline package**. Daniel emails his Slack: *"This is the cleanest Day 1 we've had in 14 batches."*

### Day 10 — Daniel's first dashboard view

Daniel opens the admin dashboard. 8 founders, 22 generations total, coherence avg 0.71. One startup has 0 generations — Daniel checks in (turns out: founder slept through onboarding, fixed within an hour).

**Surface.** `frontend/src/pages/AdminDashboardPage.tsx` (Team / Cohort tier).

### Day 14 — Halfway-through pulse

Daniel's batch is running through customer discovery. Two startups have already pivoted. The branching feature lets each pivot maintain a comparison view of "where we started" vs. "where we are."

Daniel tells our CS rep: *"This is making my job 30% easier. I want to renew + expand to W27."*

### Day 21 — Renewal conversation

CS calls Daniel. *"Want to extend your cohort license through W27 + W28? We can lock in $4500/cohort if you commit to 4 cohorts of next year."*

Daniel: *"Send me the contract."*

### Day 30 — Cohort wrap

Demo Day for W26. 6 of 8 startups present using PROMETHEUS-generated decks (they've polished them in the in-app deck editor). Daniel shows the cohort coherence avg (0.74 final) on his closing slide.

We email Daniel a "cohort report" — generations per founder, NPS, time-to-first-customer (he tracked it).

**Email subject.** *"Your W26 cohort report — 6 of 8 used PROMETHEUS at Demo Day."*

### Day 30 retrospective

**Right:**
- Branded portal made him look good to his investors
- Admin dashboard gave him in-cohort visibility
- The pivot/branching feature aligned with how accelerators think (iteration, not one-shot)

**Wrong (P1 backlog):**
- He wants per-founder LTV/CAC tracking — we're not there yet (M5 feature)
- He wants the "report card" emailed automatically at cohort end — we generate it manually (P0 fix M3 W4)

---

## 3. Priya — corporate intrapreneur, day 0 to day 30

### Day 0 — Friday, 4:50 PM (her office, Cincinnati)

Priya's CEO emails: *"What if we entered the secondhand market? Want a pitch by next Friday."*

Priya knows she has 5 working days. She's heard about PROMETHEUS from a peer.

She visits `prometheus.app`. Reads the Team-tier page. Clicks **"Talk to Sales"**.

### Day 0 +20 min — Self-serve detour

While waiting for sales callback, she signs up free (Whisper tier). Whispers the idea: *"Resale platform under our existing brand for premium home goods, focusing on certified-restored pieces with a 1-year warranty."*

Articulation agent asks: *"Marketplace or direct? Buy + resell, or commission-only?"* Priya picks "Buy + resell."

Pipeline runs. Whisper gets her Wave 1 only (no deck/landing/legal). She sees Brand, Market, Competitive, Risk, Tech cards.

### Day 0 +5 min later — Sales callback

CS lead calls. Priya: *"I want to upgrade. What's enterprise?"*

We pitch: **Team tier** ($149/mo, 5 seats) for now; enterprise pilot ($50K/yr) if she wants SSO + audit log + internal-only deploy.

Priya picks Team for week 1; we offer to roll into enterprise pilot if it lands.

### Day 1 — Generation #2 (full pipeline)

Priya logs in with her corporate Google account (drive.file scope). She re-runs the pipeline at Founder Pro level (Team tier seat). Full pipeline runs. Coherence 0.76.

Pitch deck appears. She opens it in Tiptap editor; she rearranges slides 4-7 (her CEO prefers competitive-before-financial). Speaker notes still reference the financial numbers — she edits them lightly.

### Day 2 — Branded export

She exports the deck to PowerPoint with corporate template applied (logo, palette, font). 12 slides, brand-consistent.

**Surface.** `frontend/src/components/DeckEditor/` + `backend/services/slides_service.py` + corporate template overlay (Team/Cohort feature).

### Day 4 — Internal review

Priya presents the deck to her boss + VP Strategy. They like it. Boss says: *"Run the financial model again with a 3% commission scenario."*

Priya goes back to the financial slider. Sets fee_model = "commission", fee = 3%, new tab. Re-runs the engine in 80 ms. Cash trajectory updates. She exports a fresh sheet to Google Sheets (drive.file).

### Day 5 — CEO presentation

Priya presents the deck. CEO: *"How fast can we pilot?"* She has the GTM 90-day plan ready. Plus a tech architecture diagram.

CEO greenlights a $250K pilot.

### Day 10 — Enterprise pilot conversation

CS calls Priya: *"You used 38 generations in 10 days. Want SSO + audit log + internal-only mode for a $50K/yr enterprise pilot?"* She talks to procurement.

### Day 18 — Procurement signs MSA

We close the enterprise pilot. SSO via Okta. Audit log live. Internal-only deploy mode (her landing pages don't publish to public URLs).

### Day 30 — First quarterly business review

We present to Priya + 4 of her colleagues. Aggregate stats: 6 ideas evaluated, 1 funded, 2 paused, 3 pivoted. Coherence avg 0.74. Time-saved estimated at 180 hours (she counted with stopwatch on the first idea: 6 hrs vs. ~40 hrs DIY).

**Email subject.** *"Your PROMETHEUS QBR — 6 ideas, 1 funded, 180 hrs saved."*

### Day 30 retrospective

**Right:**
- Speed-to-pitch (1 week, not 4) directly addressed her pain
- Branded export to her corporate template made her look polished to CEO
- SSO + audit log were unblockers for procurement
- Time-saved metric is the QBR talking-point her boss cared about

**Wrong (P1 backlog):**
- "Internal-only mode" — landing pages still saved a Cloudflare URL even when not published. Need to be able to skip the deploy entirely (M4 fix)
- She wants OKR-tagging on each idea (which corporate OKR does this serve?). M5+ feature
- She wants a "delete this entire generation" button for sensitive ideas. We have it; she didn't find it. P1 UX fix

---

## 4. Cross-persona patterns

| Pattern | Maya | Daniel | Priya |
|---|---|---|---|
| First-run completes < 2 min | ✓ | ✓ (per founder) | ✓ |
| Brand-ed pitch deck delivered | ✓ | ✓ × 8 | ✓ |
| Time-to-second-generation | 4 d (after meeting) | 1 d | hours |
| Decision driven by output | angel meeting | cohort kickoff | CEO presentation |
| Renewal / expansion driver | watched-market diff | branding + admin | SSO + audit |
| Top P1 unblocker | finance → deck propagation | auto cohort report | per-OKR tagging |

---

## 5. Closing

> **Each persona's 30-day journey shows what PROMETHEUS does at the surface level — and exposes the next 30 days of backlog. We do not ship surfaces that don't appear in a real journey. We do not deprioritize fixes we found in real journeys.**

The journey is the spec. Update this doc whenever a persona-style audit finds a gap; the gap becomes a P1.
