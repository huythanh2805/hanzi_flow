# Topic classification

The owner requested classification into the existing twenty topics on 2026-10-25. No vocabulary entries, meanings, Band assignments or personal progress records are created by classification.

`data/topic-rules.json` contains project-authored Chinese headword sets, English dictionary keyword expressions and exclusions. A word may belong to several topics. Exact headwords are evaluated against the existing canonical entries. Keyword matching uses only the first attested English sense, never machine English, surname/redirect/classifier references or incidental later senses. Parenthetical examples/references are removed before matching. Exclusions handle ambiguous words/phrases such as a monk's staff, parting company, river banks, medical patients, flights of stairs and figurative flatness. The rules include author choices and remain open to correction; they are not an official HSK taxonomy or teacher approval.

Generated `data/imported/topic-classification.json` records each canonical entry, topic, rule, match method, and dictionary sense/source evidence when applicable. Its source is `hanziflow-topic-rules-v1`. Source metadata pins rule bytes and the vocabulary source. `topic-report.json` contains per-topic/Band counts, representative audit samples and the unassigned list. The initial publication assigns 3,540 entries to 4,055 topic memberships; all twenty topics have content. Other entries remain unclassified where the taxonomy/rules do not give a sufficiently specific match. Do not force unrelated geography, animals, science or grammar into a topic to inflate coverage.

`prepareData()` merges memberships into `Vocabulary.topics`, validating IDs, uniqueness and sense references. It preserves all non-topic fields and the original seven design-supplied memberships. Those seven retain `owner-design-reference-v1` attribution; newly classified memberships use the classification source. The full catalogue importer registers that source and preserves these distinctions on future imports.

```powershell
npm run data:topics
npm run data:prepare
npm run data:import-topics
```

The dedicated importer only upserts the classification source and `vocabulary_topics`. It pages all memberships beyond PostgREST's 1,000-row default and verifies composite keys, source attribution, populated topic counts and the catalogue view. It compares personal-table hashes and lexical-table counts before/after, without writing personal data. Its public count-only result is `topic-cloud-report.json`. Repeating the same import is safe. Omitting a membership does not delete it; future rule corrections that remove memberships require an explicit source-scoped removal, preserving owner/manual sources.

Unit checks cover polysemy/false-positive cases, multiple membership, unknown IDs/topics, retained seed attribution and preservation of all lexical fields. Browser checks cover all twenty nonempty topic cards, topic+Band search, technology detail/lesson navigation, and the same studied entry across topic/Band navigation. Progress percentages can decrease when a collection gains more words; the absolute studied records remain unchanged.

Classification metadata is CC BY-SA 4.0; original dictionary licenses/attribution remain in the linked sense/source records. Raw meanings/examples and their translation licenses are unaffected. No runtime classifier, external classification API or new model dependency is added to the learning app.
