# Bộ từ của tôi

`/decks` provides private catalogue-based collections. `/decks/[id]` opens a custom UUID or one of the virtual IDs `saved`, `difficult`, `learned`. The virtual collections use existing personal flags/state, without copying membership into another table. They cannot be renamed/deleted; saved/difficult entries use the existing explicit flag controls, and the learned collection never resets study state.

Custom decks support creation, description/name editing with revision checks, deletion and bulk membership changes. Add to one or many custom decks from the library, word details, Band/topic collections/groups, Flashcards and practice results. The library picker keeps selections across pages. Duplicate canonical IDs are ignored. Removing/deleting a deck changes only its membership; vocabulary, other decks, flags and shared progress remain intact. Arbitrary imported/custom words and public sharing are outside this release.

## Study sources

Select multiple custom/virtual decks, union their canonical IDs, order by numeric Band/source order/ID, then group with the saved lesson size. Repeated Chinese spellings remain separate when their canonical IDs differ. Study the complete union or select groups across pages. Changing source membership, selected sources or lesson size clears pending group selections; returning to an earlier size/source does not restore old selections.

Practice accepts `{ kind: "decks", refs, groups?, fingerprint? }`. Cloud resolution checks every custom deck's owner and rejects the entire selection if any reference is unavailable. Fingerprints include the source identities, custom revisions and union IDs. Source changes during preflight fail visibly instead of silently selecting other groups. The resolver and word-page RPC return complete sets beyond the REST 1,000-row cap. Search uses the catalogue's Unicode/space normalization and escapes LIKE wildcards.

Practice snapshots IDs, questions, source description, language and grouping at creation, using the existing grading engines. A deck rename/removal/deletion never changes an active/submitted session. Creation retries first find the owned frozen session, so a deleted source cannot break replay. Both MCQ/exams and the three learning activities support deck sources; private answer keys and exam feedback rules remain unchanged.

Flashcards resolves the source once and downloads catalogue records in batches of 100 (up to four independent requests at a time). Its active list stays fixed; existing reveal, pronunciation, shuffle and shared progress controls are reused. Deck IDs, group numbers and a fingerprint travel in the URL, not vocabulary IDs. The Flashcards→practice handoff stores the selected canonical IDs in a tab-local, account/mode-scoped draft and uses a short selection UUID in the URL. Drafts do not import trial words into an account or replace persisted practice sessions.

## Persistence and access

Migration `202610250009_personal_decks.sql` adds `decks` and `deck_entries`. RLS permits only owned reads, and browser table writes are revoked. Owner-checked RPCs perform metadata and bulk membership changes in a transaction, lock destinations in UUID order, reject invalid/foreign targets before writing, skip duplicates and update revisions only on real changes. The source resolver is shared by cloud word pages and practice creation. Ordinary deck operations use the user's JWT; admin keys remain server-only in the existing private exercise installer.

Trial collections live in IndexedDB `hanziflow.decks.v1`, separately from trial progress and practice. Read/write transactions serialize local changes across tabs. Custom and virtual collections use the same ordering/grouping rules as cloud sources. Cloud mode never reads or imports trial decks. Views refresh after mutations, on focus/visibility and every 15 seconds while visible; browser tabs also receive a BroadcastChannel notification. Failed saves retain selections/forms and show an error, without a saved acknowledgement. Dialogs trap focus natively, support Escape when idle and restore the invoking control.

## Verification

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- `npm run test:e2e`: deck CRUD/pickers, unions, groups across pages, membership/size invalidation, Flashcards handoff, failed-save retry, focus/mobile and existing practice/Flashcards regression.
- `npm run test:decks-database`: isolated local PostgreSQL fixtures, all 11,092 canonical entries, ownership/transaction/revision tests, >1,000 members, search and frozen practice after deletion. Requires the isolated cluster used by the existing practice SQL suite.
- `npm run test:decks-cloud`: authorized configured project plus localhost:3000 (`DECKS_TEST_URL` overrides). Creates/removes only disposable confirmed QA accounts. Tests real RPCs and Server Actions, cross-device access, virtual/private unions, retries, all learning types, exams, trial isolation and retained progress. Speech playback is mocked; audio quality is not asserted. Screenshots are ignored under `.local-tests/decks/`.
