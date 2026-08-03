import unittest

from belloria_notion import AmbiguousMatch, ContactConflict, MemoryGateway, SyncRequest, Synchronizer
from belloria_notion.sync import Contact, Opportunity, normalize_email, normalize_phone


def request(**overrides):
    values = dict(message_id="msg-1", source="Tally", full_name="  Alice   Martin ", email=" ALICE@EXAMPLE.COM ", phone="06 12 34 56 78", gmail_thread_id="thread-1", event_date="2026-09-12", event_type="Mariage")
    values.update(overrides)
    return SyncRequest(**values)


class NotionSyncTest(unittest.TestCase):
    def setUp(self):
        self.gateway = MemoryGateway()
        self.sync = Synchronizer(self.gateway)

    def test_normalizes_email_and_french_phone(self):
        self.assertEqual(normalize_email(" A@Example.COM "), "a@example.com")
        self.assertEqual(normalize_phone("06 12 34 56 78"), "+33612345678")

    def test_same_email_reuses_contact(self):
        first = self.sync.sync(request(phone=None))
        second = self.sync.sync(request(message_id="msg-2", gmail_thread_id="thread-2", phone=None))
        self.assertEqual(second.contact_id, first.contact_id)

    def test_same_phone_reuses_contact(self):
        first = self.sync.sync(request(email=None))
        second = self.sync.sync(request(message_id="msg-2", gmail_thread_id="thread-2", email=None))
        self.assertEqual(second.contact_id, first.contact_id)

    def test_email_phone_conflict_requires_review(self):
        self.gateway.contacts["a"] = Contact("a", "email:a@example.com", "A", "a@example.com", None)
        self.gateway.contacts["b"] = Contact("b", "tel:+33612345678", "B", None, "+33612345678")
        with self.assertRaises(ContactConflict):
            self.sync.sync(request(email="a@example.com"))

    def test_replayed_gmail_message_is_noop(self):
        first = self.sync.sync(request(need="Premier besoin"))
        second = self.sync.sync(request(need="Texte contradictoire", phone="07 11 22 33 44"))
        self.assertTrue(second.replayed)
        self.assertEqual(self.gateway.opportunities[first.opportunity_id].need, "Premier besoin")
        self.assertEqual(self.gateway.contacts[first.contact_id].phone, "+33612345678")
        self.assertEqual(len(self.gateway.opportunities), 1)

    def test_distinct_events_create_distinct_opportunities(self):
        first = self.sync.sync(request(gmail_thread_id=None))
        second = self.sync.sync(request(message_id="msg-2", gmail_thread_id=None, event_date="2026-10-01"))
        self.assertNotEqual(first.opportunity_id, second.opportunity_id)

    def test_ambiguous_opportunity_requires_review(self):
        self.sync.sync(request())
        existing = next(iter(self.gateway.opportunities.values()))
        duplicate = Opportunity(**{**existing.__dict__, "id": "duplicate", "processed_message_ids": set()})
        self.gateway.opportunities[duplicate.id] = duplicate
        with self.assertRaises(AmbiguousMatch):
            self.sync.sync(request(message_id="msg-2"))

    def test_failed_transaction_can_be_replayed_without_duplicate(self):
        self.gateway.fail_before_commit = True
        with self.assertRaises(RuntimeError):
            self.sync.sync(request())
        self.assertEqual(self.gateway.contacts, {})
        self.assertEqual(self.gateway.opportunities, {})
        result = self.sync.sync(request())
        self.assertFalse(result.replayed)
        self.assertEqual(len(self.gateway.opportunities), 1)


if __name__ == "__main__":
    unittest.main()
