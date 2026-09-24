-- Schema for Inbox Buddy. Applied by `npm run db:migrate` with the database
-- OWNER connection (MIGRATION_DATABASE_URL), never by the running app. The
-- app connects with a separate least-privilege role (see SECURITY.md) that
-- can't create, alter or drop anything.

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  message_id TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at);

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
