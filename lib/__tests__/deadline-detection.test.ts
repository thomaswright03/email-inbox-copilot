import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TRIAGE_RESPONSE_SCHEMA,
  TRIAGE_RESPONSE_SCHEMA_NO_DEADLINES,
  TRIAGE_SYSTEM_INSTRUCTION,
  TRIAGE_SYSTEM_INSTRUCTION_NO_DEADLINES,
} from "../ai-prompts";
import type { ParsedEmail } from "../gmail";

// AI deadline detection is off unless the deployment sets
// AI_DEADLINE_DETECTION=1 (vitest.config.ts turns it on for the other
// tests). Off, the model is sent no Date header and no local date, time or
// time zone, is given no deadline bucket, and no item carries a date.

const email: ParsedEmail = {
  id: "court",
  threadId: "t",
  from: "Clerk <clerk@court.example>",
  subject: "Hearing set",
  snippet: "The hearing is set for Friday at 9 am. Opposition due tomorrow.",
  date: "Thu, 24 Sep 2026 09:00:00 -0700",
  isInInbox: true,
  listUnsubscribe: null,
  listUnsubscribePost: null,
};

async function capture(answer: unknown) {
  vi.resetModules();
  const ai = await import("../ai");
  const calls: { prompt: string; config: { systemInstruction: string; responseJsonSchema?: unknown } }[] = [];
  ai.__setModelForTests(async (prompt, config) => {
    calls.push({ prompt, config });
    return JSON.stringify(answer);
  });
  const triage = await ai.triageToday([email], { now: "Thursday, 2026-09-24, 09:05 (America/Los_Angeles)" });
  return { ai, calls, triage };
}

const deadlineAnswer = {
  items: [{ id: "e1", bucket: "deadline", action: "File opposition", due: "tomorrow", dueDate: "2026-09-25", spam: false, spamReason: "legitimate" }],
};

describe("AI deadline detection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off unless AI_DEADLINE_DETECTION=1", async () => {
    const { deadlineDetectionEnabled } = await import("../ai");
    vi.stubEnv("AI_DEADLINE_DETECTION", "");
    expect(deadlineDetectionEnabled()).toBe(false);
    vi.stubEnv("AI_DEADLINE_DETECTION", "true");
    expect(deadlineDetectionEnabled()).toBe(false);
    vi.stubEnv("AI_DEADLINE_DETECTION", "1");
    expect(deadlineDetectionEnabled()).toBe(true);
  });

  it("off: sends no Date header or local time, asks for no dates, and keeps no date the model returns", async () => {
    vi.stubEnv("AI_DEADLINE_DETECTION", "");
    const { calls, triage } = await capture(deadlineAnswer);
    const [{ prompt, config }] = calls;
    expect(prompt).not.toContain("Received:");
    expect(prompt).not.toContain("2026");
    expect(prompt).not.toContain("America/Los_Angeles");
    expect(prompt).not.toContain("It is now");
    expect(config.systemInstruction).toBe(TRIAGE_SYSTEM_INSTRUCTION_NO_DEADLINES);
    expect(config.systemInstruction).not.toContain('"deadline"');
    expect(config.responseJsonSchema).toEqual(TRIAGE_RESPONSE_SCHEMA_NO_DEADLINES);
    // A "deadline" answer doesn't fit the no-deadline shape, so it is
    // discarded and the caller falls back to the rules (which give no dates).
    expect(triage).toBeNull();
  });

  it("off: a well-formed answer is kept, with no dates", async () => {
    vi.stubEnv("AI_DEADLINE_DETECTION", "");
    const { triage } = await capture({
      items: [{ id: "e1", bucket: "reply", action: "Confirm the hearing", spam: false, spamReason: "legitimate" }],
    });
    expect(triage?.items).toEqual([{ id: "court", bucket: "reply", action: "Confirm the hearing", due: "", dueDate: "" }]);
  });

  it("on: sends the Date header and local time, and keeps the model's date", async () => {
    vi.stubEnv("AI_DEADLINE_DETECTION", "1");
    const { calls, triage } = await capture(deadlineAnswer);
    const [{ prompt, config }] = calls;
    expect(prompt).toContain("Received: Thu, 24 Sep 2026");
    expect(prompt).toContain("It is now Thursday, 2026-09-24, 09:05 (America/Los_Angeles)");
    expect(config.systemInstruction).toBe(TRIAGE_SYSTEM_INSTRUCTION);
    expect(config.responseJsonSchema).toEqual(TRIAGE_RESPONSE_SCHEMA);
    expect(triage?.items).toEqual([{ id: "court", bucket: "deadline", action: "File opposition", due: "tomorrow", dueDate: "2026-09-25" }]);
  });

  it("off: lib/triage.ts doesn't work out the user's local time for the model", async () => {
    vi.stubEnv("AI_DEADLINE_DETECTION", "");
    vi.resetModules();
    const localDay = await import("../local-day");
    const describeNow = vi.spyOn(localDay, "describeNow");
    const { triageInbox } = await import("../triage");
    const ai = await import("../ai");
    const prompts: string[] = [];
    ai.__setModelForTests(async (prompt) => {
      prompts.push(prompt);
      return JSON.stringify({ items: [{ id: "e1", bucket: "fyi", action: "Hearing set", spam: false, spamReason: "legitimate" }] });
    });
    const day = localDay.localDay("America/Los_Angeles", new Date("2026-09-24T16:05:00Z"));
    const outcome = await triageInbox("user-deadlines-off", day, "en", [email]);
    expect(outcome.aiStatus).toBe("generated");
    expect(describeNow).not.toHaveBeenCalled();
    expect(prompts[0]).not.toContain("America/Los_Angeles");
  });
});
