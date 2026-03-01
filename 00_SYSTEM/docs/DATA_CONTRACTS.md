# Data Contracts

This document defines expected file structures and JSON fields.

## Jurisdiction Inventory

Mutable discovery and planning data lives under:

```text
inventory/
  jurisdictions.jsonl
  batches/
  discovery_notes/
```

### `jurisdictions.jsonl` row schema

- `jurisdiction_slug: string`
- `jurisdiction_name: string`
- `jurisdiction_type: "city" | "town" | "county" | "village" | "other"`
- `state: string`
- `county_name: string | null` (county containing the municipality, or same-name county for county records)
- `source_system: "municode" | "direct_pdf" | "ecode" | "other" | "unknown"`
- `landing_url: string | null`
- `pdf_url: string | null`
- `document_kind: "udo" | "zoning_ordinance" | "land_development_code" | "code_of_ordinances" | "unknown"`
- `status: "discovered" | "source_found" | "grab_ready" | "grabbed" | "failed" | "needs_review"`
- `notes: string`
- `discovered_at: string | null` (prefer `YYYY-MM-DD`)
- `last_checked_at: string | null` (prefer `YYYY-MM-DD`)
- `last_successful_snapshot_date: string | null` (`YYYY-MM-DD` when snapshot exists)
- `tags: string[]`

### Semantics

- `inventory/` is mutable and operational. It is not the source-of-truth archive of ordinance content.
- `landing_url` is the best known human-facing source page.
- `pdf_url` is the best known direct PDF URL, if available.
- `source_system` is a coarse classification for planning and batching; it does not guarantee the current downloader supports that source.
- `status="grab_ready"` means the current tooling likely has enough information to attempt a download.
- `status="grabbed"` means at least one successful dated snapshot exists under `sources/`.

## Snapshot Storage

Single-source (`grab`):
```text
sources/<town_slug>/<YYYY-MM-DD>/
  udo.pdf
  source.json
  SHA256SUMS.txt
  source_page.png   # optional
```

Dual-source (`grab:both`):
```text
sources/<town_slug>/<YYYY-MM-DD>/municode/
sources/<town_slug>/<YYYY-MM-DD>/city_pdf/
```
Each source folder contains:
- `udo.pdf`
- `source.json`
- `SHA256SUMS.txt`
- `source_page.png` (best effort)

## source.json (Phase 0/0.5)

Required keys:
- `town_display_name: string`
- `town_slug: string`
- `source_type: "municode" | "city_pdf"` (dual-source mode)
- `retrieved_at_local: string` (ISO with zone offset)
- `source_url: string`
- `download_url: string | null`
- `download_method: string`
- `user_agent: string`
- `playwright_browser: "chromium" | "firefox" | "webkit"`
- `notes: string`

Change tracking keys (dual-source mode):
- `previous_snapshot_date: string | null`
- `previous_sha256: string | null`
- `content_changed_since_previous: boolean | null`

## Phase 1 Corpus Artifacts

```text
corpus/<town_slug>/<YYYY-MM-DD>/<source_type>/phase1/
  pages_raw.jsonl
  pages_normalized.jsonl
  chunks_all.jsonl
  chunks_chapter20.jsonl
  qa_eval_template.json
  report.json
```

### chunks_all.jsonl row schema
- `chunk_id: string`
- `text: string`
- `town_slug: string`
- `source_type: "city_pdf" | "municode"`
- `source_url: string | null`
- `source_sha256: string | null`
- `snapshot_date: string`
- `page_start: number`
- `page_end: number`
- `section_guess: string | null`
- `is_likely_chapter20: boolean`

### Semantics
- `chunks_all` means all chunks from the selected `source_type` snapshot, not all sources combined.
- `chunks_chapter20` is heuristic and may include false positives when references to `20.x` appear outside Chapter 20 context.

## Phase 2 ADU Table Artifacts

```text
corpus/<town_slug>/<YYYY-MM-DD>/<source_type>/phase2_adu_tables/
  table_blocks.jsonl
  adu_tables.json
  report.json
  normalized/
    table_03-4_normalized.json
    table_04-9_normalized.json
    table_04-10_normalized.json
    target_tables_verification_manifest.json
    target_tables_review_needed.html
```

### `table_blocks.jsonl` / `adu_tables.json` table schema
- `table_id: string`
- `table_ref: string` (for example `03-1`)
- `table_title: string`
- `category: "use_permissions" | "dimensional_standards" | "parking_loading" | "accessory_structures" | "other"`
- `relevance_score: number`
- `page_start: number`
- `page_end: number`
- `rows: [{ row_index, row_text, columns[] }]`
- `column_count_guess: number`
- `chunk_ids: string[]` (overlapping Phase 1 chunk IDs for grounding)
- `section_guess: string | null`
- `town_slug: string`
- `source_type: "city_pdf" | "municode"`
- `source_url: string | null`
- `source_sha256: string | null`
- `snapshot_date: string`

### `normalized/target_tables_verification_manifest.json` row schema
- `manifest_row_id: string` (`<table_ref>:<row_id>`)
- `table_ref: "03-4" | "04-9" | "04-10"`
- `row_id: string`
- `verification_status: "verified" | "inferred_verified" | "needs_review"`
- `reviewed_by_human: boolean` (`true` required for `verified`)
- `reviewer_note: string`
- `review_reason: string[]` (auto-derived reason when defaulting to `needs_review`)
- `inferred: boolean`
- `type: "data" | "section"`
- `provenance`:
  - `page: number`
  - `table_index: number`
  - `source_row_index: number`
  - `bbox?: number[]`
- `row_snapshot: object` (latest normalized row payload; refreshed on each verify run)

### Verification manifest merge policy
- `verified` is human-only and is preserved only when prior row has `reviewed_by_human=true`.
- rows without human-reviewed `verified` fall back to script defaults (`needs_review` or `inferred_verified`).
- `reviewer_note` is preserved from prior manifest rows by `manifest_row_id`.
- `provenance`, `review_reason`, `inferred`, and `row_snapshot` are refreshed from normalized artifacts on every run.

### Optional future extension (pattern auditing)
- Additive field candidate:
  - `detected_patterns: string[]` (for example `["P-0001", "P-0002"]`)
- Pattern IDs should reference:
  - `00_SYSTEM/docs/NORMALIZATION_STYLE_PATTERNS.md`

## Phase 2 ADU Evaluation Artifacts

```text
corpus/<town_slug>/<YYYY-MM-DD>/<source_type>/phase2_adu_eval/
  eval_set.json
  gold_citations.template.json
  gold_citations.json            # optional, human-labeled
  retrieval_results.jsonl
  scored_report.json
```

### `retrieval_results.jsonl` row schema
- `id: string`
- `question: string`
- `hit: boolean`
- `expected_doc_count: number`
- `top_k: number`
- `citation_quality_avg: number`
- `gold_relevant_count: number`
- `precision_at_k: number | null`
- `mrr_at_k: number | null`
- `ndcg_at_k: number | null`
- `top_results[]`:
  - `rank: number`
  - `doc_id: string`
  - `kind: "chunk" | "table_row"`
  - `score: number`
  - `page_start: number`
  - `page_end: number`
  - `chunk_id: string | null`
  - `table_id: string | null`
  - `table_ref: string | null`
  - `grounding_score: number`
  - `is_gold_relevant: boolean | null`

### `gold_citations.json` schema (optional input)
- `town_slug: string`
- `source_type: "city_pdf" | "municode"`
- `snapshot_date: string`
- `items[]`:
  - `id: string` (matches eval item id)
  - `relevant_doc_ids: string[]` (approved citation doc IDs)

## Compatibility Policy

- Additive fields are preferred over breaking changes.
- If schema changes are required, update this file and increment a schema version field in outputs in a future phase.
