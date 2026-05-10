# PROMETHEUS — Operations Runbook

> **Tagline:** "Read this when something is on fire. Rehearse it when nothing is."

---

## 0. Severity classification

| Sev | Definition | Time-to-page | Status page |
|---|---|---|---|
| **SEV1** | Active customer impact + data exposure or revenue at risk | 5 min | "Major outage" within 15 min |
| **SEV2** | Partial customer impact (gateway degraded > 50%, DLQ depth > 100) | 15 min | "Degraded performance" |
| **SEV3** | No customer impact, internal pain (dashboard outage, dev-only env) | next business day | optional |

**On-call rotation**: PagerDuty — primary + secondary, weekly handoff Friday 9 AM PT. Escalation path → IC → Eng leadership → Founder.

---

## 1. Incident roles

| Role | Owns |
|---|---|
| **Incident Commander (IC)** | overall coordination; declares SEV; calls in roles; updates execs |
| **Tech Lead** | mitigation + investigation |
| **Comms Lead** | status page + external customer comms; never the IC |
| **Scribe** | timeline + decisions log (Slack-bot autocapture as fallback) |

Single rule: the IC does not also do the technical work. They drive.

---

## 2. Standard playbooks

Each playbook below has the same shape: **Symptoms → Detection → Mitigation → Rollback → Post-incident**.

---

### Playbook A — Pipeline outage (gateway / worker / Gemini)

**Symptoms**:
- `/api/generate` returns 5xx
- SSE streams disconnect; no events arriving
- Error rate dashboard spike
- Customer reports in support channel

**Detection**:
- Cloud Monitoring alert: `5xx_rate > 2%` or `pipeline_pass_rate < 90%` (rolling 5-min)
- PagerDuty pages the on-call

**Mitigation (run in this order)**:

```bash
# 1. Quick triage — look at error log
gcloud logging read 'severity>=ERROR' --limit=50 \
  --project=prometheus-prod --freshness=5m

# 2. Check Cloud Run revisions
gcloud run revisions list --service=prometheus-gateway \
  --region=us-central1 --project=prometheus-prod
gcloud run revisions list --service=prometheus-worker \
  --region=us-central1 --project=prometheus-prod

# 3. Check Cloud Tasks queue depth
gcloud tasks queues describe prometheus-pipeline \
  --location=us-central1 --project=prometheus-prod

# 4. Check Gemini quota
gcloud ai models list --region=us-central1 --project=prometheus-prod
# (or hit https://console.cloud.google.com/vertex-ai/quotas)
```

If the cause is the **latest deploy**:

```bash
# Rollback gateway to previous revision (atomic)
PREV=$(gcloud run revisions list --service=prometheus-gateway \
  --region=us-central1 --format="value(metadata.name)" --limit=2 | tail -n1)
gcloud run services update-traffic prometheus-gateway \
  --to-revisions=${PREV}=100 \
  --region=us-central1 --project=prometheus-prod

# Same for worker
```

If the cause is **Gemini quota** (see Playbook D).

If the cause is **Cloud Tasks DLQ accumulating**:

```bash
# Check DLQ depth via Pub/Sub subscription
gcloud pubsub subscriptions describe prometheus-pipeline-dlq-sub \
  --project=prometheus-prod
```

If accumulating, halt new generations:

```bash
gcloud tasks queues pause prometheus-pipeline \
  --location=us-central1 --project=prometheus-prod
# Investigate; resume only after fix
gcloud tasks queues resume prometheus-pipeline \
  --location=us-central1 --project=prometheus-prod
```

**Replay DLQ** (after fix):

```bash
./scripts/replay-dlq.sh prometheus-pipeline-dlq
```

**Rollback**: traffic-split rollback (above) is enough for code regressions. For data-corruption issues use Firestore PITR (35-d window).

**Post-incident**:
- Status page update: "Resolved" + bullet summary
- Post-mortem within 5 business days for SEV1
- Linked remediation issue in tracker

---

### Playbook B — Cost spike (per-uid abuse / global)

**Symptoms**:
- Per-uid 24h cost > 99th-percentile baseline
- Global daily cost > forecast +30%
- Budget alert at 80% threshold (Pub/Sub message)

**Detection**:
- Cloud Monitoring alert: `cost_per_session_usd p95 > $1.50` or `cost_per_uid_24h > $50`
- Pub/Sub budget alert at 80%

**Mitigation — per-uid abuse**:

```bash
# 1. Identify the top abusers
gcloud logging read 'jsonPayload.cost_usd_total > 5' --limit=20 \
  --project=prometheus-prod --freshness=1h --format="value(jsonPayload.user_uid,jsonPayload.cost_usd_total)"

# 2. Manually flag for review
# Set Firestore: users/{uid}.flagged_for_review=true
# Then re-run anomaly detector; cost-budget middleware short-circuits all generations for flagged users

# 3. Email user (CS lead does this) — confirm legit usage or refund + ban
```

**Mitigation — global cost spike (e.g., misconfigured prompt sending 10× tokens)**:

```bash
# Set global kill-switch
gcloud firestore documents update system/global \
  --update="kill_switch=true" \
  --project=prometheus-prod

# Investigate the cause:
# - Look at top agents by cost: agent_cost_usd_total{agent} dashboard
# - Check recent prompt deploy
# - Roll back if a prompt change caused it
```

After fix:

```bash
gcloud firestore documents update system/global \
  --update="kill_switch=false" \
  --project=prometheus-prod
```

**Rollback**: prompt rollback (rollback the relevant `prompts/*.txt` and re-deploy) is faster than waiting for cost to drop.

**Post-incident**: tighten anomaly thresholds; re-run cost regression on golden ideas.

---

### Playbook C — Gemini quota exhaustion

**Symptoms**:
- 429 from Vertex AI / Gemini API
- Pipeline pass rate drops
- Customer reports "stuck on Wave 1"

**Detection**:
- Cloud Monitoring: `gemini_429_total` rate > 10/min
- Manual check: https://console.cloud.google.com/vertex-ai/quotas

**Mitigation**:

1. **Switch to multi-region failover**. Set env var on worker (Secret Manager + Cloud Run service update):
   ```bash
   gcloud run services update prometheus-worker \
     --update-env-vars="GEMINI_FAILOVER_REGION=us-east4" \
     --region=us-central1 --project=prometheus-prod
   ```
2. **Engage degraded mode** — Flash-only fallback. Set Firestore `system/global.degraded_mode=true`. Pipeline marks all Pro-grounded agents as Flash; user banner shows "running in degraded mode".
3. **Engage Vertex Quota Reservation** if regional capacity is constrained (request via Google Account Manager).

**Rollback**: turn off degraded mode after confirming quota normalcy (run 5 golden ideas successfully).

**Post-incident**: review Vertex Quota Reservation usage; consider larger pre-purchase for next quarter.

---

### Playbook D — Stripe webhook failure

**Symptoms**:
- Stripe Dashboard: webhook deliveries failing
- Customer reports "subscription not active after upgrade"
- Cloud Monitoring: `stripe_webhook_5xx_total` > 1% rolling 1h

**Detection**:
- Cloud Monitoring alert
- Stripe Dashboard alert

**Mitigation**:

1. **Check signature**:
   ```bash
   gcloud logging read 'logName="projects/prometheus-prod/logs/run.googleapis.com%2Fstdout" AND jsonPayload.event="stripe_webhook" AND severity>=ERROR' --limit=50 --project=prometheus-prod
   ```
2. **Verify Stripe webhook secret** matches Secret Manager:
   ```bash
   gcloud secrets versions access latest --secret=STRIPE_WEBHOOK_SECRET --project=prometheus-prod
   ```
   Compare with Stripe Dashboard endpoint config.
3. **Replay failed events** from Stripe Dashboard → Webhooks → choose endpoint → Events → click failed → Resend.
4. **For mass replay**: run `scripts/replay-stripe-events.sh --since=1h`.

**Rollback**: if a code change broke webhook handling, roll back gateway revision.

**Post-incident**:
- Reconcile `users/{uid}.plan_tier` against Stripe customer records (run `scripts/reconcile-billing.sh`).
- Refund customers whose subscriptions were not activated.
- Add a regression test for the case that broke.

---

### Playbook E — Workspace API rate limit

**Symptoms**:
- Slides/Docs/Sheets exports failing with 429
- Customer reports "deck didn't generate"

**Detection**:
- `external_api_latency_seconds{api="slides"}` p95 > 5s sustained
- 429 rate alert

**Mitigation**:

1. **Per-user pacing** — already enforced via exp backoff. Confirm worker logs show backoff engaging.
2. **Fall back to local export** — set Firestore `system/global.workspace_local_export=true`. Pipeline emits PPTX/DOCX/XLSX in-process (slower, but no Workspace API).
3. **Request quota increase** — Google Workspace API quota request via the Console (24-48h SLA).

**Rollback**: turn off local export mode after Workspace 429 rate normalizes.

---

### Playbook F — Content moderation false positive flood

**Symptoms**:
- Many users reporting "my idea was blocked"
- `safety_block_total` rate spike

**Detection**:
- Cloud Monitoring: `safety_block_total > 5/min` for 10+ min

**Mitigation**:

1. **Inspect category distribution**:
   ```bash
   gcloud logging read 'jsonPayload.event="safety_block"' \
     --limit=100 --freshness=1h --project=prometheus-prod
   ```
2. **If a single category is dominating** (e.g., "violence" blocking legitimate fitness/sports ideas):
   - Tune Vertex Safety thresholds via `backend/services/vertex_safety.py`
   - Deploy patch
3. **Manually review** flagged sessions; if false positive, mark `safety_override=true` and re-run.

**Rollback**: revert Vertex Safety threshold change.

**Post-incident**: add the category + idea pattern to the golden regression suite.

---

### Playbook G — GDPR DSAR processing

**Trigger**: user submits DSAR via `POST /api/me/data` or `POST /api/me/delete`, OR via email (forwarded to `privacy@prometheus.app`).

**SLA**: 30 days from receipt (GDPR Article 15/17).

**Procedure** for **data export**:

1. User authenticates and calls `GET /api/me/data` → JSON export downloads.
2. If user can't authenticate (account compromised): manual override.
   ```bash
   # Verify identity via secondary channel (email + photo ID for high-risk requests)
   # Then run the export tool:
   ./scripts/export-user-data.sh --uid <UID> --output <path>
   ```
3. Encrypt the export with user-provided public key (or zip with password sent separately).
4. Email the user the encrypted bundle.

**Procedure** for **deletion**:

1. User calls `POST /api/me/delete` → soft-delete sets `users/{uid}.deletion_requested_at`.
2. Nightly cron `workers/gdpr_purge.py` does the hard delete:
   - Firestore `users/{uid}/*` (cascading delete via batched writes)
   - Stripe customer (`stripe.Customer.delete`)
   - Workspace files (where OAuth token still valid; explicit detach to user-owned drive)
   - PostHog: anonymize events (PostHog Personal Data API)
3. Audit log entry retained (regulatory requirement) — `audit_log/{event_id}` shows the request was processed; no user content retained.

**Verification**: re-issue DSAR after 30 days; confirm "user not found" response.

---

### Playbook H — Prod hotfix

For SEV1/SEV2 fixes that must ship faster than the standard CD cycle.

```bash
# 1. Branch from main
git checkout -b fix/sev1-<short-name>

# 2. Apply the minimum patch + add a regression test
# 3. Run local fast tests
./scripts/test.sh fast

# 4. Push + open PR with [HOTFIX] in title
git push -u origin fix/sev1-<short-name>
gh pr create --title "[HOTFIX] fix: <summary>" --body "$(cat <<'EOF'
## SEV
SEV1

## Summary
- Symptom: ...
- Root cause: ...
- Fix: ...
- Regression test: ...

## Verification
- [ ] Local test passes
- [ ] Smoke against staging passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# 5. Two reviewers required for hotfix; CI must pass
# 6. Merge → CD auto-deploys to staging → smoke → manual approval → prod
# 7. Post-incident review within 5 business days
```

**Never skip CI on hotfix.** A broken hotfix is worse than the original incident.

---

### Playbook I — Imagen NSFW post-filter triggered

**Symptoms**:
- User reports inappropriate hero image
- `imagen_nsfw_total` spike

**Detection**:
- Cloud Monitoring alert
- Customer support ticket

**Mitigation**:

1. **Check the offending prompt** + output via session logs.
2. **If a single prompt pattern is repeatedly triggering**: tune `imagen_service.py` prepend ("tasteful, non-explicit, no real-person likenesses").
3. **Fallback**: pipeline auto-falls-back to gradient hero when post-filter rejects. Verify behavior via integration test.

**Post-incident**: extend the prompt-engineering golden suite with the offending patterns.

---

### Playbook J — Firestore quota / write contention

**Symptoms**:
- 429 from Firestore
- Generations stuck mid-pipeline ("write failed" in worker logs)

**Detection**:
- `firestore_429_total` rate alert

**Mitigation**:

1. **Check write hotspots**:
   ```bash
   gcloud logging read 'protoPayload.serviceName="firestore.googleapis.com" AND severity>=ERROR' \
     --limit=50 --project=prometheus-prod
   ```
2. **Common causes**:
   - Single-document hotspot (e.g., a counter): refactor to sharded counter
   - Composite-index missing: add via `firestore.indexes.json`
3. **Quick fix**: increase Firestore quota request via Console.

**Rollback**: if a recent code change increased write volume disproportionately, roll back.

---

## 3. Drills

We rehearse playbooks quarterly:
- **Q1**: A (pipeline outage) + D (Stripe webhook) — game-day
- **Q2**: B (cost spike) + F (moderation false positive)
- **Q3**: C (Gemini quota) + E (Workspace 429) + I (Imagen NSFW)
- **Q4**: G (GDPR DSAR) + J (Firestore contention) — compliance audit

Drills are blameless. Findings → backlog issues. Each drill produces a **delta** in this runbook (what we learned + what playbook update we made).

---

## 4. Communication templates

### 4.1 Status page — initial

> **Investigating** — We're investigating reports of slow / failed generations. We'll update every 15 minutes.

### 4.2 Status page — identified

> **Identified** — We've identified the issue (e.g., upstream Gemini API quota). Mitigation in progress; ETA 30 minutes.

### 4.3 Status page — monitoring

> **Monitoring** — Mitigation deployed. We're monitoring for recurrence.

### 4.4 Status page — resolved

> **Resolved** — Issue resolved. Brief summary: <what happened, what we did, no customer data was affected (or what was affected)>. Post-mortem will be published within 5 business days.

### 4.5 Customer email — apology + (if applicable) refund

> Subject: An issue affecting your PROMETHEUS run yesterday
>
> Hi <name>,
>
> Yesterday between 14:00 and 14:35 UTC, we had a service incident that affected runs you started during that window. Specifically: <impact>.
>
> What we did: <action>.
>
> What we'll do differently: <fix in flight>.
>
> Your account has been credited <X generations / refund>. We're sorry for the disruption.
>
> — PROMETHEUS Team

---

## 5. On-call survival kit

Before your shift, verify access to:
- [ ] Google Cloud Console (prod project)
- [ ] PagerDuty mobile app
- [ ] Slack `#incident` channel
- [ ] Status page admin (Statuspage.io / hosted)
- [ ] Stripe Dashboard (Owner-level read access)
- [ ] Cloudflare Dashboard
- [ ] Firebase Console (admin role on prod project)

**During an incident**, your job is to:
1. Acknowledge the page within 5 min
2. Declare SEV
3. Open `#incident-<short-name>` Slack channel; tag IC + roles
4. Update status page within 15 min
5. Mitigate, then resolve
6. File post-mortem doc within 5 business days

You will not be remembered for the speed of investigation. You will be remembered for the speed of communication.

---

## 6. Closing

> **An incident is a chance to improve the system. The runbook is the institutional memory of every previous improvement. Read it. Rehearse it. Update it.**
