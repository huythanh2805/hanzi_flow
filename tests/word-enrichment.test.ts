import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  markedPinyin,
  readingKey,
  createSentenceChecker,
  bandRank,
} from "@/lib/domain/word-enrichment";
import {
  importedContentSchema,
  mergeImportedContent,
} from "@/lib/domain/imported-content";
import { normalizeSource } from "@/lib/domain/catalogue";
import type { Band, Vocabulary } from "@/lib/domain/types";

const word = (text: string, band: Band = "1", pinyin = "x"): Vocabulary => ({
  id: `${text}-${pinyin}-${band}`,
  word: text,
  band,
  pinyin,
  official_entry: text,
  official_pinyin: pinyin,
  source_id: "test",
  source_order: 1,
  senses: [],
  examples: [],
  topics: [],
});
describe("dictionary reading alignment", () => {
  it("keeps lexical tones and proper-name capitalization while normalizing spacing and umlauts", () => {
    expect(markedPinyin("xue2 xi2 nu:3 er2 lu:e4 gui4 shui3 dou1 ma5")).toBe(
      "xué xí nǚ ér lüè guì shuǐ dōu ma",
    );
    expect(readingKey("nu:3 er2")).toBe(readingKey("nǚ'ér"));
    expect(readingKey("Bai2")).not.toBe(readingKey("bái"));
    expect(readingKey("hao3")).not.toBe(readingKey("hào"));
  });
});
describe("example lexical Band checks", () => {
  const target = word("爱", "1", "ài");
  const vocabulary = [
    target,
    word("我"),
    word("他"),
    word("你"),
    word("爱情", "4"),
    word("喝"),
    word("绿"),
    word("茶"),
  ];
  const check = createSentenceChecker(vocabulary);
  it("accepts same/lower Band vocabulary and saves the full proof", () => {
    const result = check("我爱他。", target);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.level.target_band).toBe("1");
      expect(result.level.max_band).toBe("1");
      expect(result.level.tokens.map((t) => t.text).join("")).toBe("我爱他");
    }
  });
  it("rejects high Band words, unknown compounds, Latin/numeric text and substring matches", () => {
    expect(check("我爱爱情。", target).accepted).toBe(false);
    expect(check("我爱绿茶。", target).accepted).toBe(false);
    expect(check("我爱AI。", target).accepted).toBe(false);
    expect(check("我爱123。", target).accepted).toBe(false);
    expect(check("我爱情。", target).accepted).toBe(false);
  });
  it("uses the highest Band for ambiguous support words and rejects polyphonic targets", () => {
    expect(
      createSentenceChecker([...vocabulary, word("他", "5")])(
        "我爱他。",
        target,
      ).accepted,
    ).toBe(false);
    expect(
      createSentenceChecker([...vocabulary, word("爱", "3", "āi")])(
        "我爱他。",
        target,
      ).accepted,
    ).toBe(false);
  });
});
it("revalidates every shipped example, rejects forged metadata and preserves canonical identities", async () => {
  const raw = normalizeSource(
    await readFile("data/source/all.jsonl", "utf8"),
    "test",
  );
  const content = importedContentSchema.parse(
    JSON.parse(await readFile("data/imported/enrichment.json", "utf8")),
  );
  const merged = mergeImportedContent(raw, content);
  expect(merged.map((v) => v.id)).toEqual(raw.map((v) => v.id));
  const examples = merged.flatMap((v) => v.examples.map((e) => ({ v, e })));
  expect(examples.length).toBeGreaterThan(6000);
  for (const { v, e } of examples) {
    expect(bandRank(e.level_check!.max_band)).toBeLessThanOrEqual(
      bandRank(v.band),
    );
    expect(e.attribution!.length).toBeGreaterThan(1);
    expect(e.en || e.vi).toBeTruthy();
  }
  const forged = {
    ...content,
    entries: [structuredClone(content.entries.find((e) => e.examples.length)!)],
  };
  forged.entries.find(
    (e) => e.examples.length,
  )!.examples[0].level_check.max_band = "7-9";
  expect(() => mergeImportedContent(raw, forged)).toThrow(
    "Band verification failed",
  );
  const duplicate = {
    ...content,
    entries: [structuredClone(content.entries[0])],
  };
  duplicate.entries.push(duplicate.entries[0]);
  expect(() => mergeImportedContent(raw, duplicate)).toThrow("repeated");
}, 15000);
