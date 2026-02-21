# Roadmap

## Current

- Phase 0: Municode archival downloader with provenance
- Phase 0.5: Dual-source archival (Municode + direct city PDF)
- Phase 1: Text extraction, normalization, chunking, and Chapter 20 subset
- Phase 2A: ADU-focused table structuring (`phase2_adu_tables`) and retrieval/citation scoring (`phase2_adu_eval`)

## Next (Phase 2B)

- Section boundary detection with stronger chapter segmentation
- Better chapter-specific filtering than regex heuristics
- Optional OCR pass for low-text pages
- Human-validated gold citation set for ADU eval prompts
- Stronger retrieval metrics (nDCG/MRR and citation precision@k)

## Later (Phase 3)

- Cross-source alignment (city PDF vs Municode by section)
- Conflict flagging with side-by-side diffs
- Broader table extraction coverage across all chapters and towns
- Export formats for downstream RAG stores (JSONL, parquet)
- Scheduled automation and monitoring

## Bloomington Focus Track

- Build/curate 25-50 real Bloomington land-use QA prompts
- Track answer + citation quality across snapshot updates
- Define publication criteria for a stable "LLM-ready Bloomington UDO" release
