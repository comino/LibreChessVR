#!/bin/sh
# Ships LibreChessVR to fred (Caddy, /opt/parallax/web).
# Public URL: https://librechessvr.com (Caddy site in Caddyfile.parallax).
# Bump CACHE in sw.js when shipping changes so installed apps refresh.
set -e
cd "$(dirname "$0")/.."
COPYFILE_DISABLE=1 tar --no-mac-metadata -czf - index.html manifest.webmanifest sw.js LICENSE THIRD_PARTY_NOTICES.md src assets .well-known |
  ssh fred 'sudo mkdir -p /opt/parallax/web && sudo tar xzf - -C /opt/parallax/web && sudo chmod -R a+rX /opt/parallax'
echo "deployed: https://librechessvr.com"
