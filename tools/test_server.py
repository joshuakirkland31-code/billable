"""Serves the repo, waits for tests/index.html to POST its result to /__result, prints it, exits.

Usage: python tools/test_server.py PORT TIMEOUT_SECONDS
Exit code 0 only if the result starts with "ALL PASS".
"""
import http.server
import os
import sys
import threading

PORT = int(sys.argv[1])
TIMEOUT = float(sys.argv[2])
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
result = {}
done = threading.Event()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path == "/__result":
            n = int(self.headers.get("Content-Length", 0))
            result["text"] = self.rfile.read(n).decode("utf-8", "replace")
            self.send_response(204)
            self.end_headers()
            done.set()
        else:
            self.send_response(404)
            self.end_headers()


srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
print("READY", flush=True)
ok = done.wait(TIMEOUT)
srv.shutdown()
text = result.get("text", "TIMEOUT: no result posted")
print(text)
sys.exit(0 if ok and text.startswith("ALL PASS") else 1)
