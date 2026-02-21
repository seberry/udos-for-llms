# ADU Tables + Retrieval Evaluation Workflow

This workflow adds a practical ADU-focused slice before broader Phase 3 table coverage.

## Purpose

Improve ADU answerability by:
1. Structuring ADU-relevant ordinance tables from Phase 1 page text.
2. Running retrieval + citation-grounding scoring against chunks plus structured table rows.

This workflow uses pipeline outputs only (`phase1/*.jsonl`) and does not require manual ordinance annotation.

## Commands

Build Phase 1 first (if not already available):

```bash
npm run build:corpus -- --town-slug bloomington --source-type city_pdf
```

Extract ADU-focused tables:

```bash
npm run build:adu-tables -- --town-slug bloomington --source-type city_pdf
```

Run ADU retrieval/citation evaluation:

```bash
npm run eval:adu -- --town-slug bloomington --source-type city_pdf --top-k 6
```

## Output folders

```text
corpus/<town_slug>/<YYYY-MM-DD>/<source_type>/phase2_adu_tables/
corpus/<town_slug>/<YYYY-MM-DD>/<source_type>/phase2_adu_eval/
```

## Notes

- `phase2_adu_tables` uses heuristic parsing from `pages_raw.jsonl` table blocks (`Table xx-yy` patterns).
- `phase2_adu_eval` builds a retrieval index from:
  - `phase1/chunks_all.jsonl`
  - `phase2_adu_tables/adu_tables.json` rows
- Scoring reports:
  - retrieval hit/miss
  - citation grounding quality (page/chunk/provenance field completeness)
