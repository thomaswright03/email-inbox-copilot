import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createDataRequestCode, verifyDataRequestCode } from "../data-request";

const SECRET = "test-secret-for-data-requests-0123456789";

describe("data request codes", () => {
  it("round-trips the account id, email and time", () => {
    const code = createDataRequestCode("123", "a@example.com", 1_790_000_000_000, SECRET)!;
    expect(verifyDataRequestCode(code, SECRET)).toEqual({ u: "123", e: "a@example.com", t: 1_790_000_000 });
  });

  it("rejects a code with a changed account id or email, or from another deployment", () => {
    const code = createDataRequestCode("123", "a@example.com", Date.now(), SECRET)!;
    const [payload, mac] = code.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "999", e: "a@example.com", t: 1 })).toString("base64url");
    expect(verifyDataRequestCode(`${forged}.${mac}`, SECRET)).toBeNull();
    expect(verifyDataRequestCode(`${payload}.${mac}x`, SECRET)).toBeNull();
    expect(verifyDataRequestCode(code, "some-other-secret-value-0123456789")).toBeNull();
    expect(verifyDataRequestCode("garbage", SECRET)).toBeNull();
  });

  it("is accepted by the operator script's verify command", () => {
    const code = createDataRequestCode("123", "a@example.com", Date.now(), SECRET)!;
    const out = execFileSync(process.execPath, [path.resolve(__dirname, "../../scripts/user-data.mjs"), "verify", code], {
      env: { ...process.env, AUTH_SECRET: SECRET },
    }).toString();
    expect(out).toContain("valid code for account id 123, email a@example.com");
  });
});
