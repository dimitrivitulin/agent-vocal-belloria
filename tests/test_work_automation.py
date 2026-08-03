import unittest
from types import SimpleNamespace

from belloria_work import CandidateMessage, Classification, MemoryInbox, Outcome, WorkAutomation


def message(message_id, date):
    return CandidateMessage(message_id, f"thread-{message_id}", date, "Sujet", "Corps")


class WorkAutomationTest(unittest.TestCase):
    def test_processes_oldest_first_and_syncs_commercial_messages(self):
        inbox = MemoryInbox([message("new", 20), message("old", 10)])
        synced = []
        classifier = lambda item: Classification(Outcome.COMMERCIAL, 0.9, "demande", item.message_id)
        report = WorkAutomation(inbox, classifier, lambda request: synced.append(request)).run_once()
        self.assertEqual(synced, ["old", "new"])
        self.assertEqual([item.message_id for item in report.results], ["old", "new"])
        self.assertEqual(inbox.states, {"old": "Traite", "new": "Traite"})

    def test_out_of_scope_skips_crm(self):
        inbox = MemoryInbox([message("newsletter", 1)])
        classifier = lambda item: Classification(Outcome.OUT_OF_SCOPE, 1.0, "newsletter")
        report = WorkAutomation(inbox, classifier, lambda request: self.fail("CRM called")).run_once()
        self.assertEqual(report.results[0].state, "Traite")

    def test_review_never_mutates_crm(self):
        inbox = MemoryInbox([message("unclear", 1)])
        classifier = lambda item: Classification(Outcome.REVIEW, 0.4, "source ambiguë")
        report = WorkAutomation(inbox, classifier, lambda request: self.fail("CRM called")).run_once()
        self.assertEqual(report.results[0].state, "A-revoir")

    def test_missing_sync_payload_requires_review(self):
        inbox = MemoryInbox([message("missing", 1)])
        classifier = lambda item: Classification(Outcome.COMMERCIAL, 0.9, "demande")
        report = WorkAutomation(inbox, classifier, lambda request: self.fail("CRM called")).run_once()
        self.assertEqual(report.results[0].state, "A-revoir")

    def test_crm_failure_is_replayable_error(self):
        inbox = MemoryInbox([message("failure", 1)])
        classifier = lambda item: Classification(Outcome.COMMERCIAL, 0.9, "demande", object())

        def fail(_request):
            raise RuntimeError("Notion indisponible")

        report = WorkAutomation(inbox, classifier, fail).run_once()
        self.assertEqual(inbox.transitions, [("failure", "En-cours"), ("failure", "Erreur")])
        self.assertEqual(report.results[0].detail, "échec technique (RuntimeError)")

    def test_replay_repairs_gmail_state_without_special_case(self):
        inbox = MemoryInbox([message("replay", 1)])
        classifier = lambda item: Classification(Outcome.THREAD_REPLY, 0.9, "réponse", object())
        report = WorkAutomation(inbox, classifier, lambda request: SimpleNamespace(replayed=True)).run_once()
        self.assertEqual(report.results[0].state, "Traite")
        self.assertIn("réparé", report.results[0].detail)

    def test_report_is_a_draft_and_surfaces_attention_items(self):
        inbox = MemoryInbox([message("review", 1), message("error", 2)])

        def classify(item):
            if item.message_id == "review":
                return Classification(Outcome.REVIEW, 0.2, "contenu ambigu")
            raise RuntimeError("classification indisponible")

        draft = WorkAutomation(inbox, classify, lambda request: None).run_once().whatsapp_draft()
        self.assertIn("Traités : 0", draft)
        self.assertIn("À revoir : 1", draft)
        self.assertIn("Erreurs : 1", draft)
        self.assertIn("review: contenu ambigu", draft)
        self.assertIn("error: échec technique (RuntimeError)", draft)


if __name__ == "__main__":
    unittest.main()
