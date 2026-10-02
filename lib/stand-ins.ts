// Stand-ins for Google's APIs, used only by the end-to-end tests
// (e2e/gmail-stub.mjs, e2e/gemini-stub.mjs, playwright.config.ts).
//
// GMAIL_API_ROOT_URL and GEMINI_API_ROOT_URL are honoured only when all of
// these hold, and are otherwise ignored:
// - E2E_STAND_INS=1 marks the process as an end-to-end test server;
// - it is not running on Vercel (VERCEL is unset), so a real deployment
//   can't turn them on by accident;
// - the URL is plain http to this machine (127.0.0.1, localhost or [::1]).
// So outside that test mode a Google access token and the Gemini API key
// only ever go to Google. lib/config-check.ts also reports any of these
// settings on a production server.
export type StandInSetting = "GMAIL_API_ROOT_URL" | "GEMINI_API_ROOT_URL";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function standInsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.E2E_STAND_INS === "1" && !env.VERCEL;
}

// The stand-in URL to use instead of Google, or undefined to use Google.
export function standInUrl(name: StandInSetting, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env[name]?.trim();
  if (!raw || !standInsEnabled(env)) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname) ? raw : undefined;
}
