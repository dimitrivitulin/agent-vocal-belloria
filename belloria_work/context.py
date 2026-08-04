from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Iterable


class EvidenceKind(str, Enum):
    CRM_HUMAN = "crm_human"
    INVOICE = "invoice"
    SENT_QUOTE = "sent_quote"
    PROSPECT_MESSAGE = "prospect_message"
    TALLY_SUBMISSION = "tally_submission"
    CRM_AUTOMATION = "crm_automation"
    INFERENCE = "inference"


_AUTHORITY = {
    EvidenceKind.CRM_HUMAN: 70,
    EvidenceKind.INVOICE: 60,
    EvidenceKind.SENT_QUOTE: 50,
    EvidenceKind.PROSPECT_MESSAGE: 40,
    EvidenceKind.TALLY_SUBMISSION: 30,
    EvidenceKind.CRM_AUTOMATION: 20,
    EvidenceKind.INFERENCE: 10,
}


@dataclass(frozen=True)
class Evidence:
    field: str
    value: Any
    kind: EvidenceKind
    observed_at: datetime
    source_id: str
    url: str | None = None
    note: str | None = None


@dataclass(frozen=True)
class ResolvedFact:
    field: str
    value: Any
    evidence: Evidence
    alternatives: tuple[Evidence, ...] = ()

    @property
    def conflicted(self) -> bool:
        return bool(self.alternatives)


@dataclass(frozen=True)
class FinancialContext:
    estimate: ResolvedFact | None = None
    quote: ResolvedFact | None = None
    actual_revenue: ResolvedFact | None = None
    deposit: ResolvedFact | None = None


@dataclass(frozen=True)
class ProspectContext:
    facts: dict[str, ResolvedFact]
    financial: FinancialContext
    unknowns: tuple[str, ...]
    warnings: tuple[str, ...]
    timeline: tuple[Evidence, ...]


IDENTITY_AND_EVENT_FIELDS = (
    "name", "email", "phone", "source", "event_type", "event_date",
    "location", "schedule", "guests", "requested_services", "need",
)
COMMERCIAL_FIELDS = (
    "crm_stage", "owner", "last_commitment", "objections", "next_action",
    "next_deadline", "confirmed_same_day_events",
)


def conversation_key(source: str, message_id: str, thread_id: str | None) -> str:
    """Return the safe lookup key; a Tally notification is always its own case."""
    if not message_id.strip():
        raise ValueError("message_id is required")
    if source.strip().casefold() == "tally":
        return f"message:{message_id}"
    return f"thread:{thread_id}" if thread_id else f"message:{message_id}"


class ContextBuilder:
    def build(self, evidence: Iterable[Evidence]) -> ProspectContext:
        items = tuple(evidence)
        grouped: dict[str, list[Evidence]] = {}
        for item in items:
            if not item.source_id.strip():
                raise ValueError("every evidence item needs a source_id")
            grouped.setdefault(item.field, []).append(item)

        facts = {name: self._resolve(name, values) for name, values in grouped.items()}
        financial = FinancialContext(
            estimate=self._allowed(facts.get("estimated_amount"), {EvidenceKind.TALLY_SUBMISSION, EvidenceKind.CRM_HUMAN, EvidenceKind.CRM_AUTOMATION}),
            quote=self._allowed(facts.get("quote_amount"), {EvidenceKind.SENT_QUOTE}),
            actual_revenue=self._allowed(facts.get("actual_revenue"), {EvidenceKind.INVOICE}),
            deposit=self._allowed(facts.get("deposit_amount"), {EvidenceKind.INVOICE, EvidenceKind.CRM_HUMAN}),
        )

        required = IDENTITY_AND_EVENT_FIELDS + COMMERCIAL_FIELDS
        unknowns = tuple(name for name in required if name not in facts or facts[name].value in (None, "", ()))
        warnings = [f"Contradiction à vérifier : {fact.field}" for fact in facts.values() if fact.conflicted]
        for name, raw, accepted in (
            ("montant du devis", facts.get("quote_amount"), financial.quote),
            ("CA effectif", facts.get("actual_revenue"), financial.actual_revenue),
        ):
            if raw and not accepted:
                warnings.append(f"{name} ignoré : preuve financière insuffisante")
        timeline = tuple(sorted(items, key=lambda item: item.observed_at))
        return ProspectContext(facts, financial, unknowns, tuple(warnings), timeline)

    @staticmethod
    def _resolve(field: str, evidence: list[Evidence]) -> ResolvedFact:
        ordered = sorted(evidence, key=lambda item: (_AUTHORITY[item.kind], item.observed_at), reverse=True)
        winner = ordered[0]
        alternatives = tuple(item for item in ordered[1:] if item.value != winner.value)
        return ResolvedFact(field, winner.value, winner, alternatives)

    @staticmethod
    def _allowed(fact: ResolvedFact | None, kinds: set[EvidenceKind]) -> ResolvedFact | None:
        return fact if fact and fact.evidence.kind in kinds else None
