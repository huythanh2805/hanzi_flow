import { z } from "zod";
import type { Vocabulary } from "./types";
import { createSentenceChecker } from "./word-enrichment";

const attribution = z
  .array(
    z.object({
      label: z.string().min(1),
      license: z.string().min(1),
      url: z.url(),
    }),
  )
  .min(1);
const provenance = {
  source_id: z.string().min(1),
  source_url: z.url(),
  attribution,
};
const band = z.enum(["1", "2", "3", "4", "5", "6", "7-9"]);
const translationMeta = z
  .partialRecord(
    z.enum(["vi", "en"]),
    z.object({
      provider: z.string(),
      model: z.string(),
      source_language: z.string(),
      source_text: z.string(),
      review_status: z.literal("machine-unreviewed"),
    }),
  )
  .optional();
export const importedContentSchema = z.object({
  version: z.literal(1),
  sources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      version: z.string(),
      license: z.string(),
      attribution: z.string(),
      repository: z.url(),
      metadata: z.record(z.string(), z.unknown()),
    }),
  ),
  entries: z.array(
    z.object({
      id: z.string(),
      senses: z.array(
        z
          .object({
            ...provenance,
            id: z.string().min(1),
            vi: z.string().min(1).optional(),
            en: z.string().min(1).optional(),
            part_of_speech: z.string().optional(),
            translation_meta: translationMeta,
            match_method: z.enum([
              "exact-word-and-reading",
              "unique-reading",
              "machine-headword",
            ]),
          })
          .refine((s) => !!s.vi || !!s.en),
      ),
      examples: z.array(
        z
          .object({
            ...provenance,
            id: z.string().min(1),
            chinese: z.string().min(1),
            original_chinese: z.string().optional(),
            en: z.string().optional(),
            vi: z.string().optional(),
            translation_meta: translationMeta,
            level_check: z.object({
              version: z.literal("hsk2021-icu-v1"),
              scope: z.literal("vocabulary-only"),
              target_band: band,
              max_band: band,
              tokens: z.array(z.object({ text: z.string(), band })).min(1),
            }),
          })
          .refine((e) => !!e.vi || !!e.en),
      ),
    }),
  ),
});
export type ImportedContent = z.infer<typeof importedContentSchema>;

export function mergeImportedContent(
  rows: Vocabulary[],
  input: unknown,
): Vocabulary[] {
  const content = importedContentSchema.parse(input);
  const sources = new Set(content.sources.map((s) => s.id));
  const byId = new Map(rows.map((v) => [v.id, v]));
  const seen = new Set<string>();
  const childIds = new Set(
    rows.flatMap((v) => [...v.senses, ...v.examples].map((s) => s.id)),
  );
  const check = createSentenceChecker(rows);
  for (const entry of content.entries) {
    const v = byId.get(entry.id);
    if (!v || seen.has(entry.id))
      throw new Error(`Unknown or repeated imported entry: ${entry.id}`);
    seen.add(entry.id);
    for (const item of [...entry.senses, ...entry.examples]) {
      if (!sources.has(item.source_id) || childIds.has(item.id))
        throw new Error(`Invalid provenance or duplicate child: ${item.id}`);
      childIds.add(item.id);
    }
    for (const example of entry.examples) {
      const result = check(example.chinese, v);
      if (
        !result.accepted ||
        JSON.stringify(result.level) !== JSON.stringify(example.level_check)
      )
        throw new Error(`Example Band verification failed: ${example.id}`);
    }
    byId.set(v.id, {
      ...v,
      senses: [...v.senses, ...entry.senses],
      examples: [...v.examples, ...entry.examples],
    });
  }
  return rows.map((v) => byId.get(v.id)!);
}
