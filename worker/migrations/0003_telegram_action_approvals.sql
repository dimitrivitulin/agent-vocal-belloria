CREATE TABLE telegram_action_approvals (
  token TEXT PRIMARY KEY,
  source_command_id TEXT NOT NULL,
  prospect TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  content TEXT NOT NULL,
  consequence TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'consumed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  confirmation_command_id TEXT
);

CREATE INDEX telegram_action_approvals_pending
ON telegram_action_approvals(state, expires_at);
