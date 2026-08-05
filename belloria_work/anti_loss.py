from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import IntEnum
from typing import Iterable, Protocol


class Priority(IntEnum):
    CRITICAL = 0
    HIGH = 1
    NORMAL = 2


@dataclass(frozen=True)
class FollowUpOpportunity:
    opportunity_id: str
    label: str
    status: str
    created_at: datetime
    last_prospect_message_at: datetime | None = None
    last_belloria_message_at: datetime | None = None
    quote_sent_at: datetime | None = None
    deposit_due_at: date | None = None
    deposit_received: bool = False
    event_date: date | None = None
    next_action: str | None = None
    next_deadline: date | None = None
    confirmed_same_day_events: tuple[str, ...] = ()
    emitted_alert_keys: frozenset[str] = field(default_factory=frozenset)


@dataclass(frozen=True)
class Alert:
    key: str
    opportunity_id: str
    label: str
    kind: str
    priority: Priority
    reason: str
    action: str
    deadline: date


@dataclass(frozen=True)
class CrmUpdate:
    opportunity_id: str
    next_action: str
    next_deadline: date
    alert_key: str


@dataclass(frozen=True)
class FollowUpPlan:
    alerts: tuple[Alert, ...]
    updates: tuple[CrmUpdate, ...]

    def telegram_briefing(self) -> str | None:
        if not self.alerts:
            return None
        lines = [f"Suivi Belloria — {len(self.alerts)} anomalie(s)"]
        labels = {Priority.CRITICAL: "URGENT", Priority.HIGH: "HAUTE", Priority.NORMAL: "NORMALE"}
        for alert in self.alerts:
            lines.append(f"- [{labels[alert.priority]}] {alert.label}: {alert.reason} → {alert.action} ({alert.deadline.isoformat()})")
        return "\n".join(lines)


class FollowUpGateway(Protocol):
    def active_opportunities(self) -> Iterable[FollowUpOpportunity]: ...
    def apply_follow_up(self, update: CrmUpdate) -> bool: ...


@dataclass(frozen=True)
class FollowUpRun:
    briefing: str | None
    updated: int
    alerts: int


TERMINAL_STATUSES = frozenset({"Gagné", "Perdu"})


class AntiLossEngine:
    """Plan the hourly CRM follow-up pass without performing remote writes."""

    def __init__(self, now: datetime) -> None:
        self.now = now
        self.today = now.date()

    def plan(self, opportunities: Iterable[FollowUpOpportunity]) -> FollowUpPlan:
        alerts: list[Alert] = []
        updates: list[CrmUpdate] = []
        for opportunity in opportunities:
            if opportunity.status in TERMINAL_STATUSES:
                continue
            alert = self._detect(opportunity)
            is_new_alert = bool(alert and alert.key not in opportunity.emitted_alert_keys)
            if is_new_alert:
                alerts.append(alert)
            desired = alert or self._fallback(opportunity)
            if is_new_alert or self._needs_update(opportunity, desired):
                updates.append(CrmUpdate(opportunity.opportunity_id, desired.action, desired.deadline, desired.key))
        alerts.sort(key=lambda item: (item.priority, item.deadline, item.label.casefold(), item.opportunity_id))
        updates.sort(key=lambda item: item.opportunity_id)
        return FollowUpPlan(tuple(alerts), tuple(updates))

    def _detect(self, item: FollowUpOpportunity) -> Alert | None:
        if item.event_date and item.event_date < self.today:
            return self._alert(item, "event_past", Priority.CRITICAL, "événement passé sans clôture", "Vérifier puis clôturer le dossier", self.today, item.event_date)
        if item.confirmed_same_day_events and item.event_date and item.event_date >= self.today:
            return self._alert(item, "confirmed_collision", Priority.CRITICAL, "collision avec une prestation confirmée", "Faire arbitrer la capacité", self.today, item.event_date)
        if item.event_date and item.event_date <= self.today + timedelta(days=7):
            return self._alert(item, "event_near", Priority.HIGH, "événement dans moins de 7 jours", "Valider les derniers détails", self.today, item.event_date)
        if item.deposit_due_at and not item.deposit_received and item.deposit_due_at <= self.today:
            return self._alert(item, "deposit_due", Priority.HIGH, "acompte attendu", "Vérifier ou relancer l’acompte", self.today, item.deposit_due_at)
        if item.quote_sent_at and not self._prospect_replied_since(item.quote_sent_at, item) and item.quote_sent_at.date() <= self.today - timedelta(days=3):
            return self._alert(item, "silent_quote", Priority.HIGH, "devis sans réponse depuis 3 jours", "Relancer le devis", self.today, item.quote_sent_at.date())
        reference = item.last_prospect_message_at or item.created_at
        if not item.last_belloria_message_at or item.last_belloria_message_at < reference:
            if reference.date() <= self.today - timedelta(days=1):
                return self._alert(item, "unanswered_request", Priority.HIGH, "demande sans réponse depuis 1 jour", "Répondre au prospect", self.today, reference.date())
        if item.next_deadline and item.next_deadline <= self.today:
            return self._alert(item, "follow_up_due", Priority.NORMAL, "relance échue", item.next_action or "Relancer le prospect", self.today, item.next_deadline)
        return None

    @staticmethod
    def _prospect_replied_since(reference: datetime, item: FollowUpOpportunity) -> bool:
        return bool(item.last_prospect_message_at and item.last_prospect_message_at > reference)

    def _fallback(self, item: FollowUpOpportunity) -> Alert:
        deadline = item.next_deadline or self.today + timedelta(days=1)
        action = item.next_action or "Examiner et définir la prochaine action"
        return self._alert(item, "missing_next_action", Priority.NORMAL, "suivi à compléter", action, deadline)

    @staticmethod
    def _needs_update(item: FollowUpOpportunity, desired: Alert) -> bool:
        return item.next_action != desired.action or item.next_deadline != desired.deadline

    @staticmethod
    def _alert(item: FollowUpOpportunity, kind: str, priority: Priority, reason: str, action: str, deadline: date, occurrence: date | None = None) -> Alert:
        key = f"{item.opportunity_id}:{kind}:{(occurrence or deadline).isoformat()}"
        return Alert(key, item.opportunity_id, item.label, kind, priority, reason, action, deadline)


class AntiLossLoop:
    """Apply a plan through an adapter that atomically stores action, date and alert key."""

    def __init__(self, gateway: FollowUpGateway, now: datetime) -> None:
        self.gateway = gateway
        self.engine = AntiLossEngine(now)

    def run_once(self) -> FollowUpRun:
        plan = self.engine.plan(self.gateway.active_opportunities())
        updated = sum(bool(self.gateway.apply_follow_up(update)) for update in plan.updates)
        return FollowUpRun(plan.telegram_briefing(), updated, len(plan.alerts))
