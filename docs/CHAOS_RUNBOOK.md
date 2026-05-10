# PROMETHEUS — Chaos Runbook

> **Tagline:** "Manual chaos drills. Each one ends with a passing recovery checklist."

---

## 0. Why this runbook exists

We test that the system survives failures we cannot or will not inject in production. Chaos drills are quarterly (see `docs/RUNBOOK.md` §3). Each drill has:

- **Setup** — what we engineer to prove the failure
- **Expected behavior** — what the system should do
- **Recovery checklist** — what we confirm before declaring the drill green

If a drill exposes an unexpected behavior, we file a P1 issue + add a regression test in `backend/tests/chaos/`.

All drills run against **staging** unless explicitly approved for prod by the on-call IC + Eng lead.

---

## 1. Drill A — Gemini quota exhaustion

### Setup

Use Vertex AI Quota Console to set a temporary low quota (e.g. 1 request/minute) on staging project. Or mock at the worker via env flag `CHAOS_GEMINI_429_PROBABILITY=0.95`.

### Expected behavior

1. Worker observes 429 from Vertex API
2. After 2 retries (exp backoff), worker fails the agent
3. Gate logic flags wave as PARTIAL
4. Pipeline emits `degraded_mode_engaged=true` event
5. Frontend shows degraded banner: "Running in Flash-only mode due to upstream capacity"
6. Subsequent runs use Flash for all Pro-grounded agents (degraded mode set in `system/global`)
7. After quota normalizes, Cloud Monitoring alert clears; manual `degraded_mode=false` flip resumes Pro usage

### Recovery checklist

- [ ] No data loss in Firestore (sessions persist with PARTIAL status)
- [ ] User can re-run from session UI (idempotency-key-aware)
- [ ] Banner clears within 1 minute of degraded_mode flip
- [ ] Cost telemetry shows degraded-mode runs at ~$0.10 (Flash-only floor)
- [ ] No `safety_block_total` spurious firings

---

## 2. Drill B — Cloud Tasks DLQ accumulation

### Setup

Trigger a transient bug in worker (e.g., set env var `CHAOS_FAIL_AGENT=market_research` causing 500). Submit 100 generations.

### Expected behavior

1. Cloud Tasks retries up to 5 attempts each
2. After 5 failures, task lands in DLQ topic
3. DLQ depth alarm fires at depth > 10
4. On-call investigates; reverts the bug
5. `scripts/replay-dlq.sh` re-runs all DLQ messages
6. All sessions complete successfully on replay

### Recovery checklist

- [ ] DLQ depth returned to 0 after replay
- [ ] No double-completion (idempotency holds; replay is no-op for already-completed sessions)
- [ ] Customer email "Your run is ready" sent exactly once per session
- [ ] Cost not double-counted (cost telemetry per-session)

---

## 3. Drill C — Firestore quota / write contention

### Setup

Run a synthetic load test (Locust at 5× peak) against staging.

### Expected behavior

1. Worker observes 429 from Firestore
2. Exponential backoff (max 5 retries)
3. Eventual write succeeds
4. If write contention persists > 30s, alert fires
5. Look for hotspots in logs (single-doc counter contention)

### Recovery checklist

- [ ] No silent data loss
- [ ] Backoff metric `firestore_429_backoff_total` shows expected behavior
- [ ] Hotspot identified (if any) and refactor planned
- [ ] Sharded counter migration plan if hotspot recurs

---

## 4. Drill D — Workspace API rate limit

### Setup

Set chaos flag `CHAOS_WORKSPACE_429_PROBABILITY=0.5` on worker.

### Expected behavior

1. Slides/Docs/Sheets API returns 429
2. Worker per-user pacing kicks in
3. After 3 retries, worker falls back to local export (PPTX/DOCX/XLSX served as binary download)
4. User receives Workspace OR local export — never empty

### Recovery checklist

- [ ] All sessions complete; no PARTIAL due to Workspace 429
- [ ] Fallback path produces valid PPTX/DOCX/XLSX (parsable by Office)
- [ ] User notified of fallback ("Workspace export delayed; download attached instead")
- [ ] Worker retries do not cascade to other users

---

## 5. Drill E — Stripe webhook replay flood

### Setup

Use Stripe CLI to send 1000 duplicate `invoice.payment_succeeded` webhooks for a single customer.

### Expected behavior

1. Each webhook signature-verified
2. First write to `billing_events/{stripe_event_id}` succeeds
3. Subsequent writes fail with conditional-create error
4. Webhook handler returns 200 immediately on dup
5. User state not double-mutated

### Recovery checklist

- [ ] User's `plan_tier` change is exactly once
- [ ] No double-credit on quota counter
- [ ] Stripe dashboard shows 1000 deliveries with 200 status
- [ ] Webhook latency p95 < 500ms even under flood

---

## 6. Drill F — Imagen NSFW post-filter cascade

### Setup

Inject prompts into Imagen calls that we know trigger Vertex Safety post-filter (without producing actual NSFW; use safety category test patterns).

### Expected behavior

1. Imagen returns SAFETY-flagged response
2. Worker rejects, logs `imagen_nsfw_total++`
3. Falls back to gradient hero
4. Pipeline completes; landing/deck still produced (with gradient instead of Imagen)
5. User unaware (gradient is on-brand by palette)

### Recovery checklist

- [ ] No NSFW image ever rendered to user
- [ ] Gradient fallback uses correct brand palette (visual diff regression test)
- [ ] Cost telemetry attributes failed Imagen call to safety, not retry

---

## 7. Drill G — Cost amplification attack

### Setup

Authenticate a synthetic user; submit 50 idea_text variants designed to maximize token usage (max-length, complex topic).

### Expected behavior

1. Each session enters cost-budget middleware
2. Per-uid 24h cost cap engages (free tier $0; Founder $9; Pro $26)
3. Subsequent generations rejected with 429 + `Retry-After`
4. Anomaly detector flags uid for manual review
5. Cost telemetry shows expected per-agent cost; no agent leaks

### Recovery checklist

- [ ] Total cost from this user ≤ tier cap × number of sessions before flag
- [ ] Budget kill-switch did not engage (per-user cap hit first)
- [ ] No 5xx spike during attack
- [ ] Manual-review queue contains the flagged uid

---

## 8. Drill H — Catastrophic Gateway pod failure

### Setup

Use Cloud Run revision rollout that intentionally crashes on startup. Then immediately roll back.

### Expected behavior

1. New revision crashes; healthcheck fails
2. Cloud Run keeps prior revision serving traffic (canary aborted)
3. Alert fires
4. CD pipeline auto-rollback (or manual intervention) restores prior revision
5. No customer impact

### Recovery checklist

- [ ] No 5xx during the bad rollout (canary safety held)
- [ ] CD logs show automatic rollback or manual intervention path
- [ ] Post-mortem documents: what triggered it, why canary saved us, what to add to release-validation

---

## 9. Drill I — GDPR DSAR processing

### Setup

Seed a test account with full data (run pipeline 5 times, deploy a domain, escrow a marketplace job). Submit `POST /api/me/delete` for that user.

### Expected behavior

1. Soft-delete sets `users/{uid}.deletion_requested_at`
2. Nightly cron `gdpr_purge.py` runs
3. All Firestore subcollections under `users/{uid}/*` deleted
4. Stripe customer deleted
5. Workspace files detached (where token still valid)
6. PostHog events anonymized
7. Audit log entry retained (regulatory)

### Recovery checklist

- [ ] User cannot log back in after purge
- [ ] No residue in Firestore (sample 10 collections)
- [ ] Stripe customer 404 on retrieval
- [ ] Audit-log entry exists with `event="gdpr_purge"` + uid hash
- [ ] Total elapsed time ≤ 24h from request to verified deletion

---

## 10. Drill J — Multi-region failover

### Setup

Simulate us-central1 region outage by setting `CHAOS_BLOCK_REGION=us-central1` on Vertex client.

### Expected behavior

1. Worker observes region-level 5xx from Vertex
2. Failover to us-east4 region engaged
3. Cost telemetry attributes calls to us-east4
4. Pipeline completes (with potentially +5s latency due to cross-region)
5. Cloud Monitoring records the failover event

### Recovery checklist

- [ ] All sessions complete; no PARTIAL due to region outage
- [ ] Latency p95 within +20% of baseline (acceptable degradation)
- [ ] Failover logged; can be manually restored to us-central1 when chaos cleared

---

## 11. Quarterly drill schedule

| Quarter | Drills |
|---|---|
| **Q1** | A (Gemini quota), E (Stripe replay) |
| **Q2** | B (Cloud Tasks DLQ), F (Imagen NSFW) |
| **Q3** | C (Firestore contention), D (Workspace 429) |
| **Q4** | G (cost amplification), I (GDPR DSAR), J (multi-region) |

Each drill takes 60–120 minutes. Conducted on a Friday morning, staging only, with all engineering on standby.

---

## 12. Closing

> **Chaos drills are how we earn the right to claim resilience. The runbook is the rehearsal. The drill is the test. The recovery checklist is the receipt.**
