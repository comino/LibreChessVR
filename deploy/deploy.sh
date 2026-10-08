#!/bin/sh
# Ships 3D Chess Practice to fred (Caddy, /opt/parallax/web).
# Public URL: https://chess.janasven.de (janasven proxies to fred; see nginx-chess.conf).
# Bump CACHE in sw.js when shipping changes so installed apps refresh.
set -e
cd "$(dirname "$0")/.."
COPYFILE_DISABLE=1 tar --no-mac-metadata -czf - index.html manifest.webmanifest sw.js src assets .well-known |
  ssh fred 'sudo mkdir -p /opt/parallax/web && sudo tar xzf - -C /opt/parallax/web && sudo chmod -R a+rX /opt/parallax'
echo "deployed: https://chess.janasven.de"
