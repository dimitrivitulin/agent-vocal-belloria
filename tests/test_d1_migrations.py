import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class D1MigrationTests(unittest.TestCase):
    def test_action_approval_schema_supports_atomic_confirmation(self):
        database = sqlite3.connect(":memory:")
        for migration in ("0002_telegram_commands.sql", "0003_telegram_action_approvals.sql", "0004_telegram_fast_path.sql"):
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

    def test_fast_path_schema_keeps_structured_expiring_snapshots_and_latency(self):
        database = sqlite3.connect(":memory:")
        for migration in ("0002_telegram_commands.sql", "0003_telegram_action_approvals.sql", "0004_telegram_fast_path.sql"):
            database.executescript((ROOT / "worker" / "migrations" / migration).read_text(encoding="utf-8"))
        database.execute(
            "INSERT INTO telegram_prospect_snapshots "
            "(prospect_id, label, sources_json, summary, recommendation, source_updated_at, expires_at) "
            "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, datetime('now', '+90 minutes'))",
            ("p-1", "Prospect test", '["notion:p-1"]', "Résumé structuré", "Action validée"),
        )
        database.execute("INSERT INTO telegram_prospect_aliases VALUES (?, ?)", ("p-1", "prospect test"))
        columns = {row[1] for row in database.execute("PRAGMA table_info(telegram_commands)")}
        self.assertTrue({"created_at", "started_at", "replied_at", "latency_ms"}.issubset(columns))
        self.assertEqual(
            ("p-1", "notion:p-1"),
            database.execute(
                "SELECT s.prospect_id, json_extract(s.sources_json, '$[0]') "
                "FROM telegram_prospect_snapshots s JOIN telegram_prospect_aliases a USING (prospect_id) WHERE a.alias = ?",
                ("prospect test",),
            ).fetchone(),
        )


if __name__ == "__main__":
    unittest.main()
