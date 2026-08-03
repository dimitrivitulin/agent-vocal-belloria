CREATE TABLE webhook_events (
  event_id TEXT PRIMARY KEY,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('message', 'status')),
  phone_number_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'processed', 'retry', 'quarantined')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error_code TEXT
);

CREATE INDEX webhook_events_retryable
ON webhook_events(state, next_attempt_at, created_at);
