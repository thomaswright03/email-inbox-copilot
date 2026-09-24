import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net, { BlockList } from "node:net";
import type { LookupFunction } from "node:net";

// Blocks the unsubscribe action from being used as an SSRF vector: a sender
// controls the List-Unsubscribe header, so before we make a server-side
// request to it we reject anything that isn't a plain http(s) URL on a
// standard port resolving only to public addresses. Redirects are followed
// manually so each hop gets the same check (a first-hop-only check is
// trivially bypassed with a redirect to an internal address).
//
// The address check runs inside the socket's own DNS lookup, so the address
// that was checked is exactly the address connected to: there is no second
// resolution for a DNS-rebinding server to answer differently.

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
  ["192.88.99.0", 24],
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
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64 (embeds IPv4)
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments incl. Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (embeds IPv4)
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
];
for (const [address, prefix] of IPV6_BLOCKED_CIDRS) {
  blockedRanges.addSubnet(address, prefix, "ipv6");
}

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;

// Extracts the IPv4 address from an IPv4-mapped (::ffff:a.b.c.d or
// ::ffff:7f00:1) or IPv4-compatible (::a.b.c.d) IPv6 address.
function embeddedIPv4(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = lower.match(/^::(?:ffff:(?:0:)?)?(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted && net.isIPv4(dotted[1])) return dotted[1];
  const hex = lower.match(/^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

export function isBlockedAddress(address: string, family: number | string): boolean {
  const isV6 = family === 6 || family === "IPv6" || net.isIPv6(address);
  if (!isV6) {
    if (!net.isIPv4(address)) return true;
    return blockedRanges.check(address, "ipv4");
  }
  if (!net.isIPv6(address)) return true;
  // An IPv4 address embedded in an IPv6 address (e.g. ::ffff:127.0.0.1)
  // would otherwise slip past the IPv6 ranges, so unwrap and check it too.
  const mapped = embeddedIPv4(address);
  if (mapped) return blockedRanges.check(mapped, "ipv4");
  if (address.toLowerCase().startsWith("::ffff:")) return true;
  return blockedRanges.check(address, "ipv6");
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

// Validates scheme, port and credentials, and resolves the host to check
// every address it points at. The connection itself re-checks at connect
// time via pinnedLookup below.
export async function toSafeUrl(candidate: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  if (url.username || url.password) return null;

  const host = hostnameOf(url);
  if (net.isIP(host)) {
    return isBlockedAddress(host, net.isIP(host)) ? null : url;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    return null;
  }
  if (addresses.length === 0) return null;
  if (addresses.some((a) => isBlockedAddress(a.address, a.family))) return null;

  return url;
}

export class UnsafeUrlError extends Error {}

// A socket-level DNS lookup that refuses to hand back a blocked address.
export const pinnedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, family: options.family ?? 0 }).then(
    (addresses) => {
      if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address, a.family))) {
        callback(new UnsafeUrlError("Unsubscribe link resolves to a disallowed address"), "", 4);
        return;
      }
      if (options.all) {
        (callback as unknown as (err: null, addresses: { address: string; family: number }[]) => void)(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    },
    (err: NodeJS.ErrnoException) => callback(err, "", 4)
  );
};

export type HopResponse = { status: number; location: string | null };
export type HopRequester = (url: URL) => Promise<HopResponse>;

// One request, no automatic redirects, body discarded, hard timeout, and a
// DNS lookup that re-applies the address check at connect time.
export const pinnedRequest: HopRequester = (url) =>
  new Promise<HopResponse>((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: pinnedLookup,
        timeout: FETCH_TIMEOUT_MS,
        headers: { "User-Agent": "InboxBuddy-Unsubscribe/1.0", Accept: "*/*" },
      },
      (res) => {
        const location = res.headers.location ?? null;
        res.resume();
        res.destroy();
        resolve({ status: res.statusCode ?? 0, location });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Unsubscribe request timed out")));
    req.on("error", reject);
    req.end();
  });

export async function safeFetchUnsubscribe(initialUrl: string, request: HopRequester = pinnedRequest): Promise<HopResponse> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safeUrl = await toSafeUrl(currentUrl);
    if (!safeUrl) {
      throw new UnsafeUrlError("Unsubscribe link points to a disallowed address");
    }

    const response = await request(safeUrl);

    if (response.status >= 300 && response.status < 400) {
      if (!response.location) return response;
      currentUrl = new URL(response.location, safeUrl).toString();
      continue;
    }

    return response;
  }

  throw new UnsafeUrlError("Too many redirects while following unsubscribe link");
}
