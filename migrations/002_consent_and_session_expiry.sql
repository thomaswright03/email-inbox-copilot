-- Durable record of each acceptance of the Terms of Service and Privacy
-- Policy: which Google account accepted which LEGAL_VERSION, and when. The
-- app can only add rows; rows are deleted three years after acceptance
-- (purge_consent_records) or when a user's data is deleted on request
-- (scripts/user-data.mjs, owner connection).
CREATE TABLE IF NOT EXISTS consent_records (
  id BIGSERIAL PRIMARY KEY,
  google_id TEXT NOT NULL,
  legal_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_records_google_id_idx ON consent_records (google_id);

CREATE INDEX IF NOT EXISTS consent_records_accepted_at_idx ON consent_records (accepted_at);

CREATE OR REPLACE FUNCTION purge_consent_records() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ DELETE FROM consent_records WHERE accepted_at < now() - interval '3 years' $$;

REVOKE ALL ON FUNCTION purge_consent_records() FROM PUBLIC;

-- Session-version rows expire 30 days after the user's last sign-in (the
-- next sign-in simply recreates the row).
CREATE INDEX IF NOT EXISTS user_sessions_updated_at_idx ON user_sessions (updated_at);

CREATE OR REPLACE FUNCTION purge_user_sessions() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ DELETE FROM user_sessions WHERE updated_at < now() - interval '30 days' $$;

REVOKE ALL ON FUNCTION purge_user_sessions() FROM PUBLIC;
