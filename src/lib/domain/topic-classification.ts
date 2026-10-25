import { z } from "zod";
import type { Topic, Vocabulary } from "./types";

export const topicRulesSchema = z.object({
  version: z.string().min(1),
  rules: z.array(
    z.object({
      id: z.string().min(1),
      topic_id: z.string().min(1),
      words: z.string(),
      english: z.string(),
      exclude_english: z.string().optional(),
      exclude_words: z.string().optional(),
    }),
  ),
});
export type TopicRules = z.infer<typeof topicRulesSchema>;
export const topicClassificationSchema = z.object({
  source: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    license: z.string().min(1),
    attribution: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()),
  }),
  entries: z.array(
    z.object({
      id: z.string(),
      topics: z
        .array(
          z.object({
            topic_id: z.string(),
            rule_id: z.string(),
            method: z.enum(["headword", "dictionary-keyword"]),
            sense_id: z.string().optional(),
            dictionary_source_id: z.string().optional(),
            matched: z.string(),
          }),
        )
        .min(1),
    }),
  ),
});
export type TopicClassification = z.infer<typeof topicClassificationSchema>;
export type TopicAssignment = {
  vocabulary_id: string;
  topic_id: string;
  source_id: string;
};

export function classifyTopics(
  rows: Vocabulary[],
  rulesInput: unknown,
  topics: Topic[],
) {
  const rules = topicRulesSchema.parse(rulesInput);
  const validTopics = new Set(topics.map((t) => t.id));
  const ids = new Set<string>();
  const compiled = rules.rules.map((r) => {
    if (!validTopics.has(r.topic_id) || ids.has(r.id))
      throw new Error(`Unknown topic or duplicate rule: ${r.id}`);
    ids.add(r.id);
    return {
      ...r,
      words: new Set(r.words.split(/\s+/).filter(Boolean)),
      excludedWords: new Set(
        (r.exclude_words ?? "").split(/\s+/).filter(Boolean),
      ),
      english: new RegExp(r.english, "iu"),
      exclude: r.exclude_english ? new RegExp(r.exclude_english, "iu") : null,
    };
  });
  return rows.flatMap((v) => {
    const found = new Map<
      string,
      TopicClassification["entries"][number]["topics"][number]
    >();
    for (const rule of compiled) {
      if (found.has(rule.topic_id) || rule.excludedWords.has(v.word)) continue;
      if (rule.words.has(v.word)) {
        found.set(rule.topic_id, {
          topic_id: rule.topic_id,
          rule_id: rule.id,
          method: "headword",
          matched: v.word,
        });
        continue;
      }
      for (const sense of v.senses
        .filter((s) => s.en && !s.translation_meta?.en)
        .slice(0, 1)) {
        // Do not classify from unreviewed machine translations or incidental
        // see-also/surname/variant/classifier references in a dictionary gloss.
        if (
          !sense.en ||
          sense.translation_meta?.en ||
          /^(surname\b|CL:|see\b|variant of\b|old variant of\b)/i.test(sense.en)
        )
          continue;
        const gloss = sense.en
          .replace(/\([^)]*\)/g, " ")
          .replace(/\[[^\]]*\]/g, " ");
        if (rule.exclude?.test(sense.en)) continue;
        const match = rule.english.exec(gloss);
        if (match) {
          found.set(rule.topic_id, {
            topic_id: rule.topic_id,
            rule_id: rule.id,
            method: "dictionary-keyword",
            sense_id: sense.id,
            dictionary_source_id: sense.source_id,
            matched: match[0],
          });
          break;
        }
      }
    }
    return found.size ? [{ id: v.id, topics: [...found.values()] }] : [];
  });
}

export function mergeTopicClassification(
  rows: Vocabulary[],
  input: unknown,
  topics: Topic[],
  seedSourceId: string,
) {
  const classification = topicClassificationSchema.parse(input);
  const known = new Map(rows.map((v) => [v.id, v]));
  const validTopics = new Set(topics.map((t) => t.id));
  const seen = new Set<string>();
  const byId = new Map<string, string[]>();
  for (const entry of classification.entries) {
    if (!known.has(entry.id) || seen.has(entry.id))
      throw new Error(`Unknown or repeated topic entry: ${entry.id}`);
    seen.add(entry.id);
    const topicIds = new Set<string>();
    const row = known.get(entry.id)!;
    for (const item of entry.topics) {
      if (!validTopics.has(item.topic_id) || topicIds.has(item.topic_id))
        throw new Error(`Unknown or duplicate topic: ${item.topic_id}`);
      if (
        item.method === "dictionary-keyword" &&
        !row.senses.some(
          (s) =>
            s.id === item.sense_id &&
            s.source_id === item.dictionary_source_id &&
            !!s.en &&
            !s.translation_meta?.en,
        )
      )
        throw new Error(`Missing attested dictionary evidence: ${entry.id}`);
      if (item.method === "headword" && item.matched !== row.word)
        throw new Error(`Incorrect topic headword: ${entry.id}`);
      topicIds.add(item.topic_id);
    }
    byId.set(entry.id, [...topicIds]);
  }
  const assignments: TopicAssignment[] = [];
  const merged = rows.map((v) => {
    const all = [...new Set([...v.topics, ...(byId.get(v.id) ?? [])])];
    for (const topic_id of all)
      assignments.push({
        vocabulary_id: v.id,
        topic_id,
        source_id: v.topics.includes(topic_id)
          ? seedSourceId
          : classification.source.id,
      });
    return { ...v, topics: all };
  });
  return { rows: merged, assignments, classification };
}
