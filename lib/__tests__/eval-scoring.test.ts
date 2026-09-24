import { describe, it, expect } from "vitest";
import { SPAM_REASONS } from "../spam-reasons";
import { SPAM_CASES } from "@/evals/golden/spam";
import { SUMMARY_FIXTURES } from "@/evals/golden/summary";
import { BUCKET_FIXTURES } from "@/evals/golden/buckets";
import { BRIEFING_BUCKETS, TRIAGE_CHUNK_SIZE } from "../ai";
import {
  formatBucketScore,
  formatSpamScore,
  mixedSpamInboxes,
  scoreBuckets,
  scoreSpam,
  scoreSummaries,
  toParsedEmail,
} from "@/evals/scoring";

describe("golden sets (evals/golden)", () => {
  it("have at least 30 spam cases with valid, consistent labels and unique ids", () => {
    expect(SPAM_CASES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SPAM_CASES.map((c) => c.id)).size).toBe(SPAM_CASES.length);
    for (const c of SPAM_CASES) {
      expect(SPAM_REASONS).toContain(c.expected.reason);
      expect(c.expected.isSpam).toBe(c.expected.reason !== "legitimate");
    }
    for (const reason of SPAM_REASONS) {
      expect(SPAM_CASES.filter((c) => c.expected.reason === reason).length, reason).toBeGreaterThanOrEqual(4);
    }
  });

  it("use only invented addresses", () => {
    const addresses = [...SPAM_CASES, ...SUMMARY_FIXTURES.flatMap((f) => f.emails), ...BUCKET_FIXTURES.flatMap((f) => f.emails)].map(
      (e) => e.from
    );
    for (const from of addresses) expect(from).toMatch(/@[\w.-]+\.example>?$/);
  });

  it("have several summary fixtures, each with must-mention items", () => {
    expect(SUMMARY_FIXTURES.length).toBeGreaterThanOrEqual(3);
    for (const f of SUMMARY_FIXTURES) {
      expect(f.mustMention.length).toBeGreaterThan(0);
      expect(f.mustNotContain).toContain("http");
    }
  });
});

describe("bucket golden set (evals/golden/buckets.ts)", () => {
  it("covers every bucket, has due-today cases, and fits one triage call per inbox", () => {
    const emails = BUCKET_FIXTURES.flatMap((f) => f.emails);
    for (const bucket of BRIEFING_BUCKETS) {
      expect(emails.filter((e) => e.bucket === bucket).length, bucket).toBeGreaterThanOrEqual(2);
    }
    expect(emails.filter((e) => e.dueToday).length).toBeGreaterThanOrEqual(2);
    // Deadlines that are not today, so "due today" can't pass by marking every deadline.
    expect(emails.filter((e) => e.bucket === "deadline" && !e.dueToday).length).toBeGreaterThanOrEqual(2);
    for (const f of BUCKET_FIXTURES) {
      expect(f.emails.length).toBeLessThanOrEqual(TRIAGE_CHUNK_SIZE);
      expect(f.now).toContain(f.today);
    }
  });
});

describe("mixed spam inboxes", () => {
  it("deal every case out once, mixing spam and legitimate mail, one triage call each", () => {
    const inboxes = mixedSpamInboxes(SPAM_CASES, TRIAGE_CHUNK_SIZE);
    expect(inboxes.length).toBeGreaterThanOrEqual(2);
    expect(inboxes.flat().map((c) => c.id).sort()).toEqual(SPAM_CASES.map((c) => c.id).sort());
    for (const inbox of inboxes) {
      expect(inbox.length).toBeLessThanOrEqual(TRIAGE_CHUNK_SIZE);
      expect(inbox.some((c) => c.expected.isSpam)).toBe(true);
      expect(inbox.some((c) => !c.expected.isSpam)).toBe(true);
    }
  });
});

describe("scoring", () => {
  const cases = SPAM_CASES.filter((c) => ["mk1", "co1", "lg1", "lg2"].includes(c.id));

  it("scores accuracy, precision, recall and reason accuracy", () => {
    const score = scoreSpam(
      cases,
      new Map([
        ["mk1", { isSpam: true, reason: "newsletter" as const }],
        ["lg1", { isSpam: true, reason: "marketing" as const }],
        ["lg2", { isSpam: false, reason: null }],
      ])
    );
    // mk1 right (wrong reason), co1 missed, lg1 false flag, lg2 right.
    expect(score).toMatchObject({ total: 4, accuracy: 0.5, precision: 0.5, recall: 0.5, reasonAccuracy: 0 });
    expect(score.mistakes.map((m) => m.id)).toEqual(["mk1", "co1", "lg1"]);
    expect(formatSpamScore("x", score)).toContain("accuracy 50.0%");
  });

  it("scores summary coverage and catches forbidden text", () => {
    const [workday, , injection] = SUMMARY_FIXTURES;
    const score = scoreSummaries(
      [workday, injection],
      new Map([
        ["workday", "- Ana needs contract comments by Thursday.\n- Billing is down tonight."],
        ["injection", "- Approve the budget. Visit https://evil.example/login"],
      ])
    );
    expect(score.coverage).toBe(1);
    expect(score.forbidden.map((f) => f.text)).toEqual(["http", "evil.example"]);
    expect(scoreSummaries([workday], new Map()).coverage).toBe(0);
  });

  it("scores buckets (any accepted bucket counts) and due-today both ways", () => {
    const [thursday] = BUCKET_FIXTURES;
    const fixture = { ...thursday, emails: thursday.emails.slice(0, 5) };
    // 0 reply ok; 1 wrong bucket; 2 accepts reply or deadline; 3 due today ok;
    // 4 due today but not marked; and 0 wrongly marked due today.
    const score = scoreBuckets(
      [fixture],
      new Map([
        ["thursday-0", { bucket: "reply" as const, dueDate: fixture.today }],
        ["thursday-1", { bucket: "fyi" as const, dueDate: "" }],
        ["thursday-2", { bucket: "deadline" as const, dueDate: "2026-09-30" }],
        ["thursday-3", { bucket: "deadline" as const, dueDate: fixture.today }],
        ["thursday-4", { bucket: "deadline" as const, dueDate: "" }],
      ])
    );
    expect(score).toMatchObject({ total: 5, bucketAccuracy: 0.8, dueTodayAccuracy: 0.6 });
    expect(score.mistakes.map((m) => m.id)).toEqual(["thursday-0", "thursday-1", "thursday-4"]);
    expect(formatBucketScore("x", score)).toContain("bucket 80.0%");
    expect(scoreBuckets([fixture], new Map())).toMatchObject({ bucketAccuracy: 0, dueTodayAccuracy: 0 });
  });

  it("turns a golden case into the email shape the app classifies", () => {
    expect(toParsedEmail(SPAM_CASES[0])).toMatchObject({ id: "mk1", isInInbox: true, listUnsubscribePost: null });
  });
});
