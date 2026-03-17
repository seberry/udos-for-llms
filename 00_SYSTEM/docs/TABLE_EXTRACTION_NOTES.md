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

## Citation anchor guidance
- Store explicit source anchors for every normalized row so downstream LLM answers can cite directly:
  - `page`
  - `table_index`
  - `source_row_index`
  - optional `bbox` (table/row box) when available from extractor
- Recommendation: expose a human-readable citation string per row, for example:
  - `UDO city_pdf 2026-02-21, Table 04-10, page 178, source row 24`
- Do not rely on implicit reconstruction at answer time when exact citation is possible.

## OCR-Based Table Verification

For dimensional standards tables, we use external OCR services to improve accuracy and provide human verification workflow.

### Recommended OCR Service
**Service**: https://ocr.z.ai/ (free)

**Why OCR.z.ai?**
- Better accuracy than automated PDF extraction for complex tables
- Produces clean markdown output with preserved table structure
- Free to use with no account required
- Handles merged cells and multi-level headers well

### OCR Workflow

1. **Extract OCR from PDF**
   - Upload PDF page(s) to https://ocr.z.ai/
   - Download the markdown output
   - Format as markdown table with proper headers

2. **Save OCR File**
   - Naming convention: `table_XX-XX.md` (e.g., `table_02-2.md`)
   - Location: `corpus/bloomington/<YYYY-MM-DD>/city_pdf/phase2_adu_tables/external_ocr/`
   - **Important**: Use `table_` prefix - scripts use pattern matching to find files

3. **Generate HTML**
   ```bash
   npx tsx src/generate_html_from_normalized_json.ts
   ```
   - Script automatically includes OCR tables when files exist
   - Generates HTML with three views: OCR (default), Structured, and PDF comparison

4. **Build Comparison Page**
   ```bash
   npx tsx src/build_dimensional_standards_comparison.ts
   ```
   - Creates side-by-side comparison: PDF images, OCR rendering, structured data
   - Toggle between views for verification

### Verification Process

The comparison page provides a single-panel review experience:
- **Left side**: PDF page images (source truth)
- **Right side**: OCR-rendered table (default) or structured data (toggle)
- **Blue sections**: OCR tables with original formatting preserved
- **Green sections**: Structured JSON data with inferred values highlighted
- **Click-to-copy**: Structured data cells are clickable to copy values

### When to Use OCR

**Use OCR for:**
- Dimensional standards tables (Chapter 20, Tables 02-2 through 02-23)
- Tables with complex layouts (merged cells, multi-level headers)
- Tables where automated extraction produces errors
- Tables requiring human verification before use

**May not need OCR for:**
- Simple single-row tables
- Tables already accurately extracted
- Tables without human review requirements

### OCR File Format Example

```markdown
## (2) Dimensional Standards

The following table is a summary of the district-specific dimensional standards.

<div align="center">
Table 02-2: R1 District Dimensional Standards
</div>

<table border="1">
<tr><td colspan="3">Lot Dimensions (Minimum, only for lots created after the effective date)</td></tr>
<tr><td>A</td><td>Lot area</td><td>20,000 square feet (0.459 acres)[1]</td></tr>
...
</table>

Notes:
[1] See Section 20.04.110 (Incentives) for alternative standards.
```

### Integration with Automated Pipeline

OCR files complement automated extraction:
1. PyMuPDF/automated extraction provides baseline JSON
2. OCR files provide human-verified reference
3. Comparison page shows both for quality control
4. Structured data used for programmatic access
5. OCR used for verification when accuracy is critical

## Pattern registry (formatting conventions)
- Track recurring formatting conventions and inference rules in:
  - `00_SYSTEM/docs/NORMALIZATION_STYLE_PATTERNS.md`
- Add entries whenever new towns/snapshots introduce new layout conventions (footnotes, grouped blanks, split rows, wrapped headers, etc.).
- Keep this registry synchronized with normalization rule notes and reviewer guidance.

## Next action (recommended)
1. Build/refresh verification artifacts:
   - `npm run verify:targets:pymupdf -- --town-slug bloomington --source-type city_pdf --date 2026-02-21`
   - outputs:
     - `normalized/target_tables_verification_manifest.json`
     - `normalized/target_tables_review_needed.html`
     - `normalized/target_tables_review_app.html`
2. Manual review loop:
   - open `target_tables_review_app.html` (table-centric, long-scroll workflow)
   - zoom PDF page image(s) with in-card controls (`+`, `-`, `Reset`)
   - compare highlighted rows in normalized chart
   - add table-level natural-language reviewer note
   - approve table or keep needs-review from in-card buttons
   - export updated manifest from app and replace `target_tables_verification_manifest.json`
   - re-run verify script; `verified` persists only when `reviewed_by_human=true`, while row snapshots/provenance are refreshed from normalized artifacts
3. Update eval to prioritize verified table rows for table-grounded scoring.

## HTML Generation Scripts

The normalized table HTML files are generated from corpus data using TypeScript scripts:

### Table 03-1
```bash
npm run normalize:table03:pymupdf -- --town-slug bloomington --source-type city_pdf --date 2026-02-21
```
- **Script:** `src/normalize_pymupdf_table03.ts`
- **Output:** `corpus/.../normalized/table_03-1_normalized.html`
- **Process:** Reads benchmark JSON, normalizes table structure, renders HTML with CSS

### Tables 03-4, 04-9, 04-10
```bash
npm run normalize:targets:pymupdf -- --town-slug bloomington --source-type city_pdf --date 2026-02-21
```
- **Script:** `src/normalize_pymupdf_target_tables.ts`
- **Outputs:** `corpus/.../normalized/table_03-4_normalized.html`, `table_04-9_normalized.html`, `table_04-10_normalized.html`
- **Process:** Reads benchmark JSON, applies normalization rules, renders HTML with inference highlighting

### Comparison Artifact
```bash
npm run compare:targets:pymupdf -- --town-slug bloomington --source-type city_pdf
```
- **Script:** `src/build_target_table_comparison_artifact.ts`
- **Output:** `corpus/.../normalized/target_tables_comparison.html`
- **Process:** Side-by-side comparison of PDF images with normalized tables

### Verification Artifacts
```bash
npm run verify:targets:pymupdf -- --town-slug bloomington --source-type city_pdf
```
- **Script:** `src/build_target_table_verification_artifacts.ts`
- **Outputs:** `target_tables_review_needed.html`, `target_tables_review_app.html`, verification manifest
- **Process:** Creates review artifacts for human verification workflow

## GitHub Pages Deployment

After generating HTML files, copy them to the public directory for GitHub Pages deployment:
```bash
copy corpus\bloomington\<date>\city_pdf\phase2_adu_tables\normalized\*.html public\bloomington\tables\
```
See `00_SYSTEM/docs/GITHUB_PAGES_DEPLOYMENT.md` for complete deployment workflow.

## Throughput plan
1. Keep review surface table-centric (not row-by-row cards).
2. Minimize context switching by showing PDF + normalized chart in one card.
3. Capture corrections as natural language notes first; convert to deterministic normalization rules after review pass.
  ++++++++ REPLACE
