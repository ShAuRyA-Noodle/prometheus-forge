#!/usr/bin/env bash
# scripts/rotate-keys.sh — Guidance + helper for monthly Secret Manager rotation.
# Doesn't rotate credentials at the upstream provider — those have to be done
# by hand (Stripe/Deepgram/etc) — but it adds the new version to Secret Manager,
# pins Cloud Run to the new version, and disables the previous version after a
# grace period.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

PROJECT_ID="${PROJECT_ID:-prometheus-prod}"
GRACE_DAYS="${GRACE_DAYS:-7}"

if [ "$#" -lt 1 ]; then
  cat <<EOF
Usage: $0 <secret-name> [<secret-name>...]

Performs the following per secret:
  1. Reads the new value from stdin (one secret at a time, prompted)
  2. Adds it as a new version
  3. Updates Cloud Run gateway + worker to read 'latest'
  4. Schedules disable of the previous version after $GRACE_DAYS days

Examples:
  $0 GEMINI_API_KEY
  $0 STRIPE_SECRET_KEY DEEPGRAM_API_KEY

Environment:
  PROJECT_ID   default: prometheus-prod
  GRACE_DAYS   default: 7

Pre-rotation checklist (do these UPSTREAM first):
  GEMINI_API_KEY      → aistudio.google.com → API Key → "Create new key", revoke old after rollout
  STRIPE_SECRET_KEY   → dashboard.stripe.com/apikeys → Roll key, choose grace period
  DEEPGRAM_API_KEY    → console.deepgram.com → Keys → Generate
  USPTO_API_KEY       → developer.uspto.gov account → Regenerate
  DOMAINR_API_KEY     → rapidapi.com dashboard → Regenerate
  CRUNCHBASE_API_KEY  → data.crunchbase.com → Account → Regenerate
  RESEND_API_KEY      → resend.com/api-keys → Create new
  CLOUDFLARE_API_TOKEN→ dash.cloudflare.com/profile/api-tokens → Create new
EOF
  exit 64
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing $1" >&2; exit 1; }
}
require_cmd gcloud
require_cmd jq

for secret in "$@"; do
  echo ""
  echo "=== Rotating $secret ==="
  if ! gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "  ! secret '$secret' does not exist in $PROJECT_ID. Create it first." >&2
    exit 1
  fi

  CURRENT=$(gcloud secrets versions list "$secret" --project="$PROJECT_ID" \
    --filter="state=ENABLED" --sort-by=~createTime --format='value(name)' --limit=1)
  echo "  current latest version: $CURRENT"

  echo "  paste new secret value (input is hidden):"
  read -rs NEW_VALUE
  echo ""
  if [ -z "$NEW_VALUE" ]; then echo "  ! empty value, aborting"; exit 1; fi

  printf '%s' "$NEW_VALUE" \
    | gcloud secrets versions add "$secret" \
        --project="$PROJECT_ID" --data-file=-

  NEW_VERSION=$(gcloud secrets versions list "$secret" --project="$PROJECT_ID" \
    --sort-by=~createTime --format='value(name)' --limit=1)
  echo "  added new version: $NEW_VERSION"

  # Cloud Run pulls 'latest' on next revision; force a redeploy if needed
  echo "  Cloud Run uses 'latest' alias — next revision picks it up."
  echo "  Force-rolling current revisions:"
  for svc in prometheus-gateway prometheus-worker; do
    if gcloud run services describe "$svc" --region=us-central1 --project="$PROJECT_ID" >/dev/null 2>&1; then
      gcloud run services update "$svc" \
        --region=us-central1 --project="$PROJECT_ID" \
        --update-env-vars="ROTATED_AT=$(date -u +%FT%TZ)" \
        --quiet
      echo "    $svc rolled"
    fi
  done

  # Schedule disable of previous version after grace period
  if [ -n "$CURRENT" ] && [ "$CURRENT" != "$NEW_VERSION" ]; then
    DISABLE_DATE=$(date -u -d "+$GRACE_DAYS days" +%Y-%m-%d 2>/dev/null \
                || date -u -v +"${GRACE_DAYS}d" +%Y-%m-%d)
    REMINDER_FILE="$REPO_ROOT/.rotate-disable-queue.tsv"
    printf "%s\t%s\t%s\t%s\n" "$DISABLE_DATE" "$secret" "$CURRENT" "$(date -u +%FT%TZ)" \
      >> "$REMINDER_FILE"
    echo "  queued: disable $secret/$CURRENT on $DISABLE_DATE (see $REMINDER_FILE)"
  fi
done

echo ""
echo "Rotation complete. Run scripts/test.sh against the new revisions before going home."
