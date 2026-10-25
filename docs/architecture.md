# HanziFlow architecture

## Inspection (2026-10-25)

The supplied workspace was empty: no existing code, configuration, dependencies, tests, or AGENTS.md was found. All sixteen individual reference images and the overview were inspected. The reference establishes a jade sidebar, quiet neutral surfaces, compact vocabulary tables, spacious study cards, and separate light/dark palettes. Some individual images include fragments of adjacent screens; these are reference artifacts, not interface requirements.

## Modular monolith

Next.js App Router, strict TypeScript, React, Tailwind, shadcn-style accessible primitives, and Lucide. Server components own authenticated bootstrap data; client components own transient filters and study interactions. Supabase PostgreSQL and Auth provide cloud persistence; RLS is the authorization boundary. Server Actions validate every mutation with Zod and derive identity from the session. Public catalogue queries are read-only. No AI services or AI infrastructure.

Folders: `src/app` routes/actions; `src/components` UI and feature components; `src/lib/domain` pure catalogue/progress/lesson functions; `src/lib/server` auth and persistence services; `src/lib/supabase` SSR clients; `data` pinned sources and reviewed enrichment; `scripts` repeatable imports; `supabase/migrations` versioned SQL; `tests` unit/integration/E2E.

## Runtime modes

With Supabase configured, private pages require a verified authenticated user and all progress is stored remotely. Without configuration, an explicitly labelled local trial can browse the real pinned catalogue and store trial progress only on that browser. Trial data never claims cross-device persistence; it is separate from account data and is not silently uploaded. Cloud errors must be surfaced, never silently replaced by trial storage.

Phase 1 uses server bootstrap + server actions instead of adding query/state libraries prematurely. Catalogue data is server-side, paginated, and searched by a validated read-only route. Bundle only page records, not 11,092 entries, into client navigation.

## Deployment

Target Vercel + Supabase, as requested. Implement and validate locally; external project provisioning requires the owner's account configuration. Store public Supabase URL/publishable key in environment variables. Import credentials are server-only and never named NEXT_PUBLIC. Document exact setup and validation limits.
