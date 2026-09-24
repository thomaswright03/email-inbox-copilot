// fetch() for the dashboard that never throws and never surfaces parser or
// exception text: a network failure is { code: "network" }, a response that
// isn't the JSON the API sends (an HTML 502 from a proxy, say) is
// { code: "bad_response" }, and an API error carries the API's own code.

export type FetchResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string };

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<FetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, code: "network" };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, status: res.status, code: "bad_response" };
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (!res.ok || !record || record.ok === false) {
    const code = typeof record?.code === "string" ? record.code : "bad_response";
    return { ok: false, status: res.status, code };
  }
  return { ok: true, status: res.status, data: body as T };
}
