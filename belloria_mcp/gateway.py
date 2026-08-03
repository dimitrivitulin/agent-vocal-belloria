from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Mapping, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

PHONE = re.compile(r"^[1-9][0-9]{7,14}$")


class WhatsAppGateway(Protocol):
    """Provider-neutral operations used by Belloria's public MCP surface."""

    def status(self) -> object: ...

    def send_text(self, phone: str, text: str) -> object: ...

    def get_media(self, media_id: str) -> "MediaDownload": ...


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: Mapping[str, str]
    body: bytes


@dataclass(frozen=True)
class MediaDownload:
    media_id: str
    content_type: str
    data: bytes


class HttpTransport(Protocol):
    def __call__(self, method: str, url: str, headers: Mapping[str, str], body: bytes | None = None, *, max_bytes: int | None = None) -> HttpResponse: ...


def urllib_transport(method: str, url: str, headers: Mapping[str, str], body: bytes | None = None, *, max_bytes: int | None = None) -> HttpResponse:
    request = Request(url, data=body, method=method, headers=dict(headers))
    try:
        with urlopen(request, timeout=10) as response:
            content = response.read() if max_bytes is None else response.read(max_bytes + 1)
            if max_bytes is not None and len(content) > max_bytes:
                raise RuntimeError("HTTP response exceeds the configured size limit")
            return HttpResponse(response.status, dict(response.headers.items()), content)
    except HTTPError as error:
        raise RuntimeError(f"HTTP request returned {error.code}") from error
    except URLError as error:
        raise RuntimeError("HTTP request is unavailable") from error


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

    def get_media(self, media_id: str) -> MediaDownload:
        raise RuntimeError("media retrieval is not supported by the WAHA fallback")


class MetaCloudGateway:
    """Small WhatsApp Cloud API adapter with an injectable HTTP boundary."""

    def __init__(
        self,
        phone_number_id: str,
        access_token: str,
        *,
        graph_version: str,
        transport: HttpTransport = urllib_transport,
        max_media_bytes: int = 10 * 1024 * 1024,
    ) -> None:
        if not phone_number_id or not access_token:
            raise ValueError("Meta phone number id and access token are required")
        self.phone_number_id = phone_number_id
        self.access_token = access_token
        self.graph_url = f"https://graph.facebook.com/{graph_version}"
        self.transport = transport
        self.max_media_bytes = max_media_bytes

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.access_token}", "Accept": "application/json"}

    def status(self) -> object:
        return {"provider": "meta", "configured": True, "phone_number_id": self.phone_number_id}

    def send_text(self, phone: str, text: str) -> object:
        validate_text_message(phone, text)
        payload = json.dumps({"messaging_product": "whatsapp", "recipient_type": "individual", "to": phone, "type": "text", "text": {"body": text}}).encode()
        response = self.transport("POST", f"{self.graph_url}/{self.phone_number_id}/messages", {**self.headers, "Content-Type": "application/json"}, payload)
        return self._json(response)

    def get_media(self, media_id: str) -> MediaDownload:
        if not media_id or not re.fullmatch(r"[A-Za-z0-9._-]+", media_id):
            raise ValueError("invalid Meta media id")
        metadata = self._json(self.transport("GET", f"{self.graph_url}/{media_id}", self.headers))
        url = metadata.get("url") if isinstance(metadata, dict) else None
        if not isinstance(url, str) or urlparse(url).scheme != "https":
            raise RuntimeError("Meta returned an invalid media URL")
        response = self.transport("GET", url, {"Authorization": f"Bearer {self.access_token}"}, max_bytes=self.max_media_bytes)
        content_type = _header(response.headers, "Content-Type").split(";", 1)[0].lower()
        allowed = content_type.startswith(("audio/", "image/", "video/")) or content_type == "application/pdf"
        if not allowed:
            raise RuntimeError(f"unsupported media type: {content_type or 'missing'}")
        declared = _header(response.headers, "Content-Length")
        if (declared.isdigit() and int(declared) > self.max_media_bytes) or len(response.body) > self.max_media_bytes:
            raise RuntimeError("Meta media exceeds the configured size limit")
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"Meta returned HTTP {response.status}")
        return MediaDownload(media_id, content_type, response.body)

    @staticmethod
    def _json(response: HttpResponse) -> object:
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"Meta returned HTTP {response.status}")
        try:
            return json.loads(response.body or b"{}")
        except json.JSONDecodeError as error:
            raise RuntimeError("Meta returned invalid JSON") from error


def _header(headers: Mapping[str, str], name: str) -> str:
    return next((value for key, value in headers.items() if key.lower() == name.lower()), "")


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
    if provider == "meta":
        try:
            phone_number_id = values["META_PHONE_NUMBER_ID"]
            access_token = values["META_ACCESS_TOKEN"]
            graph_version = values["META_GRAPH_VERSION"]
        except KeyError as error:
            raise RuntimeError(f"{error.args[0]} is required when WHATSAPP_PROVIDER=meta") from error
        return MetaCloudGateway(phone_number_id, access_token, graph_version=graph_version)
    if provider == "disabled":
        raise RuntimeError("WhatsApp provider is disabled")
    raise RuntimeError(f"unsupported WhatsApp provider: {provider}")
