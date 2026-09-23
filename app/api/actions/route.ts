import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { trashMessage, archiveMessage, getListUnsubscribeHeader } from "@/lib/gmail";
import { safeFetchUnsubscribe, UnsafeUrlError } from "@/lib/safe-fetch";
import { parseUnsubscribeTargets } from "@/lib/unsubscribe";
import { logAuditEvent } from "@/lib/audit";

type ActionBody = {
  action: "delete" | "unsubscribe" | "ignore";
  messageId: string;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userEmail = session.user?.email ?? "unknown";
  const { action, messageId } = (await req.json()) as ActionBody;
  const accessToken = session.accessToken;

  if (action === "ignore") {
    await logAuditEvent({ userEmail, action: "ignore", messageId });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    await trashMessage(accessToken, messageId);
    await logAuditEvent({ userEmail, action: "delete", messageId });
    return NextResponse.json({ ok: true });
  }

  if (action === "unsubscribe") {
    const header = await getListUnsubscribeHeader(accessToken, messageId);
    if (!header) {
      await logAuditEvent({
        userEmail,
        action: "unsubscribe",
        messageId,
        detail: "failed: no List-Unsubscribe header",
      });
      return NextResponse.json({ ok: false, error: "No unsubscribe method found for this message" }, { status: 400 });
    }

    const { url } = parseUnsubscribeTargets(header);
    if (!url) {
      await logAuditEvent({
        userEmail,
        action: "unsubscribe",
        messageId,
        detail: "failed: mailto-only, no automatic link",
      });
      return NextResponse.json({
        ok: false,
        error: "This sender only supports unsubscribing via email; no automatic link available",
      }, { status: 400 });
    }

    try {
      await safeFetchUnsubscribe(url);
    } catch (err) {
      const detail = err instanceof UnsafeUrlError ? "failed: unsafe unsubscribe URL blocked" : "failed: request error";
      await logAuditEvent({ userEmail, action: "unsubscribe", messageId, detail });
      if (err instanceof UnsafeUrlError) {
        return NextResponse.json({ ok: false, error: "This unsubscribe link isn't allowed" }, { status: 400 });
      }
      return NextResponse.json({ ok: false, error: "Unsubscribe request failed" }, { status: 502 });
    }

    await archiveMessage(accessToken, messageId);
    await logAuditEvent({ userEmail, action: "unsubscribe", messageId, detail: "succeeded" });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
