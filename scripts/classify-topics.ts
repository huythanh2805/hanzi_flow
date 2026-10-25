import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { prepareData } from "./prepare-data";
import {
  classifyTopics,
  topicRulesSchema,
  topicClassificationSchema,
} from "../src/lib/domain/topic-classification";

const { rows, topics, manifest } = await prepareData({
  includeTopicClassification: false,
});
const rulesText = await readFile("data/topic-rules.json", "utf8");
const rules = topicRulesSchema.parse(JSON.parse(rulesText));
const entries = classifyTopics(rows, rules, topics);
const classification = topicClassificationSchema.parse({
  source: {
    id: "hanziflow-topic-rules-v1",
    name: "HanziFlow topic classification",
    version: rules.version,
    license:
      "CC-BY-SA-4.0 (classification metadata; dictionary licenses retained)",
    attribution:
      "Project-authored topic rules prepared by Codex at the owner's request. Exact Chinese headword sets and attested English dictionary sense keywords; no runtime AI or external classification service. Rule-generated labels, not an official HSK topic taxonomy or teacher-approved sense mapping.",
    metadata: {
      rules_file: "data/topic-rules.json",
      rules_sha256: createHash("sha256").update(rulesText).digest("hex"),
      method: "multi-label-headwords-and-attested-dictionary-keywords",
      review_status: "rule-classified",
      vocabulary_source: {
        id: manifest.id,
        sha256: manifest.sha256,
        commit: manifest.commit,
      },
      dictionary_inputs: [
        ...new Set(
          entries.flatMap((e) =>
            e.topics.flatMap((t) =>
              t.dictionary_source_id ? [t.dictionary_source_id] : [],
            ),
          ),
        ),
      ],
      dictionary_scope:
        "First attested English sense only; machine English and incidental later senses excluded",
      evidence_file: "data/imported/topic-classification.json",
    },
  },
  entries,
});
await writeFile(
  "data/imported/topic-classification.json",
  JSON.stringify(classification),
);
const classified = new Map(entries.map((e) => [e.id, e.topics]));
const byTopic = Object.fromEntries(
  topics.map((topic) => {
    const selected = rows.filter(
      (v) =>
        v.topics.includes(topic.id) ||
        classified.get(v.id)?.some((t) => t.topic_id === topic.id),
    );
    return [
      topic.id,
      {
        name: topic.name,
        count: selected.length,
        byBand: Object.fromEntries(
          ["1", "2", "3", "4", "5", "6", "7-9"].map((b) => [
            b,
            selected.filter((v) => v.band === b).length,
          ]),
        ),
        samples: selected
          .filter(
            (_, i) => i % Math.max(1, Math.floor(selected.length / 20)) === 0,
          )
          .slice(0, 20)
          .map((v) => ({
            id: v.id,
            word: v.word,
            en: v.senses
              .filter((s) => s.en && !s.translation_meta?.en)
              .map((s) => s.en)
              .join("; ")
              .slice(0, 260),
            evidence: classified
              .get(v.id)
              ?.find((t) => t.topic_id === topic.id),
          })),
      },
    ];
  }),
);
if (Object.values(byTopic).some((t) => t.count === 0))
  throw new Error("Some topics remain empty");
const report = {
  version: rules.version,
  total: rows.length,
  classified: rows.filter((v) => v.topics.length || classified.has(v.id))
    .length,
  assignments: Object.values(byTopic).reduce((n, t) => n + t.count, 0),
  byTopic,
  unassigned: rows
    .filter((v) => !v.topics.length && !classified.has(v.id))
    .map((v) => ({
      id: v.id,
      word: v.word,
      band: v.band,
      reason:
        "No sufficiently specific match within the existing twenty topics",
    })),
};
await writeFile(
  "data/imported/topic-report.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      classified: report.classified,
      unassigned: report.unassigned.length,
      assignments: report.assignments,
      byTopic: Object.fromEntries(
        Object.entries(byTopic).map(([id, t]) => [id, t.count]),
      ),
    },
    null,
    2,
  ),
);
