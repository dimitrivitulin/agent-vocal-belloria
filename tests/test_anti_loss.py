import unittest
from dataclasses import replace
from datetime import date, datetime, timedelta

from belloria_work.anti_loss import AntiLossEngine, AntiLossLoop, FollowUpOpportunity


NOW = datetime(2026, 8, 5, 10, 0)


def opportunity(**overrides):
    values = dict(
        opportunity_id="opp-1", label="Alice — Mariage", status="Qualifié",
        created_at=NOW - timedelta(days=2), last_belloria_message_at=NOW,
        next_action="Attendre", next_deadline=date(2026, 8, 10),
    )
    values.update(overrides)
    return FollowUpOpportunity(**values)


class AntiLossEngineTest(unittest.TestCase):
    def setUp(self):
        self.engine = AntiLossEngine(NOW)

    def test_detects_all_six_anomaly_families(self):
        cases = [
            ("unanswered_request", dict(last_belloria_message_at=None)),
            ("follow_up_due", dict(next_deadline=date(2026, 8, 5))),
            ("silent_quote", dict(quote_sent_at=NOW - timedelta(days=3))),
            ("deposit_due", dict(deposit_due_at=date(2026, 8, 5))),
            ("event_near", dict(event_date=date(2026, 8, 10))),
            ("confirmed_collision", dict(event_date=date(2026, 9, 1), confirmed_same_day_events=("evt-9",))),
        ]
        for kind, fields in cases:
            with self.subTest(kind=kind):
                plan = self.engine.plan([opportunity(**fields)])
                self.assertEqual(plan.alerts[0].kind, kind)
                self.assertEqual(plan.updates[0].next_deadline, date(2026, 8, 5))

    def test_past_event_is_critical_and_terminal_records_are_ignored(self):
        active = opportunity(event_date=date(2026, 8, 4))
        won = opportunity(opportunity_id="opp-2", status="Gagné", event_date=date(2026, 8, 4))
        plan = self.engine.plan([won, active])
        self.assertEqual([item.kind for item in plan.alerts], ["event_past"])

    def test_every_active_record_gets_a_dated_next_action(self):
        plan = self.engine.plan([opportunity(next_action=None, next_deadline=None)])
        self.assertFalse(plan.alerts)
        self.assertEqual(plan.updates[0].next_action, "Examiner et définir la prochaine action")
        self.assertEqual(plan.updates[0].next_deadline, date(2026, 8, 6))

    def test_identical_second_pass_has_no_alert_or_update(self):
        first = self.engine.plan([opportunity(last_belloria_message_at=None)])
        alert = first.alerts[0]
        updated = opportunity(
            last_belloria_message_at=None, next_action=alert.action,
            next_deadline=alert.deadline, emitted_alert_keys=frozenset({alert.key}),
        )
        second = self.engine.plan([updated])
        self.assertEqual(second.alerts, ())
        self.assertEqual(second.updates, ())

        next_day = AntiLossEngine(NOW + timedelta(days=1)).plan([updated])
        self.assertEqual(next_day.alerts, ())

    def test_prospect_reply_after_quote_prevents_silent_quote(self):
        plan = self.engine.plan([opportunity(
            quote_sent_at=NOW - timedelta(days=4),
            last_prospect_message_at=NOW - timedelta(days=1),
            last_belloria_message_at=NOW,
        )])
        self.assertFalse(plan.alerts)

    def test_briefing_is_sorted_and_contains_no_internal_ids(self):
        plan = self.engine.plan([
            opportunity(opportunity_id="secret-2", label="Zoé", next_deadline=date(2026, 8, 5)),
            opportunity(opportunity_id="secret-1", label="Anne", event_date=date(2026, 8, 4)),
        ])
        briefing = plan.telegram_briefing()
        self.assertLess(briefing.index("Anne"), briefing.index("Zoé"))
        self.assertNotIn("secret-", briefing)

    def test_loop_applies_action_date_and_deduplication_key_atomically(self):
        class Gateway:
            def __init__(self):
                self.items = [opportunity(last_belloria_message_at=None)]

            def active_opportunities(self):
                return self.items

            def apply_follow_up(self, update):
                current = self.items[0]
                if update.alert_key in current.emitted_alert_keys:
                    return False
                self.items[0] = replace(
                    current,
                    next_action=update.next_action,
                    next_deadline=update.next_deadline,
                    emitted_alert_keys=current.emitted_alert_keys | {update.alert_key},
                )
                return True

        gateway = Gateway()
        first = AntiLossLoop(gateway, NOW).run_once()
        second = AntiLossLoop(gateway, NOW).run_once()
        self.assertEqual((first.alerts, first.updated), (1, 1))
        self.assertIsNotNone(first.briefing)
        self.assertEqual((second.alerts, second.updated, second.briefing), (0, 0, None))


if __name__ == "__main__":
    unittest.main()
