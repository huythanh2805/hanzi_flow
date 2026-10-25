import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { prepareData } from "./prepare-data";

const { rows, topics, topicAssignments, topicClassification } =
  await prepareData();
if (!topicClassification) throw new Error("Missing topic classification");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error(
    "Configure the Supabase URL and server-only key in .env.local",
  );
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function personalSnapshot() {
  const result: Record<string, { count: number; sha256: string }> = {};
  for (const table of ["profiles", "user_vocabulary", "review_cards"]) {
    const serialized: string[] = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await db
        .from(table)
        .select("*")
        .range(start, start + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      serialized.push(...data.map((r) => JSON.stringify(r)));
      if (data.length < 1000) break;
    }
    result[table] = {
      count: serialized.length,
      sha256: createHash("sha256")
        .update(JSON.stringify(serialized.sort()))
        .digest("hex"),
    };
  }
  return result;
}
async function catalogueCounts() {
  const result: Record<string, number | null> = {};
  for (const table of [
    "vocabulary",
    "vocabulary_senses",
    "vocabulary_translations",
    "vocabulary_examples",
  ]) {
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    result[table] = count;
  }
  return result;
}
const before = {
  personal: await personalSnapshot(),
  catalogue: await catalogueCounts(),
};
if (before.catalogue.vocabulary !== rows.length)
  throw new Error(
    "Cloud catalogue does not match the prepared canonical entry count",
  );
const sourceResult = await db
  .from("vocabulary_sources")
  .upsert(topicClassification.source);
if (sourceResult.error) throw new Error(sourceResult.error.message);
for (let offset = 0; offset < topicAssignments.length; offset += 400) {
  const { error } = await db
    .from("vocabulary_topics")
    .upsert(topicAssignments.slice(offset, offset + 400), {
      onConflict: "vocabulary_id,topic_id",
    });
  if (error) throw new Error(error.message);
}
const stored: { vocabulary_id: string; topic_id: string; source_id: string }[] =
  [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db
    .from("vocabulary_topics")
    .select("vocabulary_id,topic_id,source_id")
    .order("vocabulary_id")
    .order("topic_id")
    .range(offset, offset + 999);
  if (error) throw new Error(error.message);
  stored.push(...data);
  if (data.length < 1000) break;
}
const lookup = new Map(
  stored.map((a) => [`${a.vocabulary_id}|${a.topic_id}`, a.source_id]),
);
for (const a of topicAssignments)
  if (lookup.get(`${a.vocabulary_id}|${a.topic_id}`) !== a.source_id)
    throw new Error("Cloud topic assignment or provenance differs");
const counts = Object.fromEntries(
  topics.map((t) => [t.id, stored.filter((a) => a.topic_id === t.id).length]),
);
if (Object.values(counts).some((c) => c === 0))
  throw new Error("An empty topic remains in cloud");
const sample =
  rows.find((v) => v.topics.includes("technology") && v.band === "1") ??
  rows.find((v) => v.topics.includes("technology"))!;
const { data: entry, error: entryError } = await db
  .from("catalogue_entries")
  .select("id,topics")
  .eq("id", sample.id)
  .single();
if (entryError || !entry.topics.includes("technology"))
  throw new Error("Topic not visible through the catalogue view");
const after = {
  personal: await personalSnapshot(),
  catalogue: await catalogueCounts(),
};
if (JSON.stringify(before) !== JSON.stringify(after))
  throw new Error(
    "Personal records or lexical catalogue counts changed during import; inspect before claiming preservation",
  );
const report = {
  source_id: topicClassification.source.id,
  assignedEntries: new Set(topicAssignments.map((a) => a.vocabulary_id)).size,
  assignments: topicAssignments.length,
  cloudAssignments: stored.length,
  counts,
  personalTablesUnchanged: true,
  lexicalCatalogueCountsUnchanged: true,
  readModelVerified: true,
};
await writeFile(
  "data/imported/topic-cloud-report.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
