CREATE TABLE telegram_commands (
  command_id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  command_kind TEXT NOT NULL CHECK (command_kind IN ('text', 'voice')),
  content TEXT,
  voice_file_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending', 'transcribing', 'completed', 'quarantined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error_code TEXT
);

CREATE INDEX telegram_commands_pending
ON telegram_commands(state, created_at);
