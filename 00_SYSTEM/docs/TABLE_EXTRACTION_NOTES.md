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
- Implemented conservative normalizers and review artifacts:
  - `normalized/table_03-4_*`
  - `normalized/table_04-9_*`
  - `normalized/table_04-10_*`
  - summary: `normalized/target_tables_report.json`
- Current quality profile:
  - `03-4`: usable, with a split zoning-group row needing merge confirmation (`MS...MH`).
  - `04-9`: core rows extracted; several null cells remain where PDF layout implies shared values.
  - `04-10`: broad coverage extracted; null allowances remain for some grouped rows.

## Working policy
- Prefer conservative nulls over inferred values when confidence is low.
- Add inferred fills only when rule confidence is explicit and auditable.
- Keep one-page/table human review as required gate before feeding claims into eval/QA.
