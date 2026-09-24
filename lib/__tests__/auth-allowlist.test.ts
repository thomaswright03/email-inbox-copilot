import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth", () => ({ default: () => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() }) }));
vi.mock("next-auth/providers/google", () => ({ default: () => ({}) }));

import { isEmailAllowed } from "@/auth";

describe("isEmailAllowed", () => {
  it("allows everyone when no allowlist is configured", () => {
    expect(isEmailAllowed("anyone@example.com", "")).toBe(true);
    expect(isEmailAllowed("anyone@example.com", undefined)).toBe(true);
  });

  it("matches exact addresses case-insensitively", () => {
    expect(isEmailAllowed("Owner@Example.com", "owner@example.com, other@example.com")).toBe(true);
    expect(isEmailAllowed("stranger@example.com", "owner@example.com")).toBe(false);
  });

  it("matches @domain entries on the full domain only", () => {
    expect(isEmailAllowed("staff@acme.com", "@acme.com")).toBe(true);
    expect(isEmailAllowed("staff@notacme.com", "@acme.com")).toBe(false);
  });
});
