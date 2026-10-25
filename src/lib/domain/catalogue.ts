import { z } from "zod";
import type {
  Filters,
  PageResult,
  Preferences,
  ProgressMap,
  Vocabulary,
} from "./types";

export const sourceRowSchema = z.object({
  id: z.string().regex(/^hsk30-b(?:[1-6]|79)-\d{4}$/),
  band: z.enum(["1", "2", "3", "4", "5", "6", "7-9"]),
  word: z.string().min(1),
  pinyin: z.string().min(1),
  official_entry: z.string().min(1),
  official_pinyin: z.string().min(1),
});
export function normalizeSource(lines: string, sourceId: string): Vocabulary[] {
  const seen = new Set<string>();
  return lines
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const row = sourceRowSchema.parse(JSON.parse(line));
      if (seen.has(row.id)) throw new Error(`Duplicate source ID: ${row.id}`);
      seen.add(row.id);
      const encodedBand = row.id.split("-")[1].slice(1);
      if ((row.band === "7-9" ? "79" : row.band) !== encodedBand)
        throw new Error(`Band mismatch: ${row.id}`);
      return {
        ...row,
        source_id: sourceId,
        source_order: Number(row.id.slice(-4)),
        senses: [],
        examples: [],
        topics: [],
      };
    });
}
export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, "")
    .trim();
}
export function selectVocabulary(
  rows: Vocabulary[],
  filters: Filters,
  progress: ProgressMap = {},
): PageResult {
  const query = normalizeSearch(filters.query);
  const selected = rows.filter((v) => {
    const p = progress[v.id];
    return (
      (!filters.band || v.band === filters.band) &&
      (!filters.topic || v.topics.includes(filters.topic)) &&
      (!filters.state || (p?.state ?? "NEW") === filters.state) &&
      (!filters.favorite || !!p?.favorite) &&
      (!filters.difficult || !!p?.difficult) &&
      (!query ||
        normalizeSearch(
          [
            v.word,
            v.pinyin,
            ...v.senses.flatMap((s) => [s.vi ?? "", s.en ?? ""]),
          ].join(" "),
        ).includes(query))
    );
  });
  selected.sort((a, b) => {
    if (filters.sort === "progress") {
      const rank = { NEW: 0, LEARNING: 1, MASTERED: 2 };
      const diff =
        rank[progress[b.id]?.state ?? "NEW"] -
        rank[progress[a.id]?.state ?? "NEW"];
      if (diff) return diff;
    }
    return (
      Number(a.band.split("-")[0]) - Number(b.band.split("-")[0]) ||
      a.source_order - b.source_order
    );
  });
  const page = Math.max(
    1,
    Math.min(filters.page, Math.ceil(selected.length / filters.pageSize) || 1),
  );
  return {
    items: selected.slice(
      (page - 1) * filters.pageSize,
      page * filters.pageSize,
    ),
    total: selected.length,
    page,
    pageSize: filters.pageSize,
  };
}
export function makeLessons(
  rows: Vocabulary[],
  size: Preferences["lessonSize"],
) {
  if (![10, 15, 20, 25, 30].includes(size))
    throw new Error("Unsupported lesson size");
  const sorted = [...rows].sort(
    (a, b) =>
      Number(a.band.split("-")[0]) - Number(b.band.split("-")[0]) ||
      a.source_order - b.source_order,
  );
  return Array.from(
    { length: Math.ceil(sorted.length / size) },
    (_, index) => ({
      index: index + 1,
      entries: sorted.slice(index * size, (index + 1) * size),
    }),
  );
}
export function aggregateProgress(ids: string[], progress: ProgressMap) {
  const unique = [...new Set(ids)];
  const studied = unique.filter(
    (id) => progress[id] && progress[id].state !== "NEW",
  ).length;
  const mastered = unique.filter(
    (id) => progress[id]?.state === "MASTERED",
  ).length;
  return {
    total: unique.length,
    studied,
    mastered,
    percent: unique.length ? Math.round((studied / unique.length) * 100) : 0,
  };
}
