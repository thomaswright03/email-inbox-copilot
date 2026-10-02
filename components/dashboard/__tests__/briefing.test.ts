import { describe, it, expect } from "vitest";
import { createTranslator, MESSAGES } from "@/lib/i18n";
import type { BriefingItem } from "@/lib/ai";
import { briefingCounts, briefingHeadline, isDueToday } from "../briefing";

const TODAY = "2026-09-24";
const item = (bucket: BriefingItem["bucket"], dueDate = ""): BriefingItem => ({ id: "x", bucket, action: "", due: "", dueDate });

describe("isDueToday", () => {
  it("compares the model's due date with the user's local date", () => {
    expect(isDueToday(item("deadline", TODAY), TODAY)).toBe(true);
    expect(isDueToday(item("deadline", "2026-09-25"), TODAY)).toBe(false);
    expect(isDueToday(item("deadline"), TODAY)).toBe(false);
  });
});

describe("briefing headline", () => {
  const en = createTranslator("en", MESSAGES.en);

  it("reads '3 need a reply · 1 deadline today · 14 FYI', leaving noise out", () => {
    const items = [
      ...Array.from({ length: 3 }, () => item("reply")),
      item("deadline", TODAY),
      ...Array.from({ length: 14 }, () => item("fyi")),
      item("noise"),
    ];
    expect(briefingHeadline(briefingCounts(items, TODAY), en)).toBe("3 need a reply · 1 deadline today · 14 FYI");
  });

  it("counts deadlines that aren't today apart, or plainly when none is today", () => {
    expect(briefingHeadline(briefingCounts([item("deadline", TODAY), item("deadline", "2026-09-30"), item("deadline")], TODAY), en)).toBe(
      "1 deadline today · 2 more deadlines"
    );
    expect(briefingHeadline(briefingCounts([item("reply"), item("deadline", "2026-09-30")], TODAY), en)).toBe(
      "1 needs a reply · 1 deadline"
    );
  });

  it("is empty when nothing but noise is left", () => {
    expect(briefingHeadline(briefingCounts([item("noise")], TODAY), en)).toBe("");
  });

  it("is written in Spanish and French too", () => {
    const counts = briefingCounts([item("reply"), item("reply"), item("deadline", TODAY)], TODAY);
    expect(briefingHeadline(counts, createTranslator("es", MESSAGES.es))).toBe("2 necesitan respuesta · 1 vence hoy");
    expect(briefingHeadline(counts, createTranslator("fr", MESSAGES.fr))).toMatch(/^2 .+ · 1 échéance aujourd'hui$/);
  });
});
