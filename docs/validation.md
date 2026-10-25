# Executed validation — 2026-10-25

## Matching and listening practice

Implemented the plan in [practice.md](practice.md): three selectable learning activities, default mixed; exact preflight counts; 2–4-pair boards; Mandarin listening with generic accessible prompts and replay; frozen MCQ fallbacks; per-activity first-round results. Exams retain the original MCQ behavior. Matching failures can retry without revealing a key or changing the original grade. Defer interleaves between complete activities. Matching auto-selection follows the saved cursor, including Quick mode and reload.

Passed: 87 unit/component tests, all 23 browser E2E tests, plus five consecutive mobile/keyboard matching Quick mode runs. Browser cases cover mixed activity selection, wrong matching/reload/defer, listening playback gating, a missing/Cantonese-only voice, matching board completion, complete boards across the 25-question boundary, prior MCQ/repeat/exam behavior, stale tabs, full 5,636-question loading and Flashcards/core regression. Speech was mocked; actual engine audio quality is not asserted.

The isolated PostgreSQL suite seeded all 11,092 real entries and bilingual senses. It verified owner isolation, denied raw tables and private installation RPCs, unsupported exam selection rejection, immutable original answers, safe matching retries, fallback-variant grading, hidden exam breakdowns, unchanged learning progress and complete mixed Band 7–9 installation/read. The last local full mixed installation took about 1.3 seconds with a 0.21-second final-page read under concurrent browser checks.

Migration `202610250008_practice_exercises.sql` was applied to the connected project, with follow-up installer/validation updates. SQL Editor records: `3987c25f-6b87-4084-8a37-06f580d9949b`, `6f6cd8db-65d3-4aca-b9bc-3f9f90178efa` and `70a21f14-9856-44d0-937a-cddbf1733e79`. Installation performs a bulk insert with JIT disabled and a function-scoped 60-second REST budget; no global or role timeout was changed. The optimized production server and actual Supabase API verified read-only preview, authenticated server-side creation, independent-browser resume, matching retries/defer, first-variant grading, listening, private keys/installation and exam privacy. A real full mixed Band 7–9 recipe installed all 5,636 exact IDs and returned its final batch; the API installation measured about 20.9 seconds. Temporary confirmed QA users and cascading records were removed in `finally`, and no existing user's vocabulary/progress was edited.

Desktop/mobile screenshots were inspected in ignored `.local-tests/practice-exercises/`. The production build passed, and a scan of 27 browser JS bundles found no configured administrative key. The local database cluster and temporary production server were stopped; the user's localhost:3000 development server was retained. No deployment or commit was created. The existing incomplete Vietnamese gloss noted below remains unchanged.

## Single repeat button

Removed the duplicate Hỏi lại button and its helper block below learning answers, together with the unused CSS. The single **Hỏi lại lượt sau** action remains in the card toolbar and keeps its existing skip/random-queue behavior. Updated browser/cloud checks to use that action; browser setup now asserts exactly one repeat action and no lower helper block. All nine practice browser tests, strict typecheck and ESLint passed. No backend or grading changes were made.

## Unified Hỏi lại controls

The learning-card toolbar's **Hỏi lại lượt sau** now invokes the same defer handler and disabled rules as the lower **Hỏi lại** button. Both advance immediately, without requiring an answer, and queue the word at a random future position in the current session. The toolbar control uses the repeat icon and is no longer an aria-pressed bookmark toggle. An already graded word keeps its first score and uses the existing supplemental repeat state. Exam review remains a bookmark toggle.

Passed: all nine practice browser tests, including both buttons before answering, the toolbar button after a wrong answer, queue deduplication, first-score preservation and reload; 78 unit/component tests, strict typecheck, ESLint and optimized build. A disposable Supabase QA account on actual localhost:3000 additionally verified top→skip, bottom→skip, wrong→top→repeat queue, unchanged first score, reload and mobile layout. The account and its cascading records were removed in `finally`; the existing app/server and user data were retained. No database migration was needed.

## Random repeat position across the full remaining queue

Expanded Hỏi lại insertion from the former 1–3-question window to every future position, including the tail. A 32-bit request-UUID seed chooses and fixes the position across retries, reloads and devices. When another question exists, it appears before the repeated word so skipping does not immediately show the same word. Existing queues, first answers, scoring and repeat counters are retained.

Applied `202610250007_practice_random_repeat_position.sql`, saved SQL Editor query `b6091c84-8de8-4121-8c51-7926c82b5a1b`. This replaces only the insertion-slot calculation in the existing transactional commit and adds a private immutable helper. Unit tests cover all 20 possible future positions, unsigned high-bit seeds and empty/single-item queues. Local PostgreSQL checks parity with the browser at remaining lengths 0/1/20/5,636, plus existing ownership, replay, score and repeat invariants. All 78 unit/component tests and eight practice browser tests passed, including reload, random queue traversal, correct-answer Quick mode, repeat grading and complete Band loading. Strict typecheck and ESLint passed.

The optimized build passed. The live Supabase/browser script passed against production on localhost:3101, explicitly checking repeat positions 1 and 20 (the tail), identical-event replay preserving one queued word, resume across two browser contexts, Quick mode, repeat grading and immutable first-round results. Its disposable QA accounts and cascading records were removed; the temporary production server and isolated PostgreSQL cluster were stopped. The owner's localhost:3000 app remains running.

## Wrong-answer repeats interleaved with remaining questions

**Hỏi lại** now appears after a wrong learning answer as well as before answering. Scheduling inserts one pending occurrence after 1–3 other questions and before the tail whenever at least two others remain. Returning words hide their old selection/feedback and accept a separate repeat response. Original answers, first-round correct/wrong counts and canonical question totals remain immutable; supplemental counts are shown separately. Quick mode includes repeats when deciding whether to advance or finish. Results consistently show the original choice/correctness, even if a later repeat was correct.

Applied `202610250006_practice_interleaved_repeats.sql`, saved SQL Editor query `73a2dd6e-2201-4ec0-83e5-5cf938ad334b`. It adds a lazily initialized session queue, repeat state on practice answers and separate repeat counters. Owner checks, row locks, strict command validation, event replay and stale-revision handling remain in the transactional RPC. No lexical or learning-progress data was changed.

Passed: 77 unit/component tests; all 17 browser tests, including wrong→schedule→reload→interleaved repeat→correct answer with unchanged first score, ordinary deferrals, Quick mode, exam secrecy, full Band loading and Flashcards regressions; strict typecheck, ESLint and optimized build. The isolated PostgreSQL suite passed with all 11,092 real entries, including interleaving before the tail, first-answer immutability, repeat counters, identical-event replay without duplicate grading, owner isolation and unchanged shared learning progress.

The live Supabase/browser script passed against the optimized production server, with two isolated browser contexts resuming the same queue, hidden old answers during a repeat, Quick mode advancing from a correctly repeated word, separate repeat totals and first-round results retaining the original wrong choice. Temporary QA accounts and their cascading rows were removed. Screenshot: ignored `.local-tests/practice-repeat-after-wrong.png`. The temporary production server and isolated database cluster were stopped; localhost:3000 remains running.

## Controls visible in an active learning card

Moved Quick mode into the question-card toolbar and made **Hỏi lại lượt sau** visible there before any answer as well as after grading. Removed the feedback-only render condition; marking uses the existing revisioned mark command, leaves the question unanswered and does not navigate. The existing **Hỏi lại** skip/defer action remains below the options. Exam review behavior is retained.

A fresh isolated browser on the actual localhost:3000 initially confirmed Quick mode and defer were present while the later-round marker was absent before answering. The reported browser screenshot showed older controls, so the verified project dev processes were restarted on the same port after the UI correction. A disposable cloud QA account then checked both toolbar controls before answering, marking without grading, persistence on reload, visibility on question 2 after a wrong first answer, working Quick mode and mobile layout without overflow or browser errors. Screenshots: ignored `.local-tests/practice-controls-after-desktop.png` and `practice-controls-after-mobile.png`. The QA account and its cascading records were deleted; no existing account/session was accessed. The restarted localhost:3000 server remains running.

All seven practice browser tests passed, including marking before an answer/reload, deferred queues, both Quick mode cases, exam secrecy and full 5,636-question loading. All 75 unit/component tests, strict typecheck, ESLint and the optimized build passed.

## Quick mode

Added an optional learning-only Quick mode toggle in setup and inside active sessions. Correctness is read from the saved, graded response before advancing to the next pending question, including deferred words and the next 25-question batch. Wrong answers remain on their explanation. A final correct answer submits automatically; its submit event UUID is retained if finishing fails. The browser preference survives reload, with an in-memory fallback when storage is unavailable. Disabling the toggle preserves manual feedback, and exams do not expose or use Quick mode. No database or scoring change was needed.

Passed: strict typecheck, ESLint, 75 unit/component tests, the 15-case browser regression suite, the refined six practice cases and both focused Quick mode cases (including a complete 26-question session crossing the batch boundary). The optimized build passed. Live Supabase checks passed on development and production; the production run also deliberately blocked the automatic final submit, confirmed all three answers were already saved with two correct, then retried to produce one unchanged result. Other checks cover a blocked answer save without advancing, retry advancing once, wrong-answer review, preference reload, deferred navigation, final automatic completion and disabling Quick mode.

The test uses disposable QA accounts removed in `finally`, without touching existing user progress. The temporary production server was stopped and the owner's localhost:3000 development server retained.

## In-session Hỏi lại queue

The learning player now offers **Hỏi lại** before answering: the current word moves to the back of the unanswered queue and navigation advances immediately. After the remaining normal words, deferred words return with **Đang hỏi lại**. Deferral does not grade, duplicate questions or change the total. The last pending word cannot be deferred indefinitely. After grading, the separate **Luyện lại sau lượt đầu** flag still selects a future child session. Exams retain their existing review flags.

Applied migration `202610250005_practice_defer.sql`, saved SQL Editor query `cad7673e-c2e8-4e92-a88f-80f196725fe6`. Existing sessions receive an empty queue; owner/revision/request replay checks remain transactional, and no existing vocabulary/progress/answers are rewritten. Browser trials remain backward compatible with existing IndexedDB records.

Passed: 75 unit/component tests; 14 browser tests including actual skip→reload→answer remaining words→return to deferred word→submit; strict typecheck, ESLint and optimized build. The isolated PostgreSQL practice suite passed with all 11,092 entries, including deferred queue persistence, identical-event replay, last-word guard, no answer disclosure before answering and exactly-once grading. The live Supabase/browser check also passed deferred-word resume across two independent browser contexts, reload, returning after the other word and unchanged question totals/scores. Disposable QA accounts were removed after each live run.

The updated cloud/browser script passed against both the existing development app and the optimized production server on localhost:3101. Temporary QA users, the production test server and the isolated database cluster were cleaned up; the owner's localhost:3000 server was retained.

## Chinese and meaning practice

Implemented the approved practice plan: real setup/player/results routes, multi-group selection within Band/topic, full Bands, personal word sets, learning/exam modes, frozen bilingual question snapshots, revisioned autosave, child retries and explicit difficult flags. Migration `202610250004_practice.sql` was applied to the connected Supabase project, saved SQL Editor query `c656cd68-0ed8-4f64-9d9c-0ee36c455b6e`. It creates four practice-only tables with RLS and transactional owner-checked RPCs; existing lexical/progress data was retained.

Executed: 74 unit/component tests, strict typecheck, ESLint, production build and 13 browser tests including the nine existing Flashcards/catalogue/settings regressions. Isolated core PostgreSQL integration passed with all 11,092 entries/6,786 examples, as did the new practice SQL integration with all real bilingual senses. Practice SQL checks exact 500/5,636 canonical ID sets, homographs, owner isolation, direct/anonymous denial, hidden exam keys/grades, server scoring, forged-score rejection, duplicate events, stale revisions, immutable learning answers, early submission, separate retries and unchanged progress before explicitly marking difficult. Full 5,636-question SQL preparation measured approximately 2–3 seconds locally with per-query JIT disabled and cached Band candidate orders.

Browser trial checks cover multiple group pages, frozen lesson size after settings changes, feedback/answer locking, modifier-safe keyboard shortcuts, exam edits/reload, early submission, result selection, separate retries, stale-tab rejection with retained draft, full 5,636-question chunked download and widths 320/390/768/1440 without horizontal overflow. Practice cards have no scene background.

`npm run test:practice-cloud` verified actual remote Band 1 (500) and Band 7–9 English (5,636) exact ID sets using pagination beyond 1,000 rows, private exam keys, repeat creation and cross-owner denial. Two isolated browser contexts used the same disposable QA account for real Server Actions, failed network save/retry retaining the selection, conflicting revisions, resume on another device, hidden exam feedback, early submission, separate learning retry and mobile layout. Explicit difficult flags retained state NEW and null studied timestamps. Both temporary Auth accounts and cascading practice/profile/progress rows were deleted in `finally`; existing accounts were not used. Screenshot: ignored `.local-tests/practice-cloud-mobile.png`.

Known preflight failure: the existing Vietnamese translation for `hsk30-b79-0367` is punctuation placeholders. Complete Band 7–9 Vietnamese is rejected with that ID; English has all 5,636 questions. No vocabulary was edited or silently omitted. See [practice](practice.md) for architecture and repeatable commands. Physical speech quality still depends on installed browser/device voices.

The same live cloud/browser script also passed against the optimized production server on localhost:3101, including an actual Vietnamese preflight error shown in the setup UI. Production testing exposed React's redaction of thrown Server Action errors; expected errors now cross the boundary as typed result values, preserving conflict messages and missing-entry IDs. A scan of all 27 production browser JavaScript files found no administrative credential. Production validation used the separate `.next-e2e` build directory; temporary servers and the isolated PostgreSQL cluster were stopped while the owner's localhost:3000 server was retained.

## Earlier validation

All results below were actually executed on Windows, Node 22.13.0, Next.js 16.4.3, with the pinned source dataset.

| Check                                | Result                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `npm run typecheck`                  | Passed, TypeScript strict                                                                 |
| `npm run lint`                       | Passed, no warnings/errors                                                                |
| `npm test`                           | 63 passed, 9 files, including card/background/speaker and modifier-key checks             |
| `npm run test:e2e`                   | 9 passed in Chromium, including design contrast, responsive Hanzi and expanded Vietnamese |
| `npm run build`                      | Passed, production compilation and route generation                                       |
| `npm run data:enrichment`            | Passed, licensed content, labeled machine drafts and 6,786 rechecked examples             |
| `npm audit` / `npm audit --omit=dev` | Zero known vulnerabilities at installation/check time                                     |
| `npm run test:database`              | Passed against isolated PostgreSQL 16                                                     |
| `npm run test:cloud`                 | Passed against the configured Supabase project and local production build                 |

## Moonlight lighting follow-up

Latest background scope: only the main Flashcard uses the optimized landscape image. All other card/prose surfaces are solid; image elements were removed from the dashboard promo and sidebar promo. The page-wide ambience is retained. The focused browser check decoded the Flashcard background, checked its hover/reveal/reverse and top-only accent, and inspected dashboard/library/Bands/topics/settings/roadmap cards for absent image URLs and image elements. The global page image remained present. Responsive widths, light mode and client-error checks passed; TypeScript and ESLint also passed.

Latest Flashcard correction: removed every Flashcard box shadow, including the lower halo and inset highlight, and replaced its diagonal ring with a localized radial accent at the top-center edge. The targeted browser check confirmed `box-shadow: none` at rest/on hover/after reveal, a top-centered masked gradient, and no reflection/bottom pseudo-element. Speaker, reveal/reverse, five responsive widths, retained geometry/type, other cards and light mode passed without client errors. Updated screenshots remain in `.local-tests/reference-flashcard/`.

Latest Flashcard reference: `flashcard-surface.css` applies the owner's exact background/border gradient and outer-glow values only to Flashcards; `card-scenes.css` now excludes them. A targeted browser check verified the computed 145-degree background, 1px/18% base border, 24px radius, 65% maximum gradient stop, ring opacity 1, requested outer glow and absent moving center point. Hover/revealed states retained these values; speaker and reveal/reverse interactions passed. At 1440px the card measured 832×420.375px and Hanzi 100.8px. Widths 320/390/768/1024/1440 had no horizontal overflow, other dashboard cards retained their images/no-shadow styling, and light mode retained its prior surface. No client errors were recorded. Screenshots are in ignored `.local-tests/reference-flashcard/`.

Independent card backgrounds: added `card-scenes.css` and a root CSS image-set generated with Next's documented `getImageProps` pattern. Each dark card now paints its own optimized landscape instead of depending on the page image showing through glass. Targeted browser checks decoded the actual optimized CSS image and verified card backgrounds on roadmap, dashboard, topics and Flashcards. Transparent perimeter borders, absent shadows and pointer-transparent accents still passed at rest, on hover and after reveal; mobile answers fit without horizontal overflow and no client errors were observed. Desktop/mobile screenshots in `.local-tests/soft-edges/` were inspected; mobile Flashcards favor the moon side of the image. TypeScript and ESLint passed.

All nine browser E2E tests and the production build passed after adding the independent card images.

Latest card-only refinement: softened the two center-edge accents (42% peak alpha) and removed all remaining perimeter borders and shadows in dark mode. A focused browser check inspected roadmap, dashboard, topics and Flashcards: all four computed border colors were transparent and box shadows were `none`, including hover and revealed states; the Flashcard's old inset pseudo-element shadow was also absent. Decorative edges remained pointer-transparent, mobile answers fit the viewport and no client errors were found. Screenshots are retained in `.local-tests/soft-edges/`. Atmospheric moonlight was retained.

Owner-requested lighting adjustment: increased the top-right source and diagonal beam, and reduced vignette coverage around the source. Card-border gradients now peak in brighter pale mint at the horizontal center of both top and bottom, fading toward the corners. The actual cloud UI was rechecked across six routes at desktop/mobile widths (12 views), including roadmap/practice; masking, pointer transparency and drawer behavior passed with no overflow or client errors. The temporary QA account/profile was removed. The targeted lighting browser checks also passed for responsive widths, both flip pulses, retained card animation, reduced motion and light mode. Screenshots in `.local-tests/moonlight/` and `.local-tests/brand-redesign/` show this latest treatment.

Visibility correction: the directional border now covers all `.card` / `.prose-page` panels, including `/roadmap#practice`, rather than only Flashcards. Background glow and top/right edge contrast were increased slightly. Actual localhost:3000 was checked in an isolated QA context across dashboard, topics, Bands, settings, roadmap/practice and Flashcards, at desktop/mobile sizes (12 views). Every inspected card had the masked ring and pointer-transparent decoration; no overflow or client page errors were found. The mobile drawer passed and the temporary QA account/profile was deleted. Screenshots are in `.local-tests/brand-redesign/cloud-*-roadmap.png` and adjacent views. The existing lighting check also passed again for both flip pulses, motion preferences and responsive widths.

All nine E2E tests and the production build passed again after the shared-border correction.

Added a dedicated decorative `MoonlightOverlay` inside the existing background, `lighting.css` and one noninteractive reflection span inside the Flashcard. Existing layout, card-flip animation, learning state and actions were retained. The browser check in ignored `.local-tests/moonlight-check.mjs` verified actual CSS durations (20s atmosphere / 11s reflection), gradient-ring masking, image/light/vignette stacking, pointer transparency, edge pulses on reveal and return, and retention of the original parent `reveal` animation. At widths 320/390/768/1024/1440 there was no horizontal overflow. All three new animations computed to `none` with reduced motion, and light mode hid the overlay. No client page errors were observed; desktop/mobile Flashcards and dashboard screenshots are in `.local-tests/moonlight/`.

63 unit tests, all nine browser E2E tests, TypeScript, ESLint and the production build passed after the lighting changes. The same lighting checks also passed against the optimized production server on localhost:3100, using a disposable confirmed QA account. Ring masking, both flip pulses and animation names survived CSS optimization; the account/profile and preview server were removed afterward. No animation library or JavaScript animation loop was added.

## Application-wide brand follow-up

At the owner's request, the moonlit visual direction now applies to the entire app. `brand-theme.css` replaces the study-only stylesheet and promotes the palette, card radius, CTA gradient, muted text, borders and glass surfaces to shared tokens/rules. `AppAmbience` is mounted once in the root layout so all routes receive the backdrop; the root defaults public pages to dark while workspace preferences continue to control light/dark/system. `AppSidebar` always includes the matching promo scene. `SceneArtwork` replaces the previous SVG illustrations on dashboard, welcome and login. Learning/auth/data behavior was retained.

Validation: 63 unit tests, nine E2E tests, TypeScript and ESLint passed. An isolated browser checked 15 routes at 320/390/1600px (45 combinations), including library/detail, Band/topic lists and details, Flashcards, settings, roadmap, welcome, login, sources, setup and 404. All received one shared backdrop and no horizontal overflow was observed; light-mode dashboard was also inspected. Ignored screenshots/measurements are in `.local-tests/brand-redesign/`.

The actual cloud-connected localhost:3000 was checked with a disposable confirmed QA account across dashboard, topics, Bands, settings and Flashcards, on desktop and mobile (ten views). Computed canvas was rgb(5,8,10), cards had 24px corners and 12px blur (16px for Flashcards). The mobile drawer and Escape dismissal passed; no client page errors were recorded. The QA account/profile was removed in `finally`; existing users and progress were not used or changed.

## Moonlit Flashcards visual follow-up

The owner's subsequent dark glassmorphism direction is implemented on `/flashcards`, using their supplied moonlit valley image, scoped black/charcoal/mint tokens, 24px glass card corners, backdrop blur, restrained borders/shadows and a mint-to-emerald CTA. The image is optimized through Next Image, decorative and noninteractive. Components are separated into `AppSidebar` and the controlled study components under `src/components/flashcards/`; the existing session controller and progress actions remain responsible for learning behavior.

Checks after this refactor: 63 unit tests, all nine browser E2E tests, TypeScript and ESLint passed. Actual dark/light screenshots were inspected at 320/390/768/1024/1440/1600px, including expanded answers, study options and long Hanzi. No horizontal overflow was found. Body text remains 16px, prompt text 14–15px and the primary CTA 54px high. The existing browser assertions still verify prompt contrast, reduced motion and independent card/speaker/bookmark controls.

The optimized production build also passed. Its authenticated UI was checked separately on localhost:3100 at 320/390/1600px with another disposable QA account, then the account/profile and preview server were removed. The scene decoded successfully, the study canvas computed to rgb(5,8,10), card opacity to 0.72 and backdrop blur to 16px. This check caught a CSS optimization issue when the WebKit-prefixed backdrop declaration followed the standard declaration; placing the standard declaration last preserves both in the production bundle. The mobile skip link is fully offscreen until focused, including when its text wraps. No client page errors or horizontal overflow were observed in these production views.

The cloud-connected localhost:3000 UI was also checked with a disposable, confirmed QA account in an isolated context; mobile drawer/Escape and card reveal passed, and the account/profile was deleted in `finally`. No existing account's settings or progress was used. Screenshots are retained in ignored `.local-tests/redesign/`. Physical audio quality remains device-dependent. New files include `src/app/study-theme.css`, `src/components/app-sidebar.tsx`, `src/components/flashcards/*` and `public/images/study-moon-valley.png`; image provenance is recorded alongside the asset.

## Design handoff follow-up

Implemented the owner's HanziFlow-Design-Handoff for dark Flashcards and the shared shell, with larger Vietnamese typography throughout the existing app. Actual cloud-connected localhost:3000 was inspected with a disposable, admin-confirmed QA account in an isolated browser context; the account/profile was deleted afterward. Screenshots and measurements are retained in ignored `.local-tests/redesign/`: cloud desktop/mobile/drawer/answer views, trial dark/light desktop views, widths 320/390/768/1024/1440/1600 and representative dashboard/library/topics/settings/auth screens. No page-level horizontal overflow was found. At 1600px the cloud study card measured 832×434px; body text was 16px, background rgb(11,15,16), sidebar rgb(17,22,25). The primary CTA also fit within the 1440×900 trial viewport.

New browser assertions check near-black neutral surfaces, ≥4.5:1 prompt contrast, ≥16px body/≥14px prompt, ≥50px CTA, ≥44px card navigation targets, reduced-motion behavior, card-background reveal/reverse, independent speaker/bookmark controls, combined modifiers and long-Hanzi/expanded-Vietnamese layouts across six widths. All nine E2E tests passed. Unit regression coverage also verifies card-surface and speaker independence plus Ctrl/Meta/Alt/Shift/repeat/IME guards; 63 tests passed. Physical Chinese voice/audio quality remains device-dependent and was not graded.

Files changed for this redesign: `src/app/globals.css`, new `src/app/workspace.css`, `src/app/layout.tsx`, `src/components/shell.tsx`, `src/components/flashcards.tsx`, `tests/flashcards.test.tsx`, `tests/e2e/core.spec.ts`, `docs/design-system.md` and this document. Existing routing, Supabase schema/data and learning persistence were retained. No new dependencies, reference screenshot backgrounds or external publication were introduced.

## Topic enrichment follow-up

Imported project-authored classifications into the existing twenty topics: **3,540 canonical entries, 4,055 distinct memberships**. Every topic contains 91–413 entries. `npm run data:import-topics` verified all composite keys/source IDs, preserved the seven design memberships, checked the catalogue view and compared before/after personal-table hashes and lexical-table counts. `topic-cloud-report.json` records the actual cloud counts.

`scripts/verify-topics-cloud.ts` created one disposable, admin-confirmed QA account (no email), checked authenticated `catalogue_summary` counts/identity sets and all twenty Topic + Band 1 filters, and inspected the actual localhost:3000 topic cards and technology search in a separate browser context. It removed the QA account/profile in `finally`. Existing user sessions/accounts were not used. `topic-cloud-checks.json` records the successful checks. Reproduce with `node --import tsx --env-file-if-exists=.env.local scripts/verify-topics-cloud.ts` while the cloud-configured app runs on localhost:3000.

The seven browser E2E tests also passed on the separate trial server: twenty populated cards, technology search/detail/lesson navigation and shared progress across topic/Band navigation. This classification is a project learning taxonomy based on curated headwords and primary dictionary senses; it is not official HSK topic labeling or teacher approval. The remaining 7,552 entries have no sufficiently specific rule match in the current taxonomy and are explicitly listed in `topic-report.json`.

## Local database integration

An isolated PostgreSQL cluster was initialized in ignored `.local-tests/postgres`, bound to loopback on port 55432. Test roles and an `auth.uid()` shim simulate Supabase's authorization boundary, without using any production user data. The test script creates and removes a separate database per run and refuses to run against another cluster path.

Actual SQL checks: migration syntax/constraints, all 11,092 entries, duplicate spellings, anonymous personal-data denial, per-user RLS reads/updates, forged-identity and direct-mastery rejection, atomic independent progress flags, Band/topic/combined/personal filters, tone-normalized pinyin/translation search, literal wildcard handling, pagination, repeat import and preservation of existing progress/study timestamps. The local cluster was stopped after validation.

To reproduce, start that isolated PostgreSQL cluster with `pg_ctl` on `127.0.0.1:55432`, set `PSQL_PATH` if psql is elsewhere, and run `npm run test:database`. The script never uses `.env.local` or a cloud database.

## Live Supabase setup and verification

Project `bvzwmmlekmptjtmtxhxm` was connected with owner-supplied `.env.local` credentials. The initial migration was applied successfully in its SQL Editor with RLS enabled. The initial migration is already applied to this project; use new migrations for future schema changes. The SQL is retained in the repository and a saved SQL Editor query.

Current remote import: **11,092 vocabulary entries, 20 topics, 29,273 senses, 57,622 translations and 6,786 examples**. Every vocabulary entry has Vietnamese and English content; 4,351 entries have examples and 6,741 still have no accepted example. All examples have both translations and a lexical Band proof. Source-attested coverage is 10,738 English entries and 587 Vietnamese entries including original reference glosses. Missing content uses owner-authorized, explicitly machine-unreviewed translation drafts; 354 entries have Chinese-headword translation drafts rather than dictionary-attested English meanings. Sources, source matching gaps and final coverage are in the imported JSON reports. No Chinese examples were generated. Email/password remains enabled with confirmation. Site URL/redirect remain localhost:3000 and /auth/callback; Google OAuth remains optional.

Enrichment migration `202610250003_licensed_enrichment.sql` was applied in the SQL Editor and saved as query `5a958f8c-f117-4ebb-a00e-a2221a40e59b`. Remote auditing compared exact content counts and checked bilingual examples/provenance through `catalogue_entries`. Full-row hashes of profiles, user_vocabulary and review_cards were identical before/after import; the audit stores only counts and hashes in ignored local test storage, not personal records.

Local PostgreSQL integration inserted all 6,786 actual examples twice with the database Band guard active. It rejected forged maximum/token Bands, missing proof and incomplete Chinese token coverage. Core browser tests now run an isolated trial server on port 3100 with `.next-e2e`, preserving the owner's dev server on 3000; all six passed, including bilingual detail/examples and shared progress. Initial rendering was bounded to the one featured entry so enrichment does not send the entire 33 MB trial catalogue in bootstrap.

Limits: segmentation and lexical checks are deliberately conservative, do not certify grammar or contextual word sense, and exclude ambiguous target readings. Community source content and machine translations are not teacher-reviewed. Some clearly observed translation issues received Codex-assisted corrections in `translation-corrections.json`, still labeled machine-unreviewed. This is coverage, not a claim of perfect translation quality.

Live tests created two disposable, confirmed QA accounts through the admin API (no email delivery), verified login, independently authenticated sessions, private-data isolation, mutation restrictions, shared progress and repeat import. All temporary accounts and their personal records were removed afterward. No existing user's progress was altered.

Using a production server at localhost:3001, two independent browser contexts logged into the same QA account. One studied 谢谢 through its topic; the other saw the same LEARNING state through Band 1. Settings saved in one context loaded in the other. Login/logout, protected-route redirects and actual Server Actions passed. A scan confirmed the server administrative key is absent from built browser JavaScript.

To reproduce: build, run the production server on port 3001, then run `npm run test:cloud`. This uses the configured project, performs a repeat catalogue import, and creates/removes only marked ephemeral test accounts. Do not run it without authority to administer that project.

## UI checks and limits

Manually inspected the dashboard in light/dark mode, welcome page, and mobile layout. Browser E2E covers search/pagination, enriched bilingual meanings/examples, combined filters, shared progress across navigation and reload, flashcard reveal/study/suspension, settings/theme/group sizing, responsive widths and malformed requests. The welcome CTA's rendered foreground/background were also checked after fixing an observed CSS override.

No Vercel deployment was created. Production-domain Auth redirects still need the eventual domain. Actual email delivery and Google OAuth were not exercised. Chinese speech depends on browser/device voices and was not evaluated for audio quality. FSRS scheduling, advanced exercises, decks, analytics, streaks and offline/PWA work remain explicitly in Phase 2/3.

## Email callback repair

An actual confirmation error revealed that Next's internal request URL could contain `0.0.0.0`. Callback redirects now use the configured, validated browser-facing origin for both success and failure; wildcard bind addresses normalize to localhost. Signup, resend and Google redirects use the same helper. Local development binds to localhost on the next start.

The login form explains that a consumed/expired link may belong to an already-confirmed account, offers an explicit resend action with a cooldown, and removes provider error fragments from browser history. The account inspected during this repair was already email-confirmed; its credentials and confirmation status were not modified. No recovery email was sent by the assistant.

After repair, typecheck, lint, 50 Vitest tests and the production build passed. Live HTTP requests verified callback locations stay on localhost. A fresh Chromium context followed an expired-link callback through to the usable login page, checked the recovery message/action and fragment cleanup, and verified the mobile page fits its viewport. The running user-started development server was retained.

## Profile provisioning repair

Authentication uses `auth.users`, independently of `public.profiles`. The initial app created profiles only when settings were saved, which allowed valid Auth accounts to log in before a profile existed. Migration `202610250002_create_profiles.sql` now creates a profile atomically for each inserted Auth user and backfills existing missing rows without overwriting profile settings. It was applied successfully to the connected Supabase project; both existing Auth accounts had matching profiles afterward. Dashboard bootstrap now requires that row.

Local PostgreSQL tests passed for automatic creation, existing-account backfill, repeated migration preserving preferences, ownership isolation and cascading deletion. The live cloud test additionally verified each newly created QA account had a profile before any login or settings save. The tests use disposable accounts and retain no real-user passwords. Development Server Function argument logging was disabled in `next.config.ts` because default Next.js invocation logs include authentication arguments.
