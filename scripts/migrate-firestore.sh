#!/usr/bin/env bash
# scripts/migrate-firestore.sh — Schema migration helper.
# Runs forward-only migrations from backend/migrations/firestore/*.py
# Each migration is a Python module exposing:
#   id: str            (e.g. "001_add_company_id_to_sessions")
#   description: str
#   def up(db) -> None
#
# We track applied migrations in /migrations/{id} on Firestore itself.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

ENV="${1:-dev}"
DRY_RUN=0

shift || true
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 64 ;;
  esac
done

case "$ENV" in
  dev)     PROJECT_ID="${PROJECT_ID:-demo-prometheus}" ;;
  staging) PROJECT_ID="${PROJECT_ID:-prometheus-staging}" ;;
  prod)    PROJECT_ID="${PROJECT_ID:-prometheus-prod}" ;;
  *) echo "Usage: $0 [dev|staging|prod] [--dry-run]" >&2; exit 64 ;;
esac

OS_NAME="$(uname -s)"
case "$OS_NAME" in
  MINGW*|MSYS*|CYGWIN*) ACT="backend/.venv/Scripts/activate" ;;
  *)                    ACT="backend/.venv/bin/activate" ;;
esac
[ -f "$ACT" ] || { echo "Run ./scripts/setup.sh first" >&2; exit 1; }

# shellcheck disable=SC1090
. "$ACT"

if [ "$ENV" = "prod" ]; then
  read -r -p "Run migrations against PROD? Type the project id ($PROJECT_ID) to confirm: " CONFIRM
  if [ "$CONFIRM" != "$PROJECT_ID" ]; then echo "aborted"; exit 1; fi
fi

export GOOGLE_CLOUD_PROJECT="$PROJECT_ID"
export FIRESTORE_DATABASE="${FIRESTORE_DATABASE:-(default)}"

python3 - <<PY
"""Forward-only Firestore migration runner."""
from __future__ import annotations
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import firestore  # type: ignore

DRY_RUN = "$DRY_RUN" == "1"
ROOT = Path(".")
MIG_DIR = ROOT / "backend" / "migrations" / "firestore"
MIG_DIR.mkdir(parents=True, exist_ok=True)
db = firestore.Client(project=os.environ["GOOGLE_CLOUD_PROJECT"])

mig_files = sorted(p for p in MIG_DIR.glob("*.py") if not p.name.startswith("_"))
if not mig_files:
    print("[migrate] no migrations in backend/migrations/firestore")
    sys.exit(0)

applied = {doc.id for doc in db.collection("migrations").stream()}
print(f"[migrate] env=$ENV  project=$PROJECT_ID  dry_run={DRY_RUN}")
print(f"[migrate] found {len(mig_files)} migration files; {len(applied)} already applied")

for path in mig_files:
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mig_id = getattr(mod, "id", path.stem)
    desc = getattr(mod, "description", "(no description)")
    if mig_id in applied:
        print(f"  [skip]   {mig_id}  — already applied")
        continue
    print(f"  [apply]  {mig_id}  — {desc}")
    if DRY_RUN:
        print("           DRY RUN, not executing up()")
        continue
    mod.up(db)
    db.collection("migrations").document(mig_id).set({
        "id": mig_id,
        "description": desc,
        "applied_at": datetime.now(timezone.utc),
        "applied_by": os.environ.get("USER", "unknown"),
    })
    print(f"  [done]   {mig_id}")

print("[migrate] complete.")
PY

deactivate || true
