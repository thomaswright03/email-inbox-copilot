import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchTodaysMessages } from "@/lib/gmail";
import { classifySpam } from "@/lib/ai";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const emails = await fetchTodaysMessages(session.accessToken);
  const verdicts = await classifySpam(emails);
  const spamIds = new Set(verdicts.filter((v) => v.isSpam).map((v) => v.id));

  const flashcards = emails
    .filter((e) => spamIds.has(e.id))
    .map((e) => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      snippet: e.snippet,
      hasUnsubscribe: Boolean(e.listUnsubscribe),
      reason: verdicts.find((v) => v.id === e.id)?.reason ?? "",
    }));

  return NextResponse.json({ flashcards });
}
