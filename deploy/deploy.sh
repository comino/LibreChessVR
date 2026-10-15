#!/bin/sh
# Ships LibreChessVR to Janasven (nginx, /var/www/librechessvr/current).
# Override DEPLOY_HOST to use another SSH alias for the same server.
# Public URL: https://librechessvr.com
# Bump CACHE in sw.js when shipping changes so installed apps refresh.
set -eu
cd "$(dirname "$0")/.."
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT HUP INT TERM
# Build first so a failed local tar cannot activate an incomplete release. COPYFILE_DISABLE
# suppresses macOS metadata while keeping this command compatible with GNU tar.
COPYFILE_DISABLE=1 tar -czf "$archive" index.html manifest.webmanifest sw.js LICENSE THIRD_PARTY_NOTICES.md src assets .well-known
ssh "${DEPLOY_HOST:-janasven}" '
  set -eu
  site=/var/www/librechessvr
  test -L "$site/current"
  release=$(sudo -n mktemp -d "$site/releases/web-XXXXXXXX")
  sudo -n tar xzf - -C "$release"
  sudo -n chmod -R a+rX "$release"
  next="$site/.current-$(basename "$release")"
  sudo -n ln -s "$release" "$next"
  sudo -n mv -Tf "$next" "$site/current"
  printf "release: %s\n" "$release"
' < "$archive"
echo "deployed: https://librechessvr.com"
