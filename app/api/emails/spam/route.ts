import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchTodaysMessages } from "@/lib/gmail";
import { classifySpam } from "@/lib/ai";
import { logAuditEvent } from "@/lib/audit";
import { getOrSetCached } from "@/lib/response-cache";
import { RouteError } from "@/lib/route-error";

const CACHE_TTL_MS = 5 * 60 * 1000;

async function buildSpamPayload(accessToken: string, userEmail: string) {
  let emails;
  try {
    emails = await fetchTodaysMessages(accessToken);
  } catch (err) {
    console.error("Failed to fetch today's messages from Gmail:", err);
    throw new RouteError("Couldn't reach Gmail right now. Try again in a moment.", 502);
  }

  let verdicts;
  try {
    verdicts = await classifySpam(emails);
  } catch (err) {
    console.error("Failed to classify spam via Gemini:", err);
    throw new RouteError("Couldn't check for spam right now. Try again in a moment.", 502);
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

  // Only logged when this actually ran (a true cache miss) — logging inside
  // getOrSetCached's fetcher, not after it returns, avoids writing duplicate
  // classification rows every time a cached response is served.
  await Promise.all(
    flashcards.map((card) =>
      logAuditEvent({ userEmail, action: "classified_spam", messageId: card.id, detail: card.reason })
    )
  );

  return { flashcards };
}

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userEmail = session.user?.email ?? "unknown";
  const cacheKey = `spam:${userEmail}:${new Date().toISOString().slice(0, 10)}`;

  try {
    const payload = await getOrSetCached(cacheKey, CACHE_TTL_MS, () =>
      buildSpamPayload(session.accessToken!, userEmail)
    );
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof RouteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
