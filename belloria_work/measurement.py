from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from statistics import mean, median
from typing import Callable, Iterable

from .context import ProspectContext
from .conversion import ConversionRecommendation, NextAction


@dataclass(frozen=True)
class CommercialJourney:
    opportunity_id: str
    requested_at: datetime
    first_response_at: datetime | None = None
    quote_sent_at: datetime | None = None
    confirmed_at: datetime | None = None
    lost_at: datetime | None = None
    sent_quote_amount: float | None = None
    invoiced_amount: float | None = None
    follow_up_count: int = 0
    loss_reason: str | None = None

    def __post_init__(self) -> None:
        ordered = (self.first_response_at, self.quote_sent_at, self.confirmed_at, self.lost_at)
        if any(value is not None and value < self.requested_at for value in ordered):
            raise ValueError("un jalon commercial ne peut pas précéder la demande")
        if self.sent_quote_amount is not None and self.quote_sent_at is None:
            raise ValueError("un montant potentiel exige un devis réellement envoyé")
        if self.confirmed_at is not None and self.quote_sent_at is None:
            raise ValueError("une confirmation commerciale exige un devis envoyé tracé")
        if self.invoiced_amount is not None and self.confirmed_at is None:
            raise ValueError("un montant réalisé exige une confirmation et une facture")
        if self.follow_up_count < 0:
            raise ValueError("le nombre de relances ne peut pas être négatif")


@dataclass(frozen=True)
class FunnelMetrics:
    requests: int
    responded: int
    quoted: int
    confirmed: int
    lost: int
    median_first_response_hours: float | None
    request_to_quote_rate: float | None
    quote_to_confirmation_rate: float | None
    average_sent_quote_amount: float | None
    average_invoiced_amount: float | None
    average_follow_ups: float | None
    loss_reasons: tuple[tuple[str, int], ...]
    missing_first_response: int
    losses_without_reason: int

    def notion_properties(self) -> dict[str, int | float | str | None]:
        return {
            "Demandes": self.requests,
            "Réponses tracées": self.responded,
            "Devis envoyés": self.quoted,
            "Confirmations": self.confirmed,
            "Pertes": self.lost,
            "Délai médian 1re réponse (h)": self.median_first_response_hours,
            "Taux demande → devis (%)": _percent(self.request_to_quote_rate),
            "Taux devis → confirmation (%)": _percent(self.quote_to_confirmation_rate),
            "Montant moyen devis envoyés (€)": self.average_sent_quote_amount,
            "Montant moyen facturé (€)": self.average_invoiced_amount,
            "Relances moyennes": self.average_follow_ups,
            "Motifs de perte": ", ".join(f"{reason}: {count}" for reason, count in self.loss_reasons),
            "Réponses manquantes": self.missing_first_response,
            "Pertes sans motif": self.losses_without_reason,
        }

    def telegram_briefing(self) -> str:
        response = _display_hours(self.median_first_response_hours)
        losses = ", ".join(f"{reason} ({count})" for reason, count in self.loss_reasons) or "aucun motif tracé"
        return (
            f"Conversion — {self.requests} demande(s)\n"
            f"Première réponse : médiane {response} · {self.missing_first_response} manquante(s)\n"
            f"Demande → devis : {_display_rate(self.request_to_quote_rate)} ({self.quoted}/{self.requests})\n"
            f"Devis → confirmation : {_display_rate(self.quote_to_confirmation_rate)} ({self.confirmed}/{self.quoted})\n"
            f"Montant moyen : devis {_display_money(self.average_sent_quote_amount)} · facturé {_display_money(self.average_invoiced_amount)}\n"
            f"Relances moyennes : {_display_number(self.average_follow_ups)} · Pertes : {losses}"
        )


def measure_funnel(journeys: Iterable[CommercialJourney]) -> FunnelMetrics:
    items = tuple(journeys)
    response_delays = [
        (item.first_response_at - item.requested_at).total_seconds() / 3600
        for item in items if item.first_response_at is not None
    ]
    quoted = [item for item in items if item.quote_sent_at is not None]
    confirmed = [item for item in quoted if item.confirmed_at is not None]
    lost = [item for item in items if item.lost_at is not None]
    reasons = Counter(item.loss_reason.strip() for item in lost if item.loss_reason and item.loss_reason.strip())
    quote_amounts = [item.sent_quote_amount for item in quoted if item.sent_quote_amount is not None]
    invoice_amounts = [item.invoiced_amount for item in confirmed if item.invoiced_amount is not None]
    return FunnelMetrics(
        requests=len(items), responded=len(response_delays), quoted=len(quoted), confirmed=len(confirmed), lost=len(lost),
        median_first_response_hours=_rounded(median(response_delays)) if response_delays else None,
        request_to_quote_rate=_ratio(len(quoted), len(items)),
        quote_to_confirmation_rate=_ratio(len(confirmed), len(quoted)),
        average_sent_quote_amount=_average(quote_amounts),
        average_invoiced_amount=_average(invoice_amounts),
        average_follow_ups=_average([item.follow_up_count for item in items]),
        loss_reasons=tuple(sorted(reasons.items(), key=lambda pair: (-pair[1], pair[0].casefold()))),
        missing_first_response=len(items) - len(response_delays),
        losses_without_reason=len(lost) - sum(reasons.values()),
    )


@dataclass(frozen=True)
class ReferenceCase:
    case_id: str
    context: ProspectContext
    expected_action: NextAction
    expected_offer: str | None
    expected_human_review: bool


@dataclass(frozen=True)
class CaseResult:
    case_id: str
    passed: bool
    differences: tuple[str, ...]


@dataclass(frozen=True)
class EvaluationReport:
    results: tuple[CaseResult, ...]

    @property
    def passed(self) -> int:
        return sum(item.passed for item in self.results)

    @property
    def reliability(self) -> float | None:
        return _ratio(self.passed, len(self.results))

    @property
    def safe_to_activate(self) -> bool:
        return bool(self.results) and self.passed == len(self.results)


def evaluate_recommendations(
    cases: Iterable[ReferenceCase], recommend: Callable[[ProspectContext], ConversionRecommendation]
) -> EvaluationReport:
    results = []
    for case in cases:
        actual = recommend(case.context)
        offer = actual.primary_offer.name if actual.primary_offer else None
        differences = []
        if actual.action is not case.expected_action:
            differences.append(f"action: attendu {case.expected_action.value}, obtenu {actual.action.value}")
        if offer != case.expected_offer:
            differences.append(f"offre: attendu {case.expected_offer or 'aucune'}, obtenu {offer or 'aucune'}")
        if actual.requires_human != case.expected_human_review:
            differences.append(f"revue humaine: attendu {case.expected_human_review}, obtenu {actual.requires_human}")
        results.append(CaseResult(case.case_id, not differences, tuple(differences)))
    return EvaluationReport(tuple(results))


def compare_candidate(baseline: EvaluationReport, candidate: EvaluationReport) -> tuple[str, ...]:
    baseline_by_id = {item.case_id: item for item in baseline.results}
    return tuple(
        item.case_id for item in candidate.results
        if item.case_id in baseline_by_id and baseline_by_id[item.case_id].passed and not item.passed
    )


def _ratio(numerator: int, denominator: int) -> float | None:
    return _rounded(numerator / denominator) if denominator else None


def _average(values: Iterable[float]) -> float | None:
    values = tuple(values)
    return _rounded(mean(values)) if values else None


def _rounded(value: float) -> float:
    return round(value, 2)


def _percent(value: float | None) -> float | None:
    return round(value * 100, 1) if value is not None else None


def _display_rate(value: float | None) -> str:
    return "non calculable" if value is None else f"{_percent(value):g} %"


def _display_hours(value: float | None) -> str:
    return "non calculable" if value is None else f"{value:g} h"


def _display_money(value: float | None) -> str:
    return "non calculable" if value is None else f"{value:,.2f} €".replace(",", " ")


def _display_number(value: float | None) -> str:
    return "non calculable" if value is None else f"{value:g}"
