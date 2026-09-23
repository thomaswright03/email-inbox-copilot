import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAuditLogStatus } from "@/lib/audit";

// Operator-facing status check — requires sign-in (this is a personal-scale
// app, not a public status page) so someone can confirm the audit log is
// actually configured and reachable in production without reading logs or
// guessing from silence.
export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const auditLog = await getAuditLogStatus();
  return NextResponse.json({ auditLog });
}
