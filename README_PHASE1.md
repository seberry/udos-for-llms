# Phase 1: Build LLM-Ready Corpus Artifacts

This step transforms archived PDFs into citation-ready JSONL chunks for retrieval and QA.

Detailed schema/semantics are in `docs/DATA_CONTRACTS.md`.

## Command

```bash
npm run build:corpus -- --town-slug bloomington --source-type city_pdf
```

Options:

- `--town-slug <slug>` default: `bloomington`
- `--source-type city_pdf|municode` default: `city_pdf`
- `--date YYYY-MM-DD` default: latest snapshot under `sources/<town_slug>/`
- `--output-root <dir>` default: `corpus`
- `--max-chars <n>` chunk size target, default `1800`

## Input

Expected snapshot files:

```text
sources/<town_slug>/<YYYY-MM-DD>/<source_type>/
  udo.pdf
  source.json
  SHA256SUMS.txt
```

## Output

```text
corpus/<town_slug>/<YYYY-MM-DD>/<source_type>/phase1/
  pages_raw.jsonl
  pages_normalized.jsonl
  chunks_all.jsonl
  chunks_chapter20.jsonl
  qa_eval_template.json
  report.json
```

`chunks_all.jsonl` means all chunks for the selected `--source-type`, not a cross-source merge.

## Notes

- Extraction method: `pdftotext -layout`.
- Repeated headers/footers are removed using frequency-based detection.
- `chunks_chapter20.jsonl` is heuristic (`CHAPTER 20` and `20.x.x` patterns).
- `report.json` flags low-text pages for potential OCR follow-up.
