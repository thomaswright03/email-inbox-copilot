import { describe, it, expect, vi, afterEach } from "vitest";
import { standInUrl } from "../stand-ins";

// The end-to-end tests' stand-ins for Google (lib/stand-ins.ts): honoured
// only in their explicit test mode, never on Vercel, and only on this machine.
describe("standInUrl", () => {
  const E2E = { E2E_STAND_INS: "1" } as unknown as NodeJS.ProcessEnv;

  it("is used only with E2E_STAND_INS=1", () => {
    expect(standInUrl("GEMINI_API_ROOT_URL", { GEMINI_API_ROOT_URL: "http://127.0.0.1:4011" } as unknown as NodeJS.ProcessEnv)).toBeUndefined();
    expect(standInUrl("GEMINI_API_ROOT_URL", { E2E_STAND_INS: "true", GEMINI_API_ROOT_URL: "http://127.0.0.1:4011" } as unknown as NodeJS.ProcessEnv)).toBeUndefined();
    expect(standInUrl("GEMINI_API_ROOT_URL", { ...E2E, GEMINI_API_ROOT_URL: "http://127.0.0.1:4011" })).toBe("http://127.0.0.1:4011");
    expect(standInUrl("GMAIL_API_ROOT_URL", { ...E2E, GMAIL_API_ROOT_URL: "http://localhost:4010/" })).toBe("http://localhost:4010/");
    expect(standInUrl("GMAIL_API_ROOT_URL", { ...E2E, GMAIL_API_ROOT_URL: "http://[::1]:4010/" })).toBe("http://[::1]:4010/");
    expect(standInUrl("GEMINI_API_ROOT_URL", E2E)).toBeUndefined();
  });

  it("is never used on Vercel", () => {
    expect(standInUrl("GEMINI_API_ROOT_URL", { ...E2E, VERCEL: "1", GEMINI_API_ROOT_URL: "http://127.0.0.1:4011" })).toBeUndefined();
  });

  it("only points at this machine, over plain http", () => {
    for (const url of [
      "https://gemini-proxy.example/",
      "http://gemini-proxy.example/",
      "http://10.0.0.5:4011",
      "https://127.0.0.1:4011",
      "http://127.0.0.1.evil.example/",
      "not a url",
    ]) {
      expect(standInUrl("GEMINI_API_ROOT_URL", { ...E2E, GEMINI_API_ROOT_URL: url }), url).toBeUndefined();
    }
  });
});

describe("the Gemini client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("@google/genai");
  });

  // Makes one triage call through the real client code with the SDK faked,
  // and returns the options the client was created with.
  async function clientOptions(env: Record<string, string>): Promise<Record<string, unknown>> {
    vi.stubEnv("GEMINI_API_KEY", "key");
    vi.stubEnv("GEMINI_PAID_TIER_PROJECT", "paid-project");
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    vi.spyOn(console, "info").mockImplementation(() => {});
    const created: Record<string, unknown>[] = [];
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        constructor(options: Record<string, unknown>) {
          created.push(options);
        }
        models = { generateContent: async () => ({ text: JSON.stringify({ items: [] }) }) };
      },
    }));
    const { triageToday } = await import("../ai");
    await triageToday(
      [{ id: "m1", threadId: "t1", from: "a@example.com", subject: "Hi", snippet: "", date: "", listUnsubscribe: null, listUnsubscribePost: null, isInInbox: true }],
      { now: "Thursday, 2026-09-24, 09:30 (UTC)" }
    );
    expect(created).toHaveLength(1);
    return created[0];
  }

  it("always sends the key to Google's own endpoint, whatever GEMINI_API_ROOT_URL or the SDK's own variables say", async () => {
    const options = await clientOptions({
      GEMINI_API_ROOT_URL: "https://gemini-proxy.example/",
      GOOGLE_GEMINI_BASE_URL: "https://gemini-proxy.example/",
      GOOGLE_GENAI_USE_VERTEXAI: "true",
    });
    expect(options).toMatchObject({ apiKey: "key", vertexai: false, httpOptions: { baseUrl: "https://generativelanguage.googleapis.com/" } });
  });

  it("uses the stand-in only in the end-to-end tests' mode", async () => {
    const options = await clientOptions({ E2E_STAND_INS: "1", VERCEL: "", GEMINI_API_ROOT_URL: "http://127.0.0.1:4011" });
    expect(options).toMatchObject({ httpOptions: { baseUrl: "http://127.0.0.1:4011" } });
  });
});
