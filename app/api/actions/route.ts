import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { trashMessage, archiveMessage, getListUnsubscribeHeader } from "@/lib/gmail";

type ActionBody = {
  action: "delete" | "unsubscribe" | "ignore";
  messageId: string;
};

function parseUnsubscribeTargets(header: string): { mailto?: string; url?: string } {
  const matches = [...header.matchAll(/<([^>]+)>/g)].map((m) => m[1]);
  const url = matches.find((m) => m.startsWith("http"));
  const mailto = matches.find((m) => m.startsWith("mailto:"));
  return { url, mailto };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { action, messageId } = (await req.json()) as ActionBody;
  const accessToken = session.accessToken;

  if (action === "ignore") {
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    await trashMessage(accessToken, messageId);
    return NextResponse.json({ ok: true });
  }

  if (action === "unsubscribe") {
    const header = await getListUnsubscribeHeader(accessToken, messageId);
    if (!header) {
      return NextResponse.json({ ok: false, error: "No unsubscribe method found for this message" }, { status: 400 });
    }

    const { url } = parseUnsubscribeTargets(header);
    if (!url) {
      return NextResponse.json({
        ok: false,
        error: "This sender only supports unsubscribing via email; no automatic link available",
      }, { status: 400 });
    }

    try {
      await fetch(url, { method: "GET", redirect: "follow" });
    } catch {
      return NextResponse.json({ ok: false, error: "Unsubscribe request failed" }, { status: 502 });
    }

    await archiveMessage(accessToken, messageId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
