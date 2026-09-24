// Pushes an operator alert for events that mean an attack or abuse may be in
// progress (rate limits crossed, cross-site or SSRF attempts, Gemini quota
// exhaustion, sessions rejected). With ALERT_WEBHOOK_URL set (a Slack- or
// Discord-compatible incoming webhook) each alert kind is posted at most
// once per ALERT_COOLDOWN_MS per instance; every alert is also written as a
// structured `level: "alert"` log line for log-drain based alerting.
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const lastSent = new Map<string, number>();

export async function raiseAlert(kind: string, message: string, fields: Record<string, string | number> = {}): Promise<void> {
  console.error(JSON.stringify({ level: "alert", kind, message, ...fields }));

  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url || !url.startsWith("https://")) return;
  const now = Date.now();
  if ((lastSent.get(kind) ?? 0) > now - ALERT_COOLDOWN_MS) return;
  lastSent.set(kind, now);

  const details = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[Inbox Buddy] ${message}${details ? ` (${details})` : ""}`, content: `[Inbox Buddy] ${message}` }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", context: "alert.webhook", error: err instanceof Error ? err.name : "unknown" }));
  }
}
