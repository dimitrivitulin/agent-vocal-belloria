ALTER TABLE telegram_commands ADD COLUMN fast_path_state TEXT
CHECK (fast_path_state IN ('processing', 'replied', 'deferred', 'failed'));
ALTER TABLE telegram_commands ADD COLUMN fast_path_started_at TEXT;
ALTER TABLE telegram_commands ADD COLUMN fast_path_finished_at TEXT;
ALTER TABLE telegram_commands ADD COLUMN fast_path_error_code TEXT;

CREATE TABLE telegram_prospect_snapshots (
  prospect_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  aliases_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  actions_json TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX telegram_prospect_snapshots_expiry
ON telegram_prospect_snapshots(expires_at);
