from __future__ import annotations

import copy
import re
import unicodedata
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterator, Protocol


class ContactConflict(ValueError):
    """Email and phone resolve to different contacts."""


class AmbiguousMatch(ValueError):
    """More than one opportunity matches a stable key."""


def normalize_email(value: str | None) -> str | None:
    normalized = value.strip().lower() if value else ""
    return normalized or None


def normalize_phone(value: str | None, default_country: str = "FR") -> str | None:
    if not value:
        return None
    compact = re.sub(r"[\s().-]", "", value.strip())
    if compact.startswith("00"):
        compact = "+" + compact[2:]
    elif compact.startswith("0") and default_country == "FR":
        compact = "+33" + compact[1:]
    if not re.fullmatch(r"\+[1-9]\d{7,14}", compact):
        return None
    return compact


def normalize_text(value: str | None) -> str | None:
    normalized = " ".join(value.split()) if value else ""
    return normalized or None


def slug(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_value.lower()).strip("_")


@dataclass(frozen=True)
class SyncRequest:
    message_id: str
    source: str
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    gmail_thread_id: str | None = None
    gmail_thread_url: str | None = None
    event_date: str | None = None
    event_type: str = "Inconnu"
    location: str | None = None
    guests: int | None = None
    need: str | None = None


@dataclass
class Contact:
    id: str
    key: str
    full_name: str
    email: str | None
    phone: str | None
    notes: str | None = None


@dataclass
class Opportunity:
    id: str
    key: str
    contact_id: str
    title: str
    source: str
    event_type: str
    event_date: str | None
    gmail_thread_id: str | None
    gmail_thread_url: str | None
    location: str | None
    guests: int | None
    need: str | None
    status: str = "Nouveau"
    processed_message_ids: set[str] = field(default_factory=set)
    synchronized_at: str | None = None


class Gateway(Protocol):
    contacts: dict[str, Contact]
    opportunities: dict[str, Opportunity]

    def transaction(self) -> Iterator[None]: ...
    def new_contact_id(self) -> str: ...
    def new_opportunity_id(self) -> str: ...


@dataclass(frozen=True)
class SyncResult:
    contact_id: str
    opportunity_id: str
    created_contact: bool
    created_opportunity: bool
    replayed: bool = False


class MemoryGateway:
    """Transactional test double; production adapters implement the same contract."""

    def __init__(self) -> None:
        self.contacts: dict[str, Contact] = {}
        self.opportunities: dict[str, Opportunity] = {}
        self._contact_sequence = 0
        self._opportunity_sequence = 0
        self.fail_before_commit = False

    def new_contact_id(self) -> str:
        self._contact_sequence += 1
        return f"contact-{self._contact_sequence}"

    def new_opportunity_id(self) -> str:
        self._opportunity_sequence += 1
        return f"opportunity-{self._opportunity_sequence}"

    @contextmanager
    def transaction(self) -> Iterator[None]:
        snapshot = copy.deepcopy((self.contacts, self.opportunities))
        try:
            yield
            if self.fail_before_commit:
                self.fail_before_commit = False
                raise RuntimeError("simulated Notion failure")
        except Exception:
            self.contacts, self.opportunities = snapshot
            raise


class Synchronizer:
    def __init__(self, gateway: Gateway) -> None:
        self.gateway = gateway

    def sync(self, request: SyncRequest) -> SyncResult:
        if not request.message_id.strip():
            raise ValueError("message_id is required")
        email = normalize_email(request.email)
        phone = normalize_phone(request.phone)
        if not email and not phone:
            raise ValueError("a normalized email or E.164 phone is required")
        with self.gateway.transaction():
            replay_matches = [
                item for item in self.gateway.opportunities.values()
                if request.message_id in item.processed_message_ids
            ]
            if len(replay_matches) > 1:
                raise AmbiguousMatch("message_id is attached to multiple opportunities")
            if replay_matches:
                opportunity = replay_matches[0]
                return SyncResult(opportunity.contact_id, opportunity.id, False, False, True)
            contact, created_contact = self._contact(request, email, phone)
            opportunity, created_opportunity = self._opportunity(request, contact)
            self._enrich(opportunity, request)
            opportunity.synchronized_at = datetime.now(timezone.utc).isoformat()
            opportunity.processed_message_ids.add(request.message_id)
            return SyncResult(contact.id, opportunity.id, created_contact, created_opportunity)

    def _contact(self, request: SyncRequest, email: str | None, phone: str | None) -> tuple[Contact, bool]:
        by_email = [item for item in self.gateway.contacts.values() if email and item.email == email]
        by_phone = [item for item in self.gateway.contacts.values() if phone and item.phone == phone]
        email_match = by_email[0] if len(by_email) == 1 else None
        phone_match = by_phone[0] if len(by_phone) == 1 else None
        if len(by_email) > 1 or len(by_phone) > 1:
            raise ContactConflict("ambiguous contact identity")
        if email_match and phone_match and email_match.id != phone_match.id:
            raise ContactConflict("email and phone belong to different contacts")
        contact = email_match or phone_match
        if contact:
            contact.email = contact.email or email
            contact.phone = contact.phone or phone
            return contact, False
        key = f"email:{email}" if email else f"tel:{phone}"
        contact = Contact(
            id=self.gateway.new_contact_id(), key=key,
            full_name=normalize_text(request.full_name) or email or phone or "Contact inconnu",
            email=email, phone=phone,
        )
        self.gateway.contacts[contact.id] = contact
        return contact, True

    def _opportunity(self, request: SyncRequest, contact: Contact) -> tuple[Opportunity, bool]:
        if request.gmail_thread_id:
            matches = [item for item in self.gateway.opportunities.values() if item.gmail_thread_id == request.gmail_thread_id]
        else:
            key = self._opportunity_key(contact.key, request.event_date, request.event_type)
            matches = [item for item in self.gateway.opportunities.values() if item.key == key]
        if len(matches) > 1:
            raise AmbiguousMatch("multiple opportunities match the request")
        if matches:
            return matches[0], False
        key = self._opportunity_key(contact.key, request.event_date, request.event_type)
        title = " — ".join(filter(None, (request.event_type, contact.full_name, request.event_date)))
        opportunity = Opportunity(
            id=self.gateway.new_opportunity_id(), key=key, contact_id=contact.id,
            title=title, source=request.source, event_type=request.event_type,
            event_date=request.event_date, gmail_thread_id=request.gmail_thread_id,
            gmail_thread_url=request.gmail_thread_url, location=normalize_text(request.location),
            guests=request.guests, need=normalize_text(request.need),
        )
        self.gateway.opportunities[opportunity.id] = opportunity
        return opportunity, True

    @staticmethod
    def _opportunity_key(contact_key: str, event_date: str | None, event_type: str) -> str:
        return f"{contact_key}|{event_date or 'inconnue'}|{slug(event_type)}"

    @staticmethod
    def _enrich(opportunity: Opportunity, request: SyncRequest) -> None:
        opportunity.gmail_thread_url = opportunity.gmail_thread_url or request.gmail_thread_url
        opportunity.location = opportunity.location or normalize_text(request.location)
        opportunity.guests = opportunity.guests or request.guests
        opportunity.need = opportunity.need or normalize_text(request.need)
