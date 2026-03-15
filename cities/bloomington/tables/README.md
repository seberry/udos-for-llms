# Bloomington Table Outputs

This directory contains links to processed and normalized table artifacts from the Bloomington UDO.

## Available Tables

### Table 03-1: Allowed Use Table
- **File:** `table_03-1_normalized.html`
- **Content:** Comprehensive mapping of permitted land uses across all zoning districts (R1-R4, RM, RH, RMH, MS-MD, MH, EM, PO)
- **Columns:** Use label + 16 zoning district columns + use-specific standards
- **Rows:** ~150 data rows organized by use categories

### Table 03-4: Accessory Structure Requirements
- **File:** `table_03-4_normalized.html`
- **Content:** Maximum number and footprint requirements for ADUs and other accessory structures
- **Columns:** Zoning district, maximum number, maximum footprint, inference notes
- **Key ADU info:** Permitted ADU counts and size limits by zone

### Table 04-9: Minimum Parking Requirements
- **File:** `table_04-9_normalized.html`
- **Content:** Required parking spaces by use type and zoning district
- **Columns:** Type (data/section), use label, all other zoning districts, MD zoning district
- **Key ADU info:** Parking requirements for attached/detached dwelling types

### Table 04-10: Maximum Parking Allowances
- **File:** `table_04-10_normalized.html`
- **Content:** Maximum vehicle parking limits by use type
- **Columns:** Type (data/section), use label, maximum vehicle parking allowance
- **Key ADU info:** Upper limits on parking for various dwelling configurations

## Review and Comparison Artifacts

### Target Tables Comparison
- **File:** `target_tables_comparison.html`
- **Purpose:** Side-by-side comparison of PDF source images with normalized tables
- **Features:** Visual verification of extraction accuracy, inferred cells highlighted

### Review Needed
- **File:** `target_tables_review_needed.html`
- **Purpose:** List of rows requiring human verification
- **Usage:** Part of quality control workflow for table normalization

### Review App
- **File:** `target_tables_review_app.html`
- **Purpose:** Interactive application for reviewing and approving table data
- **Features:** Zoom controls, in-place editing, approval workflow

## How These Tables Are Generated

The HTML table files are automatically generated from corpus data using TypeScript scripts:

1. **Table 03-1:**
   ```bash
   npm run normalize:table03:pymupdf -- --town-slug bloomington --source-type city_pdf
   ```
   Script: `src/normalize_pymupdf_table03.ts`

2. **Tables 03-4, 04-9, 04-10:**
   ```bash
   npm run normalize:targets:pymupdf -- --town-slug bloomington --source-type city_pdf
   ```
   Script: `src/normalize_pymupdf_target_tables.ts`

3. **Comparison and review artifacts:**
   ```bash
   npm run compare:targets:pymupdf -- --town-slug bloomington --source-type city_pdf
   npm run verify:targets:pymupdf -- --town-slug bloomington --source-type city_pdf
   ```
   Scripts: `src/build_target_table_comparison_artifact.ts`, `src/build_target_table_verification_artifacts.ts`

## Workflow for Updating Public Tables

1. Run normalization scripts (see commands above)
2. Copy generated HTML files to public directory:
   ```bash
   copy corpus\bloomington\<date>\city_pdf\phase2_adu_tables\normalized\*.html public\bloomington\tables\
   ```
3. Update `cities/bloomington/tables/index.html` links if needed
4. Commit and push to deploy to GitHub Pages

## Usage Notes

- **Screening only:** Use these tables for initial screening and research
- **Confirm with official PDF:** Always verify against the official Bloomington UDO PDF for definitive answers
- **Inference notes:** Cells marked with yellow background contain inferred values
- **Provenance:** Each table row includes source page, table index, and row index for citation

## Data Quality

- **Method:** PyMuPDF `find_tables()` extraction with rule-based normalization
- **Audit trail:** All inferred values documented with clear reasoning
- **Verification:** Human review required before using for official purposes
- **Last updated:** 2026-02-21

## Additional Resources

- [Bloomington Main Page](../index.html)
- [Provenance](../provenance.html) - Official sources and retrieval dates
- [Chunks](../chunks/index.html) - Text-based ordinance chunks
- [Full Documentation](../../00_SYSTEM/docs/)