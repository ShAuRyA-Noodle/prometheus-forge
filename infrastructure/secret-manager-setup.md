# PROMETHEUS V2 — Secret Manager Setup

> **Tagline:** "Service accounts may pass through. Secrets do not."

Every secret PROMETHEUS depends on lives in Google Secret Manager — never in
Docker layers, never in `.env` files in production, never in source control.
Cloud Run reads them at boot via `valueFrom.secretKeyRef`. Local dev reads
them via `gcloud secrets versions access` (proxied by `scripts/setup.sh`).

This file is the canonical inventory. Run the block at the bottom to bootstrap.

---

## 1. Inventory

| Secret name              | Origin                       | Rotation | Used by         | Notes |
|--------------------------|------------------------------|----------|-----------------|-------|
| `GEMINI_API_KEY`         | aistudio.google.com / Vertex | 30 days  | gateway, worker | Pro+Flash both |
| `SECRET_KEY`             | `openssl rand -base64 32`    | 90 days  | gateway         | Used for HMAC of session cookies |
| `STRIPE_SECRET_KEY`      | Stripe dashboard             | 90 days  | gateway         | `sk_live_...` only in prod |
| `STRIPE_WEBHOOK_SECRET`  | Stripe dashboard             | on rotate| gateway         | `whsec_...` |
| `STRIPE_PRICE_FOUNDER`   | Stripe dashboard             | static   | gateway         | Price ID, not secret per se but kept here for parity |
| `STRIPE_PRICE_FOUNDER_PRO` | Stripe dashboard           | static   | gateway         | |
| `STRIPE_PRICE_TEAM`      | Stripe dashboard             | static   | gateway         | |
| `DEEPGRAM_API_KEY`       | console.deepgram.com         | 30 days  | worker          | Voice transcription |
| `USPTO_API_KEY`          | developer.uspto.gov          | 90 days  | worker          | Trademark search |
| `DOMAINR_API_KEY`        | rapidapi.com / domainr       | 90 days  | worker          | Domain availability |
| `CRUNCHBASE_API_KEY`     | data.crunchbase.com          | 90 days  | worker          | Competitor funding |
| `STATISTA_API_KEY`       | statista.com (enterprise)    | 90 days  | worker          | TAM/SAM data |
| `SIMILARWEB_API_KEY`     | similarweb.com               | 90 days  | worker          | Web traffic |
| `RECRAFT_API_KEY`        | recraft.ai                   | 90 days  | worker          | Logo SVG generation fallback |
| `RESEND_API_KEY`         | resend.com                   | 90 days  | gateway, worker | Transactional email |
| `SENDGRID_API_KEY`       | sendgrid.com                 | 90 days  | worker          | Cohort digest fallback |
| `FCM_SERVER_KEY`         | Firebase console             | 180 days | gateway         | Push notifications |
| `CLOUDFLARE_API_TOKEN`   | dash.cloudflare.com          | 90 days  | worker          | Subdomain provisioning |
| `CLOUDFLARE_ACCOUNT_ID`  | dash.cloudflare.com          | static   | worker          | Account scoping |
| `CLOUDFLARE_ZONE_ID`     | dash.cloudflare.com          | static   | worker          | Zone scoping |
| `NAMECHEAP_API_USER`     | namecheap.com                | 90 days  | worker          | Domain purchase |
| `NAMECHEAP_API_KEY`      | namecheap.com                | 90 days  | worker          | Domain purchase |
| `CLOUD_TASKS_WORKER_URL` | Cloud Run worker URL         | on deploy| gateway         | Stored as secret because it embeds project ID |
| `COSIGN_PASSWORD`        | KMS key passphrase           | 365 days | Cloud Build     | Image signing |
| `SNYK_TOKEN`             | snyk.io                      | 90 days  | Cloud Build     | Dep scan |
| `SLACK_OPS_WEBHOOK`      | api.slack.com                | 365 days | Cloud Function  | Hard-cap alerts |
| `POSTHOG_PROJECT_KEY`    | posthog.com                  | 90 days  | gateway, fe     | Analytics |
| `TERMLY_API_KEY`         | termly.io                    | 90 days  | worker          | Legal template-fill |

---

## 2. Bootstrap script (run once per env)

```bash
#!/usr/bin/env bash
# scripts/bootstrap-secrets.sh
# Idempotent. Re-running is safe — `secrets create` returns 409 we ignore.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-prometheus-prod}"
REGION="${REGION:-us-central1}"

SECRETS=(
  GEMINI_API_KEY
  SECRET_KEY
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_FOUNDER
  STRIPE_PRICE_FOUNDER_PRO
  STRIPE_PRICE_TEAM
  DEEPGRAM_API_KEY
  USPTO_API_KEY
  DOMAINR_API_KEY
  CRUNCHBASE_API_KEY
  STATISTA_API_KEY
  SIMILARWEB_API_KEY
  RECRAFT_API_KEY
  RESEND_API_KEY
  SENDGRID_API_KEY
  FCM_SERVER_KEY
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_ZONE_ID
  NAMECHEAP_API_USER
  NAMECHEAP_API_KEY
  CLOUD_TASKS_WORKER_URL
  COSIGN_PASSWORD
  SNYK_TOKEN
  SLACK_OPS_WEBHOOK
  POSTHOG_PROJECT_KEY
  TERMLY_API_KEY
)

echo "Creating ${#SECRETS[@]} secrets in $PROJECT_ID..."

for s in "${SECRETS[@]}"; do
  if gcloud secrets describe "$s" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "  - $s exists, skipping create"
  else
    gcloud secrets create "$s" \
      --project="$PROJECT_ID" \
      --replication-policy="user-managed" \
      --locations="$REGION" \
      --labels="app=prometheus,managed_by=terraform_or_setup_script"
    echo "  + $s created (no version yet — add via 'gcloud secrets versions add')"
  fi
done
```

---

## 3. Adding a new secret version

```bash
# from a file
echo -n "sk_live_xxx" | gcloud secrets versions add GEMINI_API_KEY \
  --project=prometheus-prod --data-file=-

# verify
gcloud secrets versions access latest --secret=GEMINI_API_KEY --project=prometheus-prod
```

---

## 4. Granting access to service accounts

```bash
# Gateway needs read on a subset
for s in GEMINI_API_KEY SECRET_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
         CLOUD_TASKS_WORKER_URL RESEND_API_KEY POSTHOG_PROJECT_KEY \
         STRIPE_PRICE_FOUNDER STRIPE_PRICE_FOUNDER_PRO STRIPE_PRICE_TEAM; do
  gcloud secrets add-iam-policy-binding "$s" \
    --project=prometheus-prod \
    --member="serviceAccount:gateway-sa@prometheus-prod.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done

# Worker needs read on the data-API set
for s in GEMINI_API_KEY DEEPGRAM_API_KEY USPTO_API_KEY DOMAINR_API_KEY \
         CRUNCHBASE_API_KEY STATISTA_API_KEY SIMILARWEB_API_KEY \
         RECRAFT_API_KEY RESEND_API_KEY SENDGRID_API_KEY \
         CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ZONE_ID \
         NAMECHEAP_API_USER NAMECHEAP_API_KEY TERMLY_API_KEY; do
  gcloud secrets add-iam-policy-binding "$s" \
    --project=prometheus-prod \
    --member="serviceAccount:worker-sa@prometheus-prod.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## 5. Rotation policy

- **Monthly** for high-value LLM keys (`GEMINI_API_KEY`).
- **Quarterly** for everything else.
- **Immediate** on suspected compromise (PagerDuty `secret_compromise` runbook).
- Rotation is mechanized via `scripts/rotate-keys.sh`.
- Each secret has a `rotation` annotation (in Terraform when we move there) that
  Cloud Scheduler reads to alert SRE.

---

## 6. Audit

- Every `secrets versions access` call is logged in Cloud Audit Logs (Data Read).
- We export those logs to BigQuery for 1-year retention via the
  `prometheus-audit-sink` log sink.
- Anomaly: more than 5 reads of the same secret in 5 minutes from a single
  principal triggers a Cloud Monitoring alert (channel `SLACK_OPS`).

---

## 7. Local development

For local dev, never copy a prod secret into `.env`. Use:

```bash
gcloud auth application-default login
gcloud config set project prometheus-prod
# scripts/dev.sh fetches dev-tier secrets via:
# gcloud secrets versions access latest --secret=GEMINI_API_KEY_DEV
```

Dev-tier secrets are suffixed `_DEV` and bound to a separate billing account
and rate-limited Gemini key.
