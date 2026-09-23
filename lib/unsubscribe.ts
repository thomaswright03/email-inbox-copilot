// Parses an RFC 8058 List-Unsubscribe header into its candidate targets.
// Prefers the http(s) one-click target; mailto-only senders get no automatic
// link (the caller falls back to a disabled Unsubscribe button).
export function parseUnsubscribeTargets(header: string): { mailto?: string; url?: string } {
  const matches = [...header.matchAll(/<([^>]+)>/g)].map((m) => m[1]);
  const url = matches.find((m) => m.startsWith("http"));
  const mailto = matches.find((m) => m.startsWith("mailto:"));
  return { url, mailto };
}
