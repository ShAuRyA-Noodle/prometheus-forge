#!/usr/bin/env bash
# scripts/dev.sh — Run backend + frontend together for local dev.
# Prefers tmux when available; falls back to background processes with pid mgmt.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

OS_NAME="$(uname -s)"
case "$OS_NAME" in
  MINGW*|MSYS*|CYGWIN*) OS=win ;;
  *)                    OS=unix ;;
esac

# ---------- env ----------
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
export ENV="${ENV:-dev}"
export LOG_LEVEL="${LOG_LEVEL:-DEBUG}"
export PORT_BACKEND="${PORT_BACKEND:-8080}"
export PORT_FRONTEND="${PORT_FRONTEND:-5173}"

# ---------- venv activation ----------
if [ "$OS" = "win" ]; then
  ACTIVATE="$REPO_ROOT/backend/.venv/Scripts/activate"
else
  ACTIVATE="$REPO_ROOT/backend/.venv/bin/activate"
fi

if [ ! -f "$ACTIVATE" ]; then
  echo "Backend venv not found at $ACTIVATE. Run ./scripts/setup.sh first." >&2
  exit 1
fi

# ---------- tmux path ----------
if command -v tmux >/dev/null 2>&1 && [ "${PROMETHEUS_NO_TMUX:-0}" != "1" ]; then
  SESSION="prometheus"
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "tmux session '$SESSION' exists; killing it"
    tmux kill-session -t "$SESSION"
  fi
  tmux new-session -d -s "$SESSION" -n backend \
    "cd '$REPO_ROOT/backend' && . '$ACTIVATE' && exec uvicorn main:app --reload --host 0.0.0.0 --port $PORT_BACKEND"
  tmux new-window -t "$SESSION" -n frontend \
    "cd '$REPO_ROOT/frontend' && exec npm run dev -- --port $PORT_FRONTEND --host"
  tmux new-window -t "$SESSION" -n logs \
    "cd '$REPO_ROOT' && exec bash -c 'echo \"-- prometheus dev session --\"; sleep 9999'"
  echo "Attaching to tmux session '$SESSION'. Detach with Ctrl-b d."
  exec tmux attach -t "$SESSION"
fi

# ---------- background processes path ----------
echo "tmux not found; falling back to background processes"

LOG_DIR="$REPO_ROOT/.dev-logs"
mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

cleanup() {
  echo ""
  echo "[dev.sh] Shutting down..."
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ -n "${TAIL_PID:-}" ] && kill -0 "$TAIL_PID" 2>/dev/null; then
    kill "$TAIL_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup INT TERM EXIT

# Backend
(
  cd "$REPO_ROOT/backend"
  # shellcheck disable=SC1090
  . "$ACTIVATE"
  exec uvicorn main:app --reload --host 0.0.0.0 --port "$PORT_BACKEND"
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "[dev.sh] backend pid=$BACKEND_PID  log=$BACKEND_LOG"

# Frontend
(
  cd "$REPO_ROOT/frontend"
  exec npm run dev -- --port "$PORT_FRONTEND" --host
) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "[dev.sh] frontend pid=$FRONTEND_PID log=$FRONTEND_LOG"

echo "[dev.sh] backend  : http://localhost:$PORT_BACKEND"
echo "[dev.sh] frontend : http://localhost:$PORT_FRONTEND"
echo "[dev.sh] tailing logs (Ctrl-C to stop both)"
echo ""

tail -f "$BACKEND_LOG" "$FRONTEND_LOG" &
TAIL_PID=$!

wait $BACKEND_PID $FRONTEND_PID
