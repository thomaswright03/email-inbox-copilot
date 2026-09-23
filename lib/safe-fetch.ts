import dns from "node:dns/promises";
import net, { BlockList } from "node:net";

// Blocks the unsubscribe action from being used as an SSRF vector: a sender
// controls the List-Unsubscribe header, so before we make a server-side
// request to it we reject anything that isn't a plain http(s) URL resolving
// to a public address. Redirects are followed manually so each hop gets the
// same check (a first-hop-only check is trivially bypassed with a redirect
// to an internal address).

const blockedRanges = new BlockList();

const IPV4_BLOCKED_CIDRS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // includes cloud metadata endpoints (169.254.169.254)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
for (const [address, prefix] of IPV4_BLOCKED_CIDRS) {
  blockedRanges.addSubnet(address, prefix, "ipv4");
}

const IPV6_BLOCKED_CIDRS: [string, number][] = [
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
];
for (const [address, prefix] of IPV6_BLOCKED_CIDRS) {
  blockedRanges.addSubnet(address, prefix, "ipv6");
}

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;

function isBlockedAddress(address: string, family: number): boolean {
  if (blockedRanges.check(address, family === 6 ? "ipv6" : "ipv4")) return true;
  // An IPv4 address embedded in an IPv6 address (e.g. ::ffff:127.0.0.1) would
  // otherwise slip past the IPv6 ranges above, so unwrap and check it too.
  if (family === 6 && address.startsWith("::ffff:")) {
    const mapped = address.slice("::ffff:".length);
    if (net.isIPv4(mapped) && blockedRanges.check(mapped, "ipv4")) return true;
  }
  return false;
}

async function toSafeUrl(candidate: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    return null;
  }
  if (addresses.length === 0) return null;
  if (addresses.some((a) => isBlockedAddress(a.address, a.family))) return null;

  return url;
}

export class UnsafeUrlError extends Error {}

export async function safeFetchUnsubscribe(initialUrl: string): Promise<Response> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safeUrl = await toSafeUrl(currentUrl);
    if (!safeUrl) {
      throw new UnsafeUrlError("Unsubscribe link points to a disallowed address");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(safeUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "InboxBuddy-Unsubscribe/1.0" },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      currentUrl = new URL(location, safeUrl).toString();
      continue;
    }

    return response;
  }

  throw new UnsafeUrlError("Too many redirects while following unsubscribe link");
}
