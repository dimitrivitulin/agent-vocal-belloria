import hashlib
import hmac
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

from tools.webhook_receiver import WebhookHandler, valid_signature


class ReceiverTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        WebhookHandler.hmac_key = "test-secret"
        WebhookHandler.events_file = Path(self.temp_dir.name) / "events.ndjson"
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), WebhookHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp_dir.cleanup()

    def request(self, method: str, path: str, body: bytes = b"", signature: str | None = None):
        connection = HTTPConnection("127.0.0.1", self.server.server_port)
        headers = {"Content-Type": "application/json"}
        if signature:
            headers["X-Webhook-Hmac"] = signature
        connection.request(method, path, body, headers)
        response = connection.getresponse()
        payload = response.read()
        connection.close()
        return response.status, payload

    def test_health(self) -> None:
        status, _ = self.request("GET", "/health")
        self.assertEqual(status, 200)

    def test_valid_event_is_recorded(self) -> None:
        body = json.dumps({"event": "message", "session": "test"}).encode()
        signature = hmac.new(b"test-secret", body, hashlib.sha512).hexdigest()
        status, _ = self.request("POST", "/webhooks/waha", body, signature)
        self.assertEqual(status, 202)
        self.assertEqual(json.loads(WebhookHandler.events_file.read_text()), json.loads(body))

    def test_missing_or_invalid_signature_is_rejected(self) -> None:
        body = b'{"event":"message"}'
        for signature in (None, "invalid"):
            with self.subTest(signature=signature):
                status, _ = self.request("POST", "/webhooks/waha", body, signature)
                self.assertEqual(status, 401)
        self.assertFalse(WebhookHandler.events_file.exists())

    def test_signature_helper_accepts_optional_prefix(self) -> None:
        body = b"payload"
        digest = hmac.new(b"secret", body, hashlib.sha512).hexdigest()
        self.assertTrue(valid_signature(body, f"sha512={digest}", "secret"))


if __name__ == "__main__":
    unittest.main()
