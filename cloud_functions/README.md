# PROMETHEUS — Cloud Functions

Out-of-band Cloud Functions for safety, abuse response, GDPR/CCPA, and share
analytics. Each function is independently deployable; they share no code with
the main worker so they can be patched without redeploying the pipeline.

## Functions

| Function              | Trigger        | Purpose |
| --------------------- | -------------- | ------- |
| `billing_killswitch`  | Pub/Sub        | Disable Gemini/Vertex on billing breach + flip Firestore killswitch doc. |
| `abuse_response`      | Pub/Sub        | Add IP to Cloud Armor deny list on rate-burst log alerts. |
| `dsar_processor`      | HTTP (Firebase auth) | GDPR/CCPA export-or-delete request with 30-day SLA. |
| `share_view_pixel`    | HTTP (open)    | 1x1 PNG endpoint that logs verified share-token views. |

## Deploy

Set common env vars first:

```bash
export PROJECT_ID=prometheus-prod
export REGION=us-central1
```

### billing_killswitch

```bash
gcloud functions deploy billing_killswitch \
  --gen2 --runtime python311 --region $REGION \
  --source ./cloud_functions/billing_killswitch \
  --entry-point handle \
  --trigger-topic billing-alerts \
  --service-account billing-killswitch@$PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars PROJECT_ID=$PROJECT_ID,HARD_LIMIT_USD=100 \
  --set-secrets SLACK_WEBHOOK=slack-webhook:latest,RESEND_API_KEY=resend:latest
```

### abuse_response

```bash
gcloud functions deploy abuse_response \
  --gen2 --runtime python311 --region $REGION \
  --source ./cloud_functions/abuse_response \
  --entry-point handle \
  --trigger-topic abuse-events \
  --service-account abuse-response@$PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars PROJECT_ID=$PROJECT_ID,CLOUD_ARMOR_POLICY=prometheus-abuse-deny,BLOCK_DURATION_S=3600
```

### dsar_processor

```bash
gcloud functions deploy dsar_processor \
  --gen2 --runtime python311 --region $REGION \
  --source ./cloud_functions/dsar_processor \
  --entry-point handle \
  --trigger-http --allow-unauthenticated \
  --service-account dsar-processor@$PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars PROJECT_ID=$PROJECT_ID,DSAR_BUCKET=$PROJECT_ID-dsar-exports,FROM_EMAIL=privacy@prometheus.local \
  --set-secrets RESEND_API_KEY=resend:latest
```

### share_view_pixel

```bash
gcloud functions deploy share_view_pixel \
  --gen2 --runtime python311 --region $REGION \
  --source ./cloud_functions/share_view_pixel \
  --entry-point handle \
  --trigger-http --allow-unauthenticated \
  --set-env-vars PROJECT_ID=$PROJECT_ID \
  --set-secrets SHARE_TOKEN_SECRET=share-token-secret:latest
```

## Required IAM

| Function              | Roles |
| --------------------- | ----- |
| `billing_killswitch`  | `serviceusage.serviceUsageAdmin`, `datastore.user` |
| `abuse_response`      | `compute.securityAdmin`, `datastore.user` |
| `dsar_processor`      | `datastore.user`, `storage.objectAdmin` (DSAR bucket only), Firebase Admin |
| `share_view_pixel`    | `datastore.user` |

## Operational notes

- **Killswitch override**: re-enable services with `gcloud services enable
  aiplatform.googleapis.com generativelanguage.googleapis.com` and set
  `system_state/killswitch.enabled = false` in Firestore.
- **DSAR retention**: signed URLs expire after 7 days; the GCS bucket has a
  30-day lifecycle rule for the `dsar/` prefix.
- **Pixel**: always returns 200 + 1x1 PNG; bad/expired tokens silently no-op.
