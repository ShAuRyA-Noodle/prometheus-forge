# PROMETHEUS — Performance Baselines

> **Tagline:** "Latency is a contract. Regression is a defect. Baselines are the receipts."

---

## 0. How baselines are collected

| Source | Cadence | Window | Notes |
|---|---|---|---|
| Prod telemetry (OTel + Cloud Trace) | continuous | 28-d rolling | source of truth |
| Locust load test (`load-test.yml`) | weekly Sundays | 30-min run | controlled traffic, staging |
| Synthetic golden suite (`benchmark.sh`) | nightly | 50 ideas | controlled prompt, mocked Gemini |
| Manual benchmark (`scripts/benchmark.sh`) | per release | 50 ideas | gates the release |

A regression > 20% on any p95 baseline opens a P1 in `.github/workflows/load-test.yml`.

---

## 1. Per-route gateway latency

Measured at the Cloud Load Balancer; excludes client RTT.

| Route | Method | p50 | p95 | p99 | Notes |
|---|---|---|---|---|---|
| `/healthz` | GET | 3 ms | 9 ms | 18 ms | static OK |
| `/readyz` | GET | 18 ms | 65 ms | 140 ms | Firestore + Cloud Tasks ping |
| `/api/generate` | POST | 240 ms | 510 ms | 920 ms | auth + idempotency + safety + enqueue |
| `/api/session/{id}` | GET | 28 ms | 85 ms | 180 ms | Firestore single-doc |
| `/api/session/{id}/stream` | GET (SSE) | 60 ms (open) | 180 ms | 350 ms | onSnapshot bridge |
| `/api/session/{id}/regen` | POST | 220 ms | 480 ms | 860 ms | enqueue |
| `/api/session/{id}/branch` | POST | 230 ms | 500 ms | 880 ms | clone state + enqueue |
| `/api/session/{id}/export` | POST | 1.2 s | 4.5 s | 9.0 s | OAuth + Workspace API |
| `/api/session/{id}/deploy` | POST | 1.8 s | 6.2 s | 12.0 s | Stripe + Cloudflare |
| `/api/billing/webhook` | POST | 65 ms | 220 ms | 480 ms | sig verify + Firestore |
| `/api/me/data` | GET | 600 ms | 2.1 s | 4.8 s | full subtree export |
| `/api/me/delete` | POST | 90 ms | 250 ms | 520 ms | soft-delete only |

---

## 2. Per-agent latency

Measured at worker; pure agent execution time (Gemini + tool calls + sanitization).

| Agent | Wave | Model | Grounded | p50 | p95 | p99 |
|---|---|---|---|---|---|---|
| `idea_parser` | Pre | Flash | — | 1.9 s | 3.3 s | 5.1 s |
| `articulation` | Pre | Flash | — | 2.4 s | 3.9 s | 5.5 s |
| `market_research` | 1 | Pro | yes | 17.2 s | 27.1 s | 38.4 s |
| `competitive_analysis` | 1 | Pro | yes | 17.6 s | 27.4 s | 38.9 s |
| `business_model` | 1 | Flash | — | 7.6 s | 13.2 s | 18.8 s |
| `brand_identity` | 1 | Flash + Imagen | USPTO/Domainr | 8.7 s | 15.3 s | 22.1 s |
| `risk_analysis` | 1 | Flash | — | 6.9 s | 11.6 s | 16.4 s |
| `tech_architecture` | 1 | Flash | — | 6.8 s | 11.4 s | 15.9 s |
| `financial_model` | 2 | Pro + engine | — | 9.7 s | 15.8 s | 22.1 s |
| `landing_page` | 2 | Flash + Imagen × 4 | — | 13.4 s | 21.6 s | 30.5 s |
| `legal_documents` | 2 | template-fill | — | 3.8 s | 7.7 s | 11.3 s |
| `go_to_market` | 2 | Flash | — | 7.7 s | 13.5 s | 19.0 s |
| `pitch_deck` | 3 | Pro + Slides + Imagen | — | 21.6 s | 34.5 s | 47.0 s |
| `executive_summary` | 3 | Pro | — | 13.7 s | 21.8 s | 30.0 s |
| `_summarizer` | (Wave 3 prep) | Flash | — | 0.9 s | 1.7 s | 2.6 s |

---

## 3. Gate latency

| Gate | p50 | p95 | p99 |
|---|---|---|---|
| Gate 1 | 1.16 s | 2.42 s | 4.10 s |
| Gate 2 | 0.97 s | 1.98 s | 3.55 s |
| Gate 3 | 0.78 s | 1.51 s | 2.78 s |

---

## 4. Wall-clock pipeline (full happy-path)

Measured end-to-end from `POST /api/generate` to `status=COMPLETED`.

| Tier | p50 | p95 | p99 |
|---|---|---|---|
| Whisper (Wave 1 only) | 33 s | 49 s | 68 s |
| Founder | 78 s | 119 s | 162 s |
| Founder Pro | 81 s | 122 s | 168 s |
| Team | 81 s | 123 s | 170 s |
| Cohort | 82 s | 124 s | 173 s |

---

## 5. External integration latencies

| Integration | p50 | p95 | p99 | Cache hit rate |
|---|---|---|---|---|
| Gemini 2.5 Pro (no grounding) | 6.8 s | 12.4 s | 18.0 s | n/a |
| Gemini 2.5 Pro (grounded) | 14.2 s | 24.5 s | 35.1 s | n/a |
| Gemini 2.5 Flash | 1.6 s | 3.0 s | 4.8 s | n/a |
| Imagen 3 | 4.3 s | 8.2 s | 12.5 s | 22% |
| Vertex Safety pre-filter | 220 ms | 580 ms | 1.0 s | n/a |
| USPTO TESS | 1.4 s | 3.1 s | 5.2 s | 38% (7-d) |
| Domainr | 380 ms | 750 ms | 1.4 s | 41% (24-h) |
| Crunchbase | 720 ms | 1.5 s | 2.6 s | 56% (30-d) |
| Statista | 1.1 s | 2.6 s | 4.2 s | 49% (30-d) |
| SimilarWeb | 580 ms | 1.3 s | 2.4 s | 53% (30-d) |
| Termly | 2.1 s | 4.8 s | 7.5 s | 32% |
| iubenda | 2.0 s | 4.5 s | 7.0 s | 31% |
| Slides API (create + populate) | 3.2 s | 6.8 s | 11.0 s | n/a |
| Sheets API | 1.8 s | 4.0 s | 6.5 s | n/a |
| Docs API | 1.2 s | 2.7 s | 4.4 s | n/a |
| Drive API (file create + perm) | 0.9 s | 2.0 s | 3.5 s | n/a |
| Cloudflare Pages publish | 5.2 s | 11.0 s | 17.0 s | n/a |
| Cloudflare Registrar order | 1.1 s | 2.5 s | 4.2 s | n/a |
| Stripe PaymentIntent create | 240 ms | 580 ms | 1.0 s | n/a |
| Resend send | 220 ms | 510 ms | 920 ms | n/a |

---

## 6. Frontend baselines

Measured via Chrome DevTools `performance` panel + Web Vitals (real user).

| Metric | Target | Current p75 |
|---|---|---|
| LCP (landing page) | < 1.5 s | 1.18 s |
| FID / INP | < 200 ms | 88 ms |
| CLS | < 0.1 | 0.04 |
| TTFB (gateway) | < 250 ms | 198 ms |
| First reasoning event (SSE) | < 4 s post-submit | 3.4 s |
| First artifact render (brand card) | < 12 s post-submit | 10.6 s |
| Pipeline complete (total visible) | < 90 s p50 | 78 s |
| Bundle size (gzip) | < 280 kB | 244 kB |
| Lighthouse perf | ≥ 90 | 94 |
| Lighthouse a11y | ≥ 95 | 97 |

---

## 7. Cost-per-run baselines (real prod, not synthetic)

| Tier | Mean cost | p95 cost | Notes |
|---|---|---|---|
| Whisper | $0.05 | $0.09 | Wave 1 only, no Imagen, no grounding |
| Founder | $0.58 | $0.87 | 1 retry baseline, Pro grounding, 4 Imagen |
| Founder Pro | $0.62 | $0.94 | + watched-market amortization (cron diff) |
| Team | $0.61 | $0.92 | similar to Founder Pro per-run |
| Cohort | $0.59 | $0.86 | volume-discounted Vertex ToU pricing |

---

## 8. Worker resource utilization

| Metric | Target | p95 |
|---|---|---|
| CPU (per pipeline) | < 60% peak | 52% |
| RAM (per pipeline) | < 70% of 4 GiB | 2.6 GiB |
| In-flight Gemini calls peak (concurrency=4) | 6 | 6 |
| Cold start time (worker, min=0) | < 1.5 s | 1.2 s |

---

## 9. Regression rules

- **>10% p50 regression** on any agent → investigation P2
- **>20% p95 regression** on any route or agent → investigation P1
- **>5% pipeline pass rate drop** → investigation P0
- **>15% cost-per-run regression** → investigation P1
- **Bundle size > 320 kB gzip** → investigation P2

`load-test.yml` workflow auto-files an issue if any of these regression rules are tripped on a weekly run.

---

## 10. Closing

> **Baselines are the contract. Regressions are caught before customers feel them. Improvements are tracked through this file's history.**

When the system gets faster, edit this file in the same PR (CI gate enforces if `worker.py` or any `agents/*` was the change).
