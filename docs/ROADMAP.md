# Roadmap

## Current

- Phase 0: Municode archival downloader with provenance
- Phase 0.5: Dual-source archival (Municode + direct city PDF)
- Phase 1: Text extraction, normalization, chunking, and Chapter 20 subset

## Next (Phase 2)

- Section boundary detection with stronger chapter segmentation
- Better chapter-specific filtering than regex heuristics
- Optional OCR pass for low-text pages
- Evaluation harness to score retrieval citation hit-rate

## Later (Phase 3)

- Cross-source alignment (city PDF vs Municode by section)
- Conflict flagging with side-by-side diffs
- Export formats for downstream RAG stores (JSONL, parquet)
- Scheduled automation and monitoring

## Bloomington Focus Track

- Build/curate 25-50 real Bloomington land-use QA prompts
- Track answer + citation quality across snapshot updates
- Define publication criteria for a stable "LLM-ready Bloomington UDO" release
