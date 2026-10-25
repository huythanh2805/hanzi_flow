import { expect, it } from "vitest";
import { enrichCatalogue } from "@/lib/domain/enrichment";
import { normalizeSource } from "@/lib/domain/catalogue";

it("imports attributed examples and HTTPS audio without inventing missing fields", () => {
  const rows = normalizeSource(
    JSON.stringify({
      id: "hsk30-b1-0124",
      band: "1",
      word: "工作",
      pinyin: "gōngzuò",
      official_entry: "工作",
      official_pinyin: "gōngzuò",
    }),
    "fixture",
  );
  const batch = {
    source: {
      id: "test-only",
      name: "Unit test fixtures",
      version: "1",
      license: "Test only",
      attribution: "Fixtures, not real learning content",
      review_status: "approved",
    },
    entries: [
      {
        id: rows[0].id,
        senses: [],
        topics: [],
        examples: [{ id: "test-example", chinese: "测试" }],
        audio: [
          { id: "test-audio", url: "https://example.invalid/fixture.mp3" },
        ],
      },
    ],
  };
  const [entry] = enrichCatalogue(rows, batch, []);
  expect(entry.examples[0]).toEqual({
    id: "test-example",
    chinese: "测试",
    source_id: "test-only",
  });
  expect(entry.examples[0].vi).toBeUndefined();
  expect(entry.audio_url).toBe("https://example.invalid/fixture.mp3");
  expect(() =>
    enrichCatalogue(
      rows,
      {
        ...batch,
        entries: [
          {
            ...batch.entries[0],
            audio: [{ id: "bad", url: "javascript:alert(1)" }],
          },
        ],
      },
      [],
    ),
  ).toThrow();
});
