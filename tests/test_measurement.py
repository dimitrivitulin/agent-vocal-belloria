import unittest
from datetime import datetime, timedelta, timezone

from belloria_work.context import ContextBuilder, Evidence, EvidenceKind
from belloria_work.conversion import ConversionEngine, NextAction
from belloria_work.measurement import (
    CommercialJourney, ReferenceCase, compare_candidate, evaluate_recommendations, measure_funnel,
)


NOW = datetime(2026, 8, 5, tzinfo=timezone.utc)


def context(**overrides):
    values = dict(name="Alice", event_type="Mariage", event_date="2026-10-03", location="Toulouse",
                  guests=80, requested_services="Cocktail", need="Cocktail", crm_stage="Nouveau",
                  confirmed_same_day_events=0)
    values.update(overrides)
    evidence = [Evidence(key, value, EvidenceKind.CRM_HUMAN, NOW, f"crm:{key}") for key, value in values.items() if value is not None]
    return ContextBuilder().build(evidence)


class FunnelMeasurementTests(unittest.TestCase):
    def test_measures_funnel_amounts_and_data_quality(self):
        journeys = [
            CommercialJourney("a", NOW, NOW + timedelta(hours=2), NOW + timedelta(days=1),
                              NOW + timedelta(days=3), sent_quote_amount=1000, invoiced_amount=900, follow_up_count=1),
            CommercialJourney("b", NOW, NOW + timedelta(hours=6), NOW + timedelta(days=2),
                              lost_at=NOW + timedelta(days=4), sent_quote_amount=2000, follow_up_count=2, loss_reason="Budget"),
            CommercialJourney("c", NOW, lost_at=NOW + timedelta(days=1)),
        ]
        metrics = measure_funnel(journeys)
        self.assertEqual(4, metrics.median_first_response_hours)
        self.assertEqual(0.67, metrics.request_to_quote_rate)
        self.assertEqual(0.5, metrics.quote_to_confirmation_rate)
        self.assertEqual(1500, metrics.average_sent_quote_amount)
        self.assertEqual(900, metrics.average_invoiced_amount)
        self.assertEqual((('Budget', 1),), metrics.loss_reasons)
        self.assertEqual((1, 1), (metrics.missing_first_response, metrics.losses_without_reason))

    def test_empty_population_is_explicitly_not_calculable(self):
        metrics = measure_funnel([])
        self.assertIsNone(metrics.request_to_quote_rate)
        self.assertIn("non calculable", metrics.telegram_briefing())
        self.assertIsNone(metrics.notion_properties()["Taux demande → devis (%)"])

    def test_rejects_amount_without_required_commercial_proof(self):
        with self.assertRaises(ValueError):
            CommercialJourney("a", NOW, sent_quote_amount=1000)
        with self.assertRaises(ValueError):
            CommercialJourney("b", NOW, invoiced_amount=1000)
        with self.assertRaises(ValueError):
            CommercialJourney("c", NOW, confirmed_at=NOW + timedelta(days=1))

    def test_notion_and_telegram_outputs_expose_core_indicators(self):
        metrics = measure_funnel([CommercialJourney("a", NOW, NOW + timedelta(hours=1))])
        self.assertEqual(1, metrics.notion_properties()["Demandes"])
        self.assertIn("Demande → devis", metrics.telegram_briefing())


class RecommendationEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.cases = (
            ReferenceCase("cocktail-complet", context(), NextAction.PREPARE_QUOTE, "Grazing Table Cocktail", False),
            ReferenceCase("lieu-manquant", context(location=None), NextAction.QUALIFY, "Grazing Table Cocktail", False),
            ReferenceCase("collision", context(confirmed_same_day_events=1), NextAction.HUMAN_DECISION, "Grazing Table Cocktail", True),
        )

    def test_reference_suite_must_be_complete_before_activation(self):
        report = evaluate_recommendations(self.cases, ConversionEngine().recommend)
        self.assertEqual(1, report.reliability)
        self.assertTrue(report.safe_to_activate)

    def test_candidate_regression_identifies_case_and_difference(self):
        baseline = evaluate_recommendations(self.cases, ConversionEngine().recommend)
        changed = list(self.cases)
        changed[0] = ReferenceCase("cocktail-complet", context(), NextAction.FOLLOW_UP, "Grazing Table Cocktail", False)
        candidate = evaluate_recommendations(changed, ConversionEngine().recommend)
        self.assertEqual(("cocktail-complet",), compare_candidate(baseline, candidate))
        self.assertIn("action", candidate.results[0].differences[0])
        self.assertFalse(candidate.safe_to_activate)


if __name__ == "__main__":
    unittest.main()
