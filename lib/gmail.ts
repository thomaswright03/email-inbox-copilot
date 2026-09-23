import { google, gmail_v1 } from "googleapis";

export type ParsedEmail = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  bodyText: string;
  date: string;
  listUnsubscribe: string | null;
  isInInbox: boolean;
};

function getGmailClient(accessToken: string): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function extractPlainText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = decodeBase64Url(payload.body.data);
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return "";
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function fetchTodaysMessages(accessToken: string): Promise<ParsedEmail[]> {
  const gmail = getGmailClient(accessToken);

  const list = await gmail.users.messages.list({
    userId: "me",
    q: "newer_than:1d",
    maxResults: 50,
  });

  const messageIds = list.data.messages ?? [];
  if (messageIds.length === 0) return [];

  const messages = await Promise.all(
    messageIds.map(async (m) => {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "full",
      });
      return full.data;
    })
  );

  return messages.map((msg) => {
    const headers = msg.payload?.headers;
    const labelIds = msg.labelIds ?? [];
    return {
      id: msg.id!,
      threadId: msg.threadId!,
      from: getHeader(headers, "From"),
      subject: getHeader(headers, "Subject") || "(no subject)",
      snippet: msg.snippet ?? "",
      bodyText: extractPlainText(msg.payload).slice(0, 2000),
      date: getHeader(headers, "Date"),
      listUnsubscribe: getHeader(headers, "List-Unsubscribe") || null,
      isInInbox: labelIds.includes("INBOX") && !labelIds.includes("SPAM"),
    };
  });
}

export async function getListUnsubscribeHeader(accessToken: string, messageId: string): Promise<string | null> {
  const gmail = getGmailClient(accessToken);
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["List-Unsubscribe"],
  });
  return getHeader(msg.data.payload?.headers, "List-Unsubscribe") || null;
}

export async function trashMessage(accessToken: string, messageId: string): Promise<void> {
  const gmail = getGmailClient(accessToken);
  await gmail.users.messages.trash({ userId: "me", id: messageId });
}

export async function archiveMessage(accessToken: string, messageId: string): Promise<void> {
  const gmail = getGmailClient(accessToken);
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["INBOX"] },
  });
}
