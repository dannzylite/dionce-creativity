# Local preview server that stops the browser caching files, so code changes show on a normal refresh.
# Run: python3 dev-server.py   then open http://localhost:8000
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    print("Serving on http://localhost:8000 (Ctrl+C to stop)")
    ThreadingHTTPServer(("", 8000), NoCacheHandler).serve_forever()
