#!/usr/bin/env bash
# Runs tests/index.html in headless Edge and prints the result.
# Exit 0 only if the page reports "ALL PASS".
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8766
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
cd "$ROOT"
python -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 30); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/tests/index.html" && break
  sleep 0.2
done
PROFILE="$(mktemp -d)"
DOM="$("$EDGE" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROFILE" \
  --virtual-time-budget=15000 --dump-dom "http://127.0.0.1:$PORT/tests/index.html" 2>/dev/null)"
rm -rf "$PROFILE"
OUT="$(printf '%s' "$DOM" | python -c "import sys,re,html;d=sys.stdin.read();m=re.search(r'<pre id=\"out\">(.*?)</pre>',d,re.S);print(html.unescape(m.group(1)) if m else 'NO OUTPUT')")"
echo "$OUT"
case "$OUT" in "ALL PASS"*) exit 0;; *) exit 1;; esac
