import { describe, it, expect, vi, afterEach } from "vitest";
import { redact, toSafeError, logError } from "../log";

describe("redact", () => {
  it.each([
    ["Authorization: Bearer ya29.a0AfH6SMBx-secret", "ya29"],
    ["token ya29.A0ARrdaM-abcdef", "ya29"],
    ["refresh 1//0gAbCdEfGhIjKlMnOpQrStUvWxYz", "1//0g"],
    ["key AIzaSyA1234567890abcdefghijklmnop", "AIza"],
    ["https://x.example/cb?code=4/abc&state=1", "4/abc"],
    ["postgres://user:pw@db.neon.tech/app", "pw@"],
  ])("removes secrets from %s", (input, secretFragment) => {
    expect(redact(input)).not.toContain(secretFragment);
  });
});

describe("toSafeError / logError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("drops request config and headers carried by API client errors", () => {
    const err = Object.assign(new Error("Request failed with status code 401"), {
      code: "401",
      config: { headers: { Authorization: "Bearer ya29.live-token" } },
      response: { status: 401 },
    });
    const safe = toSafeError(err);
    expect(safe).toEqual({ name: "Error", message: "Request failed with status code 401", status: 401, code: "401" });

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("test", err);
    expect(spy.mock.calls[0][0]).not.toContain("ya29");
  });
});
