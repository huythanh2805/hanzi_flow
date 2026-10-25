import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { sourceChecksum } from "../scripts/source-checksum";
import {
  aggregateProgress,
  makeLessons,
  normalizeSource,
  selectVocabulary,
} from "@/lib/domain/catalogue";
import { applyProgress } from "@/lib/domain/progress";
import { enrichCatalogue } from "@/lib/domain/enrichment";
import { filterSchema } from "@/lib/domain/validation";
import type { Topic, Vocabulary } from "@/lib/domain/types";
import { prepareData } from "../scripts/prepare-data";
let rows: Vocabulary[];
beforeAll(async () => {
  rows = (await prepareData()).rows;
});
describe("pinned source import", () => {
  it.each(["\n", "\r\n"])(
    "verifies the pinned checksum with %j line endings",
    async (ending) => {
      const source = (await readFile("data/source/all.jsonl", "utf8"))
        .replace(/\r\n/g, "\n")
        .replace(/\n/g, ending);
      const expected =
        "48c27811c37d6ee708bcadbffeafdb559b026a5a60b4dda7bad0d6e6d9763413";
      const manifest = JSON.parse(
        await readFile("data/source/manifest.json", "utf8"),
      );
      expect(manifest.sha256).toBe(expected);
      expect(sourceChecksum(source)).toBe(expected);
      expect(sourceChecksum(source.replace('"id"', '"changed_id"'))).not.toBe(
        expected,
      );
    },
  );
  it("verifies all seven band counts", () => {
    expect(rows).toHaveLength(11092);
    expect(
      Object.fromEntries(
        ["1", "2", "3", "4", "5", "6", "7-9"].map((b) => [
          b,
          rows.filter((v) => v.band === b).length,
        ]),
      ),
    ).toEqual({
      "1": 500,
      "2": 772,
      "3": 973,
      "4": 1000,
      "5": 1071,
      "6": 1140,
      "7-9": 5636,
    });
  });
  it("normalizes repeatably by source ID without merging duplicate spellings", async () => {
    const raw = await readFile("data/source/all.jsonl", "utf8");
    const first = normalizeSource(raw, "source");
    const twice = new Map(first.map((v) => [v.id, v]));
    normalizeSource(raw, "source").forEach((v) => twice.set(v.id, v));
    expect(twice.size).toBe(11092);
    expect([...twice.values()]).toEqual(first);
    expect(rows.filter((v) => v.word === "打")).toHaveLength(3);
    expect(new Set(rows.map((v) => v.word)).size).toBe(10946);
  });
  it("rejects duplicate IDs and mismatched band metadata", () => {
    const row = {
      id: "hsk30-b1-0001",
      band: "1",
      word: "爱",
      pinyin: "ài",
      official_entry: "爱",
      official_pinyin: "ài",
    };
    expect(() =>
      normalizeSource(
        [JSON.stringify(row), JSON.stringify(row)].join("\n"),
        "source",
      ),
    ).toThrow("Duplicate source ID");
    expect(() =>
      normalizeSource(JSON.stringify({ ...row, band: "2" }), "source"),
    ).toThrow("Band mismatch");
  });
  it("does not silently supply absent translations, examples, audio or topics from the raw HSK source", async () => {
    const v = normalizeSource(
      await readFile("data/source/all.jsonl", "utf8"),
      "raw",
    )[0];
    expect(v.senses).toEqual([]);
    expect(v.examples).toEqual([]);
    expect(v.topics).toEqual([]);
    expect(v.audio_url).toBeUndefined();
  });
  it("supports multiple separate senses for an exact entry and validates enrichment provenance", () => {
    const v = rows[0];
    const topics: Topic[] = [
      {
        id: "test",
        name: "Test",
        description: "",
        color: "jade",
        icon: "Leaf",
      },
    ];
    const input = {
      source: {
        id: "fixture",
        name: "Test fixture",
        version: "1",
        license: "Test only",
        attribution: "Unit test",
        review_status: "approved",
      },
      entries: [
        {
          id: v.id,
          topics: ["test"],
          senses: [
            { id: "sense-a", vi: "fixture A" },
            { id: "sense-b", en: "fixture B" },
          ],
        },
      ],
    };
    const result = enrichCatalogue([v], input, topics);
    expect(result[0].senses).toHaveLength(2);
    expect(result[0].senses.map((s) => s.source_id)).toEqual([
      "fixture",
      "fixture",
    ]);
    expect(() =>
      enrichCatalogue(
        [v],
        { ...input, source: { ...input.source, license: "" } },
        topics,
      ),
    ).toThrow();
    expect(() =>
      enrichCatalogue(
        [v],
        { ...input, entries: [{ ...input.entries[0], id: "unknown" }] },
        topics,
      ),
    ).toThrow("Unknown");
    expect(() =>
      enrichCatalogue(
        [v],
        { ...input, entries: [{ ...input.entries[0], topics: ["random"] }] },
        topics,
      ),
    ).toThrow("Unknown topic");
  });
});
describe("shared catalogue filtering", () => {
  it("filters by band, topic, and their intersection", () => {
    expect(
      selectVocabulary(rows, filterSchema.parse({ band: "2" })).total,
    ).toBe(772);
    const result = selectVocabulary(
      rows,
      filterSchema.parse({ topic: "work-career", band: "1" }),
    );
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe("hsk30-b1-0124");
    expect(
      selectVocabulary(
        rows,
        filterSchema.parse({ topic: "work-career", band: "2" }),
      ).total,
    ).toBe(0);
  });
  it.each([
    "工作",
    "gōng zuò",
    "gongzuo",
    "công việc",
    "cong viec",
    "occupation",
  ])("searches attested characters, pinyin and translations: %s", (query) => {
    expect(
      selectVocabulary(rows, filterSchema.parse({ query })).items.some(
        (v) => v.id === "hsk30-b1-0124",
      ),
    ).toBe(true);
  });
  it("preserves global progress when switching collections and avoids duplicate topic counting", () => {
    const id = "hsk30-b1-0124";
    const progress = {
      [id]: applyProgress(undefined, id, { state: "LEARNING", favorite: true }),
    };
    const band = selectVocabulary(
      rows,
      filterSchema.parse({ band: "1", state: "LEARNING" }),
      progress,
    );
    const topic = selectVocabulary(
      rows,
      filterSchema.parse({ topic: "work-career", favorite: true }),
      progress,
    );
    expect(band.items.map((v) => v.id)).toEqual([id]);
    expect(topic.items.map((v) => v.id)).toEqual([id]);
    expect(aggregateProgress([id, id], progress)).toEqual({
      total: 1,
      studied: 1,
      mastered: 0,
      percent: 100,
    });
  });
  it("paginates without dropping or repeating entries and clamps stale page indices", () => {
    const page1 = selectVocabulary(
      rows,
      filterSchema.parse({ band: "1", page: 1 }),
    );
    const page2 = selectVocabulary(
      rows,
      filterSchema.parse({ band: "1", page: 2 }),
    );
    expect(
      new Set([...page1.items, ...page2.items].map((v) => v.id)).size,
    ).toBe(60);
    const last = selectVocabulary(
      rows,
      filterSchema.parse({ band: "1", page: 100 }),
    );
    expect(last.page).toBe(17);
    expect(last.items).toHaveLength(20);
  });
});
describe("deterministic study groups", () => {
  it.each([10, 15, 20, 25, 30] as const)(
    "covers a band once in source order with group size %s",
    (size) => {
      const selected = rows.filter((v) => v.band === "1");
      const lessons = makeLessons([...selected].reverse(), size);
      expect(lessons.flatMap((l) => l.entries.map((v) => v.id))).toEqual(
        selected.map((v) => v.id),
      );
      expect(lessons).toHaveLength(Math.ceil(500 / size));
    },
  );
  it("changing size preserves the identity used for progress", () => {
    const selected = rows.filter((v) => v.band === "1");
    expect(
      makeLessons(selected, 10).flatMap((l) => l.entries.map((v) => v.id)),
    ).toEqual(
      makeLessons(selected, 30).flatMap((l) => l.entries.map((v) => v.id)),
    );
  });
});
