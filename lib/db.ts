import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export type Sql = NeonQueryFunction<false, false>;

// Shared across lib/audit.ts and lib/db-cache.ts — both are best-effort
// features layered on the same optional Postgres connection. Returns null
// (not a throw) when DATABASE_URL isn't set, so every caller can no-op
// gracefully rather than needing its own env-var check.
export function getSql(): Sql | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  return neon(connectionString);
}
