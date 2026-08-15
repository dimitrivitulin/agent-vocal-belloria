CREATE TABLE codex_sms_actions (
  action_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  recipient TEXT NOT NULL,
  content TEXT NOT NULL,
  consent_reference TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'expired', 'succeeded', 'failed', 'unknown')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  claimed_at TEXT,
  dispatch_started_at TEXT,
  finished_at TEXT,
  provider_message_id TEXT,
  provider_http_status INTEGER,
  provider_error_code TEXT
);

CREATE INDEX codex_sms_actions_state_expiry
ON codex_sms_actions(state, expires_at);

CREATE TRIGGER codex_sms_actions_content_immutable
BEFORE UPDATE OF action_id, idempotency_key, recipient, content, consent_reference, content_hash, expires_at ON codex_sms_actions
BEGIN
  SELECT RAISE(ABORT, 'codex SMS action content is immutable');
END;

CREATE TRIGGER codex_sms_actions_state_transitions
BEFORE UPDATE OF state ON codex_sms_actions
WHEN NEW.state <> OLD.state
  AND NOT (
    (OLD.state = 'pending' AND NEW.state = 'expired')
    OR (OLD.state = 'pending' AND NEW.state = 'claimed'
      AND NEW.confirmed_at IS NOT NULL
      AND NEW.claimed_at IS NOT NULL)
    OR (OLD.state = 'claimed' AND NEW.state = 'succeeded'
      AND OLD.dispatch_started_at IS NOT NULL
      AND NEW.finished_at IS NOT NULL
      AND NEW.provider_message_id IS NOT NULL
      AND NEW.provider_http_status IS NOT NULL)
    OR (OLD.state = 'claimed' AND NEW.state = 'failed'
      AND NEW.finished_at IS NOT NULL
      AND NEW.provider_error_code IS NOT NULL)
    OR (OLD.state = 'claimed' AND NEW.state = 'unknown'
      AND OLD.dispatch_started_at IS NOT NULL
      AND NEW.finished_at IS NOT NULL
      AND NEW.provider_error_code IS NOT NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid codex SMS action state transition');
END;

CREATE TRIGGER codex_sms_actions_confirmation_immutable
BEFORE UPDATE OF confirmed_at, claimed_at ON codex_sms_actions
WHEN OLD.confirmed_at IS NOT NULL OR OLD.claimed_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'codex SMS action confirmation is immutable');
END;

CREATE TRIGGER codex_sms_actions_dispatch_immutable
BEFORE UPDATE OF dispatch_started_at ON codex_sms_actions
WHEN OLD.dispatch_started_at IS NOT NULL
  OR (NEW.dispatch_started_at IS NOT NULL AND OLD.state <> 'claimed')
BEGIN
  SELECT RAISE(ABORT, 'codex SMS action dispatch is immutable');
END;

CREATE TRIGGER codex_sms_actions_result_immutable
BEFORE UPDATE OF finished_at, provider_message_id, provider_http_status, provider_error_code ON codex_sms_actions
WHEN OLD.finished_at IS NOT NULL
  OR NEW.state NOT IN ('succeeded', 'failed', 'unknown')
  OR NEW.finished_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'codex SMS action result is immutable');
END;
