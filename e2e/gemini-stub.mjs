// A stand-in for the Gemini API, used only by the end-to-end tests. The
// AI-on app under test is pointed at it with GEMINI_API_ROOT_URL
// (lib/ai.ts). It answers the triage call (lib/ai-prompts.ts) the way a
// careful model would for the Gmail stand-in's inbox (e2e/gmail-stub.mjs),
// reading only the prompt it was sent: each <email id="…"> block is sorted
// by its subject, and "due today" uses the date the prompt says it is now.
//
// GET /__calls returns how many triage calls it has answered.
import http from "node:http";

const PORT = Number(process.env.GEMINI_STUB_PORT ?? 4011);
let calls = 0;

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

function promptText(body) {
  return (body.contents ?? [])
    .flatMap((c) => c.parts ?? [])
    .map((p) => p.text ?? "")
    .join("\n");
}

const item = (id, fields) => ({ id, bucket: "fyi", action: "", due: "", dueDate: "", spam: false, spamReason: "legitimate", ...fields });

function triage(prompt) {
  const today = prompt.match(/It is now [A-Za-z]+, (\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
  const items = [];
  for (const [, id, block] of prompt.matchAll(/<email id="(e\d+)">([\s\S]*?)<\/email>/g)) {
    const subject = block.match(/^Subject: (.*)$/m)?.[1] ?? "";
    if (/contract/i.test(subject)) {
      items.push(item(id, { bucket: "reply", action: "Ana wants your comments on the contract", due: "Fri" }));
    } else if (/invoice/i.test(subject)) {
      items.push(item(id, { bucket: "deadline", action: "Pay invoice 2291", due: "5 pm", dueDate: today }));
    } else if (/% off/i.test(subject)) {
      items.push(item(id, { bucket: "noise", spam: true, spamReason: "marketing" }));
    } else {
      items.push(item(id, { action: "A new issue of Tools Weekly is out" }));
    }
  }
  return { items };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/__health") return send(res, 200, { ok: true });
  if (url.pathname === "/__calls") return send(res, 200, { calls });

  if (req.method === "POST" && /\/models\/[^/]+:generateContent$/.test(url.pathname)) {
    calls++;
    const text = JSON.stringify(triage(promptText(await readBody(req))));
    return send(res, 200, {
      candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    });
  }
  return send(res, 404, { error: { code: 404, message: "Not found" } });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Gemini stand-in listening on http://127.0.0.1:${PORT}`);
});
