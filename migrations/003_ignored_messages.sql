-- Messages a user marked "Not spam": they are never shown as spam cards to
-- that user again. Only the Gmail message id is kept (no content), and rows
-- are deleted 7 days after they were written, by which time the message has
-- long left the 24-hour window the app looks at.
CREATE TABLE IF NOT EXISTS ignored_messages (
  google_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (google_id, message_id)
);

CREATE INDEX IF NOT EXISTS ignored_messages_created_at_idx ON ignored_messages (created_at);
