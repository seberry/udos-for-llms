# Data Contracts

This document defines expected file structures and JSON fields.

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

## Compatibility Policy

- Additive fields are preferred over breaking changes.
- If schema changes are required, update this file and increment a schema version field in outputs in a future phase.
