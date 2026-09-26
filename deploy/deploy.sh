#!/bin/sh
# Ships the static app to fred: https://parallax.46-224-133-201.sslip.io (Caddy, /opt/parallax/web).
# Bump CACHE in sw.js when shipping changes so installed apps refresh.
set -e
cd "$(dirname "$0")/.."
COPYFILE_DISABLE=1 tar --no-mac-metadata -czf - index.html manifest.webmanifest sw.js src assets .well-known |
  ssh fred 'sudo mkdir -p /opt/parallax/web && sudo tar xzf - -C /opt/parallax/web && sudo chmod -R a+rX /opt/parallax'
echo "deployed: https://parallax.46-224-133-201.sslip.io"
