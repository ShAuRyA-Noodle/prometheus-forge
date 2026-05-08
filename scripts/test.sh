#!/usr/bin/env bash
# scripts/test.sh — Full test suite: pytest backend + vitest frontend.
# Optional --e2e flag runs Playwright. Reports coverage. Fails on regression.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

# ---------- args ----------
RUN_E2E=0
RUN_BACKEND=1
RUN_FRONTEND=1
COV_MIN="${COV_MIN:-70}"

for arg in "$@"; do
  case "$arg" in
    --e2e)         RUN_E2E=1 ;;
    --backend)     RUN_FRONTEND=0 ;;
    --frontend)    RUN_BACKEND=0 ;;
    --no-coverage) COV_MIN=0 ;;
    -h|--help)
      cat <<EOF
Usage: $0 [--e2e] [--backend] [--frontend] [--no-coverage]

  --e2e           also run Playwright e2e suite
  --backend       only run backend tests
  --frontend      only run frontend tests
  --no-coverage   don't enforce coverage threshold
EOF
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 64 ;;
  esac
done

OS_NAME="$(uname -s)"
case "$OS_NAME" in
  MINGW*|MSYS*|CYGWIN*) OS=win ;;
  *)                    OS=unix ;;
esac

# ---------- backend ----------
if [ "$RUN_BACKEND" = "1" ]; then
  echo "================== BACKEND =================="
  cd "$REPO_ROOT/backend"

  if [ "$OS" = "win" ]; then ACTIVATE=".venv/Scripts/activate"; else ACTIVATE=".venv/bin/activate"; fi
  if [ ! -f "$ACTIVATE" ]; then echo "Run ./scripts/setup.sh first" >&2; exit 1; fi
  # shellcheck disable=SC1090
  . "$ACTIVATE"

  echo "[ruff] lint"
  ruff check .
  echo "[ruff] format check"
  ruff format --check .
  echo "[mypy] strict typecheck"
  mypy --strict agents services models

  echo "[pytest] unit + integration"
  if [ "$COV_MIN" = "0" ]; then
    pytest -q
  else
    pytest --cov=. --cov-report=term-missing --cov-report=xml \
           --cov-fail-under="$COV_MIN" -q
  fi
  deactivate || true
fi

# ---------- frontend ----------
if [ "$RUN_FRONTEND" = "1" ]; then
  echo "================== FRONTEND =================="
  cd "$REPO_ROOT/frontend"
  echo "[eslint]"
  npm run lint
  echo "[tsc --noEmit]"
  npm run typecheck
  echo "[vitest]"
  if [ "$COV_MIN" = "0" ]; then
    npm run test -- --run
  else
    npm run test -- --run --coverage
  fi

  if [ "$RUN_E2E" = "1" ]; then
    echo "[playwright]"
    npx playwright install --with-deps chromium >/dev/null 2>&1 || true
    npm run test:e2e
  fi
fi

echo ""
echo "All tests passed."
