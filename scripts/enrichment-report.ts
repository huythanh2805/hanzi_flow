import { writeFile } from "node:fs/promises";
import { prepareData } from "./prepare-data";
const { rows, imported } = await prepareData();
const coverage = (selected: typeof rows) => ({
  total: selected.length,
  vi: selected.filter((v) => v.senses.some((s) => s.vi)).length,
  en: selected.filter((v) => v.senses.some((s) => s.en)).length,
  humanVi: selected.filter((v) =>
    v.senses.some((s) => s.vi && !s.translation_meta?.vi),
  ).length,
  humanEn: selected.filter((v) =>
    v.senses.some((s) => s.en && !s.translation_meta?.en),
  ).length,
  machineHeadword: selected.filter((v) =>
    v.senses.some((s) => s.match_method === "machine-headword"),
  ).length,
  withExamples: selected.filter((v) => v.examples.length).length,
  exampleCount: selected.reduce((n, v) => n + v.examples.length, 0),
  bilingualExamples: selected.reduce(
    (n, v) => n + v.examples.filter((e) => e.vi && e.en).length,
    0,
  ),
});
const report = {
  version: 1,
  standard: "GF0025-2021",
  limitations: [
    "Lexical Band check only; grammar and semantic reading in each example have not been certified by a teacher.",
    "Machine translations are explicitly labeled machine-unreviewed, never dictionary-verified.",
    "Polyphonic and repeated same-reading target entries do not receive corpus examples without sense review.",
  ],
  coverage: coverage(rows),
  byBand: Object.fromEntries(
    ["1", "2", "3", "4", "5", "6", "7-9"].map((b) => [
      b,
      coverage(rows.filter((v) => v.band === b)),
    ]),
  ),
  sourceIds: imported.sources.map((s) => s.id),
  missingExamples: rows
    .filter((v) => !v.examples.length)
    .map((v) => ({ id: v.id, word: v.word, pinyin: v.pinyin, band: v.band })),
  machineHeadwords: rows
    .filter((v) => v.senses.some((s) => s.match_method === "machine-headword"))
    .map((v) => ({ id: v.id, word: v.word, pinyin: v.pinyin, band: v.band })),
};
await writeFile("data/imported/report.json", JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ coverage: report.coverage, byBand: report.byBand }, null, 2),
);
