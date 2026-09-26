#!/bin/sh
# Builds the Quest APK (Meta's Bubblewrap fork, immersive mode) from twa-manifest.json.
# Needs JDK 17 + Android SDK (paths in ~/.bubblewrap/config.json) and the signing key in
# ~/.parallax/ (keystore + password file) — keep that key: updates must be signed with it.
# Install: adb install -r android/app-release-signed.apk
set -e
cd "$(dirname "$0")"
npx -y @meta-quest/bubblewrap-cli@latest update --skipVersionUpgrade
PASS="$(cat ~/.parallax/keystore.pass)"
BUBBLEWRAP_KEYSTORE_PASSWORD="$PASS" BUBBLEWRAP_KEY_PASSWORD="$PASS" \
  npx -y @meta-quest/bubblewrap-cli@latest build --skipPwaValidation
