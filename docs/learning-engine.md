# Learning engine

## Entry identity and collections

The source has 11,092 entries: 500 / 772 / 973 / 1,000 / 1,071 / 1,140 / 5,636 across Bands 1/2/3/4/5/6/7–9. Source IDs (including repeated spellings and readings) are canonical. A topic, band, filter or lesson selects IDs; all mutations address the same user-entry record. Analytics distinguishes entries from distinct spellings and review cards.

Lessons sort by numeric band then pinned source order and slice by 10/15/20/25/30 entries. Changing size changes grouping only. Studied is LEARNING; a button never grants mastery. Completion of a lesson is separate from memory mastery.

## Phase 1 flashcards

Chinese ↔ pinyin is available for every source entry. Meaning modes require a published translation and omit missing content. Reveal, previous/next, shuffle, pronunciation, keyboard navigation, and progress persistence are functional. Marking studied updates shared progress. No fake review scheduling is attached to an ordinary study action.

## Phase 2 scheduling decision

Investigated maintained `open-spaced-repetition/ts-fsrs` documentation: `createEmptyCard`, `fsrs().repeat` to preview, `fsrs().next` to commit Again/Hard/Good/Easy. Pin installed version in Phase 2. Persist all Card fields, scheduler version/parameters and immutable log. Use a server timestamp, user-scoped event UUID, row lock, expected revision and unique event constraint in one database transaction. Retry returns prior result; stale different events fail visibly. Enable recognition first; additional skills are user controlled.

Proposed mastery rule for Phase 2: at least 3 successful reviews on distinct study days, FSRS stability >= 21 days, latest rating >= Good, no active suspension. Document and test before enabling MASTERED. Due is derived from cards and never a vocabulary learning state.

## Exercises and daily plans

Phase 2: typed discriminated exercise definitions with eligible content, accepted answers and source-attributed distractors; no quiz with absent meanings. Meaning/recognition, listening and production metrics remain separate. Normalize pinyin Unicode and whitespace without silently removing tones in tone-sensitive modes. Phase 3 adds manually authored sentence/context exercises and browser recording without pronunciation scoring claims.

Daily boundaries use the profile IANA time zone, not server time. Priority: overdue, due, difficult, then new entries capped by goal and available time. Streaks require persisted events in distinct local dates. Phase 1 shows actual studied totals and explicitly defers review counts/streak calculations until event data exists.
