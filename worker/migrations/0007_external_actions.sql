CREATE TABLE external_actions (
  action_id TEXT PRIMARY KEY,
  creation_key TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type = 'telegram_command'),
  source_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  confirmation_token TEXT NOT NULL UNIQUE,
  approval_text TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'claimed', 'expired', 'succeeded', 'failed', 'unknown')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  presented_at TEXT,
  presentation_message_id TEXT,
  presentation_chat_id TEXT,
  approved_at TEXT,
  approval_command_id TEXT UNIQUE,
  approval_message_id TEXT,
  approval_chat_id TEXT,
  claimed_at TEXT
);

CREATE INDEX external_actions_state_expiry
ON external_actions(state, expires_at);

CREATE TRIGGER external_actions_telegram_source_exists
BEFORE INSERT ON external_actions
WHEN NEW.source_type = 'telegram_command'
  AND NOT EXISTS (SELECT 1 FROM telegram_commands WHERE command_id = NEW.source_id)
BEGIN
  SELECT RAISE(ABORT, 'external action source does not exist');
END;

CREATE TRIGGER external_actions_content_immutable
BEFORE UPDATE OF action_id, creation_key, source_type, source_id, action_type, target_json, payload_json, content_hash, confirmation_token, approval_text, expires_at ON external_actions
BEGIN
  SELECT RAISE(ABORT, 'external action content is immutable');
END;

CREATE TRIGGER external_actions_state_transitions
BEFORE UPDATE OF state ON external_actions
WHEN NEW.state <> OLD.state
  AND NOT (
    (OLD.state = 'pending' AND NEW.state = 'expired')
    OR (OLD.state = 'pending' AND NEW.state = 'approved'
      AND OLD.presentation_message_id IS NOT NULL
      AND NEW.approved_at IS NOT NULL
      AND NEW.approval_command_id IS NOT NULL
      AND NEW.approval_message_id IS NOT NULL
      AND NEW.approval_chat_id IS NOT NULL)
    OR (OLD.state = 'approved' AND NEW.state = 'claimed' AND NEW.claimed_at IS NOT NULL)
    OR (OLD.state = 'claimed' AND NEW.state IN ('succeeded', 'failed', 'unknown'))
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid external action state transition');
END;

CREATE TRIGGER external_actions_presentation_immutable
BEFORE UPDATE OF presented_at, presentation_message_id, presentation_chat_id ON external_actions
WHEN OLD.presented_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'external action presentation is immutable');
END;

CREATE TRIGGER external_actions_approval_immutable
BEFORE UPDATE OF approved_at, approval_command_id, approval_message_id, approval_chat_id ON external_actions
WHEN OLD.approved_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'external action approval is immutable');
END;

CREATE TRIGGER external_actions_claim_immutable
BEFORE UPDATE OF claimed_at ON external_actions
WHEN OLD.claimed_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'external action claim is immutable');
END;
