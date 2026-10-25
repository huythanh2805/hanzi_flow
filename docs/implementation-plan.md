# Implementation plan

## Source verification

Repository: https://github.com/ayman-ezz/hsk-3.0-word-list. Inspected README, LICENSE, NOTICE, band CSV and all.jsonl before implementation. Pinned commit `8c79c71915c25a80e5e68aacec940449b36060d8`; version 1.0.1, data unchanged since 1.0.0. CC BY 4.0 compilation with retained upstream MIT notice. This is GF 0025-2021, not the 2025 examination syllabus.

Actual fields: id, band, word, pinyin, official_entry, official_pinyin. No translations, definitions, examples, audio files, or topic classifications. IDs encode stable within-band order. Duplicate spellings and polyphonic entries must survive import. Copy pinned source and license notices; normalized import upserts only catalogue fields and never touches personal progress. Validate exact counts and ID uniqueness, plus source checksum.

## Non-AI enrichment

JSON enrichment is keyed by exact source ID and sense ID; each batch includes attribution, license/permission basis, version and review status. Publish only explicitly approved records. UI reports absent meanings/examples. The user's supplied design includes a small set of Vietnamese/English glosses and topic examples; these may be transcribed with attribution to that user-provided material, without expanding meanings or claiming dictionary verification. All other topic membership is unavailable until classified. A dry-run validator reports unknown IDs, conflicting sense IDs, invalid topics and missing provenance before database upsert.

Licensed dictionaries (for example CC-CEDICT, after separately inspecting its current license) are potential later sources, not assumed to be imported. Exact spelling alone is insufficient for sense alignment: pinyin, band-specific meaning and editorial review are necessary. Administrator imports use server-only credentials; the web app never grants catalogue mutation rights to ordinary users.

## Phase 1 sequence

1. Create strict Next.js project, tokens and reusable accessible UI.
2. Vendor pinned vocabulary, provenance, idempotent normalization and cloud import.
3. Add normalized SQL schema, RLS, SSR Auth, sign-in/signup/logout and protected pages.
4. Implement paginated search with band/topic/state/favorite/difficult filters and details.
5. Build band/topic pages on shared selection/progress services and deterministic lesson selection.
6. Implement basic flashcards and shared studied/favorite/difficult/suspended mutations.
7. Persist validated settings and show real aggregate progress.
8. Run typecheck, lint, unit/integration tests, production build and core browser E2E. Record unavailable cloud checks honestly.

## Later phases

Chinese↔meaning, matching/listening practice and resumable history are implemented; see [practice](practice.md). Private catalogue-based collections and combined-deck study are implemented; see [decks](decks.md). Remaining work includes multi-stage lessons, FSRS atomic scheduling/review queues, event-based daily plans, typing/context exercises, recordings, custom/shared decks, analytics/streaks and offline support.

## Review gates and test plan

Verify shared progress after switching band/topic, preserved duplicate source rows, import idempotency without user-data writes, stable lessons at every size, combined filters, Unicode pinyin, missing enrichment, authorization and validation failures, no false mastery, settings and theme persistence. Use Vitest for pure domains, React Testing Library for keyboard/reveal behavior, Playwright for browse/filter/detail/study/favorite flows. SQL RLS integration tests require an actual local/remote Supabase; never label them passed without execution. Compare desktop/mobile and both themes against the supplied references. No external AI dependencies.
