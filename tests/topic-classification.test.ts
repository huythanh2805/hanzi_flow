import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  classifyTopics,
  mergeTopicClassification,
} from "@/lib/domain/topic-classification";
import { prepareData } from "../scripts/prepare-data";
import type { Vocabulary } from "@/lib/domain/types";
import topicData from "../data/topics.json";
import rules from "../data/topic-rules.json";

const entry = (
  word: string,
  english: string[],
  machine = false,
): Vocabulary => ({
  id: `test-${word}`,
  word,
  band: "1",
  pinyin: "test",
  official_entry: word,
  official_pinyin: "test",
  source_id: "test",
  source_order: 1,
  topics: [],
  examples: [],
  senses: english.map((en, i) => ({
    id: `sense-${word}-${i}`,
    source_id: "test-dictionary",
    en,
    ...(machine
      ? {
          translation_meta: {
            en: {
              provider: "fixture",
              model: "test",
              source_language: "zh",
              source_text: word,
              review_status: "machine-unreviewed" as const,
            },
          },
        }
      : {}),
  })),
});
const classify = (row: Vocabulary) =>
  classifyTopics([row], rules, topicData)[0]?.topics.map((t) => t.topic_id) ??
  [];

describe("topic meaning disambiguation", () => {
  it("allows useful multiple topics without substring matching Chinese words", () => {
    expect(classify(entry("程序员", ["programmer"]))).toEqual(
      expect.arrayContaining(["technology", "work-career"]),
    );
    expect(classify(entry("家庭", ["family"]))).toContain("family");
    expect(classify(entry("国家", ["country; nation"]))).not.toContain(
      "family",
    );
    expect(classify(entry("银行", ["bank"]))).toContain("finance");
    expect(classify(entry("岸", ["bank; shore"]))).not.toContain("finance");
  });
  it("ignores incidental later senses and metaphorical keywords", () => {
    expect(classify(entry("编造", ["to compile", "to cook up"]))).not.toContain(
      "food",
    );
    expect(
      classify(entry("科", ["branch of study", "family (taxonomy)"])),
    ).not.toContain("family");
    expect(classify(entry("其他", ["other", "the rest"]))).not.toContain(
      "lifestyle",
    );
    expect(classify(entry("培养", ["to train"]))).not.toContain(
      "transportation",
    );
    expect(
      classify(entry("病人", ["sick person; patient; invalid"])),
    ).not.toContain("personality");
    expect(classify(entry("分手", ["to part company"]))).not.toContain(
      "work-career",
    );
    expect(
      classify(entry("禅杖", ["the staff of a Buddhist monk"])),
    ).not.toContain("work-career");
    expect(classify(entry("阶梯", ["flight of steps"]))).not.toContain(
      "transportation",
    );
    expect(classify(entry("平淡", ["flat; dull; ordinary"]))).not.toContain(
      "housing",
    );
    expect(
      classify(entry("判决", ["judgment (by a court of law)"])),
    ).not.toContain("opinions");
  });
  it("does not use unreviewed machine English or fill an unrelated fallback topic", () => {
    expect(classify(entry("测试未分类", ["something"]))).toEqual([]);
    expect(classify(entry("测试机器义", ["computer"], true))).toEqual([]);
  });
});
it("ships nonempty topics, preserves every canonical entry and lexical field, and retains seed attribution", async () => {
  const before = await prepareData({ includeTopicClassification: false });
  const content = JSON.parse(
    await readFile("data/imported/topic-classification.json", "utf8"),
  );
  const result = mergeTopicClassification(
    before.rows,
    content,
    before.topics,
    before.enrichment.source.id,
  );
  const lexical = (v: Vocabulary) =>
    Object.fromEntries(Object.entries(v).filter(([key]) => key !== "topics"));
  expect(result.rows.map(lexical)).toEqual(before.rows.map(lexical));
  expect(
    result.rows.every((v) => new Set(v.topics).size === v.topics.length),
  ).toBe(true);
  for (const topic of before.topics)
    expect(
      result.rows.filter((v) => v.topics.includes(topic.id)).length,
    ).toBeGreaterThan(30);
  expect(
    result.assignments.find(
      (a) =>
        a.vocabulary_id === "hsk30-b1-0124" && a.topic_id === "work-career",
    )!.source_id,
  ).toBe(before.enrichment.source.id);
  expect(
    result.assignments.filter(
      (a) => a.source_id === before.enrichment.source.id,
    ),
  ).toHaveLength(7);
  const first = structuredClone(content.entries[0]);
  first.topics[0].topic_id = "not-a-topic";
  expect(() =>
    mergeTopicClassification(
      before.rows,
      { ...content, entries: [first] },
      before.topics,
      before.enrichment.source.id,
    ),
  ).toThrow("Unknown or duplicate topic");
  expect(() =>
    mergeTopicClassification(
      before.rows,
      { ...content, entries: [{ ...first, id: "not-a-word" }] },
      before.topics,
      before.enrichment.source.id,
    ),
  ).toThrow("Unknown or repeated topic entry");
}, 15000);
