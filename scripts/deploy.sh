#!/usr/bin/env bash
# scripts/deploy.sh — Full prod deploy: build, push, deploy gateway+worker+frontend.
# Bumps version. Requires gcloud auth. Confirms before pushing to prod.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

# ---------- args ----------
ENV="${1:-staging}"
case "$ENV" in
  staging|prod) ;;
  *) echo "Usage: $0 [staging|prod]" >&2; exit 64 ;;
esac

PROJECT_ID="${PROJECT_ID:-prometheus-${ENV}}"
REGION="${REGION:-us-central1}"
AR_REPO="${AR_REPO:-prometheus}"

# ---------- preflight ----------
for cmd in gcloud docker firebase node npm git jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing $cmd" >&2; exit 1; }
done

if ! gcloud config get-value account >/dev/null 2>&1; then
  echo "gcloud not authenticated. Run: gcloud auth login" >&2
  exit 1
fi

# Clean working tree (prod only)
if [ "$ENV" = "prod" ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "ERROR: working tree dirty. Commit or stash before deploying to prod." >&2
    exit 1
  fi
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "ERROR: prod deploys must come from main (you are on $CURRENT_BRANCH)" >&2
    exit 1
  fi
fi

# ---------- version bump ----------
VERSION_FILE="$REPO_ROOT/VERSION"
if [ ! -f "$VERSION_FILE" ]; then echo "0.0.0" > "$VERSION_FILE"; fi
CURRENT=$(cat "$VERSION_FILE")
PATCH_DEFAULT=$(echo "$CURRENT" | awk -F. -v OFS=. '{$3++; print}')
read -r -p "Current version $CURRENT — new version [default $PATCH_DEFAULT]: " NEW
NEW="${NEW:-$PATCH_DEFAULT}"
echo "$NEW" > "$VERSION_FILE"

GIT_SHA=$(git rev-parse --short HEAD)
IMAGE_TAG="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/backend:$NEW-$GIT_SHA"
IMAGE_LATEST="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/backend:latest"

cat <<EOF

================================================================================
  PROMETHEUS V2 deploy plan
  ENV       : $ENV
  PROJECT   : $PROJECT_ID
  REGION    : $REGION
  VERSION   : $NEW
  GIT SHA   : $GIT_SHA
  IMAGE     : $IMAGE_TAG
================================================================================
EOF

if [ "$ENV" = "prod" ]; then
  read -r -p "Deploy to PROD? Type 'deploy' to confirm: " CONFIRM
  if [ "$CONFIRM" != "deploy" ]; then echo "aborted."; exit 1; fi
fi

# ---------- 1. test gate ----------
echo "[1/7] running test suite (skip with PROMETHEUS_SKIP_TESTS=1)"
if [ "${PROMETHEUS_SKIP_TESTS:-0}" != "1" ]; then
  "$SCRIPT_DIR/test.sh"
fi

# ---------- 2. build backend image ----------
echo "[2/7] building backend image"
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
docker build \
  --tag "$IMAGE_TAG" \
  --tag "$IMAGE_LATEST" \
  --build-arg "VCS_REF=$GIT_SHA" \
  --build-arg "VERSION=$NEW" \
  -f backend/Dockerfile backend

# ---------- 3. trivy scan ----------
echo "[3/7] trivy scan"
if command -v trivy >/dev/null 2>&1; then
  trivy image --severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed "$IMAGE_TAG"
else
  echo "(trivy not installed — skipping local scan; CI will catch it)"
fi

# ---------- 4. push image ----------
echo "[4/7] pushing image"
docker push "$IMAGE_TAG"
docker push "$IMAGE_LATEST"

# ---------- 5. deploy services ----------
echo "[5/7] deploying gateway"
TMP_GW=$(mktemp)
sed "s|us-central1-docker.pkg.dev/prometheus-prod/prometheus/backend:latest|$IMAGE_TAG|g" \
  infrastructure/cloud-run-gateway.yaml > "$TMP_GW"
gcloud run services replace "$TMP_GW" --region="$REGION" --project="$PROJECT_ID"
gcloud run services update-traffic prometheus-gateway --to-latest --region="$REGION" --project="$PROJECT_ID"
rm -f "$TMP_GW"

echo "[5/7] deploying worker"
TMP_WK=$(mktemp)
sed "s|us-central1-docker.pkg.dev/prometheus-prod/prometheus/backend:latest|$IMAGE_TAG|g" \
  infrastructure/cloud-run-worker.yaml > "$TMP_WK"
gcloud run services replace "$TMP_WK" --region="$REGION" --project="$PROJECT_ID"
gcloud run services update-traffic prometheus-worker --to-latest --region="$REGION" --project="$PROJECT_ID"
rm -f "$TMP_WK"

# ---------- 6. firestore + frontend ----------
echo "[6/7] deploying firestore rules + indexes"
firebase deploy \
  --only firestore:rules,firestore:indexes,storage \
  --project "$PROJECT_ID" --non-interactive

echo "[6/7] building + deploying frontend"
( cd frontend && npm ci && npm run build )
firebase deploy --only "hosting:$ENV" --project "$PROJECT_ID" --non-interactive

# ---------- 7. smoke test ----------
echo "[7/7] smoke-testing"
GATEWAY_URL=$(gcloud run services describe prometheus-gateway \
  --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/healthz")
if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: gateway healthcheck returned $HTTP_CODE" >&2
  exit 1
fi

# ---------- tag commit ----------
if [ "$ENV" = "prod" ]; then
  git tag -a "v$NEW" -m "Deploy v$NEW to prod ($GIT_SHA)"
  echo "Tagged v$NEW. Push tag with: git push origin v$NEW"
fi

echo ""
echo "Deploy complete."
echo "  Gateway : $GATEWAY_URL"
echo "  Version : $NEW ($GIT_SHA)"
