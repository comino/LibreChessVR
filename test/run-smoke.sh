#!/bin/sh
# Runs the headless-Chrome smoke pages (real time, one by one, clean storage) and prints each #result.
# Usage: test/run-smoke.sh [page ...]   (default: test/smoke.html + all test/*-smoke.html)
# CHROME_FLAGS adds browser flags (bx: --no-sandbox, since Chrome gets no user namespaces in the container).
cd "$(dirname "$0")/.."
MAC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -z "$CHROME" ] && for c in "$MAC_CHROME" google-chrome chromium chromium-browser; do
  command -v "$c" >/dev/null 2>&1 && { CHROME=$c; break; }; done
[ -n "$CHROME" ] || { echo "run-smoke: no Chrome or Chromium found; set CHROME" >&2; exit 1; }
PORT=${PORT:-8123}
CDP_PORT=$((PORT + 1000)); export CDP_PORT
WORK=$(mktemp -d) # Chrome's profile and its own temp dirs (TMPDIR), removed on exit
PROFILE="$WORK/profile"
python3 -m http.server $PORT >/dev/null 2>&1 & SERVER=$!
TMPDIR="$WORK" "$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --mute-audio $CHROME_FLAGS \
  --remote-debugging-port=$CDP_PORT --user-data-dir="$PROFILE" about:blank >/dev/null 2>&1 & BROWSER=$!
cleanup() { # Chrome's helper processes outlive the parent and keep writing to the profile
  { kill $SERVER $BROWSER; pkill -f "user-data-dir=$PROFILE"
    for i in 1 2 3 4 5 6 7 8 9 10; do pgrep -f "user-data-dir=$PROFILE" >/dev/null || break; sleep 0.3; done
    wait; } 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null && break; sleep 0.5; done
node test/cdp-run.mjs "http://localhost:$PORT" ${@:-test/smoke.html test/*-smoke.html}
