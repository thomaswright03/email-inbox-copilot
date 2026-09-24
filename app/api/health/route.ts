import { NextResponse } from "next/server";
import { getAuditLogStatus } from "@/lib/audit";
import { jsonError } from "@/lib/api";
import { getGoogleSession } from "@/lib/session";

// Operator-facing status check — requires sign-in (this is a personal-scale
// app, not a public status page) so someone can confirm the audit log is
// actually configured and reachable in production without reading logs or
// guessing from silence. It returns two booleans and nothing else.
export async function GET(req: Request) {
  const session = await getGoogleSession(req.headers);
  if (!session) return jsonError("Not authenticated", 401);

  const auditLog = await getAuditLogStatus();
  return NextResponse.json({ auditLog });
}
