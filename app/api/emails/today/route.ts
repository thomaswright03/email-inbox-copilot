import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchTodaysMessages } from "@/lib/gmail";
import { summarizeToday } from "@/lib/ai";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const emails = await fetchTodaysMessages(session.accessToken);
  const summary = await summarizeToday(emails);

  return NextResponse.json({
    summary,
    count: emails.length,
    emails: emails.map((e) => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      snippet: e.snippet,
      date: e.date,
    })),
  });
}
