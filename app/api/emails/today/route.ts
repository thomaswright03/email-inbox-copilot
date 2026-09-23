import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchTodaysMessages } from "@/lib/gmail";
import { summarizeToday } from "@/lib/ai";
import { getOrSetCached } from "@/lib/response-cache";
import { RouteError } from "@/lib/route-error";

const CACHE_TTL_MS = 5 * 60 * 1000;

async function buildTodayPayload(accessToken: string) {
  let emails;
  try {
    emails = await fetchTodaysMessages(accessToken);
  } catch (err) {
    console.error("Failed to fetch today's messages from Gmail:", err);
    throw new RouteError("Couldn't reach Gmail right now. Try again in a moment.", 502);
  }

  let summary: string;
  try {
    summary = await summarizeToday(emails);
  } catch (err) {
    console.error("Failed to generate summary from Gemini:", err);
    throw new RouteError("Couldn't generate your summary right now. Try again in a moment.", 502);
  }

  return {
    summary,
    count: emails.length,
    emails: emails.map((e) => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      snippet: e.snippet,
      date: e.date,
    })),
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userEmail = session.user?.email ?? "unknown";
  const cacheKey = `today:${userEmail}:${new Date().toISOString().slice(0, 10)}`;

  try {
    const payload = await getOrSetCached(cacheKey, CACHE_TTL_MS, () => buildTodayPayload(session.accessToken!));
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof RouteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
