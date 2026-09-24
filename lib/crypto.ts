import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Authenticated encryption (AES-256-GCM) for inbox-derived data written to
// Postgres, so a database dump or a leaked DATABASE_URL doesn't expose
// email senders, subjects, previews or AI summaries. The key is derived from
// AUTH_SECRET with HKDF and a purpose label, so it is never stored anywhere
// and rotating AUTH_SECRET makes old ciphertext unreadable (it then just
// counts as a cache miss).

export type Sealed = { v: 1; iv: string; ct: string; tag: string };

function deriveKey(purpose: string): Buffer | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return Buffer.from(hkdfSync("sha256", secret, "inbox-buddy", `inbox-buddy:${purpose}`, 32));
}

export function seal(value: unknown, purpose: string, aad: string): Sealed | null {
  const key = deriveKey(purpose);
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { v: 1, iv: iv.toString("base64"), ct: ct.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function unseal<T>(sealed: unknown, purpose: string, aad: string): T | undefined {
  const key = deriveKey(purpose);
  if (!key || !sealed || typeof sealed !== "object") return undefined;
  const s = sealed as Partial<Sealed>;
  if (s.v !== 1 || typeof s.iv !== "string" || typeof s.ct !== "string" || typeof s.tag !== "string") return undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(s.iv, "base64"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(s.tag, "base64"));
    const pt = Buffer.concat([decipher.update(Buffer.from(s.ct, "base64")), decipher.final()]);
    return JSON.parse(pt.toString("utf8")) as T;
  } catch {
    return undefined;
  }
}
