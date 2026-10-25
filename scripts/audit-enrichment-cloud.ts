import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { prepareData } from "./prepare-data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing server-only cloud configuration");
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const snapshotPath = ".local-tests/enrichment-personal-before.json";
async function personalDigest() {
  const snapshot: Record<string, { count: number; sha256: string }> = {};
  for (const table of ["profiles", "user_vocabulary", "review_cards"]) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from(table)
        .select("*")
        .range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    const sorted = rows.map((r) => JSON.stringify(r)).sort();
    snapshot[table] = {
      count: rows.length,
      sha256: createHash("sha256").update(JSON.stringify(sorted)).digest("hex"),
    };
  }
  return snapshot;
}
const snapshot = await personalDigest();
if (process.argv.includes("--before")) {
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(
    "Saved personal-table counts and digests before import. No personal data exported.",
  );
} else {
  const before = JSON.parse(await readFile(snapshotPath, "utf8"));
  if (JSON.stringify(before) !== JSON.stringify(snapshot))
    throw new Error(
      "Personal tables changed during import window; inspect before claiming preservation.",
    );
  const { rows } = await prepareData();
  const expected = {
    vocabulary: rows.length,
    vocabulary_senses: rows.reduce((n, v) => n + v.senses.length, 0),
    vocabulary_translations: rows.reduce(
      (n, v) =>
        n + v.senses.reduce((m, s) => m + Number(!!s.vi) + Number(!!s.en), 0),
      0,
    ),
    vocabulary_examples: rows.reduce((n, v) => n + v.examples.length, 0),
  };
  for (const [table, count] of Object.entries(expected)) {
    const result = await db
      .from(table)
      .select("*", { count: "exact", head: true });
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    if (result.count !== count)
      throw new Error(`${table}: expected ${count}, found ${result.count}`);
  }
  const sample = rows.find(
    (v) => v.examples.length && v.senses.some((s) => s.translation_meta?.vi),
  )!;
  const { data, error } = await db
    .from("catalogue_entries")
    .select("*")
    .eq("id", sample.id)
    .single();
  if (error) throw error;
  if (
    !data.examples.every(
      (e: { vi?: string; en?: string; level_check?: unknown }) =>
        e.vi && e.en && e.level_check,
    ) ||
    !data.senses.some(
      (s: { translation_meta?: { vi?: unknown } }) => s.translation_meta?.vi,
    )
  )
    throw new Error("Read model lost bilingual content or provenance");
  const machineSense = sample.senses.find((s) => s.translation_meta?.vi)!;
  const translated = await db
    .from("vocabulary_translations")
    .select("source_id,text")
    .eq("sense_id", machineSense.id)
    .eq("language", "vi")
    .single();
  if (
    translated.error ||
    translated.data.source_id !== "argos-offline-mt-1.9" ||
    translated.data.text !== machineSense.vi
  )
    throw new Error(
      "Machine translation provenance or corrected text differs in cloud",
    );
  console.log(
    JSON.stringify(
      {
        verified: expected,
        personalTablesUnchanged: true,
        bilingualExamplesAndMetadataVisible: true,
      },
      null,
      2,
    ),
  );
}
