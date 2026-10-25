import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Converter } from "opencc-js";
import { normalizeSource } from "../src/lib/domain/catalogue";
import {
  createSentenceChecker,
  readingKey,
} from "../src/lib/domain/word-enrichment";
import { importedContentSchema } from "../src/lib/domain/imported-content";
import type { Example, Sense } from "../src/lib/domain/types";

type Dictionary = {
  traditional: string;
  simplified: string;
  pinyin: string;
  glosses: string[];
  line: number;
};
type Wiktionary = {
  word: string;
  pos: string;
  senses: { glosses: string[]; tags?: string[] }[];
  sounds: { pinyin?: string; tags?: string[] }[];
};
type Sentence = {
  id: string;
  text: string;
  owner: string;
  license: string;
  translations: Partial<
    Record<
      "en" | "vi",
      { id: string; text: string; owner: string; license: string }
    >
  >;
};
const raw = await readFile("data/source/all.jsonl", "utf8");
const source = JSON.parse(await readFile("data/source/manifest.json", "utf8"));
if (createHash("sha256").update(raw).digest("hex") !== source.sha256)
  throw new Error("HSK checksum mismatch");
const rows = normalizeSource(raw, source.id);
const dictionary: { cedict: Dictionary[]; wiktionary: Wiktionary[] } =
  JSON.parse(await readFile("data/imported/dictionary-input.json", "utf8"));
const sentences: Sentence[] = JSON.parse(
  await readFile("data/imported/sentence-input.json", "utf8"),
);
const downloads = JSON.parse(
  await readFile("data/enrichment-sources/downloads.json", "utf8"),
);
const convert = Converter({ from: "tw", to: "cn" });
const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex").slice(0, 20);
const cedictId = "cc-cedict-20261025";
const wiktId = "viwiktionary-20261002";
const tatoebaId = "tatoeba-20261024";
const cedictUrl = "https://www.mdbg.net/chinese/dictionary?page=cc-cedict";
const entries = new Map(
  rows.map((v) => [
    v.id,
    { id: v.id, senses: [] as Sense[], examples: [] as Example[] },
  ]),
);
const byWord = new Map<string, typeof rows>();
const canonicalReadings = new Map<string, typeof rows>();
for (const row of rows) {
  byWord.set(row.word, [...(byWord.get(row.word) ?? []), row]);
  const key = row.word + "|" + readingKey(row.pinyin);
  canonicalReadings.set(key, [...(canonicalReadings.get(key) ?? []), row]);
}
const review: { id: string; word: string; reason: string }[] = [];
const dictionaries = new Map<string, Dictionary[]>();
const variants = new Map<string, Set<string>>();
for (const d of dictionary.cedict) {
  const key = d.simplified + "|" + readingKey(d.pinyin);
  dictionaries.set(key, [...(dictionaries.get(key) ?? []), d]);
  for (const spelling of [d.simplified, d.traditional])
    variants.set(
      spelling,
      new Set([...(variants.get(spelling) ?? []), d.simplified]),
    );
}
for (const row of rows) {
  const key = row.word + "|" + readingKey(row.pinyin);
  if (canonicalReadings.get(key)!.length > 1) {
    review.push({
      id: row.id,
      word: row.word,
      reason: "same-spelling-reading-across-bands-needs-sense-review",
    });
    continue;
  }
  let found = dictionaries.get(key) ?? [];
  let method: "exact-word-and-reading" | "unique-reading" =
    "exact-word-and-reading";
  if (!found.length) {
    const possible = dictionary.cedict.filter((d) => d.simplified === row.word);
    if (
      new Set(possible.map((d) => readingKey(d.pinyin))).size === 1 &&
      byWord.get(row.word)!.length === 1 &&
      possible[0] &&
      readingKey(possible[0].pinyin).toLowerCase() ===
        readingKey(row.pinyin).toLowerCase()
    ) {
      found = possible;
      method = "unique-reading";
    }
  }
  for (const d of found) {
    const glosses = d.glosses.filter(
      (g) =>
        !/^(CL:|see |variant of |old variant of |archaic variant of |also written |same as )/i.test(
          g,
        ),
    );
    for (const en of glosses) {
      const id = `${cedictId}:${row.id}:${hash(en)}`;
      if (entries.get(row.id)!.senses.some((s) => s.id === id)) continue;
      entries
        .get(row.id)!
        .senses.push({
          id,
          en,
          source_id: cedictId,
          source_url: cedictUrl,
          match_method: method,
          attribution: [
            {
              label: "CC-CEDICT contributors · MDBG",
              license: "CC-BY-SA-4.0",
              url: cedictUrl,
            },
          ],
        });
    }
  }
}
for (const d of dictionary.wiktionary) {
  const spellings = variants.get(d.word) ?? new Set([convert(d.word)]);
  for (const word of spellings) {
    const candidates = byWord.get(word) ?? [];
    // Without attested pronunciation, accept only one reading in both HSK and dictionary.
    const readings = new Set(
      dictionary.cedict
        .filter((e) => e.simplified === word)
        .map((e) => readingKey(e.pinyin)),
    );
    const pinyin = d.sounds.flatMap((s) =>
      s.pinyin ? [readingKey(s.pinyin)] : [],
    );
    const matched = candidates.filter((v) =>
      pinyin.length
        ? pinyin.includes(readingKey(v.pinyin))
        : readings.size === 1 && readings.has(readingKey(v.pinyin)),
    );
    if (matched.length !== 1) continue;
    const row = matched[0];
    const url = `https://vi.wiktionary.org/wiki/${encodeURIComponent(d.word)}`;
    for (const sense of d.senses) {
      const vi = sense.glosses.join("; ");
      if (
        !vi.trim() ||
        /^(Biến thể|Dạng khác|Xem |Chữ giản thể|Chữ phồn thể|Hình thức)/i.test(
          vi,
        )
      )
        continue;
      const id = `${wiktId}:${row.id}:${hash(d.pos + vi)}`;
      if (entries.get(row.id)!.senses.some((s) => s.id === id)) continue;
      entries
        .get(row.id)!
        .senses.push({
          id,
          vi,
          ...(d.pos !== "unknown" ? { part_of_speech: d.pos } : {}),
          source_id: wiktId,
          source_url: url,
          match_method: pinyin.length
            ? "exact-word-and-reading"
            : "unique-reading",
          attribution: [
            {
              label: `Wiktionary tiếng Việt contributors · ${d.word}`,
              license: "CC-BY-SA-4.0",
              url,
            },
          ],
        });
    }
  }
}

const check = createSentenceChecker(rows);
const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const rejected: Record<string, number> = {};
const maxWordLength = Math.max(...[...byWord.keys()].map((w) => w.length));
const ordered = sentences.sort(
  (a, b) =>
    Number(!!b.translations.vi) - Number(!!a.translations.vi) ||
    a.text.length - b.text.length ||
    Number(a.id) - Number(b.id),
);
for (const sentence of ordered) {
  const chinese = convert(sentence.text).normalize("NFC");
  const pieces = [...segmenter.segment(chinese)].filter((s) => s.isWordLike);
  const targets = new Set<string>();
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i; j < pieces.length; j++) {
      const length =
        pieces[j].index + pieces[j].segment.length - pieces[i].index;
      if (length > maxWordLength) break;
      const word = chinese.slice(pieces[i].index, pieces[i].index + length);
      if (byWord.has(word)) targets.add(word);
    }
  }
  for (const word of targets)
    for (const row of byWord.get(word)!) {
      const entry = entries.get(row.id)!;
      if (
        entry.examples.length >= 2 ||
        entry.examples.some((e) => e.chinese === chinese)
      )
        continue;
      if (
        canonicalReadings.get(row.word + "|" + readingKey(row.pinyin))!
          .length !== 1
      )
        continue;
      const result = check(chinese, row);
      if (!result.accepted) {
        rejected[result.reason] = (rejected[result.reason] ?? 0) + 1;
        continue;
      }
      const source_url = `https://tatoeba.org/en/sentences/show/${sentence.id}`;
      const attribution = [
        {
          label: `中文 · ${sentence.owner} · Tatoeba #${sentence.id}`,
          license: sentence.license,
          url: source_url,
        },
      ];
      for (const language of ["vi", "en"] as const) {
        const translation = sentence.translations[language];
        if (translation)
          attribution.push({
            label: `${language.toUpperCase()} · ${translation.owner} · Tatoeba #${translation.id}`,
            license: translation.license,
            url: `https://tatoeba.org/en/sentences/show/${translation.id}`,
          });
      }
      entry.examples.push({
        id: `${tatoebaId}:${row.id}:${sentence.id}`,
        chinese,
        ...(chinese !== sentence.text
          ? { original_chinese: sentence.text }
          : {}),
        ...(sentence.translations.vi
          ? { vi: sentence.translations.vi.text }
          : {}),
        ...(sentence.translations.en
          ? { en: sentence.translations.en.text }
          : {}),
        source_id: tatoebaId,
        source_url,
        attribution,
        level_check: result.level,
      });
    }
}
const content = importedContentSchema.parse({
  version: 1,
  sources: [
    {
      id: cedictId,
      name: "CC-CEDICT",
      version: "2026-10-25",
      license: "CC-BY-SA-4.0",
      attribution:
        "CC-CEDICT contributors, distributed by MDBG. Selected definitions, matched by simplified headword and tonal reading; classifier/redirect-only glosses excluded.",
      repository: cedictUrl,
      metadata: {
        downloads: downloads.filter(
          (d: { file: string }) => d.file === "cedict.txt.gz",
        ),
      },
    },
    {
      id: wiktId,
      name: "Wiktionary tiếng Việt / Kaikki",
      version: "dump 2026-10-02; extraction 2026-10-21",
      license: "CC-BY-SA-4.0",
      attribution:
        "Vietnamese Wiktionary contributors; extracted by Kaikki/Wiktextract. Chinese/Mandarin lexical senses only; no automatic translation. Traditional forms aligned through CC-CEDICT.",
      repository: "https://kaikki.org/viwiktionary/rawdata.html",
      metadata: {
        downloads: downloads.filter(
          (d: { file: string }) => d.file === "viwiktionary.jsonl.gz",
        ),
      },
    },
    {
      id: tatoebaId,
      name: "Tatoeba",
      version: "2026-10-24",
      license: "CC-BY-2.0-FR; CC0-1.0 where stated",
      attribution:
        "Tatoeba sentence owners and translation owners, credited per sentence. Only direct translations. Traditional Chinese converted using OpenCC JS 1.4.2 (MIT AND Apache-2.0); originals retained. Community corpus; lexical Band checked, grammar not certified.",
      repository: "https://tatoeba.org/en/downloads",
      metadata: {
        downloads: downloads.filter((d: { file: string }) =>
          d.file.endsWith("bz2"),
        ),
        checker: "hsk2021-icu-v1",
        node: process.version,
        icu: process.versions.icu,
      },
    },
  ],
  entries: [...entries.values()].filter(
    (e) => e.senses.length || e.examples.length,
  ),
});
await writeFile("data/imported/enrichment.json", JSON.stringify(content));
const count = (ids: typeof rows) => ({
  total: ids.length,
  en: ids.filter((v) => entries.get(v.id)!.senses.some((s) => s.en)).length,
  vi: ids.filter((v) => entries.get(v.id)!.senses.some((s) => s.vi)).length,
  examples: ids.filter((v) => entries.get(v.id)!.examples.length).length,
  examplesVi: ids.filter((v) => entries.get(v.id)!.examples.some((e) => e.vi))
    .length,
  examplesBoth: ids.filter((v) =>
    entries.get(v.id)!.examples.some((e) => e.vi && e.en),
  ).length,
});
const report = {
  version: 1,
  sourceStandard: "GF0025-2021",
  scope:
    "Lexical Band only, not grammatical certification; community content has not been individually teacher-reviewed.",
  coverage: count(rows),
  byBand: Object.fromEntries(
    ["1", "2", "3", "4", "5", "6", "7-9"].map((b) => [
      b,
      count(rows.filter((v) => v.band === b)),
    ]),
  ),
  rejected,
  review,
  missing: rows
    .filter(
      (v) =>
        !entries.get(v.id)!.senses.some((s) => s.en) ||
        !entries.get(v.id)!.senses.some((s) => s.vi) ||
        !entries.get(v.id)!.examples.length,
    )
    .map((v) => ({
      id: v.id,
      word: v.word,
      pinyin: v.pinyin,
      band: v.band,
      en: entries.get(v.id)!.senses.some((s) => s.en),
      vi: entries.get(v.id)!.senses.some((s) => s.vi),
      examples: entries.get(v.id)!.examples.length,
    })),
};
await writeFile(
  "data/imported/source-report.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      coverage: report.coverage,
      byBand: report.byBand,
      review: review.length,
      examples: content.entries.reduce((n, e) => n + e.examples.length, 0),
      senses: content.entries.reduce((n, e) => n + e.senses.length, 0),
    },
    null,
    2,
  ),
);
