from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import Iterable

from .context import ProspectContext, ResolvedFact


class CommercialStatus(str, Enum):
    VALIDATED = "Validé"
    TO_VALIDATE = "À valider"
    SUSPENDED = "Suspendu"


class NextAction(str, Enum):
    QUALIFY = "qualifier"
    PREPARE_QUOTE = "préparer_un_devis"
    FOLLOW_UP = "relancer"
    WAIT_DEPOSIT = "attendre_acompte"
    CONFIRM = "confirmer"
    HUMAN_DECISION = "décision_humaine"


@dataclass(frozen=True)
class CommercialOffer:
    name: str
    moments: tuple[str, ...]
    price: float | None
    unit: str | None
    status: CommercialStatus
    role: str = "core"
    keywords: tuple[str, ...] = ()
    incompatible_with: tuple[str, ...] = ()


@dataclass(frozen=True)
class Diagnostic:
    fit: str
    urgency: str
    completeness: str
    engagement: str
    value: str
    planning_risk: str


@dataclass(frozen=True)
class ConversionRecommendation:
    action: NextAction
    diagnostic: Diagnostic
    primary_offer: CommercialOffer | None
    upsells: tuple[CommercialOffer, ...]
    blocking_questions: tuple[str, ...]
    reasons: tuple[str, ...]
    uncertainties: tuple[str, ...]
    requires_human: bool
    draft: str | None


CORE_OFFERS = (
    CommercialOffer("Grazing Table Cocktail", ("cocktail", "apéritif", "vin d'honneur"), 18, "personne", CommercialStatus.VALIDATED, keywords=("cocktail", "apéritif", "vin d'honneur"), incompatible_with=("Bar Charcu'Bello",)),
    CommercialOffer("Grazing Table Menu", ("repas", "dîner", "déjeuner", "mariage"), 25, "personne", CommercialStatus.VALIDATED, keywords=("menu", "repas", "dîner", "déjeuner")),
    CommercialOffer("Brunch grazing", ("brunch", "lendemain"), 25, "personne", CommercialStatus.VALIDATED, keywords=("brunch", "lendemain")),
)

PROVEN_UPSELLS = (
    CommercialOffer("Mignardises sucrées", (), 5, "personne", CommercialStatus.VALIDATED, role="upsell", keywords=("sucré", "dessert", "mignardise")),
    CommercialOffer("Bar de bienvenue", (), 3, "personne", CommercialStatus.VALIDATED, role="upsell", keywords=("accueil", "bienvenue")),
    CommercialOffer("Cookie'Bello", (), 5, "unité", CommercialStatus.VALIDATED, role="upsell", keywords=("cookie", "dessert")),
    CommercialOffer("Bar à donuts", (), 3, "unité", CommercialStatus.VALIDATED, role="upsell", keywords=("donut", "animation sucrée")),
)

_BLOCKING_FIELDS = {
    "event_date": "Quelle est la date de l’événement ?",
    "location": "Où aura lieu l’événement ?",
    "guests": "Combien de convives sont prévus ?",
    "need": "Quel moment et quel besoin la prestation doit-elle couvrir ?",
}


class ConversionEngine:
    def __init__(self, offers: Iterable[CommercialOffer] = CORE_OFFERS + PROVEN_UPSELLS):
        self.offers = tuple(offers)

    def recommend(self, context: ProspectContext, *, today: date | None = None) -> ConversionRecommendation:
        today = today or date.today()
        text = self._searchable_text(context)
        questions = tuple(question for field, question in _BLOCKING_FIELDS.items() if not self._value(context, field))
        conflicts = self._truthy(self._value(context, "confirmed_same_day_events"))
        contradictions = tuple(warning for warning in context.warnings if warning.startswith("Contradiction"))
        primary = self._select_primary(text)
        requested_unvalidated = self._requested_unvalidated(text)
        upsells = self._select_upsells(text, primary)
        days = self._days_until(context, today)
        stage = str(self._value(context, "crm_stage") or "").casefold()
        attempts = int(self._value(context, "follow_up_attempts") or 0)

        uncertainties = list(context.warnings)
        if requested_unvalidated:
            uncertainties.append("Information commerciale non validée : " + ", ".join(requested_unvalidated))
        if primary is None:
            uncertainties.append("Aucune offre cœur validée ne correspond explicitement au besoin")
        if conflicts:
            uncertainties.append("Capacité à vérifier avec le planning confirmé")

        requires_human = bool(conflicts or contradictions or requested_unvalidated or (not questions and primary is None))
        action = self._action(stage, questions, requires_human, attempts)
        requires_human = requires_human or action is NextAction.HUMAN_DECISION
        reasons = self._reasons(action, primary, days, questions, conflicts, attempts)
        diagnostic = Diagnostic(
            fit="fort" if primary else "indéterminé",
            urgency="forte" if days is not None and days <= 14 else "normale" if days is not None else "inconnue",
            completeness="complète" if not questions else f"{len(questions)} information(s) bloquante(s)",
            engagement=self._engagement(stage),
            value=self._value_level(context),
            planning_risk="à vérifier" if conflicts else "non signalé",
        )
        draft = self._draft(context, action, primary, questions, conflicts)
        return ConversionRecommendation(action, diagnostic, primary, upsells, questions, tuple(reasons), tuple(dict.fromkeys(uncertainties)), requires_human, draft)

    def _select_primary(self, text: str) -> CommercialOffer | None:
        candidates = [offer for offer in self.offers if offer.role == "core" and offer.status is CommercialStatus.VALIDATED]
        scored = [(sum(keyword.casefold() in text for keyword in offer.keywords + offer.moments), offer) for offer in candidates]
        score, offer = max(scored, key=lambda item: item[0], default=(0, None))
        return offer if score else None

    def _select_upsells(self, text: str, primary: CommercialOffer | None) -> tuple[CommercialOffer, ...]:
        selected = []
        for offer in self.offers:
            if offer.role != "upsell" or offer.status is not CommercialStatus.VALIDATED:
                continue
            if any(keyword.casefold() in text for keyword in offer.keywords):
                if primary and (offer.name in primary.incompatible_with or primary.name in offer.incompatible_with):
                    continue
                selected.append(offer)
        return tuple(selected[:2])

    def _requested_unvalidated(self, text: str) -> tuple[str, ...]:
        return tuple(offer.name for offer in self.offers if offer.status is not CommercialStatus.VALIDATED and offer.name.casefold() in text)

    @staticmethod
    def _action(stage: str, questions: tuple[str, ...], requires_human: bool, attempts: int) -> NextAction:
        if requires_human:
            return NextAction.HUMAN_DECISION
        if questions:
            return NextAction.QUALIFY
        if "acompte" in stage:
            return NextAction.WAIT_DEPOSIT
        if "confirm" in stage:
            return NextAction.CONFIRM
        if "devis envoyé" in stage or "devis envoye" in stage:
            return NextAction.FOLLOW_UP if attempts < 2 else NextAction.HUMAN_DECISION
        return NextAction.PREPARE_QUOTE

    @staticmethod
    def _reasons(action: NextAction, primary: CommercialOffer | None, days: int | None, questions: tuple[str, ...], conflicts: bool, attempts: int) -> list[str]:
        reasons = [f"Action choisie : {action.value}"]
        if primary:
            reasons.append(f"{primary.name} correspond explicitement au moment demandé")
        if questions:
            reasons.append("Le devis exige encore des informations bloquantes")
        if days is not None:
            reasons.append(f"Événement dans {days} jour(s)")
        if conflicts:
            reasons.append("Un événement confirmé existe le même jour sans preuve de capacité restante")
        if attempts:
            reasons.append(f"{attempts} relance(s) déjà tracée(s)")
        return reasons

    @staticmethod
    def _draft(context: ProspectContext, action: NextAction, primary: CommercialOffer | None, questions: tuple[str, ...], conflicts: bool) -> str | None:
        if action is NextAction.HUMAN_DECISION:
            return None
        name = str(ConversionEngine._value(context, "name") or "Bonjour")
        greeting = f"Bonjour {name}," if name != "Bonjour" else "Bonjour,"
        if action is NextAction.QUALIFY:
            return greeting + " merci pour votre demande. Pour vous proposer une solution précise, pourriez-vous nous confirmer : " + " ".join(questions)
        if action is NextAction.FOLLOW_UP:
            return greeting + " je reviens vers vous au sujet de votre projet. Avez-vous pu consulter notre proposition et souhaitez-vous que nous l’ajustions ?"
        if action is NextAction.WAIT_DEPOSIT:
            return greeting + " votre projet est bien suivi. Nous restons disponibles si vous avez une question concernant les prochaines étapes."
        if action is NextAction.CONFIRM:
            return greeting + " merci pour votre confirmation. Nous vérifions les derniers détails opérationnels avec vous."
        if primary:
            caveat = " Sous réserve de vérification du planning." if conflicts else ""
            return greeting + f" pour votre projet, la formule {primary.name} nous paraît la plus adaptée.{caveat} Nous pouvons préparer une proposition détaillée à valider avec vous."
        return None

    @staticmethod
    def _value(context: ProspectContext, field: str):
        fact: ResolvedFact | None = context.facts.get(field)
        return fact.value if fact else None

    @staticmethod
    def _truthy(value) -> bool:
        return value not in (None, "", (), [], False, 0, "0", "aucun", "Aucun")

    @staticmethod
    def _searchable_text(context: ProspectContext) -> str:
        fields = ("event_type", "requested_services", "need", "last_commitment", "objections")
        return " ".join(str(ConversionEngine._value(context, field) or "") for field in fields).casefold()

    @staticmethod
    def _days_until(context: ProspectContext, today: date) -> int | None:
        value = ConversionEngine._value(context, "event_date")
        if isinstance(value, datetime):
            value = value.date()
        if isinstance(value, date):
            return (value - today).days
        if isinstance(value, str):
            try:
                return (date.fromisoformat(value) - today).days
            except ValueError:
                return None
        return None

    @staticmethod
    def _engagement(stage: str) -> str:
        if any(word in stage for word in ("confirm", "acompte")):
            return "fort"
        if "devis" in stage:
            return "moyen"
        return "initial"

    @staticmethod
    def _value_level(context: ProspectContext) -> str:
        facts = (context.financial.actual_revenue, context.financial.quote, context.financial.estimate)
        amount = next((fact.value for fact in facts if fact is not None), None)
        if not isinstance(amount, (int, float)):
            return "inconnue"
        return "élevée" if amount >= 2000 else "moyenne" if amount >= 750 else "standard"
