# PROMETHEUS V2 — IAM Roles & Workload Identity

> **Tagline:** "Least privilege isn't a virtue, it's a perimeter."

Four service accounts. No service account JSON keys ever land in a Docker layer,
a CI environment variable, or developer laptop. All non-human identities use
Workload Identity Federation (WIF) for GitHub Actions, and Workload Identity
for Cloud Run.

---

## 1. Service Accounts

| SA email                                            | Purpose                                | Roles |
|-----------------------------------------------------|----------------------------------------|-------|
| `gateway-sa@prometheus-prod.iam.gserviceaccount.com`| Cloud Run gateway                      | see §1.1 |
| `worker-sa@prometheus-prod.iam.gserviceaccount.com` | Cloud Run worker                       | see §1.2 |
| `tasks-invoker@prometheus-prod.iam.gserviceaccount.com` | Cloud Tasks → worker OIDC          | see §1.3 |
| `scheduler-sa@prometheus-prod.iam.gserviceaccount.com`| Cloud Scheduler → worker OIDC        | see §1.4 |
| `build-sa@prometheus-prod.iam.gserviceaccount.com`  | Cloud Build, GitHub Actions deploys    | see §1.5 |
| `budget-killswitch-sa@prometheus-prod.iam.gserviceaccount.com` | Hard-cap kill function       | see §1.6 |

### 1.1 `gateway-sa`

```
roles/datastore.user                      # read+write Firestore
roles/cloudtasks.enqueuer                 # enqueue pipeline tasks
roles/iam.serviceAccountTokenCreator on tasks-invoker  # mint OIDC for tasks
roles/secretmanager.secretAccessor (per-secret)
roles/run.invoker on prometheus-worker    # for sync admin endpoints only
roles/aiplatform.user                     # Vertex Safety pre-filter
roles/firebase.sdkAdminServiceAgent       # mint custom auth tokens
roles/cloudtrace.agent
roles/logging.logWriter
roles/monitoring.metricWriter
```

### 1.2 `worker-sa`

```
roles/datastore.user
roles/storage.objectAdmin (limited to bucket prometheus-prod-assets/<session>/*)
roles/aiplatform.user                     # Gemini / Imagen
roles/secretmanager.secretAccessor (per-secret, see secret-manager-setup.md)
roles/cloudtrace.agent
roles/logging.logWriter
roles/monitoring.metricWriter
roles/firebase.sdkAdminServiceAgent       # write to /agent_outputs
# NO drive.file scope here — Workspace API calls use OAuth on behalf of the user
```

### 1.3 `tasks-invoker`

```
roles/run.invoker on prometheus-worker    # ONLY this — nothing else
```

### 1.4 `scheduler-sa`

```
roles/run.invoker on prometheus-worker
roles/run.invoker on prometheus-gateway   # for /internal/billing/sync-usage
```

### 1.5 `build-sa`

```
roles/cloudbuild.builds.builder
roles/artifactregistry.writer
roles/run.developer
roles/run.serviceAgent
roles/iam.serviceAccountUser on gateway-sa   # actAs to deploy
roles/iam.serviceAccountUser on worker-sa
roles/firebasehosting.admin
roles/datastore.indexAdmin                  # deploy indexes
roles/cloudkms.signerVerifier on cosign key
roles/storage.objectAdmin (limited to gs://prometheus-prod-build-cache)
```

### 1.6 `budget-killswitch-sa`

```
roles/serviceusage.serviceUsageAdmin       # disable APIs
roles/secretmanager.secretAccessor on SLACK_OPS_WEBHOOK
roles/logging.logWriter
```

---

## 2. Workload Identity (Cloud Run)

Cloud Run services read `GOOGLE_APPLICATION_CREDENTIALS` automatically via the
metadata server when configured with `serviceAccountName` — no key file needed.

```yaml
# in cloud-run-gateway.yaml / cloud-run-worker.yaml
spec:
  template:
    spec:
      serviceAccountName: gateway-sa@prometheus-prod.iam.gserviceaccount.com
```

---

## 3. Workload Identity Federation (GitHub Actions)

Replace long-lived JSON keys with OIDC tokens minted by GitHub.

### 3.1 Pool & Provider

```bash
# 1. Create the pool
gcloud iam workload-identity-pools create github-pool \
  --project=prometheus-prod \
  --location=global \
  --display-name="GitHub Actions Pool"

# 2. Add the OIDC provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project=prometheus-prod \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub" \
  --attribute-mapping="\
google.subject=assertion.sub,\
attribute.actor=assertion.actor,\
attribute.repository=assertion.repository,\
attribute.repository_owner=assertion.repository_owner,\
attribute.ref=assertion.ref,\
attribute.environment=assertion.environment" \
  --attribute-condition="assertion.repository_owner == 'shauryasanghvi' && \
                         assertion.repository == 'shauryasanghvi/prometheus'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

### 3.2 Bind to `build-sa`

```bash
PROJECT_NUMBER=$(gcloud projects describe prometheus-prod --format='value(projectNumber)')

gcloud iam service-accounts add-iam-policy-binding \
  "build-sa@prometheus-prod.iam.gserviceaccount.com" \
  --project=prometheus-prod \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/shauryasanghvi/prometheus"
```

### 3.3 GitHub Actions usage

```yaml
# .github/workflows/cd.yml
permissions:
  id-token: write          # required to mint OIDC token
  contents: read

steps:
  - uses: google-github-actions/auth@v2
    with:
      workload_identity_provider: projects/${{ env.PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github-pool/providers/github-provider
      service_account: build-sa@prometheus-prod.iam.gserviceaccount.com
```

No JSON key. No `GOOGLE_APPLICATION_CREDENTIALS` secret in GitHub.

---

## 4. Custom roles (least-privilege over predefined)

For hot collections, create custom roles to narrow access.

### 4.1 `roles/prometheus.firestoreSessionsRW`

Reduces `datastore.user` → only sessions and subcollections.

```yaml
title: "PROMETHEUS Firestore Sessions Read-Write"
includedPermissions:
  - datastore.databases.get
  - datastore.entities.get
  - datastore.entities.create
  - datastore.entities.update
  - datastore.entities.delete
  - datastore.entities.list
condition:
  expression: "resource.name.startsWith('projects/prometheus-prod/databases/(default)/documents/sessions/')"
```

(Conditional IAM is in beta for Datastore — apply where supported, fall back to
`datastore.user` elsewhere.)

---

## 5. Audit

All IAM changes go through Terraform (`infra/terraform/iam.tf` — future).
Until then:

- Bi-weekly run of `gcloud asset search-all-iam-policies --scope=projects/prometheus-prod`
  output diffed in Slack.
- Anyone holding `roles/owner` is alerted on (only break-glass account `sre-breakglass@`).
- Service accounts without 90-day rotation evidence are flagged.

---

## 6. Break-glass

`sre-breakglass@prometheus-prod.iam.gserviceaccount.com` exists with
`roles/owner` but is disabled by default. Enabled only via paged on-call,
auto-disabled after 4 hours via Cloud Function.

---

## 7. Forbidden

- No SA may hold `roles/iam.serviceAccountKeyAdmin` outside terraform.
- No SA JSON key may be downloaded — `iam.disableServiceAccountKeyCreation` org policy enforced.
- No `roles/owner` or `roles/editor` on regular SAs — ever.
