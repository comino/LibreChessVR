#!/bin/sh
# Runs the headless-Chrome smoke pages and prints each page's #result line.
# Usage: test/run-smoke.sh [page ...]   (default: all test/*-smoke.html + smoke.html)
cd "$(dirname "$0")/.."
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PORT=8123
python3 -m http.server $PORT >/dev/null 2>&1 & SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1
fail=0
for page in ${@:-test/smoke.html test/*-smoke.html}; do
  out=$("$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
    --virtual-time-budget=30000 --dump-dom "http://localhost:$PORT/$page" 2>/dev/null |
    sed -n 's/.*<div id="result"[^>]*>\([^<]*\)<.*/\1/p')
  echo "$page: ${out:-NO RESULT}"
  case "$out" in *-OK*) ;; *) fail=1 ;; esac
done
exit $fail
