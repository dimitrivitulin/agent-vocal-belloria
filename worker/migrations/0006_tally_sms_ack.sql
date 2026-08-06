ALTER TABLE tally_submissions ADD COLUMN sms_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (sms_status IN ('pending', 'accepted', 'delivered', 'failed', 'skipped'));
ALTER TABLE tally_submissions ADD COLUMN sms_provider_id TEXT;
ALTER TABLE tally_submissions ADD COLUMN sms_error_code TEXT;
ALTER TABLE tally_submissions ADD COLUMN sms_updated_at TEXT;

CREATE INDEX tally_submissions_sms_status
ON tally_submissions(sms_status, created_at);
