import { readFile, writeFile } from "node:fs/promises";
import { sourceChecksum } from "./source-checksum";
import { normalizeSource } from "../src/lib/domain/catalogue";
import {
  enrichCatalogue,
  enrichmentSchema,
} from "../src/lib/domain/enrichment";
import type { Topic } from "../src/lib/domain/types";
import {
  importedContentSchema,
  mergeImportedContent,
} from "../src/lib/domain/imported-content";
import {
  mergeTopicClassification,
  type TopicAssignment,
} from "../src/lib/domain/topic-classification";

export async function prepareData(
  options: { includeTopicClassification?: boolean } = {},
) {
  const source = await readFile("data/source/all.jsonl", "utf8");
  const manifest = JSON.parse(
    await readFile("data/source/manifest.json", "utf8"),
  );
  if (sourceChecksum(source) !== manifest.sha256)
    throw new Error("Pinned source checksum mismatch");
  const topics: Topic[] = JSON.parse(
    await readFile("data/topics.json", "utf8"),
  );
  const enrichment = enrichmentSchema.parse(
    JSON.parse(await readFile("data/enrichment.json", "utf8")),
  );
  const base = enrichCatalogue(
    normalizeSource(source, manifest.id),
    enrichment,
    topics,
  );
  const imported = importedContentSchema.parse(
    JSON.parse(await readFile("data/imported/enrichment.json", "utf8")),
  );
  const enrichedRows = mergeImportedContent(base, imported);
  const topicData =
    options.includeTopicClassification === false
      ? null
      : mergeTopicClassification(
          enrichedRows,
          JSON.parse(
            await readFile("data/imported/topic-classification.json", "utf8"),
          ),
          topics,
          enrichment.source.id,
        );
  const rows = topicData?.rows ?? enrichedRows;
  const topicAssignments: TopicAssignment[] =
    topicData?.assignments ??
    rows.flatMap((v) =>
      v.topics.map((topic_id) => ({
        vocabulary_id: v.id,
        topic_id,
        source_id: enrichment.source.id,
      })),
    );
  if (rows.length !== 11092) throw new Error("Unexpected source count");
  const expected = {
    "1": 500,
    "2": 772,
    "3": 973,
    "4": 1000,
    "5": 1071,
    "6": 1140,
    "7-9": 5636,
  };
  for (const [band, count] of Object.entries(expected))
    if (rows.filter((v) => v.band === band).length !== count)
      throw new Error(`Incorrect count for ${band}`);
  return {
    rows,
    manifest,
    topics,
    enrichment,
    imported,
    topicAssignments,
    topicClassification: topicData?.classification ?? null,
  };
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("prepare-data.ts")) {
  const { rows, manifest } = await prepareData();
  await writeFile("data/catalogue.json", JSON.stringify(rows));
  console.log(
    `Prepared ${rows.length} source entries; ${new Set(rows.map((v) => v.word)).size} distinct spellings; source ${manifest.commit}.`,
  );
}
