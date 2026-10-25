# Vocabulary enrichment

The canonical HSK list retains 11,092 IDs, original pinyin, Band and printed fields. Content sources never create duplicate vocabulary/progress records. Seven design transcriptions in `data/enrichment.json` remain separate.

## Sources and matching

- CC-CEDICT / MDBG, CC BY-SA 4.0: English glosses matched by spelling and tonal pinyin. Capitalization distinguishes names. Case-only fallback requires one dictionary reading and one canonical entry. Classifier/redirect-only glosses are excluded. Repeated same-spelling/same-reading entries across Bands are quarantined for sense review.
- Vietnamese Wiktionary / Kaikki, CC BY-SA 4.0: Chinese/Mandarin lexical sections only. Traditional spellings align through CC-CEDICT. Without attested pinyin, require one dictionary reading and one canonical match. Unrelated languages, romanizations and redirects without glosses are excluded.
- Tatoeba, per-sentence CC BY 2.0 France or CC0: direct English/Vietnamese links and owned sentences only. Usernames, IDs and URLs retained. OpenCC converts traditional characters and preserves originals.

Community sources are not individually teacher-reviewed. Full notices: `data/enrichment-sources/NOTICE.md`. Snapshot URLs, byte counts and hashes: `downloads.json`.

## Lexical Band guard

`createSentenceChecker` uses Node/ICU Chinese word segmentation. Each support token must exist in the HSK list, using its maximum recorded Band, no higher than the target Band. Unknown compounds cannot be split into easy characters. Targets require unambiguous readings and word boundaries; repeated same-reading targets across Bands are held back. Band-dependent sentence lengths are 14/18/22/26/30/34/40 characters. Require three distinct lexical tokens; reject non-Han words, numerals and unknown words. This deliberately rejects some usable sentences, including ICU's single-token segmentation of 我爱你.

Select at most two examples per entry, preferring direct Vietnamese translations and shorter sentences. Persist the ordered token/Band proof. Preparation re-runs the checker; a database trigger independently checks coverage, actual token Bands, maximum Band and target identity. Node/ICU versions are recorded in source metadata; use those versions when reproducing segmentation. Grammar and contextual sense suitability still require an editor. Do not claim a full proficiency certificate.

## Authorized automatic translation

On 2026-10-25 the owner explicitly allowed automatic translation for missing content, superseding the original prohibition for this data-preparation step. Argos/OPUS-MT 1.9 runs offline with CTranslate2 4.8.3. No API key, paid service or runtime AI integration is required. Translate missing Vietnamese senses individually from English, expanding dictionary shorthand. Missing English headwords receive Chinese→English drafts; this does not resolve polyphony or establish Band-specific senses. Missing example languages are translated; the Chinese sentence stays unchanged. Human translations remain and appear first.

Every output records provider, model, input language/text and `machine-unreviewed`. The UI labels machine translations in details, the library and flashcards. Drafts may contain errors and are never represented as dictionary-attested or teacher-approved. Adaptations retain input data licenses; model licensing does not replace them. Model package notices and archive hashes are in `translation-models.json`. Codex-assisted corrections to observed translation issues are recorded in `translation-corrections.json`, applied after model translation, and remain machine-unreviewed; they never overwrite human source translations. No Chinese example generation occurs.

## Reproduce

Selected content ships in `data/imported/enrichment.json`; normal builds/imports require neither Python nor models. Rebuild from source snapshots with:

```powershell
python scripts/fetch-enrichment-sources.py
python scripts/prepare-enrichment-inputs.py
npx tsx scripts/build-vocabulary-enrichment.ts
python -m venv .local-tests/translation
.local-tests/translation/Scripts/python.exe -m pip install -r scripts/translation-requirements.txt
python scripts/fetch-translation-models.py
.local-tests/translation/Scripts/python.exe scripts/translate-enrichment.py
npx tsx scripts/enrichment-report.ts
npm run data:enrichment
npm run data:prepare
```

Raw corpora/models, intermediate extraction and the resumable translation cache are ignored by Git. Source downloads refuse checksum drift unless explicitly refreshed; models refuse changed archives. Translation checkpoints support resumption. The source builder intentionally rebuilds pre-translation content, so repeat translation afterward. The selected export is self-contained and retains provenance.

Apply all migrations, then `npm run data:import`. Upserts address canonical/source/sense/example IDs, update search text, and never write personal tables. Batches can be safely retried; the complete import is not one transaction. Omitting old content does not delete it: removals require an explicit source-scoped correction. Read-only `scripts/audit-enrichment-cloud.ts --before`, then without that flag, checks counts, read-model metadata and personal-table digests around import.

Manually reviewed content uses `data/enrichment.json`, stable IDs, rights, attribution and an honest review status. Never invent approvals. `npm run data:enrichment` validates source/child IDs and examples. `/api/content-export` provides selected data with attribution; data licenses remain separate from application code.
