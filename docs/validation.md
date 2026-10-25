# Executed validation — 2026-10-25

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
