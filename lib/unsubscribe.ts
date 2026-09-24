// Works out how a sender lets people unsubscribe, from the message's
// List-Unsubscribe (RFC 2369) and List-Unsubscribe-Post (RFC 8058) headers.
//
// - "one-click": an https URL plus `List-Unsubscribe-Post:
//   List-Unsubscribe=One-Click`. The server POSTs to it (app/api/actions).
// - "link": an http(s) URL without one-click support. A GET to it usually
//   lands on a page asking the person to confirm, so the server doesn't
//   fetch it; the user opens it themselves.
// - "mailto": the sender only accepts an email; the user sends it from
//   Gmail with the address, subject and body the sender asked for.

export type UnsubscribeMethod =
  | { kind: "one-click"; url: string }
  | { kind: "link"; url: string }
  | { kind: "mailto"; to: string; subject: string; body: string };

export function parseUnsubscribeTargets(header: string): { mailto?: string; url?: string } {
  const matches = [...header.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  const url = matches.find((m) => /^https?:\/\//i.test(m));
  const mailto = matches.find((m) => /^mailto:/i.test(m));
  return { url, mailto };
}

function httpUrl(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const ADDRESS = /^[^\s@<>()",;:]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function parseMailto(candidate: string): { to: string; subject: string; body: string } | null {
  if (!/^mailto:/i.test(candidate)) return null;
  const rest = candidate.slice("mailto:".length);
  const [rawTo, query = ""] = rest.split("?", 2);
  let to: string;
  try {
    to = decodeURIComponent(rawTo).trim();
  } catch {
    return null;
  }
  if (!ADDRESS.test(to)) return null;
  const params = new URLSearchParams(query);
  return {
    to,
    subject: (params.get("subject") ?? "unsubscribe").slice(0, 200),
    body: (params.get("body") ?? "unsubscribe").slice(0, 500),
  };
}

function isOneClick(listUnsubscribePost: string | null): boolean {
  return (listUnsubscribePost ?? "").replace(/\s+/g, "").toLowerCase() === "list-unsubscribe=one-click";
}

export function unsubscribeMethod(
  listUnsubscribe: string | null,
  listUnsubscribePost: string | null
): UnsubscribeMethod | null {
  if (!listUnsubscribe) return null;
  const { url, mailto } = parseUnsubscribeTargets(listUnsubscribe);
  const safeUrl = url ? httpUrl(url) : null;
  if (safeUrl && isOneClick(listUnsubscribePost) && safeUrl.startsWith("https:")) {
    return { kind: "one-click", url: safeUrl };
  }
  if (safeUrl) return { kind: "link", url: safeUrl };
  const parsed = mailto ? parseMailto(mailto) : null;
  if (parsed) return { kind: "mailto", ...parsed };
  return null;
}

// Opens a prefilled message in Gmail's compose window.
export function gmailComposeUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
