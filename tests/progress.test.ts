import { describe, expect, it } from "vitest";
import { applyProgress, localDate, studiedToday } from "@/lib/domain/progress";
import {
  credentialsSchema,
  filterSchema,
  preferencesSchema,
  progressPatchSchema,
} from "@/lib/domain/validation";
import { defaultPreferences } from "@/lib/domain/types";
const id = "hsk30-b1-0124";
describe("independent progress flags", () => {
  it("favorites do not mark an entry studied or create a review schedule", () => {
    const p = applyProgress(undefined, id, { favorite: true });
    expect(p.state).toBe("NEW");
    expect(p.studied_at).toBeNull();
    expect(p).not.toHaveProperty("due");
  });
  it("preserves the first study date across repeat study and unrelated changes", () => {
    const first = applyProgress(
      undefined,
      id,
      { state: "LEARNING" },
      new Date("2026-10-24T18:00:00Z"),
    );
    const second = applyProgress(
      first,
      id,
      { state: "LEARNING", difficult: true, suspended: true },
      new Date("2026-10-25T18:00:00Z"),
    );
    expect(second.studied_at).toBe(first.studied_at);
    expect(second.state).toBe("LEARNING");
    expect(second.difficult).toBe(true);
    expect(second.suspended).toBe(true);
    expect(applyProgress(second, id, { suspended: false }).difficult).toBe(
      true,
    );
  });
  it("does not downgrade existing mastery through a study action", () => {
    const mastered = {
      ...applyProgress(undefined, id, { state: "LEARNING" }),
      state: "MASTERED" as const,
    };
    expect(applyProgress(mastered, id, { state: "LEARNING" }).state).toBe(
      "MASTERED",
    );
  });
  it("rejects forged identity, due dates, arbitrary flags and false mastery at the action boundary", () => {
    for (const patch of [
      { user_id: "other", favorite: true },
      { state: "MASTERED" },
      { due: "tomorrow" },
      { favorite: "yes" },
      {},
    ])
      expect(progressPatchSchema.safeParse(patch).success).toBe(false);
  });
});
describe("daily boundaries", () => {
  it("uses the configured local date around midnight instead of UTC", () => {
    const date = new Date("2026-10-24T18:00:00Z");
    expect(localDate(date, "Asia/Bangkok")).toBe("2026-10-25");
    expect(localDate(date, "America/New_York")).toBe("2026-10-24");
  });
  it("handles daylight-saving boundaries and counts only first studies today", () => {
    const current = new Date("2026-11-01T06:30:00Z");
    expect(localDate(current, "America/New_York")).toBe("2026-11-01");
    const first = applyProgress(
      undefined,
      id,
      { state: "LEARNING" },
      new Date("2026-10-24T18:00:00Z"),
    );
    expect(
      studiedToday(
        { [id]: first },
        "Asia/Bangkok",
        new Date("2026-10-25T05:00:00Z"),
      ),
    ).toBe(1);
    expect(
      studiedToday(
        { [id]: first },
        "Asia/Bangkok",
        new Date("2026-10-25T18:00:00Z"),
      ),
    ).toBe(0);
  });
  it("validates time zones and supported lesson sizes", () => {
    expect(preferencesSchema.safeParse(defaultPreferences).success).toBe(true);
    expect(
      preferencesSchema.safeParse({
        ...defaultPreferences,
        timeZone: "bad/zone",
      }).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse({ ...defaultPreferences, lessonSize: 17 })
        .success,
    ).toBe(false);
  });
});
describe("request validation", () => {
  it("caps query/page payloads and rejects malformed bands", () => {
    for (const filters of [
      { query: "a".repeat(101) },
      { band: "9" },
      { pageSize: 500 },
      { page: -1 },
    ])
      expect(filterSchema.safeParse(filters).success).toBe(false);
  });
  it("requires valid email and minimum password length", () => {
    expect(
      credentialsSchema.safeParse({ email: "bad", password: "abc" }).success,
    ).toBe(false);
  });
});
