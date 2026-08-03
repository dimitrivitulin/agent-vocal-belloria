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
