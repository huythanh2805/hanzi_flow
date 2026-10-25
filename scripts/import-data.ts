import { createClient } from "@supabase/supabase-js";
import { prepareData } from "./prepare-data";
import { normalizeSearch } from "../src/lib/domain/catalogue";

const {
  rows,
  manifest,
  topics,
  enrichment,
  imported,
  topicAssignments,
  topicClassification,
} = await prepareData();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and server-only SUPABASE_SECRET_KEY in .env.local before importing.",
  );
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function upsert(
  table: string,
  values: Record<string, unknown>[],
  onConflict = "id",
) {
  for (let i = 0; i < values.length; i += 400) {
    const { error } = await db
      .from(table)
      .upsert(values.slice(i, i + 400), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}
await upsert("vocabulary_sources", [
  {
    id: manifest.id,
    name: manifest.name,
    repository: manifest.repository,
    commit: manifest.commit,
    version: manifest.version,
    standard: manifest.standard,
    license: manifest.license,
    attribution: manifest.attribution,
    metadata: manifest,
  },
  {
    id: enrichment.source.id,
    name: enrichment.source.name,
    version: enrichment.source.version,
    license: enrichment.source.license,
    attribution: enrichment.source.attribution,
    metadata: enrichment.source,
  },
  ...imported.sources,
  ...(topicClassification ? [topicClassification.source] : []),
]);
await upsert("topics", topics);
await upsert(
  "vocabulary",
  rows.map((v) => ({
    id: v.id,
    source_id: v.source_id,
    band: v.band,
    word: v.word,
    pinyin: v.pinyin,
    official_entry: v.official_entry,
    official_pinyin: v.official_pinyin,
    source_order: v.source_order,
    search_text: normalizeSearch(
      [
        v.word,
        v.pinyin,
        ...v.senses.flatMap((s) => [s.vi ?? "", s.en ?? ""]),
      ].join(" "),
    ),
  })),
);
await upsert(
  "vocabulary_senses",
  rows.flatMap((v) =>
    v.senses.map((s, index) => ({
      id: s.id,
      vocabulary_id: v.id,
      source_id: s.source_id,
      part_of_speech: s.part_of_speech ?? null,
      sort_order: index,
      source_url: s.source_url ?? null,
      attribution: s.attribution ?? [],
      match_method: s.match_method ?? "reference-transcription",
      translation_meta: s.translation_meta ?? {},
    })),
  ),
);
await upsert(
  "vocabulary_translations",
  rows.flatMap((v) =>
    v.senses.flatMap((s) =>
      (["vi", "en"] as const).flatMap((language) =>
        s[language]
          ? [
              {
                sense_id: s.id,
                language,
                text: s[language],
                source_id: s.translation_meta?.[language]
                  ? "argos-offline-mt-1.9"
                  : s.source_id,
              },
            ]
          : [],
      ),
    ),
  ),
  "sense_id,language",
);
await upsert("vocabulary_topics", topicAssignments, "vocabulary_id,topic_id");
await upsert(
  "vocabulary_examples",
  rows.flatMap((v) =>
    v.examples.map((example) => ({
      ...example,
      vocabulary_id: v.id,
      original_chinese: example.original_chinese ?? null,
      translation_meta: example.translation_meta ?? {},
    })),
  ),
);
await upsert(
  "vocabulary_audio",
  enrichment.entries.flatMap((entry) =>
    (entry.audio ?? []).map((clip) => ({
      id: clip.id,
      vocabulary_id: entry.id,
      source_id: enrichment.source.id,
      url: clip.url,
    })),
  ),
);
console.log(
  `Upserted ${rows.length} canonical entries, ${rows.reduce((n, v) => n + v.senses.length, 0)} senses and ${rows.reduce((n, v) => n + v.examples.length, 0)} examples. No personal tables were written. Re-running is safe.`,
);
