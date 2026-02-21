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

Optional gold-labeled scoring:

```bash
npm run eval:adu -- --town-slug bloomington --source-type city_pdf --top-k 6 --gold-file corpus/bloomington/2026-02-21/city_pdf/phase2_adu_eval/gold_citations.json
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
  - gold-based ranking metrics when `gold_citations.json` exists (`precision@k`, `MRR@k`, `nDCG@k`)

## Human Gold-Check Pass (recommended next)

For each key ADU question:
1. Open `phase2_adu_eval/retrieval_results.jsonl`.
2. Review top results and mark whether the cited chunk/page actually answers the question.
3. Copy `phase2_adu_eval/gold_citations.template.json` to `phase2_adu_eval/gold_citations.json`.
4. Fill `relevant_doc_ids` for each question with accepted `doc_id` values.
5. Re-run `eval:adu` with `--gold-file` to compute ranking metrics.

Target first set:
- ADU use permission location
- attached ADU size/height constraints
- detached ADU setbacks/height
- owner-occupancy affidavit/recording requirements
- ADU-relevant parking requirements
