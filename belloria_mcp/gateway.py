from __future__ import annotations

import json
import os
import re
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PHONE = re.compile(r"^[1-9][0-9]{7,14}$")


class WhatsAppGateway(Protocol):
    """Provider-neutral operations used by Belloria's public MCP surface."""

    def status(self) -> object: ...

    def send_text(self, phone: str, text: str) -> object: ...


class WahaGateway:
    """Disabled-by-default fallback adapter for the historical WAHA API."""

    def __init__(self, base_url: str, api_key: str, session: str = "default") -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.session = session

    def request(self, method: str, path: str, payload: dict | None = None) -> object:
        body = None if payload is None else json.dumps(payload).encode()
        request = Request(
            f"{self.base_url}{path}", data=body, method=method,
            headers={"Accept": "application/json", "Content-Type": "application/json", "X-Api-Key": self.api_key},
        )
        try:
            with urlopen(request, timeout=5) as response:
                return json.loads(response.read() or b"{}")
        except HTTPError as error:
            raise RuntimeError(f"WAHA returned HTTP {error.code}") from error
        except URLError as error:
            raise RuntimeError("WAHA is unavailable") from error

    def status(self) -> object:
        return self.request("GET", f"/api/sessions/{self.session}")

    def send_text(self, phone: str, text: str) -> object:
        validate_text_message(phone, text)
        return self.request("POST", "/api/sendText", {"session": self.session, "chatId": f"{phone}@c.us", "text": text})


def validate_text_message(phone: str, text: str) -> None:
    if not PHONE.fullmatch(phone):
        raise ValueError("phone must contain 8 to 15 digits without '+'")
    if not text or len(text) > 2000:
        raise ValueError("text must contain 1 to 2000 characters")


def gateway_from_env(environ: dict[str, str] | None = None) -> WhatsAppGateway:
    """Build an explicitly enabled provider; no provider is active by default."""
    values = os.environ if environ is None else environ
    provider = values.get("WHATSAPP_PROVIDER", "disabled").lower()
    if provider == "waha":
        try:
            api_key = values["WAHA_API_KEY"]
        except KeyError as error:
            raise RuntimeError("WAHA_API_KEY is required when WHATSAPP_PROVIDER=waha") from error
        return WahaGateway(
            values.get("WAHA_BASE_URL", "http://127.0.0.1:3000"),
            api_key,
            values.get("WAHA_SESSION", "default"),
        )
    if provider == "disabled":
        raise RuntimeError("WhatsApp provider is disabled")
    raise RuntimeError(f"unsupported WhatsApp provider: {provider}")
