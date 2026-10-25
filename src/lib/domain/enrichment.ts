import { z } from "zod";
import type { Topic, Vocabulary } from "./types";
export const enrichmentSchema = z.object({
  source: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      version: z.string().min(1),
      license: z.string().min(1),
      attribution: z.string().min(1),
      review_status: z.enum(["approved", "reference-transcription"]),
    })
    .passthrough(),
  entries: z.array(
    z.object({
      id: z.string(),
      senses: z.array(
        z
          .object({
            id: z.string().min(1),
            vi: z.string().min(1).optional(),
            en: z.string().min(1).optional(),
            part_of_speech: z.string().optional(),
          })
          .refine(
            (s) => !!s.vi || !!s.en,
            "Sense needs an attested translation",
          ),
      ),
      topics: z.array(z.string()),
      examples: z
        .array(
          z.object({
            id: z.string().min(1),
            chinese: z.string().min(1),
            pinyin: z.string().min(1).optional(),
            vi: z.string().min(1).optional(),
            en: z.string().min(1).optional(),
          }),
        )
        .default([]),
      audio: z
        .array(
          z.object({
            id: z.string().min(1),
            url: z
              .url()
              .refine(
                (url) => url.startsWith("https://"),
                "Audio references must use HTTPS",
              ),
          }),
        )
        .default([]),
    }),
  ),
});
export function enrichCatalogue(
  rows: Vocabulary[],
  input: unknown,
  topics: Topic[],
) {
  const enrichment = enrichmentSchema.parse(input);
  const ids = new Set(rows.map((v) => v.id));
  const topicIds = new Set(topics.map((t) => t.id));
  const seen = new Set<string>();
  const senses = new Set<string>();
  const examples = new Set<string>();
  const audio = new Set<string>();
  for (const e of enrichment.entries) {
    if (!ids.has(e.id) || seen.has(e.id))
      throw new Error(`Unknown or duplicate enrichment entry: ${e.id}`);
    seen.add(e.id);
    for (const t of e.topics)
      if (!topicIds.has(t)) throw new Error(`Unknown topic: ${t}`);
    for (const s of e.senses) {
      if (senses.has(s.id)) throw new Error(`Conflicting sense ID: ${s.id}`);
      senses.add(s.id);
    }
    for (const example of e.examples) {
      if (examples.has(example.id))
        throw new Error(`Conflicting example ID: ${example.id}`);
      examples.add(example.id);
    }
    for (const clip of e.audio) {
      if (audio.has(clip.id))
        throw new Error(`Conflicting audio ID: ${clip.id}`);
      audio.add(clip.id);
    }
  }
  const byId = new Map(enrichment.entries.map((e) => [e.id, e]));
  return rows.map((v) => {
    const e = byId.get(v.id);
    return e
      ? {
          ...v,
          senses: e.senses.map((s) => ({
            ...s,
            source_id: enrichment.source.id,
          })),
          topics: [...new Set(e.topics)],
          examples: e.examples.map((example) => ({
            ...example,
            source_id: enrichment.source.id,
          })),
          ...(e.audio.length
            ? {
                audio_url: [...e.audio].sort((a, b) =>
                  a.id.localeCompare(b.id),
                )[0].url,
              }
            : {}),
        }
      : v;
  });
}
