# PROMETHEUS — Production Deployment

> **Tagline:** "Repeatable, scriptable, gated. No service-account.json, no surprises."

---

## 0. Pre-requisites

- A **Google Cloud project** (e.g. `prometheus-prod`) with billing enabled
- A **GitHub repository** (this one) with Actions enabled
- A **Firebase project** linked to the GCP project
- A **Cloudflare account** (for DNS + Workers + Pages)
- A **Stripe account** (production keys + webhook endpoint)
- A **domain** (`prometheus.app`)
- **Local tools**: `gcloud`, `firebase`, `gh`, `node 20`, `python 3.11`, `docker`, `cosign`

The whole production deploy is driven by `scripts/deploy.sh` plus three CI workflows. **Never run prod commands ad-hoc** — they are scripted because every step has an audit trail.

---

## 1. Step 0 — Environments

We run **3 environments**:

| Env | Project | Domain | Purpose |
|---|---|---|---|
| dev | `prometheus-dev` | `dev.prometheus.app` | engineering scratch |
| staging | `prometheus-staging` | `staging.prometheus.app` | pre-prod canary; runs golden regression on every CD |
| prod | `prometheus-prod` | `prometheus.app` | customer traffic |

Each env has its own:
- Firestore database (region `us-central1`; staging/prod also `eu` mirror for EU users)
- Cloud Tasks queue
- Cloud Run services (gateway + worker)
- Service accounts (`gateway-sa`, `worker-sa`, `tasks-invoker-sa`, `cron-sa`, `outbox-sa`)
- Secret Manager secrets
- Stripe keys (test in dev/staging; live in prod)

---

## 2. Step 1 — Workload Identity Federation (one-time)

We will **never** create or commit a `service-account.json`. CI authenticates to GCP via GitHub OIDC → Workload Identity Federation → impersonate `ci-deploy-sa@…`.

```bash
# Set vars
export PROJECT_ID="prometheus-prod"
export PROJECT_NUMBER="$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')"
export POOL="github-pool"
export PROVIDER="github-provider"
export REPO="ShAuRyA-Noodle/prometheus"
export CI_SA="ci-deploy-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# 1. Create the Workload Identity Pool
gcloud iam workload-identity-pools create "$POOL" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# 2. Create OIDC provider in the pool
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL" \
  --display-name="GitHub provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-condition="assertion.repository=='${REPO}'"

# 3. Create CI deploy SA
gcloud iam service-accounts create ci-deploy-sa \
  --project="$PROJECT_ID" \
  --display-name="CI Deploy"

# 4. Bind WIF subject (only main branch can deploy prod)
gcloud iam service-accounts add-iam-policy-binding "$CI_SA" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}"

# 5. Grant least-priv roles to ci-deploy-sa
for ROLE in \
    roles/run.admin \
    roles/cloudbuild.builds.editor \
    roles/iam.serviceAccountUser \
    roles/secretmanager.secretAccessor \
    roles/artifactregistry.writer \
    roles/firebase.admin \
    roles/cloudtasks.queueAdmin
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${CI_SA}" \
    --role="$ROLE"
done
```

In GitHub Actions:

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: google-github-actions/auth@v2
    with:
      workload_identity_provider: 'projects/${{ env.PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github-pool/providers/github-provider'
      service_account: 'ci-deploy-sa@${{ env.PROJECT_ID }}.iam.gserviceaccount.com'
```

**Hard rule from CLAUDE.md:** no `service-account.json` paths in Docker layers. No environment variable `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json` in any Dockerfile.

---

## 3. Step 2 — Service accounts (least-privilege)

Run once per environment:

```bash
# Gateway: read user data, enqueue Cloud Tasks
gcloud iam service-accounts create gateway-sa --project="$PROJECT_ID"
for ROLE in \
    roles/datastore.user \
    roles/cloudtasks.enqueuer \
    roles/secretmanager.secretAccessor \
    roles/aiplatform.user \
    roles/cloudtrace.agent \
    roles/logging.logWriter
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:gateway-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$ROLE"
done

# Worker: full pipeline access (Vertex, Imagen, Workspace OAuth proxy)
gcloud iam service-accounts create worker-sa --project="$PROJECT_ID"
for ROLE in \
    roles/datastore.user \
    roles/aiplatform.user \
    roles/secretmanager.secretAccessor \
    roles/cloudtrace.agent \
    roles/logging.logWriter
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:worker-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$ROLE"
done

# Tasks invoker: invoke worker on behalf of Cloud Tasks
gcloud iam service-accounts create tasks-invoker-sa --project="$PROJECT_ID"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:tasks-invoker-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

# Cron: weekly retention diff
gcloud iam service-accounts create cron-sa --project="$PROJECT_ID"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:cron-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudtasks.enqueuer"

# Outbox processor (Cloud Function)
gcloud iam service-accounts create outbox-sa --project="$PROJECT_ID"
for ROLE in \
    roles/datastore.user \
    roles/eventarc.eventReceiver \
    roles/logging.logWriter
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:outbox-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$ROLE"
done
```

---

## 4. Step 3 — Secret Manager

Every secret in `.env.example` (excluding `VITE_*` public Firebase config) becomes a Secret Manager secret. **No env files in prod.**

```bash
# Bash helper
create_secret () {
  local NAME="$1"
  local VALUE="$2"
  if ! gcloud secrets describe "$NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$NAME" --replication-policy="automatic" --project="$PROJECT_ID"
  fi
  echo -n "$VALUE" | gcloud secrets versions add "$NAME" --data-file=- --project="$PROJECT_ID"
}

# === Gemini / Vertex ===
create_secret GEMINI_API_KEY              "$(read -s -p 'GEMINI_API_KEY: ' x; echo $x)"

# === Stripe ===
create_secret STRIPE_SECRET_KEY           "$(read -s -p 'STRIPE_SECRET_KEY: ' x; echo $x)"
create_secret STRIPE_WEBHOOK_SECRET       "$(read -s -p 'STRIPE_WEBHOOK_SECRET: ' x; echo $x)"

# === External APIs ===
create_secret DEEPGRAM_API_KEY            "$(read -s -p 'DEEPGRAM_API_KEY: ' x; echo $x)"
create_secret USPTO_API_KEY               "$(read -s -p 'USPTO_API_KEY: ' x; echo $x)"
create_secret DOMAINR_API_KEY             "$(read -s -p 'DOMAINR_API_KEY: ' x; echo $x)"
create_secret CRUNCHBASE_API_KEY          "$(read -s -p 'CRUNCHBASE_API_KEY: ' x; echo $x)"
create_secret STATISTA_API_KEY            "$(read -s -p 'STATISTA_API_KEY: ' x; echo $x)"
create_secret SIMILARWEB_API_KEY          "$(read -s -p 'SIMILARWEB_API_KEY: ' x; echo $x)"
create_secret RECRAFT_API_KEY             "$(read -s -p 'RECRAFT_API_KEY: ' x; echo $x)"
create_secret CLOUDFLARE_API_TOKEN        "$(read -s -p 'CLOUDFLARE_API_TOKEN: ' x; echo $x)"
create_secret RESEND_API_KEY              "$(read -s -p 'RESEND_API_KEY: ' x; echo $x)"
create_secret TERMLY_API_KEY              "$(read -s -p 'TERMLY_API_KEY: ' x; echo $x)"
create_secret IUBENDA_API_KEY             "$(read -s -p 'IUBENDA_API_KEY: ' x; echo $x)"
create_secret SECRET_KEY                  "$(openssl rand -base64 32)"

# Grant access
for SECRET in GEMINI_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
              DEEPGRAM_API_KEY USPTO_API_KEY DOMAINR_API_KEY \
              CRUNCHBASE_API_KEY STATISTA_API_KEY SIMILARWEB_API_KEY \
              RECRAFT_API_KEY CLOUDFLARE_API_TOKEN RESEND_API_KEY \
              TERMLY_API_KEY IUBENDA_API_KEY SECRET_KEY
do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:gateway-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:worker-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

Cloud Run services mount secrets as env vars at startup:

```bash
gcloud run services update prometheus-gateway \
  --update-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest \
  --project="$PROJECT_ID" --region=us-central1
```

---

## 5. Step 4 — Cloud Tasks queue

```bash
gcloud tasks queues create prometheus-pipeline \
  --location=us-central1 \
  --project="$PROJECT_ID" \
  --max-attempts=5 \
  --min-backoff=10s \
  --max-backoff=60s \
  --max-doublings=4 \
  --max-concurrent-dispatches=200 \
  --max-dispatches-per-second=50

# DLQ via Pub/Sub on permanent failure
gcloud pubsub topics create prometheus-pipeline-dlq --project="$PROJECT_ID"
```

---

## 6. Step 5 — Artifact Registry + image build

```bash
# One-time: create repo
gcloud artifacts repositories create containers \
  --repository-format=docker \
  --location=us-central1 \
  --project="$PROJECT_ID"

# Authenticate
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build (CI does this; reproduce locally for testing)
export SHA="$(git rev-parse --short HEAD)"
docker build -f backend/Dockerfile -t us-central1-docker.pkg.dev/${PROJECT_ID}/containers/gateway:${SHA} backend
docker push us-central1-docker.pkg.dev/${PROJECT_ID}/containers/gateway:${SHA}

docker build -f backend/Dockerfile.worker -t us-central1-docker.pkg.dev/${PROJECT_ID}/containers/worker:${SHA} backend
docker push us-central1-docker.pkg.dev/${PROJECT_ID}/containers/worker:${SHA}

# Sigstore-sign images
cosign sign --key cosign.key us-central1-docker.pkg.dev/${PROJECT_ID}/containers/gateway:${SHA}
cosign sign --key cosign.key us-central1-docker.pkg.dev/${PROJECT_ID}/containers/worker:${SHA}
```

CI uses `cosign sign --key gcpkms://...` (KMS-backed key, no key file).

---

## 7. Step 6 — Cloud Run deploys

### 7.1 Gateway

```bash
gcloud run deploy prometheus-gateway \
  --project="$PROJECT_ID" \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/${PROJECT_ID}/containers/gateway:${SHA} \
  --service-account=gateway-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --min-instances=1 \
  --max-instances=20 \
  --concurrency=80 \
  --memory=1Gi \
  --cpu=2 \
  --timeout=300 \
  --ingress=internal-and-cloud-load-balancing \
  --no-allow-unauthenticated \
  --set-env-vars="ENV=prod,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_REGION=us-central1,FIRESTORE_DATABASE=(default),CLOUD_TASKS_QUEUE=prometheus-pipeline,CLOUD_TASKS_LOCATION=us-central1,CLOUD_TASKS_INVOKER_SA=tasks-invoker-sa@${PROJECT_ID}.iam.gserviceaccount.com,LOG_LEVEL=INFO" \
  --update-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest,SECRET_KEY=SECRET_KEY:latest" \
  --execution-environment=gen2 \
  --cpu-boost
```

### 7.2 Worker

```bash
gcloud run deploy prometheus-worker \
  --project="$PROJECT_ID" \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/${PROJECT_ID}/containers/worker:${SHA} \
  --service-account=worker-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --min-instances=0 \
  --max-instances=50 \
  --concurrency=4 \
  --memory=4Gi \
  --cpu=4 \
  --no-cpu-throttling \
  --timeout=900 \
  --ingress=internal \
  --no-allow-unauthenticated \
  --set-env-vars="ENV=prod,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},LOG_LEVEL=INFO,MAX_COST_USD_PER_SESSION=2.50" \
  --update-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,DEEPGRAM_API_KEY=DEEPGRAM_API_KEY:latest,USPTO_API_KEY=USPTO_API_KEY:latest,DOMAINR_API_KEY=DOMAINR_API_KEY:latest,CRUNCHBASE_API_KEY=CRUNCHBASE_API_KEY:latest,STATISTA_API_KEY=STATISTA_API_KEY:latest,SIMILARWEB_API_KEY=SIMILARWEB_API_KEY:latest,RECRAFT_API_KEY=RECRAFT_API_KEY:latest,CLOUDFLARE_API_TOKEN=CLOUDFLARE_API_TOKEN:latest,RESEND_API_KEY=RESEND_API_KEY:latest,TERMLY_API_KEY=TERMLY_API_KEY:latest,IUBENDA_API_KEY=IUBENDA_API_KEY:latest" \
  --execution-environment=gen2

# Allow tasks-invoker-sa to invoke worker
gcloud run services add-iam-policy-binding prometheus-worker \
  --project="$PROJECT_ID" \
  --region=us-central1 \
  --member="serviceAccount:tasks-invoker-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

`--no-cpu-throttling` keeps the worker hot during Wave 2 / Wave 3 — async parallel agents need CPU between Gemini calls.

### 7.3 Why these flags

| Flag | Reason |
|---|---|
| `--ingress=internal-and-cloud-load-balancing` (gateway) | Public traffic only via Cloud Armor LB; no direct Cloud Run URL leak |
| `--ingress=internal --no-allow-unauthenticated` (worker) | Worker reachable only from Cloud Tasks (OIDC) |
| `--min-instances=1` (gateway) | Eliminate cold start on /generate |
| `--no-cpu-throttling` (worker) | CPU stays available between Gemini awaits |
| `--concurrency=4` (worker) | One pipeline per CPU; isolates noisy neighbors |
| `--timeout=900` (worker) | Longest p99 pipeline + 5× safety |
| `--cpu-boost` (gateway) | Faster cold-start on the rare scaling event |

---

## 8. Step 7 — Cloud Armor

```bash
# Create policy
gcloud compute security-policies create prometheus-armor \
  --project="$PROJECT_ID" \
  --type=CLOUD_ARMOR

# OWASP CRS
gcloud compute security-policies rules create 1000 \
  --security-policy=prometheus-armor \
  --expression="evaluatePreconfiguredExpr('xss-v33-stable')" \
  --action=deny-403

gcloud compute security-policies rules create 1010 \
  --security-policy=prometheus-armor \
  --expression="evaluatePreconfiguredExpr('sqli-v33-stable')" \
  --action=deny-403

# Per-IP rate limit on /api/generate
gcloud compute security-policies rules create 2000 \
  --security-policy=prometheus-armor \
  --expression="request.path.matches('/api/generate.*')" \
  --action=rate-based-ban \
  --rate-limit-threshold-count=60 \
  --rate-limit-threshold-interval-sec=60 \
  --ban-duration-sec=600 \
  --conform-action=allow \
  --exceed-action=deny-429 \
  --enforce-on-key=IP

# Attach policy via load balancer (assumes LB created separately)
gcloud compute backend-services update prometheus-gateway-backend \
  --security-policy=prometheus-armor \
  --global
```

Full rules: `infrastructure/cloud-armor-rules.yaml` (`gcloud compute security-policies import` from YAML in CD).

---

## 9. Step 8 — Firestore + Firebase

```bash
# Apply security rules
firebase deploy --only firestore:rules --project="$PROJECT_ID"

# Apply indexes
firebase deploy --only firestore:indexes --project="$PROJECT_ID"

# TTL on idea_text (Firestore-managed)
gcloud firestore fields ttls update idea_text_expires_at \
  --collection-group=runs --project="$PROJECT_ID"

# TTL on stream events
gcloud firestore fields ttls update event_expires_at \
  --collection-group=events --project="$PROJECT_ID"

# TTL on idempotency keys
gcloud firestore fields ttls update key_expires_at \
  --collection-group=idempotency_keys --project="$PROJECT_ID"

# EU mirror (multi-region)
# Done at project setup; Firestore database created with location=eu for region=eu users
```

---

## 10. Step 9 — Frontend deploy (Firebase Hosting)

```bash
cd frontend
npm ci
npm run build  # Vite builds to dist/

firebase deploy --only hosting --project="$PROJECT_ID"

# Custom domain attached separately:
# firebase hosting:sites:create prometheus-app
# Map domain in Firebase Console; verify; SSL auto-provisioned
```

---

## 11. Step 10 — Cloud Scheduler (weekly retention diff)

```bash
gcloud scheduler jobs create http prometheus-retention-cron \
  --project="$PROJECT_ID" \
  --location=us-central1 \
  --schedule="0 6 * * 0" \
  --time-zone="UTC" \
  --uri="https://prometheus-worker-XXXXXX.run.app/internal/cron/retention" \
  --http-method=POST \
  --oidc-service-account-email=cron-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --oidc-token-audience="https://prometheus-worker-XXXXXX.run.app" \
  --attempt-deadline=540s
```

Exact YAML in `infrastructure/cloud-scheduler.yaml`.

---

## 12. Step 11 — Budget alert + kill-switch

```bash
# 1. Create budget
gcloud billing budgets create \
  --billing-account=BILLING_ID \
  --display-name="prometheus-prod-monthly" \
  --budget-amount=5000USD \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.8 \
  --threshold-rule=percent=1.0 \
  --notifications-rule-pubsub-topic=projects/${PROJECT_ID}/topics/budget-alerts \
  --filter-projects=${PROJECT_ID}

# 2. Pub/Sub topic
gcloud pubsub topics create budget-alerts --project="$PROJECT_ID"

# 3. Cloud Function kill-switch (deploy from cloud_functions/budget_killswitch/)
gcloud functions deploy budget-killswitch \
  --gen2 \
  --runtime=python311 \
  --trigger-topic=budget-alerts \
  --service-account=outbox-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --entry-point=on_budget_alert \
  --source=cloud_functions/budget_killswitch \
  --region=us-central1 \
  --project="$PROJECT_ID"
```

The function reads the alert payload; at 100% threshold it sets Firestore flag `system/global.kill_switch=true`. Cost-budget middleware short-circuits all generations while flag is set.

---

## 13. Step 12 — Observability

### 13.1 SLO dashboards

```bash
# Imported from infrastructure/dashboards/*.json via gcloud monitoring dashboards create
gcloud monitoring dashboards create --config-from-file=infrastructure/dashboards/pipeline.json
gcloud monitoring dashboards create --config-from-file=infrastructure/dashboards/agent.json
gcloud monitoring dashboards create --config-from-file=infrastructure/dashboards/business.json
gcloud monitoring dashboards create --config-from-file=infrastructure/dashboards/reliability.json
```

### 13.2 Alerts

| Alert | Condition | Action |
|---|---|---|
| Pipeline p95 > 180s | rolling 30-min window | Page on-call |
| Pipeline pass rate < 90% | rolling 30-min window | Page on-call |
| 5xx rate > 2% | rolling 5-min | Page on-call |
| Cost per session p95 > $1.50 | rolling 1-h | Page on-call |
| Cloud Tasks DLQ depth > 0 | sustained 5-min | Page on-call |
| Budget alert 80% | once | Notify finance |
| Budget alert 100% | once | Page on-call + auto kill-switch |

`gcloud alpha monitoring policies create` from `infrastructure/alerts/*.yaml`.

---

## 14. Step 13 — Smoke + canary

After deploy, CI runs smoke tests:

```bash
# Smoke: gateway health
curl -fsS https://prometheus.app/healthz

# Smoke: gateway readyz (auth + Firestore + Cloud Tasks)
curl -fsS https://prometheus.app/readyz

# Smoke: golden idea round-trip (uses test JWT issued by deploy script)
SCRIPT_DIR="$(dirname "$0")"
$SCRIPT_DIR/smoke-golden.sh
```

Canary traffic split:

```bash
gcloud run services update-traffic prometheus-gateway \
  --to-revisions=NEW_REV=10,PREV_REV=90 \
  --region=us-central1 \
  --project="$PROJECT_ID"
# observe 30 min
gcloud run services update-traffic prometheus-gateway \
  --to-revisions=NEW_REV=50,PREV_REV=50 \
  --region=us-central1 --project="$PROJECT_ID"
# observe 30 min
gcloud run services update-traffic prometheus-gateway \
  --to-revisions=NEW_REV=100 \
  --region=us-central1 --project="$PROJECT_ID"
```

---

## 15. Step 14 — Rollback

If smoke fails or canary degrades:

```bash
# Get previous revision
PREV=$(gcloud run revisions list --service=prometheus-gateway --region=us-central1 \
  --format="value(metadata.name)" --limit=2 | tail -n1)

# Snap traffic back
gcloud run services update-traffic prometheus-gateway \
  --to-revisions=${PREV}=100 \
  --region=us-central1 --project="$PROJECT_ID"

# Same for worker
gcloud run services update-traffic prometheus-worker \
  --to-revisions=$(gcloud run revisions list --service=prometheus-worker --region=us-central1 --format="value(metadata.name)" --limit=2 | tail -n1)=100 \
  --region=us-central1 --project="$PROJECT_ID"
```

A rollback NEVER reverts Firestore data — it only reverts the running code. If a migration was destructive, Firestore PITR (35d) is the recovery path.

---

## 16. CI/CD entry points

| Workflow | Trigger | Purpose |
|---|---|---|
| `.github/workflows/ci.yml` | PR + push | Lint, typecheck, test, audit |
| `.github/workflows/cd.yml` | push to `main` | Deploy staging → smoke → manual prod approval |
| `.github/workflows/security-scan.yml` | daily 03:00 UTC | pip-audit, npm audit, semgrep, trivy, gitleaks |
| `.github/workflows/golden-regression.yml` | nightly 04:00 UTC | 50 golden through mocked pipeline |
| `.github/workflows/security-regression.yml` | nightly | security tests + abuse + chaos |
| `.github/workflows/load-test.yml` | weekly Sunday | Locust against staging; baseline diff |
| `.github/workflows/quality-benchmark.yml` | weekly | Judge service score regression |
| `.github/workflows/codeql.yml` | weekly | CodeQL static analysis |

Each is documented inline in its YAML.

---

## 17. Pre-deploy checklist

Before running `scripts/deploy.sh prod`, all must pass:

- [ ] `git status` clean on branch `main`
- [ ] CI green on the commit
- [ ] All P0/P1 audit findings closed (CI gate enforces)
- [ ] Golden regression (50 ideas) green
- [ ] No newly-introduced dependencies without `pip-audit` / `npm audit` clean
- [ ] `mypy --strict` clean on `backend/agents/`, `backend/services/`, `backend/models/`
- [ ] Secret Manager versions current (no rotation flags)
- [ ] Firestore rules version increment matches PR
- [ ] Cloud Armor rules version increment matches PR
- [ ] PR description includes a `## Rollout` section if this changes the topology
- [ ] Stripe webhook test event passing in staging

---

## 18. Closing

> **PROMETHEUS V2 deploys are scripted, gated, observable, rollback-able. There is no `service-account.json`, no manual `gcloud` ad-hoc, no untested prod first. The deploy is the test.**

If you find a step missing or a flag inconsistent with the running system, file an issue (`bug.md` template) and PR the diff. The `cd.yml` workflow is the source of truth for ordering — this doc is the human-readable companion.
