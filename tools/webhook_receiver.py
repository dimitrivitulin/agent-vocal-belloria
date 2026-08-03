"""Récepteur local minimal pour valider les webhooks WAHA signés."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def valid_signature(body: bytes, supplied: str | None, secret: str) -> bool:
    """Accepte l'empreinte SHA-512 hexadécimale émise par WAHA."""
    if not supplied or not secret:
        return False
    value = supplied.removeprefix("sha512=").lower()
    expected = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(value, expected)


class WebhookHandler(BaseHTTPRequestHandler):
    hmac_key = ""
    events_file = Path("events.ndjson")

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self.send_error(404)
            return
        self._reply(200, {"status": "ok"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/webhooks/waha":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400, "Invalid Content-Length")
            return
        body = self.rfile.read(length)
        signature = self.headers.get("X-Webhook-Hmac")
        if not valid_signature(body, signature, self.hmac_key):
            self._reply(401, {"error": "invalid signature"})
            return
        try:
            event = json.loads(body)
        except json.JSONDecodeError:
            self._reply(400, {"error": "invalid json"})
            return
        self.events_file.parent.mkdir(parents=True, exist_ok=True)
        with self.events_file.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")
        self._reply(202, {"status": "accepted"})

    def log_message(self, format: str, *args: object) -> None:
        return

    def _reply(self, status: int, payload: dict[str, str]) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    WebhookHandler.hmac_key = os.environ["WEBHOOK_HMAC_KEY"]
    WebhookHandler.events_file = Path(os.getenv("WEBHOOK_EVENTS_FILE", "events.ndjson"))
    host = os.getenv("WEBHOOK_HOST", "127.0.0.1")
    port = int(os.getenv("WEBHOOK_PORT", "8080"))
    ThreadingHTTPServer((host, port), WebhookHandler).serve_forever()


if __name__ == "__main__":
    main()

