# Executed validation — 2026-10-25

All results below were actually executed on Windows, Node 22.13.0, Next.js 16.4.3, with the pinned source dataset.

| Check                                | Result                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `npm run typecheck`                  | Passed, TypeScript strict                                                          |
| `npm run lint`                       | Passed, no warnings/errors                                                         |
| `npm test`                           | 55 passed, 8 files, including source/reading alignment and all-example Band checks |
| `npm run test:e2e`                   | 6 passed in Chromium                                                               |
| `npm run build`                      | Passed, production compilation and route generation                                |
| `npm run data:enrichment`            | Passed, licensed content, labeled machine drafts and 6,786 rechecked examples      |
| `npm audit` / `npm audit --omit=dev` | Zero known vulnerabilities at installation/check time                              |
| `npm run test:database`              | Passed against isolated PostgreSQL 16                                              |
| `npm run test:cloud`                 | Passed against the configured Supabase project and local production build          |

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
