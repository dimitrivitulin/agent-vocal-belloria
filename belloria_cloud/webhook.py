"""Cœur sans framework du webhook Meta, testable sans service distant."""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Any, Iterator


@dataclass(frozen=True)
class MetaEvent:
    """Un événement adressable et dédoublonnable reçu de Meta."""

    event_id: str
    kind: str
    phone_number_id: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class NormalizedWhatsAppEvent:
    """Provider-neutral subset consumed after durable webhook ingestion."""

    event_id: str
    kind: str
    phone_number_id: str
    occurred_at: str | None
    sender: str | None = None
    recipient: str | None = None
    message_type: str | None = None
    text: str | None = None
    media_id: str | None = None
    status: str | None = None


def verify_challenge(mode: str | None, token: str | None, challenge: str | None, expected_token: str) -> str | None:
    """Retourne le challenge uniquement pour un abonnement Meta valide."""
    if mode != "subscribe" or not token or challenge is None or not expected_token:
        return None
    return challenge if hmac.compare_digest(token, expected_token) else None


def valid_signature(body: bytes, supplied: str | None, app_secret: str) -> bool:
    """Vérifie X-Hub-Signature-256 sur les octets reçus, avant décodage JSON."""
    if not supplied or not app_secret or not supplied.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(supplied[7:].lower(), expected)


def iter_events(document: dict[str, Any]) -> Iterator[MetaEvent]:
    """Extrait les messages et statuts sans dépendre d'un serveur HTTP."""
    if document.get("object") != "whatsapp_business_account":
        return
    for entry in document.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "messages":
                continue
            value = change.get("value", {})
            phone_number_id = str(value.get("metadata", {}).get("phone_number_id", ""))
            for message in value.get("messages", []):
                if message.get("id"):
                    yield MetaEvent(str(message["id"]), "message", phone_number_id, message)
            for status in value.get("statuses", []):
                if status.get("id") and status.get("status"):
                    # Un même message traverse plusieurs statuts : chacun doit être traité une fois.
                    event_id = f'{status["id"]}:{status["status"]}'
                    yield MetaEvent(event_id, "status", phone_number_id, status)


def normalize_event(event: MetaEvent) -> NormalizedWhatsAppEvent:
    """Normalize supported Meta fields while preserving a stable event id."""
    payload = event.payload
    timestamp = str(payload["timestamp"]) if payload.get("timestamp") is not None else None
    if event.kind == "status":
        return NormalizedWhatsAppEvent(
            event.event_id, "status", event.phone_number_id, timestamp,
            recipient=_optional_string(payload.get("recipient_id")),
            status=_optional_string(payload.get("status")),
        )
    message_type = _optional_string(payload.get("type"))
    content = payload.get(message_type, {}) if message_type else {}
    if not isinstance(content, dict):
        content = {}
    return NormalizedWhatsAppEvent(
        event.event_id, "message", event.phone_number_id, timestamp,
        sender=_optional_string(payload.get("from")),
        message_type=message_type,
        text=_optional_string(content.get("body")) if message_type == "text" else None,
        media_id=_optional_string(content.get("id")) if message_type in {"audio", "document", "image", "sticker", "video"} else None,
    )


def _optional_string(value: Any) -> str | None:
    return str(value) if value is not None and value != "" else None
