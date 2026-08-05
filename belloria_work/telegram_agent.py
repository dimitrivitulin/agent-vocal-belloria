from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from secrets import token_urlsafe
from typing import Callable, Protocol

from .context import ProspectContext
from .conversion import ConversionEngine, ConversionRecommendation


class Intent(str, Enum):
    PRIORITIES = "priorities"
    SUMMARY = "summary"
    RECOMMENDATION = "recommendation"
    PREPARE_REPLY = "prepare_reply"
    PREPARE_QUOTE = "prepare_quote"
    FOLLOW_UP = "follow_up"
    PLANNING = "planning"
    REVENUE = "revenue"
    CONFIRM = "confirm"


MUTATING_INTENTS = {Intent.PREPARE_REPLY, Intent.PREPARE_QUOTE, Intent.FOLLOW_UP}


@dataclass(frozen=True)
class ProspectMatch:
    prospect_id: str
    label: str


@dataclass(frozen=True)
class ParsedCommand:
    intent: Intent
    prospect_query: str | None = None
    confirmation_token: str | None = None


@dataclass(frozen=True)
class ProposedAction:
    token: str
    command_id: str
    prospect: ProspectMatch
    intent: Intent
    content: str
    consequence: str
    sources: tuple[str, ...]
    expires_at: datetime


@dataclass(frozen=True)
class AgentReply:
    text: str
    completed: bool
    proposed_action: ProposedAction | None = None
    executed: bool = False


class ApprovalStore(Protocol):
    def put(self, action: ProposedAction) -> None: ...
    def pop(self, token: str) -> ProposedAction | None: ...


class MemoryApprovalStore:
    def __init__(self) -> None:
        self.actions: dict[str, ProposedAction] = {}

    def put(self, action: ProposedAction) -> None:
        self.actions[action.token] = action

    def pop(self, token: str) -> ProposedAction | None:
        return self.actions.pop(token, None)


class TelegramCommandParser:
    """Deterministic edge parser; it may be replaced by a language adapter."""

    def parse(self, text: str) -> ParsedCommand:
        normalized = " ".join(text.strip().casefold().split())
        if normalized.startswith("confirmer "):
            return ParsedCommand(Intent.CONFIRM, confirmation_token=normalized.split(" ", 1)[1].upper())
        if "priorit" in normalized:
            return ParsedCommand(Intent.PRIORITIES)
        if "planning" in normalized:
            return ParsedCommand(Intent.PLANNING)
        if "ca" in normalized or "chiffre d'affaire" in normalized:
            return ParsedCommand(Intent.REVENUE)
        patterns = (
            (Intent.PREPARE_QUOTE, ("prépare le devis", "prepare le devis")),
            (Intent.PREPARE_REPLY, ("prépare une réponse", "prepare une reponse")),
            (Intent.FOLLOW_UP, ("relance",)),
            (Intent.SUMMARY, ("résume", "resume")),
            (Intent.RECOMMENDATION, ("proposer", "recommande", "que lui")),
        )
        for intent, markers in patterns:
            for marker in markers:
                if marker in normalized:
                    query = normalized.split(marker, 1)[1].strip(" ?.:,-") or None
                    return ParsedCommand(intent, query)
        raise ValueError("commande non reconnue")


class TelegramSalesAgent:
    def __init__(self, *, resolve_prospect: Callable[[str], list[ProspectMatch]],
                 load_context: Callable[[str], ProspectContext],
                 execute_action: Callable[[ProposedAction], str],
                 general_query: Callable[[Intent], str],
                 approvals: ApprovalStore | None = None,
                 conversion: ConversionEngine | None = None,
                 parser: TelegramCommandParser | None = None,
                 token_factory: Callable[[], str] = lambda: token_urlsafe(9),
                 clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc)) -> None:
        self.resolve_prospect = resolve_prospect
        self.load_context = load_context
        self.execute_action = execute_action
        self.general_query = general_query
        self.approvals = approvals or MemoryApprovalStore()
        self.conversion = conversion or ConversionEngine()
        self.parser = parser or TelegramCommandParser()
        self.token_factory = token_factory
        self.clock = clock

    def handle(self, command_id: str, text: str) -> AgentReply:
        try:
            command = self.parser.parse(text)
        except ValueError:
            return AgentReply("Commande non reconnue. Précisez le prospect et l’action souhaitée.", True)
        if command.intent is Intent.CONFIRM:
            return self._confirm(command.confirmation_token or "")
        if command.intent in {Intent.PRIORITIES, Intent.PLANNING, Intent.REVENUE}:
            return AgentReply(self.general_query(command.intent), True)
        if not command.prospect_query:
            return AgentReply("Quel prospect dois-je utiliser ?", True)
        matches = self.resolve_prospect(command.prospect_query)
        if not matches:
            return AgentReply("Aucun prospect trouvé. Donnez un nom, un email ou l’événement.", True)
        if len(matches) != 1:
            labels = ", ".join(item.label for item in matches[:5])
            return AgentReply(f"Plusieurs prospects correspondent : {labels}. Précisez lequel.", True)
        prospect = matches[0]
        context = self.load_context(prospect.prospect_id)
        recommendation = self.conversion.recommend(context, today=self.clock().date())
        if command.intent is Intent.SUMMARY:
            return AgentReply(self._summary(prospect, context, recommendation), True)
        if command.intent is Intent.RECOMMENDATION:
            return AgentReply(self._recommendation(prospect, recommendation), True)
        return self._propose(command_id, command.intent, prospect, context, recommendation)

    def _propose(self, command_id: str, intent: Intent, prospect: ProspectMatch,
                 context: ProspectContext, recommendation: ConversionRecommendation) -> AgentReply:
        if intent not in MUTATING_INTENTS:
            return AgentReply("Action non prise en charge.", True)
        if recommendation.requires_human:
            return AgentReply(self._recommendation(prospect, recommendation) + "\nDécision humaine requise : aucune action préparée.", True)
        if intent is Intent.PREPARE_QUOTE:
            offer = recommendation.primary_offer.name if recommendation.primary_offer else "offre à valider"
            content = f"Préparer un devis {offer} pour {prospect.label}"
        else:
            content = recommendation.draft or f"Préparer {intent.value} pour {prospect.label}"
        consequence = {
            Intent.PREPARE_REPLY: "Créer un brouillon de réponse, sans l’envoyer.",
            Intent.PREPARE_QUOTE: "Passer le dossier en devis à préparer, sans envoyer de devis.",
            Intent.FOLLOW_UP: "Créer un brouillon de relance, sans l’envoyer.",
        }[intent]
        sources = self._sources(context)
        action = ProposedAction(self.token_factory().upper(), command_id, prospect, intent, content,
                                consequence, sources, self.clock() + timedelta(minutes=10))
        self.approvals.put(action)
        source_text = ", ".join(sources) or "aucune source traçable"
        text = (f"Action proposée pour {prospect.label}\nSources : {source_text}\n"
                f"Contenu exact : {content}\nConséquence : {consequence}\n"
                f"Pour approuver : CONFIRMER {action.token}")
        return AgentReply(text, False, action)

    def _confirm(self, token: str) -> AgentReply:
        action = self.approvals.pop(token)
        if action is None:
            return AgentReply("Confirmation inconnue ou déjà utilisée. Aucune action exécutée.", True)
        if self.clock() > action.expires_at:
            return AgentReply("Confirmation expirée. Aucune action exécutée ; reformulez la demande.", True)
        receipt = self.execute_action(action)
        return AgentReply(f"Action exécutée pour {action.prospect.label}. Compte rendu : {receipt}", True, executed=True)

    @staticmethod
    def _sources(context: ProspectContext) -> tuple[str, ...]:
        return tuple(dict.fromkeys(fact.evidence.source_id for fact in context.facts.values()))

    @staticmethod
    def _summary(prospect: ProspectMatch, context: ProspectContext, recommendation: ConversionRecommendation) -> str:
        def value(field: str):
            return context.facts[field].value if field in context.facts else "inconnu"
        warnings = "; ".join(context.warnings) or "aucune"
        return (f"{prospect.label} — {value('event_type')} le {value('event_date')}, "
                f"{value('guests')} convives à {value('location')}. Étape : {value('crm_stage')}. "
                f"Blocage : {warnings}. Action recommandée : {recommendation.action.value}.")

    @staticmethod
    def _recommendation(prospect: ProspectMatch, recommendation: ConversionRecommendation) -> str:
        offer = recommendation.primary_offer.name if recommendation.primary_offer else "aucune offre validée"
        reasons = "; ".join(recommendation.reasons)
        uncertainties = "; ".join(recommendation.uncertainties) or "aucune"
        return (f"{prospect.label} — offre : {offer}. Action : {recommendation.action.value}. "
                f"Raisons : {reasons}. Incertitudes : {uncertainties}.")
