import unittest
from datetime import datetime, timezone

from belloria_work import ContextBuilder, Evidence, EvidenceKind, conversation_key


def fact(field, value, kind, day, source_id="source", url=None):
    return Evidence(field, value, kind, datetime(2026, 8, day, tzinfo=timezone.utc), source_id, url)


class ProspectContextTest(unittest.TestCase):
    def test_tally_submissions_sharing_a_thread_stay_distinct(self):
        self.assertEqual(conversation_key("Tally", "msg-a", "shared"), "message:msg-a")
        self.assertEqual(conversation_key("Tally", "msg-b", "shared"), "message:msg-b")
        self.assertEqual(conversation_key("Email direct", "msg-c", "shared"), "thread:shared")

    def test_new_prospect_message_overrides_form_and_keeps_conflict(self):
        context = ContextBuilder().build([
            fact("guests", 40, EvidenceKind.TALLY_SUBMISSION, 1, "tally-message"),
            fact("guests", 55, EvidenceKind.PROSPECT_MESSAGE, 2, "gmail-reply"),
        ])
        guests = context.facts["guests"]
        self.assertEqual(guests.value, 55)
        self.assertTrue(guests.conflicted)
        self.assertIn("Contradiction à vérifier : guests", context.warnings)

    def test_recent_human_crm_correction_has_priority(self):
        context = ContextBuilder().build([
            fact("event_date", "2026-09-12", EvidenceKind.PROSPECT_MESSAGE, 4, "gmail"),
            fact("event_date", "2026-09-19", EvidenceKind.CRM_HUMAN, 3, "notion"),
        ])
        self.assertEqual(context.facts["event_date"].value, "2026-09-19")

    def test_estimate_never_becomes_quote_or_actual_revenue(self):
        context = ContextBuilder().build([
            fact("estimated_amount", 900, EvidenceKind.TALLY_SUBMISSION, 1),
            fact("quote_amount", 900, EvidenceKind.CRM_AUTOMATION, 2),
            fact("actual_revenue", 900, EvidenceKind.PROSPECT_MESSAGE, 3),
        ])
        self.assertEqual(context.financial.estimate.value, 900)
        self.assertIsNone(context.financial.quote)
        self.assertIsNone(context.financial.actual_revenue)
        self.assertEqual(len([w for w in context.warnings if "preuve financière" in w]), 2)

    def test_sent_quote_and_invoice_are_exposed_separately(self):
        context = ContextBuilder().build([
            fact("quote_amount", 1200, EvidenceKind.SENT_QUOTE, 2, "gmail-pdf"),
            fact("actual_revenue", 1100, EvidenceKind.INVOICE, 3, "clients-2026"),
            fact("deposit_amount", 400, EvidenceKind.INVOICE, 3, "clients-2026"),
        ])
        self.assertEqual(context.financial.quote.value, 1200)
        self.assertEqual(context.financial.actual_revenue.value, 1100)
        self.assertEqual(context.financial.deposit.value, 400)

    def test_unknowns_make_incomplete_context_explicit(self):
        context = ContextBuilder().build([fact("name", "Alice", EvidenceKind.CRM_HUMAN, 1)])
        self.assertIn("event_date", context.unknowns)
        self.assertIn("next_action", context.unknowns)

    def test_evidence_requires_traceable_source(self):
        with self.assertRaises(ValueError):
            ContextBuilder().build([fact("name", "Alice", EvidenceKind.INFERENCE, 1, "")])


if __name__ == "__main__":
    unittest.main()
