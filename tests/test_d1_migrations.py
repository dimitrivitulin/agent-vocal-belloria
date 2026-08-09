import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class D1MigrationTests(unittest.TestCase):
    def test_tally_sms_schema_tracks_provider_status_without_copying_recipient(self):
        database = sqlite3.connect(":memory:")
        for migration in ("0005_tally_submissions.sql", "0006_tally_sms_ack.sql"):
            database.executescript(
                (ROOT / "worker" / "migrations" / migration).read_text(encoding="utf-8")
            )
        columns = {
            row[1] for row in database.execute("PRAGMA table_info(tally_submissions)")
        }
        self.assertTrue(
            {"sms_status", "sms_provider_id", "sms_error_code", "sms_updated_at"}
            <= columns
        )
        self.assertNotIn("sms_recipient", columns)

    def test_action_approval_schema_supports_atomic_confirmation(self):
        database = sqlite3.connect(":memory:")
        for migration in ("0002_telegram_commands.sql", "0003_telegram_action_approvals.sql"):
            database.executescript((ROOT / "worker" / "migrations" / migration).read_text(encoding="utf-8"))
        database.execute(
            "INSERT INTO telegram_commands (command_id, message_id, command_kind, content, state) VALUES (?, ?, ?, ?, ?)",
            ("1", "1", "text", "Prépare", "pending"),
        )
        inserted = database.execute(
            "INSERT INTO telegram_action_approvals (token, source_command_id, prospect, sources_json, content, consequence, expires_at) "
            "SELECT ?, command_id, ?, ?, ?, ?, datetime('now', ?) FROM telegram_commands WHERE command_id = ? AND state = 'pending' "
            "ON CONFLICT(token) DO NOTHING",
            ("ABC123", "Élodie", "[]", "Action", "Conséquence", "+10 minutes", "1"),
        )
        self.assertEqual(1, inserted.rowcount)
        database.execute(
            "INSERT INTO telegram_commands (command_id, message_id, command_kind, content, state) VALUES (?, ?, ?, ?, ?)",
            ("2", "2", "text", "CONFIRMER abc123", "pending"),
        )
        row = database.execute(
            "UPDATE telegram_action_approvals SET state = 'consumed', consumed_at = CURRENT_TIMESTAMP, confirmation_command_id = ? "
            "WHERE token = (SELECT upper(trim(substr(content, 10))) FROM telegram_commands WHERE command_id = ? AND state = 'pending' AND upper(content) LIKE 'CONFIRMER %') "
            "AND state = 'pending' AND expires_at > CURRENT_TIMESTAMP RETURNING token",
            ("2", "2"),
        ).fetchone()
        self.assertEqual(("ABC123",), row)

    def test_fast_path_schema_tracks_latency_and_expires_snapshots(self):
        database = sqlite3.connect(":memory:")
        for migration in (
            "0002_telegram_commands.sql",
            "0003_telegram_action_approvals.sql",
            "0004_telegram_fast_path.sql",
        ):
            database.executescript(
                (ROOT / "worker" / "migrations" / migration).read_text(encoding="utf-8")
            )
        columns = {
            row[1] for row in database.execute("PRAGMA table_info(telegram_commands)")
        }
        self.assertTrue(
            {"fast_path_state", "fast_path_started_at", "fast_path_finished_at", "fast_path_error_code"}
            <= columns
        )
        database.execute(
            "INSERT INTO telegram_prospect_snapshots "
            "(prospect_id, label, aliases_json, summary, recommendation, actions_json, sources_json, generated_at, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(?, ?))",
            ("p-1", "Prospect", "[]", "Résumé", "Recommandation", "{}", "[]",
             "2026-08-05T10:00:00Z", "2026-08-05T10:00:00Z", "+90 minutes"),
        )
        expiry = database.execute(
            "SELECT expires_at FROM telegram_prospect_snapshots WHERE prospect_id = 'p-1'"
        ).fetchone()[0]
        self.assertEqual("2026-08-05 11:30:00", expiry)

    def test_external_actions_schema_requires_a_persisted_source_and_enforces_immutable_transitions(self):
        database = sqlite3.connect(":memory:")
        for migration in ("0002_telegram_commands.sql", "0007_external_actions.sql"):
            database.executescript(
                (ROOT / "worker" / "migrations" / migration).read_text(encoding="utf-8")
            )
        database.execute(
            "INSERT INTO telegram_commands (command_id, message_id, command_kind, content, state) VALUES (?, ?, ?, ?, ?)",
            ("1", "1", "text", "Prépare", "pending"),
        )
        values = (
            "action-1", "key-1", "telegram_command", "1", "gmail.send",
            '{"recipients":["camille@example.test"]}', '{"subject":"Bonjour"}', "a" * 64,
            "ABCDEF123456", "Action exacte\nCONFIRMER ABCDEF123456", "2099-01-01 00:00:00",
        )
        database.execute(
            "INSERT INTO external_actions (action_id, creation_key, source_type, source_id, action_type, target_json, payload_json, content_hash, confirmation_token, approval_text, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            values,
        )
        with self.assertRaises(sqlite3.IntegrityError):
            database.execute(
                "INSERT INTO external_actions (action_id, creation_key, source_type, source_id, action_type, target_json, payload_json, content_hash, confirmation_token, approval_text, expires_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                ("action-2", "key-2", "telegram_command", "missing", "gmail.send", "{}", "{}", "b" * 64,
                 "ABCDEF654321", "Action", "2099-01-01 00:00:00"),
            )
        with self.assertRaises(sqlite3.IntegrityError):
            database.execute("UPDATE external_actions SET payload_json = '{}' WHERE action_id = 'action-1'")
        with self.assertRaises(sqlite3.IntegrityError):
            database.execute(
                "UPDATE external_actions SET state = 'approved', approved_at = CURRENT_TIMESTAMP, approval_command_id = '2', "
                "approval_message_id = '20', approval_chat_id = '123' WHERE action_id = 'action-1'"
            )

        database.execute(
            "UPDATE external_actions SET presented_at = CURRENT_TIMESTAMP, presentation_message_id = '10', presentation_chat_id = '123' "
            "WHERE action_id = 'action-1'"
        )
        approved = database.execute(
            "UPDATE external_actions SET state = 'approved', approved_at = CURRENT_TIMESTAMP, approval_command_id = '2', "
            "approval_message_id = '20', approval_chat_id = '123' "
            "WHERE action_id = 'action-1' AND state = 'pending'"
        )
        self.assertEqual(1, approved.rowcount)
        first_claim = database.execute(
            "UPDATE external_actions SET state = 'claimed', claimed_at = CURRENT_TIMESTAMP "
            "WHERE action_id = 'action-1' AND state = 'approved'"
        )
        second_claim = database.execute(
            "UPDATE external_actions SET state = 'claimed', claimed_at = CURRENT_TIMESTAMP "
            "WHERE action_id = 'action-1' AND state = 'approved'"
        )
        self.assertEqual(1, first_claim.rowcount)
        self.assertEqual(0, second_claim.rowcount)
        with self.assertRaises(sqlite3.IntegrityError):
            database.execute("UPDATE external_actions SET state = 'approved' WHERE action_id = 'action-1'")


if __name__ == "__main__":
    unittest.main()
