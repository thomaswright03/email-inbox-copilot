-- Schema for Inbox Buddy. Applied by `npm run db:migrate` with the database
-- OWNER connection (MIGRATION_DATABASE_URL), never by the running app. The
-- app connects with a separate least-privilege role (see SECURITY.md) that
-- can't create, alter or drop anything.

-- user_id is the Google account id (never the email address); detail only
-- holds fixed strings written by the app, never model output.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  message_id TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Databases created by earlier versions of the app (which created this table
-- at runtime with a user_email column) are brought to the same shape, and
-- the model-written reasons they stored are removed.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'user_email') THEN ALTER TABLE audit_log ALTER COLUMN user_email DROP NOT NULL; END IF; END $$;

UPDATE audit_log SET detail = NULL WHERE action = 'classified_spam';

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at);

-- Retention. The app's role has no DELETE on audit_log; this function (run
-- with the owner's rights) is the only way it can remove rows, and it can
-- only remove rows older than the retention period (minimum 30 days).
CREATE OR REPLACE FUNCTION purge_audit_log(retention_days integer) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ DELETE FROM audit_log WHERE created_at < now() - make_interval(days => GREATEST(retention_days, 30)) $$;

REVOKE ALL ON FUNCTION purge_audit_log(integer) FROM PUBLIC;

-- Encrypted (AES-256-GCM) inbox-derived cache values, see lib/db-cache.ts.
CREATE TABLE IF NOT EXISTS response_cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS response_cache_expires_at_idx ON response_cache (expires_at);

-- Fixed-window rate-limit counters, see lib/rate-limit.ts.
CREATE TABLE IF NOT EXISTS rate_limit (
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);

-- Per-user session generation. Every session cookie carries the version
-- current at sign-in; bumping it (sign-out, or scripts/revoke-sessions.mjs)
-- invalidates every outstanding session for that user. See lib/session-store.ts.
CREATE TABLE IF NOT EXISTS user_sessions (
  google_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
