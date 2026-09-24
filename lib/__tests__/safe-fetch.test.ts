import { describe, it, expect, vi, afterEach } from "vitest";
import dns from "node:dns/promises";
import { isBlockedAddress, toSafeUrl, oneClickUnsubscribe, UnsafeUrlError, pinnedLookup } from "../safe-fetch";

describe("isBlockedAddress", () => {
  const blockedIPv4 = [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254", // cloud metadata endpoint
    "172.16.5.5",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
  ];

  it.each(blockedIPv4)("blocks IPv4 %s", (address) => {
    expect(isBlockedAddress(address, 4)).toBe(true);
  });

  it("allows a normal public IPv4 address", () => {
    expect(isBlockedAddress("93.184.216.34", 4)).toBe(false);
    expect(isBlockedAddress("8.8.8.8", 4)).toBe(false);
  });

  it("blocks IPv6 loopback and link-local/unique-local ranges", () => {
    expect(isBlockedAddress("::1", 6)).toBe(true);
    expect(isBlockedAddress("fe80::1", 6)).toBe(true);
    expect(isBlockedAddress("fc00::1", 6)).toBe(true);
  });

  it("allows a normal public IPv6 address", () => {
    expect(isBlockedAddress("2606:4700:4700::1111", 6)).toBe(false);
  });

  it("unwraps an IPv4-mapped IPv6 address and blocks it if the mapped address is blocked", () => {
    // ::ffff:127.0.0.1 must not slip past the IPv6 ranges by hiding a
    // blocked IPv4 loopback/metadata address inside an IPv6-shaped literal.
    expect(isBlockedAddress("::ffff:127.0.0.1", 6)).toBe(true);
    expect(isBlockedAddress("::ffff:169.254.169.254", 6)).toBe(true);
  });

  it("allows an IPv4-mapped IPv6 address whose mapped address is public", () => {
    expect(isBlockedAddress("::ffff:8.8.8.8", 6)).toBe(false);
  });
});

describe("toSafeUrl", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects non-http(s) schemes", async () => {
    expect(await toSafeUrl("ftp://example.com")).toBeNull();
    expect(await toSafeUrl("file:///etc/passwd")).toBeNull();
    expect(await toSafeUrl("not a url")).toBeNull();
  });

  it("rejects non-standard ports", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    expect(await toSafeUrl("http://example.com:8080")).toBeNull();
  });

  it("rejects a hostname that resolves to a blocked address", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "169.254.169.254", family: 4 }] as never);
    expect(await toSafeUrl("http://metadata.internal")).toBeNull();
  });

  it("accepts a hostname that resolves to a public address", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const url = await toSafeUrl("https://example.com/unsub");
    expect(url).not.toBeNull();
    expect(url?.hostname).toBe("example.com");
  });

  it("rejects if any resolved address (not just the first) is blocked", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ] as never);
    expect(await toSafeUrl("http://multi-homed.example")).toBeNull();
  });
});

describe("isBlockedAddress: IPv6 ranges that embed or tunnel IPv4", () => {
  it.each([
    "::",
    "::ffff:7f00:1", // hex form of ::ffff:127.0.0.1
    "::ffff:a9fe:a9fe", // hex form of ::ffff:169.254.169.254
    "::127.0.0.1", // IPv4-compatible
    "::7f00:1", // hex form of the IPv4-compatible loopback
    "64:ff9b::a9fe:a9fe", // NAT64
    "2002:7f00:1::", // 6to4
    "2001:0:4136:e378::1", // Teredo
    "ff02::1", // multicast
    "fec0::1", // site-local
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address, 6)).toBe(true);
  });

  it("fails closed on something that isn't an IP address", () => {
    expect(isBlockedAddress("not-an-ip", 4)).toBe(true);
  });
});

describe("toSafeUrl: literals and credentials", () => {
  it("rejects blocked IP literals without a DNS lookup", async () => {
    const spy = vi.spyOn(dns, "lookup");
    expect(await toSafeUrl("http://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(await toSafeUrl("http://[::1]/")).toBeNull();
    expect(await toSafeUrl("http://[::ffff:7f00:1]/")).toBeNull();
    expect(await toSafeUrl("http://[::127.0.0.1]/")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("rejects URLs with embedded credentials", async () => {
    expect(await toSafeUrl("https://user:pass@example.com/unsub")).toBeNull();
  });
});

describe("pinnedLookup", () => {
  afterEach(() => vi.restoreAllMocks());

  function lookup(hostname: string, options: { all?: boolean } = {}) {
    return new Promise<{ err: Error | null; result: unknown }>((resolve) => {
      pinnedLookup(hostname, options as never, ((err: Error | null, address: unknown) =>
        resolve({ err, result: address })) as never);
    });
  }

  it("refuses at connect time when DNS now answers with a private address (rebinding)", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
    const { err } = await lookup("rebind.example");
    expect(err).toBeInstanceOf(UnsafeUrlError);
  });

  it("hands back the checked public address", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const { err, result } = await lookup("example.com");
    expect(err).toBeNull();
    expect(result).toBe("93.184.216.34");
  });

  it("supports all:true lookups", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const { err, result } = await lookup("example.com", { all: true });
    expect(err).toBeNull();
    expect(result).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });
});

describe("oneClickUnsubscribe", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends one RFC 8058 POST to a public https URL", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never);
    const request = vi.fn().mockResolvedValueOnce({ status: 200, location: null });

    const response = await oneClickUnsubscribe("https://example.com/unsub?u=1", request);

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(new URL("https://example.com/unsub?u=1"), {
      method: "POST",
      body: "List-Unsubscribe=One-Click",
      contentType: "application/x-www-form-urlencoded",
    });
  });

  it("does not follow a redirect: the redirect status is returned for the caller to reject", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never);
    const request = vi.fn().mockResolvedValueOnce({ status: 302, location: "http://169.254.169.254/latest/meta-data/" });

    const response = await oneClickUnsubscribe("https://example.com/unsub", request);

    expect(response.status).toBe(302);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects a plain http URL (RFC 8058 requires https)", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never);
    const request = vi.fn();
    await expect(oneClickUnsubscribe("http://example.com/unsub", request)).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a URL that resolves to a private or metadata address", async () => {
    const request = vi.fn();
    await expect(oneClickUnsubscribe("https://169.254.169.254/", request)).rejects.toBeInstanceOf(UnsafeUrlError);
    vi.spyOn(dns, "lookup").mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }] as never);
    await expect(oneClickUnsubscribe("https://internal.example/unsub", request)).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(request).not.toHaveBeenCalled();
  });
});
