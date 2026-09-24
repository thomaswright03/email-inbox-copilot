import { getSql } from "./db";
import { logError } from "./log";

// Durable evidence of consent: one row per acceptance of a LEGAL_VERSION
// (migrations/002). Returns false if the record couldn't be written, in
// which case the acceptance is not applied (auth.ts), so nobody reaches
// their inbox data without a stored record. Without DATABASE_URL (local
// development only) there is nowhere to record it and it returns true.
// False when agreements can't be recorded at all: a production deployment
// without DATABASE_URL. The consent screen then says the service isn't set
// up, instead of asking the user to retry something that can't succeed.
export function consentStorageReady(): boolean {
  return Boolean(process.env.DATABASE_URL) || process.env.NODE_ENV !== "production";
}

export async function recordConsent(googleId: string, legalVersion: string): Promise<boolean> {
  const sql = getSql();
  if (!sql) return process.env.NODE_ENV !== "production";
  try {
    await sql`INSERT INTO consent_records (google_id, legal_version) VALUES (${googleId}, ${legalVersion})`;
    if (Math.random() < 0.05) {
      await sql`SELECT purge_consent_records()`.catch((err) => logError("consent.purge", err));
    }
    return true;
  } catch (err) {
    logError("consent.record", err);
    return false;
  }
}
