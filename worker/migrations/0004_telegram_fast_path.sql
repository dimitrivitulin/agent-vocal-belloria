ALTER TABLE telegram_commands ADD COLUMN started_at TEXT;
ALTER TABLE telegram_commands ADD COLUMN replied_at TEXT;
ALTER TABLE telegram_commands ADD COLUMN latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0);

CREATE TABLE telegram_prospect_snapshots (
  prospect_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sources_json TEXT NOT NULL CHECK (json_valid(sources_json)),
  summary TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  reply_draft TEXT,
  quote_draft TEXT,
  follow_up_draft TEXT,
  contradictory INTEGER NOT NULL DEFAULT 0 CHECK (contradictory IN (0, 1)),
  source_updated_at TEXT NOT NULL,
  refreshed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE TABLE telegram_prospect_aliases (
  prospect_id TEXT NOT NULL REFERENCES telegram_prospect_snapshots(prospect_id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  PRIMARY KEY (prospect_id, alias)
);

CREATE INDEX telegram_prospect_alias_lookup ON telegram_prospect_aliases(alias);
CREATE INDEX telegram_prospect_snapshot_freshness ON telegram_prospect_snapshots(expires_at, refreshed_at);
