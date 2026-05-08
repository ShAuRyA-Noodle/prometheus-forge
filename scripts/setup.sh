#!/usr/bin/env bash
# scripts/setup.sh — One-command local dev bootstrap for PROMETHEUS V2.
# Idempotent. Re-running is safe.
#
# Works on: macOS (bash 3.2+), Linux, Windows Git Bash.
# Avoid GNU-only flags. Avoid `mapfile`/`readarray`. Avoid `[[ -v ... ]]`.
set -euo pipefail

# ---------- log helpers ----------
_color()    { printf "\033[%sm%s\033[0m\n" "$1" "$2"; }
log()       { _color "1;36" "==> $*"; }
warn()      { _color "1;33" "[WARN] $*" >&2; }
err()       { _color "1;31" "[ERR ] $*" >&2; }
ok()        { _color "1;32" "[ OK ] $*"; }

# ---------- locate repo root ----------
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

log "PROMETHEUS V2 setup starting in $REPO_ROOT"

# ---------- detect OS ----------
OS_NAME="$(uname -s)"
case "$OS_NAME" in
  Darwin)         OS=mac    ;;
  Linux)          OS=linux  ;;
  MINGW*|MSYS*|CYGWIN*) OS=win ;;
  *)              OS=unknown; warn "Unknown OS '$OS_NAME', proceeding optimistically" ;;
esac
log "Detected OS: $OS"

# ---------- preflight ----------
require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Missing required command: $1"
    if [ -n "${2:-}" ]; then echo "      Install: $2" >&2; fi
    exit 1
  fi
}

require_cmd python3 "https://www.python.org/downloads/"
require_cmd node    "https://nodejs.org/"
require_cmd npm     "(comes with Node)"
require_cmd git     "https://git-scm.com/"

# Node >= 20
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  err "Node 20+ required (have $NODE_MAJOR). Use nvm: 'nvm install 20'"
  exit 1
fi

# Python >= 3.11
PY_VER=$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
PY_MAJ=$(echo "$PY_VER" | cut -d. -f1)
PY_MIN=$(echo "$PY_VER" | cut -d. -f2)
if [ "$PY_MAJ" -lt 3 ] || { [ "$PY_MAJ" -eq 3 ] && [ "$PY_MIN" -lt 11 ]; }; then
  err "Python 3.11+ required (have $PY_VER)"
  exit 1
fi
ok "Toolchain: node $(node -v), python $PY_VER"

# ---------- install uv (fast Python pkg mgr) ----------
if ! command -v uv >/dev/null 2>&1; then
  log "Installing uv (Astral package manager)"
  if [ "$OS" = "win" ]; then
    # Git Bash: use pip as a portable bootstrap
    python3 -m pip install --user uv
  else
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # uv installer puts it in ~/.local/bin or ~/.cargo/bin — make sure it's on PATH this session
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
  fi
fi
ok "uv $(uv --version 2>/dev/null || echo "(installed)")"

# ---------- backend venv + deps ----------
log "Backend: creating .venv and installing requirements"
cd "$REPO_ROOT/backend"
if [ ! -d .venv ]; then
  uv venv .venv --python "python$PY_VER" 2>/dev/null || uv venv .venv
fi

# shellcheck disable=SC1091
if [ "$OS" = "win" ]; then
  . .venv/Scripts/activate
else
  . .venv/bin/activate
fi

# Try hashed install first; fall back to lockless if no hash file
if grep -q -- "--hash=" requirements.txt 2>/dev/null; then
  uv pip install --require-hashes -r requirements.txt
else
  uv pip install -r requirements.txt
fi
ok "Backend deps installed"
deactivate || true

# ---------- frontend deps ----------
log "Frontend: installing npm deps"
cd "$REPO_ROOT/frontend"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
ok "Frontend deps installed"

# ---------- .env bootstrap ----------
cd "$REPO_ROOT"
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    ok "Created .env from .env.example — fill in your keys"
  else
    warn ".env.example missing, creating empty .env"
    : > .env
  fi
else
  ok ".env already exists, leaving in place"
fi

# ---------- Frontend .env.local ----------
if [ ! -f frontend/.env.local ] && [ -f .env ]; then
  # Extract VITE_* lines into frontend/.env.local for Vite
  grep '^VITE_' .env > frontend/.env.local 2>/dev/null || true
  ok "Synced VITE_* vars to frontend/.env.local"
fi

# ---------- gcloud auth (optional, prompted) ----------
if command -v gcloud >/dev/null 2>&1; then
  if gcloud config get-value account >/dev/null 2>&1; then
    ACCT=$(gcloud config get-value account 2>/dev/null)
    ok "gcloud authenticated as: $ACCT"
  else
    warn "gcloud installed but not authenticated. Run: gcloud auth application-default login"
  fi
else
  warn "gcloud not installed. Install: https://cloud.google.com/sdk/install"
fi

# ---------- firebase tools (optional) ----------
if ! command -v firebase >/dev/null 2>&1; then
  warn "firebase CLI not installed. Install: npm i -g firebase-tools"
else
  ok "firebase $(firebase --version)"
fi

# ---------- pre-commit hooks (optional) ----------
if [ -f .pre-commit-config.yaml ] && command -v pre-commit >/dev/null 2>&1; then
  pre-commit install --install-hooks
  ok "pre-commit hooks installed"
fi

# ---------- summary ----------
cat <<EOF

================================================================================
  PROMETHEUS V2 dev environment ready.

  Next:
    1. Fill in $REPO_ROOT/.env with API keys
    2. Run:   ./scripts/dev.sh             # backend + frontend together
    3. Run:   ./scripts/test.sh            # full test suite
    4. Optional: ./scripts/local-emulator.sh  # Firebase emulators (no prod hits)

  Backend  : http://localhost:8080
  Frontend : http://localhost:5173
================================================================================
EOF
