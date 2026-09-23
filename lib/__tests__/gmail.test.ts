import { describe, it, expect } from "vitest";
import { isInInbox, getHeader } from "../gmail";

describe("isInInbox", () => {
  it("is true for a message with only the INBOX label", () => {
    expect(isInInbox(["INBOX", "UNREAD"])).toBe(true);
  });

  it("is false for a message already labeled SPAM, even if also in INBOX", () => {
    expect(isInInbox(["INBOX", "SPAM"])).toBe(false);
  });

  it("is false for a message with no INBOX label at all", () => {
    expect(isInInbox(["SENT"])).toBe(false);
  });

  it("is false for an empty label set", () => {
    expect(isInInbox([])).toBe(false);
  });
});

describe("getHeader", () => {
  const headers = [
    { name: "From", value: "sender@example.com" },
    { name: "Subject", value: "Hello" },
  ];

  it("finds a header by exact-case name", () => {
    expect(getHeader(headers, "From")).toBe("sender@example.com");
  });

  it("finds a header case-insensitively", () => {
    expect(getHeader(headers, "subject")).toBe("Hello");
    expect(getHeader(headers, "SUBJECT")).toBe("Hello");
  });

  it("returns an empty string for a missing header", () => {
    expect(getHeader(headers, "List-Unsubscribe")).toBe("");
  });

  it("returns an empty string when headers is undefined", () => {
    expect(getHeader(undefined, "From")).toBe("");
  });
});
