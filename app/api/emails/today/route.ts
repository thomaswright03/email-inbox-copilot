import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchTodaysMessages } from "@/lib/gmail";
import { summarizeToday } from "@/lib/ai";
import { getCached, setCached } from "@/lib/cache";

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userEmail = session.user?.email ?? "unknown";
  const cacheKey = `today:${userEmail}:${new Date().toISOString().slice(0, 10)}`;
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

  let summary: string;
  try {
    summary = await summarizeToday(emails);
  } catch (err) {
    console.error("Failed to generate summary from Gemini:", err);
    return NextResponse.json(
      { error: "Couldn't generate your summary right now. Try again in a moment." },
      { status: 502 }
    );
  }

  const payload = {
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

  setCached(cacheKey, payload, CACHE_TTL_MS);
  return NextResponse.json(payload);
}
