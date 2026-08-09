ALTER TABLE external_actions ADD COLUMN dispatch_started_at TEXT;
ALTER TABLE external_actions ADD COLUMN finished_at TEXT;
ALTER TABLE external_actions ADD COLUMN provider_message_id TEXT;
ALTER TABLE external_actions ADD COLUMN provider_thread_id TEXT;
ALTER TABLE external_actions ADD COLUMN provider_http_status INTEGER;
ALTER TABLE external_actions ADD COLUMN provider_error_code TEXT;

DROP TRIGGER external_actions_state_transitions;

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
  SELECT RAISE(ABORT, 'invalid external action state transition');
END;

CREATE TRIGGER external_actions_dispatch_immutable
BEFORE UPDATE OF dispatch_started_at ON external_actions
WHEN OLD.dispatch_started_at IS NOT NULL
  OR (NEW.dispatch_started_at IS NOT NULL AND OLD.state <> 'claimed')
BEGIN
  SELECT RAISE(ABORT, 'external action dispatch is immutable');
END;

CREATE TRIGGER external_actions_result_immutable
BEFORE UPDATE OF finished_at, provider_message_id, provider_thread_id, provider_http_status, provider_error_code ON external_actions
WHEN OLD.finished_at IS NOT NULL
  OR NEW.state NOT IN ('succeeded', 'failed', 'unknown')
  OR NEW.finished_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'external action result is immutable');
END;
