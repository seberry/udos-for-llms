# Table Extraction Notes (Bloomington)

## Date
- 2026-02-21

## Scope
- Bloomington `city_pdf` UDO snapshot `2026-02-21`
- Focus tables:
  - `03-1` Allowed Use Table
  - `03-4` Number/size of enclosed accessory structures
  - `04-9` Minimum vehicle parking requirements
  - `04-10` Maximum vehicle parking allowance

## Findings
- The original heuristic line-based parser is not reliable for complex multi-level headers and wrapped rows.
- For `03-1`, the table has hierarchical headers (Use + Residential/Mixed-Use/Non-Residential groupings with sub-columns) that break simple row splitting.
- PyMuPDF `page.find_tables()` performs materially better on this PDF:
  - identifies table geometry and column count (`19` columns on pages `91-95`)
  - captures two-row header pattern needed for normalization
- A normalization layer is still required for:
  - section rows vs data rows
  - row continuations
  - cleanup/deduping

## Validation checkpoint
- Human+assistant interpretation check passed:
  - `Fraternity or sorority house` in normalized `03-1` maps to `MS` and `MI` as allowed (`P`), consistent with review.

## Current pipeline (for `03-1`)
1. Benchmark extraction:
   - `npm run bench:tables:pymupdf -- --pdf sources/bloomington/2026-02-21/city_pdf/udo.pdf --out-dir corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/pymupdf_benchmark --pages 91-95`
2. Normalize:
   - `npm run normalize:table03:pymupdf -- --town-slug bloomington --source-type city_pdf --date 2026-02-21`
3. Review outputs:
   - `corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/pymupdf_benchmark/review_pages_91_92_93_94_95.html`
   - `corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/normalized/table_03-1_normalized.html`

## Extended targets status (`03-4`, `04-9`, `04-10`)
- Implemented normalizers and review artifacts:
  - `normalized/table_03-4_*`
  - `normalized/table_04-9_*`
  - `normalized/table_04-10_*`
  - summary: `normalized/target_tables_report.json`
- Added side-by-side audit artifact:
  - `normalized/target_tables_comparison.html` (PDF page images vs normalized tables, inferred cells highlighted)
- Current quality profile:
  - `03-4`: split zoning-group row merged; blank max-number and last-row footprint normalized to explicit `None`.
  - `04-9`: MD column filled from "All Other" except duplex/triplex/fourplex entries (special MD behavior retained).
  - `04-10`: grouped fill-down applied for:
    - `Group care facility, FHAA large`
    - `Nursing or convalescent home`
    - `Opioid rehabilitation home, small`
    - `Opioid rehabilitation home, large`
    - `Supportive housing, large`
  - remaining conservative blanks in `04-10`: `Vehicle repair, minor`, `Vehicle sales or rental`.

## Working policy
- Prefer conservative nulls over inferred values when confidence is low.
- Add inferred fills only when rule confidence is explicit and auditable.
- Keep one-page/table human review as required gate before feeding claims into eval/QA.
