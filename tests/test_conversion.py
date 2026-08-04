import unittest
from datetime import date, datetime, timezone

from belloria_work.context import ContextBuilder, Evidence, EvidenceKind
from belloria_work.conversion import (
    CommercialOffer,
    CommercialStatus,
    ConversionEngine,
    NextAction,
)


NOW = datetime(2026, 8, 5, tzinfo=timezone.utc)


def context(**values):
    defaults = {
        "name": "Élodie",
        "email": "elodie@example.test",
        "phone": "0600000000",
        "source": "Tally",
        "event_type": "Mariage",
        "event_date": "2026-10-03",
        "location": "Toulouse",
        "schedule": "18h",
        "guests": 80,
        "requested_services": "Cocktail et mignardises sucrées",
        "need": "Un cocktail pour le vin d'honneur avec une touche sucrée",
        "crm_stage": "Nouveau",
        "owner": "Cyndy",
        "last_commitment": "Souhaite recevoir une proposition",
        "objections": "",
        "next_action": "Répondre",
        "next_deadline": "2026-08-06",
        "confirmed_same_day_events": 0,
    }
    defaults.update(values)
    evidence = [Evidence(field, value, EvidenceKind.CRM_HUMAN, NOW, f"crm:{field}") for field, value in defaults.items() if value is not None]
    return ContextBuilder().build(evidence)


class ConversionEngineTests(unittest.TestCase):
    def test_recommends_validated_core_offer_and_relevant_upsell(self):
        result = ConversionEngine().recommend(context(), today=date(2026, 8, 5))
        self.assertEqual(NextAction.PREPARE_QUOTE, result.action)
        self.assertEqual("Grazing Table Cocktail", result.primary_offer.name)
        self.assertEqual(("Mignardises sucrées",), tuple(item.name for item in result.upsells))
        self.assertFalse(result.requires_human)
        self.assertIn("18", str(result.primary_offer.price))

    def test_asks_only_blocking_questions_before_quote(self):
        result = ConversionEngine().recommend(context(location=None, guests=None))
        self.assertEqual(NextAction.QUALIFY, result.action)
        self.assertEqual(2, len(result.blocking_questions))
        self.assertIn("Où", result.draft)
        self.assertNotIn("disponible", result.draft.casefold())

    def test_same_day_event_escalates_without_promising_availability(self):
        result = ConversionEngine().recommend(context(confirmed_same_day_events=1))
        self.assertEqual(NextAction.HUMAN_DECISION, result.action)
        self.assertTrue(result.requires_human)
        self.assertIsNone(result.draft)
        self.assertEqual("à vérifier", result.diagnostic.planning_risk)

    def test_sent_quote_is_followed_up_but_repeated_attempts_escalate(self):
        first = ConversionEngine().recommend(context(crm_stage="Devis envoyé", follow_up_attempts=1))
        repeated = ConversionEngine().recommend(context(crm_stage="Devis envoyé", follow_up_attempts=2))
        self.assertEqual(NextAction.FOLLOW_UP, first.action)
        self.assertEqual(NextAction.HUMAN_DECISION, repeated.action)
        self.assertTrue(repeated.requires_human)
        self.assertIsNone(repeated.draft)

    def test_unvalidated_requested_offer_is_never_recommended_or_priced(self):
        unknown = CommercialOffer("Atelier burrata", (), 12, "personne", CommercialStatus.TO_VALIDATE, keywords=("burrata",))
        result = ConversionEngine((*ConversionEngine().offers, unknown)).recommend(
            context(requested_services="Cocktail et Atelier burrata", need="Cocktail avec atelier burrata")
        )
        self.assertEqual("Grazing Table Cocktail", result.primary_offer.name)
        self.assertNotIn("Atelier burrata", tuple(item.name for item in result.upsells))
        self.assertEqual(NextAction.HUMAN_DECISION, result.action)
        self.assertTrue(any("non validée" in item for item in result.uncertainties))

    def test_unknown_core_need_escalates_instead_of_inventing_an_offer(self):
        result = ConversionEngine().recommend(context(event_type="Animation", requested_services="Fontaine à chocolat", need="Animation chocolat"))
        self.assertIsNone(result.primary_offer)
        self.assertEqual(NextAction.HUMAN_DECISION, result.action)
        self.assertIsNone(result.draft)

    def test_brunch_alone_is_not_overloaded_with_automatic_upsells(self):
        result = ConversionEngine().recommend(context(event_type="Brunch", requested_services="Brunch", need="Brunch du lendemain"))
        self.assertEqual("Brunch grazing", result.primary_offer.name)
        self.assertEqual((), result.upsells)


if __name__ == "__main__":
    unittest.main()
