#!/usr/bin/env bash
# Runs tests/index.html in headless Edge; the page POSTs its result to the test server.
# Exit 0 only if the page reports "ALL PASS".
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8799
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
cd "$ROOT"
OUTF="$(mktemp)"
python tools/test_server.py "$PORT" 60 >"$OUTF" 2>&1 &
SRV=$!
for i in $(seq 1 50); do grep -q READY "$OUTF" && break; sleep 0.1; done
PROFILE="$(mktemp -d)"
"$EDGE" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROFILE" \
  "http://127.0.0.1:$PORT/tests/index.html?report=1" >/dev/null 2>&1 &
EDGEPID=$!
wait $SRV
CODE=$?
kill $EDGEPID 2>/dev/null
WPID=$(ps -p $EDGEPID -o winpid= 2>/dev/null | tr -d ' ')
[ -n "$WPID" ] && taskkill //F //T //PID "$WPID" >/dev/null 2>&1
rm -rf "$PROFILE" 2>/dev/null
grep -v '^READY$' "$OUTF"
rm -f "$OUTF"
exit $CODE
