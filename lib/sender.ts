// Splits a From header ("Name" <addr>, Name <addr>, or a bare address) into
// a display name and an address. Used by the dashboard and the rule-based
// summary.
export function parseSender(from: string): { name: string; email: string } {
  const match = from.trim().match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  if (match) {
    const email = match[2].trim();
    const name = match[1].trim();
    return { name: name || email, email };
  }
  const bare = from.trim();
  return { name: bare, email: bare };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
