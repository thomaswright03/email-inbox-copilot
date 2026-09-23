import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchTodaysMessages } from "@/lib/gmail";
import { classifySpam } from "@/lib/ai";
import { logAuditEvent } from "@/lib/audit";
import { getCached, setCached } from "@/lib/cache";

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userEmail = session.user?.email ?? "unknown";
  const cacheKey = `spam:${userEmail}:${new Date().toISOString().slice(0, 10)}`;
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) return NextResponse.json(cached);

  let emails;
  try {
    emails = await fetchTodaysMessages(session.accessToken);
  } catch (err) {
    console.error("Failed to fetch today's messages from Gmail:", err);
    return NextResponse.json(
      { error: "Couldn't reach Gmail right now. Try again in a moment." },
      { status: 502 }
    );
  }

  let verdicts;
  try {
    verdicts = await classifySpam(emails);
  } catch (err) {
    console.error("Failed to classify spam via Gemini:", err);
    return NextResponse.json(
      { error: "Couldn't check for spam right now. Try again in a moment." },
      { status: 502 }
    );
  }

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

  await Promise.all(
    flashcards.map((card) =>
      logAuditEvent({ userEmail, action: "classified_spam", messageId: card.id, detail: card.reason })
    )
  );

  const payload = { flashcards };
  setCached(cacheKey, payload, CACHE_TTL_MS);
  return NextResponse.json(payload);
}
