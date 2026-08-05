CREATE TABLE tally_submissions (
  event_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  form_name TEXT,
  submitted_at TEXT,
  payload_json TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processed', 'quarantined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE UNIQUE INDEX tally_submissions_submission_id
ON tally_submissions(submission_id);

CREATE INDEX tally_submissions_pending
ON tally_submissions(state, created_at);
