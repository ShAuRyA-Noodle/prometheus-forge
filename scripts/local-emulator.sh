#!/usr/bin/env bash
# scripts/local-emulator.sh — Boot Firebase Emulator suite (Firestore + Auth)
# for local dev without prod hits.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

if ! command -v firebase >/dev/null 2>&1; then
  echo "firebase CLI not installed. npm i -g firebase-tools" >&2
  exit 1
fi

# Default firebase.json if missing
if [ ! -f firebase.json ]; then
  cat > firebase.json <<'JSON'
{
  "firestore": {
    "rules": "infrastructure/firestore.rules",
    "indexes": "infrastructure/firestore.indexes.json"
  },
  "storage": {
    "rules": "infrastructure/storage.rules"
  },
  "hosting": [
    {
      "target": "staging",
      "public": "frontend/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    },
    {
      "target": "prod",
      "public": "frontend/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    }
  ],
  "emulators": {
    "auth":      { "port": 9099 },
    "firestore": { "port": 8085 },
    "storage":   { "port": 9199 },
    "hosting":   { "port": 5000 },
    "ui":        { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
JSON
  echo "[emulator] wrote firebase.json"
fi

# Storage rules placeholder if missing
if [ ! -f infrastructure/storage.rules ]; then
  cat > infrastructure/storage.rules <<'STO'
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Per-user folder
    match /users/{uid}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    // Session assets (signed URLs preferred — see backend/services/storage.py)
    match /sessions/{sessionId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if false; // backend SA only via admin SDK
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
STO
  echo "[emulator] wrote storage.rules"
fi

# Set env so frontend hits emulators
export FIRESTORE_EMULATOR_HOST="localhost:8085"
export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
export FIREBASE_STORAGE_EMULATOR_HOST="localhost:9199"
export VITE_USE_EMULATORS=1

PROJECT_ID="${FIREBASE_PROJECT_ID:-demo-prometheus}"

echo "[emulator] starting suite for project $PROJECT_ID"
echo "[emulator] UI: http://localhost:4000"
echo "[emulator] Firestore: localhost:8085"
echo "[emulator] Auth:      localhost:9099"
echo "[emulator] Storage:   localhost:9199"
echo ""

exec firebase emulators:start \
  --project "$PROJECT_ID" \
  --only auth,firestore,storage,hosting \
  --import=./.firebase-emulator-data \
  --export-on-exit
