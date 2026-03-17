# File Locations Reference

Quick reference for where files live in the UDOsforLLMs project.

## Directory Structure Overview

```
UDOsforLLMs/
├── 00_SYSTEM/              # System documentation
├── corpus/                 # Source of truth (authoritative data)
├── public/                 # Published files (for GitHub Pages)
├── sources/                # Original PDF downloads
├── src/                    # Build/generation scripts
└── tools/                  # Utility scripts
```

## Dimensional Standards Tables

### Corpus (Source of Truth)
**Location:** `corpus/<town_slug>/<YYYY-MM-DD>/<source_type>/phase2_adu_tables/normalized/`

**Files:**
- `table_02-2_normalized.json` - Machine-readable source data
- `table_02-2_rows.jsonl` - Row-by-row JSONL format
- `table_02-2_normalized.html` - Individual table HTML page
- `dimensional_standards_comparison.html` - All tables comparison page

**Notes:**
- This is the authoritative source
- JSON files are edited/updated here
- Scripts generate HTML from these JSON files

### Public (Published)
**Location:** `public/bloomington/tables/`

**Files:**
- `table_02-2_normalized.html` - Published individual table
- `dimensional_standards_comparison.html` - Published comparison page
- `pymupdf_benchmark/images/` - PDF images for comparison

**Notes:**
- Mirrors corpus structure
- Updated by manual copy after regeneration
- Served via GitHub Pages

### Source Scripts
**Location:** `src/`

**Key Scripts:**
- `normalize_pymupdf_dimensional_standards.ts` - OCR extraction → JSON (automated)
- `update_dimensional_standards_from_ocr.ts` - Manual markdown → JSON (corrections)
- `generate_html_from_normalized_json.ts` - JSON → HTML + JSONL
- `build_dimensional_standards_comparison.ts` - Build comparison page

## Phase 1 Corpus (Text Chunks)

### Corpus (Source of Truth)
**Location:** `corpus/<town_slug>/<YYYY-MM-DD>/<source_type>/phase1/`

**Files:**
- `pages_raw.jsonl` - Raw page text
- `pages_normalized.jsonl` - Cleaned page text
- `chunks_all.jsonl` - All text chunks
- `chunks_chapter20.jsonl` - Chapter 20 chunks (zoning)
- `report.json` - Processing summary

## Phase 2 ADU Tables

### Corpus (Source of Truth)
**Location:** `corpus/<town_slug>/<YYYY-MM-DD>/<source_type>/phase2_adu_tables/`

**Files:**
- `table_blocks.jsonl` - Extracted table blocks
- `adu_tables.json` - ADU-relevant tables
- `normalized/` - Normalized table data
  - `target_tables_verification_manifest.json` - Verification status
- `external_ocr/` - OCR-rendered markdown tables
  - `table_02-2.md` - OCR output for dimensional standards
  - `table_02-3.md` - etc.
  
**Purpose of external_ocr/:**
- Stores OCR-rendered tables from external OCR services (e.g., https://ocr.z.ai/)
- Used for verification of complex dimensional standards tables
- Automatically integrated into HTML generation and comparison pages
- Naming convention: `table_XX-XX.md` (must match table reference)
- **Critical**: Files must have `table_` prefix for pattern matching to work

## Source PDFs

### Downloaded Sources
**Location:** `sources/<town_slug>/<YYYY-MM-DD>/`

**Structure (Dual Source):**
```
sources/bloomington/2026-02-21/
├── municode/
│   ├── udo.pdf
│   ├── source.json
│   └── SHA256SUMS.txt
└── city_pdf/
    ├── udo.pdf
    ├── source.json
    └── SHA256SUMS.txt
```

## Inventory Data

**Location:** `inventory/`

**Files:**
- `jurisdictions.jsonl` - Jurisdiction discovery data
- `batches/` - Batched processing files
- `discovery_notes/` - Discovery process notes

## Documentation

**Location:** `00_SYSTEM/docs/`

**Key Files:**
- `DATA_CONTRACTS.md` - Data schema definitions
- `FILE_LOCATIONS.md` - This file
- `OPERATIONS.md` - Operational procedures
- `TABLE_UPDATE_TROUBLESHOOTING.md` - Troubleshooting guide
- `NORMALIZATION_STYLE_PATTERNS.md` - Table normalization patterns
- `TABLE_EXTRACTION_NOTES.md` - Table extraction notes
- `GITHUB_PAGES_DEPLOYMENT.md` - Deployment guide

## Quick Lookup

| What you need | Where to find it |
|---------------|------------------|
| **Update table data** | Edit JSON in `corpus/.../normalized/` or run update script |
| **View corrected tables** | `public/bloomington/tables/table_XX-XX_normalized.html` |
| **Compare PDF vs data** | `public/bloomington/tables/dimensional_standards_comparison.html` |
| **Run update workflow** | See `00_SYSTEM/README.md` Common Workflows section |
| **Check data schema** | `00_SYSTEM/docs/DATA_CONTRACTS.md` |
| **Debug table issues** | `00_SYSTEM/docs/TABLE_UPDATE_TROUBLESHOOTING.md` |
| **Find script to run** | See "Source Scripts" section above or check `src/` directory |

## Path Patterns

### Bloomington (current work)
- Corpus: `corpus/bloomington/2026-02-21/city_pdf/`
- Public: `public/bloomington/tables/`
- Scripts: `src/`

### Other towns
- Replace `bloomington` with town slug
- Replace `2026-02-21` with snapshot date
- Keep directory structure the same

## Important Notes

1. **Corpus is source of truth** - Always edit JSON files in `corpus/`, not `public/`
2. **Public requires manual copy** - No automatic deployment from corpus to public
3. **Scripts generate from corpus** - HTML files are outputs from corpus JSON
4. **Dual source structure** - Some towns have both `municode/` and `city_pdf/` sources
5. **Date-based snapshots** - Each date has its own corpus directory