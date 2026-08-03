from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Protocol


class Outcome(str, Enum):
    COMMERCIAL = "demande_commerciale"
    THREAD_REPLY = "reponse_fil_commercial"
    OUT_OF_SCOPE = "hors_perimetre"
    REVIEW = "a_revoir"


@dataclass(frozen=True)
class CandidateMessage:
    message_id: str
    thread_id: str
    internal_date: int
    subject: str
    body: str
    source: str | None = None


@dataclass(frozen=True)
class Classification:
    outcome: Outcome
    confidence: float
    reason: str
    sync_request: object | None = None


class Inbox(Protocol):
    def candidates(self) -> list[CandidateMessage]: ...
    def set_state(self, message_id: str, state: str) -> None: ...


Classifier = Callable[[CandidateMessage], Classification]
CrmSync = Callable[[object], object]


@dataclass(frozen=True)
class MessageResult:
    message_id: str
    state: str
    detail: str


@dataclass
class RunReport:
    results: list[MessageResult] = field(default_factory=list)

    def count(self, state: str) -> int:
        return sum(item.state == state for item in self.results)

    def whatsapp_draft(self) -> str:
        lines = [
            "Passage Belloria terminé",
            f"Traités : {self.count('Traite')}",
            f"À revoir : {self.count('A-revoir')}",
            f"Erreurs : {self.count('Erreur')}",
        ]
        failures = [item for item in self.results if item.state in {"A-revoir", "Erreur"}]
        lines.extend(f"- {item.message_id}: {item.detail}" for item in failures)
        return "\n".join(lines)


class WorkAutomation:
    """One scheduled pass; adapters own remote reads, writes and retries."""

    def __init__(self, inbox: Inbox, classifier: Classifier, crm_sync: CrmSync) -> None:
        self.inbox = inbox
        self.classifier = classifier
        self.crm_sync = crm_sync

    def run_once(self) -> RunReport:
        report = RunReport()
        for message in sorted(self.inbox.candidates(), key=lambda item: item.internal_date):
            self.inbox.set_state(message.message_id, "En-cours")
            try:
                classification = self.classifier(message)
                result = self._apply(message, classification)
            except Exception as exc:
                detail = f"échec technique ({type(exc).__name__})"
                result = MessageResult(message.message_id, "Erreur", detail)
            self.inbox.set_state(message.message_id, result.state)
            report.results.append(result)
        return report

    def _apply(self, message: CandidateMessage, classification: Classification) -> MessageResult:
        if classification.outcome is Outcome.REVIEW:
            return MessageResult(message.message_id, "A-revoir", classification.reason)
        if classification.outcome is Outcome.OUT_OF_SCOPE:
            return MessageResult(message.message_id, "Traite", classification.reason)
        if classification.sync_request is None:
            return MessageResult(message.message_id, "A-revoir", "demande CRM absente")
        sync_result = self.crm_sync(classification.sync_request)
        replayed = bool(getattr(sync_result, "replayed", False))
        detail = "état Gmail réparé depuis le CRM" if replayed else classification.reason
        return MessageResult(message.message_id, "Traite", detail)


class MemoryInbox:
    def __init__(self, messages: list[CandidateMessage]) -> None:
        self.messages = messages
        self.states: dict[str, str] = {}
        self.transitions: list[tuple[str, str]] = []

    def candidates(self) -> list[CandidateMessage]:
        return list(self.messages)

    def set_state(self, message_id: str, state: str) -> None:
        self.states[message_id] = state
        self.transitions.append((message_id, state))
