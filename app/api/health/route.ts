import { NextResponse } from "next/server";
import { getAuditLogStatus } from "@/lib/audit";
import { jsonError } from "@/lib/api";
import { getGoogleSession } from "@/lib/session";
import { productionConfigProblems } from "@/lib/config-check";

// Operator-facing status check — requires sign-in (this is a personal-scale
// app, not a public status page) so someone can confirm the audit log is
// actually configured and reachable in production without reading logs or
// guessing from silence. It returns booleans and nothing else; the details
// of a configuration problem are in the startup alert (instrumentation.ts).
export async function GET(req: Request) {
  const session = await getGoogleSession(req.headers);
  if (!session) return jsonError("Not authenticated", 401);

  const auditLog = await getAuditLogStatus();
  const configOk = process.env.NODE_ENV !== "production" || productionConfigProblems().length === 0;
  return NextResponse.json({ auditLog, configOk });
}
