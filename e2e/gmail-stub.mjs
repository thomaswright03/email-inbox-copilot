// A stand-in for the Gmail REST API, used only by the end-to-end tests.
// The app under test is pointed at it with GMAIL_API_ROOT_URL (lib/gmail.ts).
// Every access token gets its own copy of the inbox below, so tests don't
// share state; the token "revoked" answers 401 like a revoked Google grant.
//
// GET /__calls?token=<t> lists the changes (trash, untrash, modify) made
// with that token, for assertions.
import http from "node:http";

const PORT = Number(process.env.GMAIL_STUB_PORT ?? 4010);
const MINUTE = 60 * 1000;

function fixture() {
  const now = Date.now();
  const date = (minutesAgo) => new Date(now - minutesAgo * MINUTE).toUTCString();
  return [
    {
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "Can you look over the attached contract before Friday?",
      headers: { From: "Ana Ruiz <ana@partner.example>", Subject: "Contract review before Friday", Date: date(20) },
    },
    {
      id: "m2",
      threadId: "t2",
      labelIds: ["INBOX"],
      snippet: "Limited time: 50% off everything this weekend only. Act now!",
      headers: {
        From: "MegaDeals <deals@megadeals.example>",
        Subject: "LIMITED TIME: 50% OFF EVERYTHING",
        Date: date(90),
        "List-Unsubscribe": "<https://megadeals.example/unsubscribe?u=1>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    },
    {
      id: "m3",
      threadId: "t3",
      labelIds: ["INBOX"],
      snippet: "This week in tools: click here for the full newsletter. Unsubscribe anytime.",
      headers: {
        From: "Tools Weekly <news@toolsweekly.example>",
        Subject: "This week in tools",
        Date: date(180),
        "List-Unsubscribe": "<mailto:leave@toolsweekly.example?subject=unsubscribe>",
      },
    },
  ];
}

const inboxes = new Map();
const calls = new Map();

function inboxFor(token) {
  if (!inboxes.has(token)) inboxes.set(token, fixture());
  return inboxes.get(token);
}

function record(token, entry) {
  if (!calls.has(token)) calls.set(token, []);
  calls.get(token).push(entry);
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });
}

function asMetadata(message, wanted) {
  const names = wanted.length ? wanted.map((h) => h.toLowerCase()) : null;
  return {
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds,
    snippet: message.snippet,
    payload: {
      headers: Object.entries(message.headers)
        .filter(([name]) => !names || names.includes(name.toLowerCase()))
        .map(([name, value]) => ({ name, value })),
    },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/__health") return send(res, 200, { ok: true });
  if (url.pathname === "/__calls") return send(res, 200, calls.get(url.searchParams.get("token")) ?? []);

  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token === "revoked") {
    return send(res, 401, { error: { code: 401, message: "Invalid Credentials", status: "UNAUTHENTICATED" } });
  }
  const inbox = inboxFor(token);

  const match = url.pathname.match(/^\/gmail\/v1\/users\/me\/messages(?:\/([^/]+))?(?:\/(trash|untrash|modify))?$/);
  if (!match) return send(res, 404, { error: { code: 404, message: "Not found" } });
  const [, id, verb] = match;

  if (!id && req.method === "GET") {
    const messages = inbox.filter((m) => !m.labelIds.includes("TRASH")).map((m) => ({ id: m.id, threadId: m.threadId }));
    return send(res, 200, { messages, resultSizeEstimate: messages.length });
  }

  const message = inbox.find((m) => m.id === id);
  if (!message) return send(res, 404, { error: { code: 404, message: "Requested entity was not found." } });

  if (!verb && req.method === "GET") return send(res, 200, asMetadata(message, url.searchParams.getAll("metadataHeaders")));

  if (req.method === "POST") {
    const body = await readBody(req);
    if (verb === "trash") message.labelIds = [...message.labelIds.filter((l) => l !== "INBOX"), "TRASH"];
    if (verb === "untrash") message.labelIds = [...message.labelIds.filter((l) => l !== "TRASH"), "INBOX"];
    if (verb === "modify") {
      const remove = new Set(body.removeLabelIds ?? []);
      message.labelIds = [...message.labelIds.filter((l) => !remove.has(l)), ...(body.addLabelIds ?? [])];
    }
    record(token, { verb, id, body });
    return send(res, 200, asMetadata(message, []));
  }

  return send(res, 405, { error: { code: 405, message: "Method not allowed" } });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Gmail stand-in listening on http://127.0.0.1:${PORT}`);
});
