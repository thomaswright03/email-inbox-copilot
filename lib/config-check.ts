// Settings a production deployment needs (docs/deployment.md). Checked at
// startup (instrumentation.ts) and reported by /api/health.
export function productionConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) problems.push("AUTH_SECRET must be set to 32+ random characters");
  if (!env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) problems.push("AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are required");
  if (!env.DATABASE_URL) {
    problems.push("DATABASE_URL is required: without it no user can accept the Terms, and AI budgets fail closed");
  }
  if (!env.ALLOWED_EMAILS?.trim()) problems.push("ALLOWED_EMAILS is empty, so nobody can sign in");
  if (env.GMAIL_API_ROOT_URL) problems.push("GMAIL_API_ROOT_URL is a test-only setting and must not be set");
  if (env.MIGRATION_DATABASE_URL) problems.push("MIGRATION_DATABASE_URL (the owner connection) must not be set at runtime");
  return problems;
}
