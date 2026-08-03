"""Envoie un événement WAHA fictif et correctement signé au récepteur local."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from urllib.request import Request, urlopen


def main() -> None:
    secret = os.environ["WAHA_WEBHOOK_HMAC_KEY"]
    payload = {
        "id": "evt_belloria_simulation",
        "timestamp": 1785751200000,
        "event": "message",
        "session": "belloria-test",
        "payload": {"from": "33600000000@c.us", "body": "Demande de devis fictive"},
        "engine": "NOWEB",
        "environment": {"tier": "CORE", "version": "simulation"},
    }
    body = json.dumps(payload, separators=(",", ":")).encode()
    signature = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    request = Request(
        os.getenv("WAHA_WEBHOOK_URL", "http://127.0.0.1:8080/webhooks/waha"),
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Hmac": signature,
            "X-Webhook-Hmac-Algorithm": "sha512",
        },
        method="POST",
    )
    with urlopen(request, timeout=5) as response:
        print(response.read().decode())


if __name__ == "__main__":
    main()

