// fetch() for the dashboard that never throws and never surfaces parser or
// exception text: a network failure is { code: "network" }, no answer
// within FETCH_TIMEOUT_MS is { code: "timeout" }, a response that isn't the
// JSON the API sends (an HTML 502 from a proxy, say) is
// { code: "bad_response" }, and an API error carries the API's own code.

export type FetchResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string };

// Longer than the server's own bounds on Gmail and Gemini (lib/gmail.ts,
// lib/ai.ts), so a slow answer still arrives, but a hung one never leaves
// the dashboard waiting forever.
export const FETCH_TIMEOUT_MS = 20_000;

export async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<FetchResult<T>> {
  const controller = new AbortController();
  let timedOut = false;
  // Settles the wait even where fetch ignores the abort signal.
  const aborted = new Promise<never>((_, reject) =>
    controller.signal.addEventListener("abort", () => reject(new Error("timeout")))
  );
  aborted.catch(() => {});
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    let res: Response;
    try {
      res = await Promise.race([fetch(url, { ...init, signal: controller.signal }), aborted]);
    } catch {
      return { ok: false, status: 0, code: timedOut ? "timeout" : "network" };
    }
    let body: unknown;
    try {
      body = await Promise.race([res.json(), aborted]);
    } catch {
      return { ok: false, status: res.status, code: timedOut ? "timeout" : "bad_response" };
    }
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    if (!res.ok || !record || record.ok === false) {
      const code = typeof record?.code === "string" ? record.code : "bad_response";
      return { ok: false, status: res.status, code };
    }
    return { ok: true, status: res.status, data: body as T };
  } finally {
    clearTimeout(timer);
  }
}
