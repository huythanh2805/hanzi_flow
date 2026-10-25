# HanziFlow

Chinese vocabulary learning platform. Phase 1: Next.js App Router + React + strict TypeScript + Tailwind/shadcn-style Radix primitives + Supabase Auth/PostgreSQL. No runtime AI integration or paid AI service. Owner-authorized offline machine translations are labeled unreviewed.

## Run locally

Requires Node 22.12+ and npm. Tested dependency versions are locked in package-lock.json.

```powershell
npm ci
npm run data:prepare
npm run dev
```

Open http://localhost:3000. Without Supabase keys the application explicitly runs in a local browser trial. It uses the real pinned catalogue and browser-local trial progress, never fake learning statistics. Trial data is independent from cloud accounts.

## Connect Supabase

1. Copy `.env.example` to `.env.local` (do not overwrite an existing configured file). Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Settings → API Keys. Use a publishable key, never a secret key in a NEXT_PUBLIC variable.
2. Apply all SQL files in `supabase/migrations` in filename order. Core tables/RLS, automatic Auth profiles and enrichment provenance/Band guards are included. All three migrations have been applied to the connected project.
3. Set server-only `SUPABASE_SECRET_KEY=sb_secret_...` locally for import. Legacy `SUPABASE_SERVICE_ROLE_KEY` is accepted for compatibility. Never commit or expose either. Runtime user requests only use the publishable key and session cookies.
4. Run `npm run data:prepare`, `npm run data:enrichment`, `npm run data:import`. Re-running upserts catalogue IDs without touching user history. Source/seed upserts are repeatable but the whole multi-batch import is not one transaction; a failed run should be retried before exposing a fresh catalogue. The importer does not delete removed enrichment: publishing removals requires an explicit source-scoped migration/review.
5. Enable Email/password in Supabase Authentication. Configure Site URL and allowed redirects: `http://localhost:3000/auth/callback` and the production equivalent. Signup uses PKCE. Keep confirmation enabled as desired. For Google OAuth, configure provider credentials in Supabase then set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.
6. Restart the development server. Create an account at `/login`. Cloud-configured application pages require a verified session; cloud errors never silently fall back to browser storage.

## Environment

| Variable                             | Purpose                                        |
| ------------------------------------ | ---------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Supabase project API URL                       |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public browser/SSR key, RLS applies            |
| SUPABASE_SECRET_KEY                  | Server-only administrative import credential   |
| SUPABASE_SERVICE_ROLE_KEY            | Optional legacy alternative to secret key      |
| NEXT_PUBLIC_SITE_URL                 | Canonical app URL; set when deploying          |
| NEXT_PUBLIC_GOOGLE_AUTH_ENABLED      | Optional Google login button; false by default |

For local-only QA with a configured project, run the dev/test server with the two NEXT_PUBLIC_SUPABASE variables empty in the process environment. Do not edit/erase the owner's `.env.local` to switch modes.

## Implemented Phase 1 workflows

- Responsive jade UI, welcome/auth, dashboard, light/dark/system theme, mobile navigation.
- Full 11,092-entry source catalogue, stable IDs, pagination; Chinese/pinyin/attested Vietnamese/English search; band/topic/combined/state/favorite/difficult filters; source-order/band/progress sorting.
- Entry details preserve separate senses and explicitly show unavailable content. Browser Chinese speech playback.
- Seven Band collections and twenty database-driven topics; deterministic group size 10/15/20/25/30. Group progress shares global vocabulary progress.
- Favorite, difficult, studied and suspension flags are independent. Studying through a topic updates the same Band entry. No manual false mastery.
- Basic Chinese/pinyin and available meaning flashcards; reveal, shuffle, navigation, keyboard controls, pronunciation, mark studied, difficult retry and session summary.
- Validated account settings and persisted real progress; email/password, optional Google OAuth, SSR cookie refresh, logout and protected cloud routes.
- Repeatable validated import, licensed dictionary/corpus provenance and explicit machine translation labels. Every imported example is rechecked against the target's lexical Band; the database rejects false token Bands. Seven original reference glosses/topics remain separate.

## Data attribution

HSK 3.0 word list by **HSK University (https://hskuniversity.com)**, https://github.com/ayman-ezz/hsk-3.0-word-list, CC BY 4.0. Pinned commit `8c79c71915c25a80e5e68aacec940449b36060d8`, version 1.0.1. Retain `data/source/LICENSE` and `data/source/NOTICE` (upstream MIT). Original columns unchanged; source_order derived from IDs. Separate seed enrichment attributed to the owner's supplied images. 11,092 source entries / 10,946 distinct spellings. This is the **2021 proficiency standard**, not the 2025 examination syllabus.

Coverage and remaining example gaps are in `data/imported/report.json`. CC-CEDICT English, Vietnamese Wiktionary and Tatoeba content retain licenses and attribution; missing translations have owner-authorized machine-unreviewed drafts. Ambiguous dictionary matches are recorded in `source-report.json`. Examples use target-or-lower Band vocabulary and preserve original sentences and authors. This checks vocabulary, not grammar or contextual sense certification. See [enrichment](docs/enrichment.md) and [notices](data/enrichment-sources/NOTICE.md). The public `/sources` page offers a data export with attribution. Audio coverage is unchanged.

All twenty topics now contain vocabulary: 3,540 entries across 4,055 memberships. Classifications use exact Chinese headwords and primary attested English senses with exclusions, preserve the original seven design assignments, and share canonical progress with Bands. Regenerate with `npm run data:topics`, prepare the local catalogue with `npm run data:prepare`, and import only topic links with `npm run data:import-topics`. See [classification workflow](docs/topic-classification.md), `data/imported/topic-report.json` and `topic-cloud-report.json` for coverage/evidence, remaining gaps and cloud verification. Unmatched entries are not forced into unrelated topics.

## Validation

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Playwright requires a Chromium installation (`npx playwright install chromium` if unavailable). Unit tests verify source integrity/idempotent normalization, filtering, repeated spellings/senses, shared progress, deterministic lessons, time-zone daily boundaries and validation. Browser tests cover learning workflows and mobile UI. Live Supabase RLS, authentication and persistence were also verified with ephemeral QA accounts; see `docs/validation.md` for exact executed results and limitations. `npm run test:database` requires the isolated local PostgreSQL cluster described there; `npm run test:cloud` requires an authorized Supabase project and the production app on localhost:3001.

## Deployment

Vercel preset: Next.js. Add public Supabase environment variables and canonical SITE_URL. Apply/import database before deployment and configure production Auth redirect URLs. No service key required in deployed frontend/runtime. Build with `npm run build`. No external deployment is created automatically by local development.

The pinned HSK source checksum in `data/source/manifest.json` uses UTF-8 text with LF line endings. Import scripts normalize CRLF before hashing so Windows and Linux checkouts verify the same source content.

## Next phase

Phase 2: ts-fsrs scheduling, immutable review logs and atomic idempotent review transactions; multi-stage lessons; advanced flashcards; daily plans/queues; multiple-choice, listening, typing and real practice telemetry. Phase 3: decks, remaining exercises, recording, analytics/streaks and offline improvements. Planned navigation is labelled; it does not claim working review or practice features.

See [architecture](docs/architecture.md), [database](docs/database-design.md), [design system](docs/design-system.md), [learning engine](docs/learning-engine.md), and [implementation plan](docs/implementation-plan.md).
