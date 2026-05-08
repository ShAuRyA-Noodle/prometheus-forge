#!/usr/bin/env bash
# scripts/security-scan.sh — pip-audit + npm audit + semgrep (OWASP Top 10) + trivy.
# Reports issues. Exit 1 on HIGH/CRITICAL.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

REPORT_DIR="$REPO_ROOT/.security-reports"
mkdir -p "$REPORT_DIR"
DATE=$(date -u +%Y-%m-%dT%H-%M-%S)

OS_NAME="$(uname -s)"
case "$OS_NAME" in
  MINGW*|MSYS*|CYGWIN*) OS=win ;;
  *)                    OS=unix ;;
esac

ANY_FAIL=0

# ---------- pip-audit ----------
echo "[1/5] pip-audit"
if [ "$OS" = "win" ]; then ACT="backend/.venv/Scripts/activate"; else ACT="backend/.venv/bin/activate"; fi
if [ -f "$ACT" ]; then
  # shellcheck disable=SC1090
  . "$ACT"
  if ! command -v pip-audit >/dev/null 2>&1; then
    pip install pip-audit==2.7.3
  fi
  pip-audit -r backend/requirements.txt --format json --output "$REPORT_DIR/pip-audit-$DATE.json" \
    || { echo "[pip-audit] FAIL"; ANY_FAIL=1; }
  deactivate || true
else
  echo "  skipping (no venv)"
fi

# ---------- npm audit ----------
echo "[2/5] npm audit"
( cd frontend && npm audit --audit-level=high --json > "$REPORT_DIR/npm-audit-$DATE.json" ) \
  || { echo "[npm audit] FAIL (high+)"; ANY_FAIL=1; }

# ---------- semgrep ----------
echo "[3/5] semgrep (OWASP Top 10 + secrets)"
if command -v semgrep >/dev/null 2>&1; then
  semgrep \
    --config=p/owasp-top-ten \
    --config=p/secrets \
    --config=p/python \
    --config=p/typescript \
    --config=p/react \
    --severity=ERROR \
    --severity=WARNING \
    --json \
    --output="$REPORT_DIR/semgrep-$DATE.json" \
    --error \
    backend frontend \
    || { echo "[semgrep] FAIL"; ANY_FAIL=1; }
else
  echo "  semgrep not installed; install: pip install semgrep"
fi

# ---------- trivy fs ----------
echo "[4/5] trivy (filesystem)"
if command -v trivy >/dev/null 2>&1; then
  trivy fs --severity HIGH,CRITICAL --exit-code 1 \
    --ignore-unfixed --scanners vuln,secret,misconfig \
    --format json --output "$REPORT_DIR/trivy-fs-$DATE.json" . \
    || { echo "[trivy fs] FAIL"; ANY_FAIL=1; }
else
  echo "  trivy not installed; brew install aquasecurity/trivy/trivy"
fi

# ---------- trivy image (if local image exists) ----------
echo "[5/5] trivy (local image)"
LOCAL_IMG=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
  | grep -E 'prometheus.*backend' | head -1 || true)
if [ -n "$LOCAL_IMG" ] && command -v trivy >/dev/null 2>&1; then
  trivy image --severity HIGH,CRITICAL --exit-code 1 \
    --ignore-unfixed --format json --output "$REPORT_DIR/trivy-image-$DATE.json" \
    "$LOCAL_IMG" \
    || { echo "[trivy image] FAIL"; ANY_FAIL=1; }
else
  echo "  no local prometheus image found; skipping"
fi

# ---------- summary ----------
echo ""
echo "================================================"
echo "Security reports: $REPORT_DIR"
ls -la "$REPORT_DIR" | tail -10
echo "================================================"

if [ "$ANY_FAIL" = "1" ]; then
  echo "[security-scan] FAILED — review reports above."
  exit 1
fi
echo "[security-scan] PASSED"
