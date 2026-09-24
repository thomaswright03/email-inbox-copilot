import { describe, it, expect, vi, beforeEach } from "vitest";

// The real Gemini call path, with only the SDK faked: the client is created
// lazily, transient errors are retried, and every call logs one usage line
// with token counts and no email content.
const generateContent = vi.fn();
const constructed = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
    constructor(options: unknown) {
      constructed(options);
    }
  },
}));

import { classifySpam, MODEL, summarizeToday } from "../ai";
import type { ParsedEmail } from "../gmail";

const EMAIL: ParsedEmail = {
  id: "m1",
  threadId: "t1",
  from: "Deals <deals@shop.example>",
  subject: "SECRET-SUBJECT 50% off",
  snippet: "SECRET-SNIPPET limited time",
  date: "",
  listUnsubscribe: "<https://shop.example/u>",
  listUnsubscribePost: null,
  isInInbox: true,
};

function usageLines(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return spy.mock.calls
    .map(([line]: unknown[]) => JSON.parse(String(line)) as Record<string, unknown>)
    .filter((l: Record<string, unknown>) => l.level === "ai_usage");
}

describe("Gemini calls", () => {
  beforeEach(() => {
    generateContent.mockReset();
  });

  it("does not create the Gemini client until a model call is made", () => {
    expect(constructed).not.toHaveBeenCalled();
  });

  it("logs feature, model, tokens, latency and outcome for each call, without email content", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    generateContent.mockResolvedValue({ text: "- One thing matters", usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 9 } });

    expect(await summarizeToday([EMAIL], "fr")).toEqual({ text: "- One thing matters", incomplete: false });
    expect(constructed).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0]).toMatchObject({ model: MODEL });
    expect(generateContent.mock.calls[0][0].contents).toContain("Write the summary in French");

    const [line] = usageLines(info);
    expect(line).toMatchObject({ feature: "summary", model: MODEL, outcome: "ok", inputTokens: 120, outputTokens: 9 });
    expect(typeof line.latencyMs).toBe("number");
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/SECRET/);
    info.mockRestore();
  });

  it("a summary that stopped at the output limit is flagged incomplete, without its unfinished last line", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    generateContent.mockResolvedValueOnce({
      text: "- Ana needs the contract by Friday\n- Your invoice is due\n- The team off",
      candidates: [{ finishReason: "MAX_TOKENS" }],
    });
    expect(await summarizeToday([EMAIL])).toEqual({
      text: "- Ana needs the contract by Friday\n- Your invoice is due",
      incomplete: true,
    });
    expect(usageLines(info).at(-1)).toMatchObject({ feature: "summary", outcome: "truncated" });

    generateContent.mockResolvedValueOnce({ text: "- All done", candidates: [{ finishReason: "STOP" }] });
    expect(await summarizeToday([EMAIL])).toEqual({ text: "- All done", incomplete: false });
    info.mockRestore();
  });

  it("logs an empty answer and a discarded verdict as such", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    generateContent.mockResolvedValueOnce({ text: "" });
    expect(await summarizeToday([EMAIL])).toBeNull();
    generateContent.mockResolvedValueOnce({ text: '{"isSpam": true, "reason": "made-up"}' });
    expect(await classifySpam([EMAIL])).toEqual([]);
    generateContent.mockResolvedValueOnce({ text: "not json" });
    expect(await classifySpam([EMAIL])).toEqual([]);
    expect(usageLines(info).map((l) => l.outcome)).toEqual(["empty", "ok", "discarded", "ok", "discarded"]);
    info.mockRestore();
  });

  it("retries a transient provider error, and logs a final failure", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error("unavailable"), { status: 503 }))
      .mockResolvedValueOnce({ text: '{"isSpam": true, "reason": "marketing"}' });
    expect(await classifySpam([EMAIL])).toEqual([{ id: "m1", isSpam: true, reason: "marketing" }]);
    expect(generateContent).toHaveBeenCalledTimes(2);

    generateContent.mockRejectedValue(Object.assign(new Error("bad key"), { status: 400 }));
    await expect(summarizeToday([EMAIL])).rejects.toThrow("bad key");
    expect(usageLines(info).at(-1)).toMatchObject({ feature: "summary", outcome: "error", error: "Error" });
    info.mockRestore();
  });

  it("sends nothing when the paid tier isn't attested", async () => {
    vi.stubEnv("GEMINI_PAID_TIER_PROJECT", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(summarizeToday([EMAIL])).rejects.toThrow(/disabled/);
    expect(generateContent).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
