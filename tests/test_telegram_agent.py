import unittest
from datetime import datetime, timedelta, timezone

from belloria_work.context import ContextBuilder, Evidence, EvidenceKind
from belloria_work.telegram_agent import Intent, ProspectMatch, TelegramSalesAgent


NOW = datetime(2026, 8, 5, 10, tzinfo=timezone.utc)


def context(**overrides):
    values = {
        "name": "Élodie", "email": "elodie@example.test", "phone": "0600000000",
        "source": "Tally", "event_type": "Mariage", "event_date": "2026-10-03",
        "location": "Toulouse", "schedule": "18h", "guests": 80,
        "requested_services": "Cocktail", "need": "Cocktail pour le vin d'honneur",
        "crm_stage": "Nouveau", "owner": "Cyndy", "last_commitment": "Attend une proposition",
        "objections": "", "next_action": "Répondre", "next_deadline": "2026-08-06",
        "confirmed_same_day_events": 0,
    }
    values.update(overrides)
    return ContextBuilder().build(Evidence(k, v, EvidenceKind.CRM_HUMAN, NOW, f"crm:{k}") for k, v in values.items())


class TelegramSalesAgentTests(unittest.TestCase):
    def setUp(self):
        self.executed = []
        self.matches = [ProspectMatch("p-1", "Élodie — mariage du 3 octobre")]
        self.now = NOW
        self.agent = TelegramSalesAgent(
            resolve_prospect=lambda _query: self.matches,
            load_context=lambda _prospect_id: context(),
            execute_action=lambda action: self.executed.append(action) or "brouillon crm-42 créé",
            general_query=lambda intent: {Intent.PRIORITIES: "5 priorités", Intent.PLANNING: "Planning du jour", Intent.REVENUE: "CA prouvé"}[intent],
            token_factory=lambda: "abc123",
            clock=lambda: self.now,
        )

    def test_consultation_loads_context_without_mutation(self):
        reply = self.agent.handle("7001", "Résume Élodie")
        self.assertIn("Mariage", reply.text)
        self.assertIn("préparer_un_devis", reply.text)
        self.assertTrue(reply.completed)
        self.assertEqual([], self.executed)

    def test_voice_transcript_uses_the_same_command_path(self):
        reply = self.agent.handle("voice-7001", "Que lui proposer Élodie ?")
        self.assertIn("Grazing Table Cocktail", reply.text)
        self.assertEqual([], self.executed)

    def test_ambiguous_resolution_never_loads_or_mutates(self):
        self.matches = [ProspectMatch("p-1", "Élodie A"), ProspectMatch("p-2", "Élodie B")]
        reply = self.agent.handle("7002", "Que lui proposer Élodie ?")
        self.assertIn("Plusieurs prospects", reply.text)
        self.assertEqual([], self.executed)

    def test_mutation_exposes_scope_and_waits_for_confirmation(self):
        reply = self.agent.handle("7003", "Prépare le devis Élodie")
        self.assertFalse(reply.completed)
        self.assertIn("Contenu exact", reply.text)
        self.assertIn("CONFIRMER ABC123", reply.text)
        self.assertIn("crm:name", reply.text)
        self.assertEqual([], self.executed)
        confirmed = self.agent.handle("7004", "CONFIRMER ABC123")
        self.assertTrue(confirmed.executed)
        self.assertIn("brouillon crm-42 créé", confirmed.text)
        self.assertEqual(1, len(self.executed))

    def test_confirmation_is_single_use(self):
        self.agent.handle("7003", "Prépare une réponse Élodie")
        self.agent.handle("7004", "CONFIRMER ABC123")
        replay = self.agent.handle("7005", "CONFIRMER ABC123")
        self.assertFalse(replay.executed)
        self.assertEqual(1, len(self.executed))

    def test_expired_confirmation_executes_nothing(self):
        self.agent.handle("7003", "Relance Élodie")
        self.now = NOW + timedelta(minutes=11)
        reply = self.agent.handle("7004", "CONFIRMER ABC123")
        self.assertIn("expirée", reply.text)
        self.assertEqual([], self.executed)

    def test_general_queries_do_not_require_a_prospect(self):
        self.assertEqual("5 priorités", self.agent.handle("1", "Mes priorités").text)
        self.assertEqual("Planning du jour", self.agent.handle("2", "Mon planning du jour").text)
        self.assertEqual("CA prouvé", self.agent.handle("3", "Où en est le CA ?").text)
        self.assertEqual([], self.executed)

    def test_planning_conflict_blocks_quote_preparation(self):
        self.agent.load_context = lambda _prospect_id: context(confirmed_same_day_events=1)
        reply = self.agent.handle("7006", "Prépare le devis Élodie")
        self.assertIn("Décision humaine requise", reply.text)
        self.assertIsNone(reply.proposed_action)
        self.assertEqual([], self.executed)


if __name__ == "__main__":
    unittest.main()
