#!/usr/bin/env bash
# Bootstrap Capacitor iOS + Android shells. Run AFTER `npm run build` succeeds.
# One-time per platform; commit the generated `ios/` and `android/` folders.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d dist ]; then
  echo "[bootstrap-capacitor] No dist/ folder. Run 'npm run build' first."
  exit 1
fi

# Install Capacitor core if missing.
if ! npm ls @capacitor/cli >/dev/null 2>&1; then
  echo "[bootstrap-capacitor] Installing Capacitor packages..."
  npm install --save-dev @capacitor/cli
  npm install --save \
    @capacitor/core \
    @capacitor/ios \
    @capacitor/android \
    @capacitor/push-notifications \
    @capacitor/local-notifications \
    @capacitor/splash-screen \
    @capacitor/status-bar \
    @capacitor/keyboard \
    @capacitor/share \
    @capacitor/haptics \
    @capacitor/preferences \
    @capacitor/network \
    @capacitor/app
fi

# Add platforms idempotently.
if [ ! -d ios ]; then
  echo "[bootstrap-capacitor] Adding iOS platform (requires macOS + Xcode)..."
  npx cap add ios || echo "[bootstrap-capacitor] iOS add failed — skip on non-macOS."
fi

if [ ! -d android ]; then
  echo "[bootstrap-capacitor] Adding Android platform..."
  npx cap add android
fi

echo "[bootstrap-capacitor] Syncing web → native..."
npx cap sync

cat <<EOF

Capacitor bootstrap complete.

Next steps:
  iOS:     npx cap open ios       (requires macOS + Xcode 15+)
           Configure signing in Xcode, set capabilities (Push, Background fetch).
  Android: npx cap open android   (requires Android Studio)
           Configure signing key, set capabilities (Push, Background sync).

Push notifications:
  iOS:     Apple Push Notification certificate uploaded to Firebase project.
  Android: google-services.json placed at android/app/google-services.json.

Both platforms register an FCM token via @capacitor/push-notifications and POST
it to /api/me/push-token (already implemented in routes_user.py).
EOF
