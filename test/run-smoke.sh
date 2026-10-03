#!/bin/sh
# Runs the headless-Chrome smoke pages (real time, one by one, clean storage) and prints each #result.
# Usage: test/run-smoke.sh [page ...]   (default: test/smoke.html + all test/*-smoke.html)
cd "$(dirname "$0")/.."
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PORT=${PORT:-8123}
CDP_PORT=$((PORT + 1000)); export CDP_PORT
PROFILE=$(mktemp -d)
python3 -m http.server $PORT >/dev/null 2>&1 & SERVER=$!
"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --mute-audio \
  --remote-debugging-port=$CDP_PORT --user-data-dir="$PROFILE" about:blank >/dev/null 2>&1 & BROWSER=$!
trap 'kill $SERVER $BROWSER 2>/dev/null; wait 2>/dev/null; rm -rf "$PROFILE"' EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null && break; sleep 0.5; done
node test/cdp-run.mjs "http://localhost:$PORT" ${@:-test/smoke.html test/*-smoke.html}
