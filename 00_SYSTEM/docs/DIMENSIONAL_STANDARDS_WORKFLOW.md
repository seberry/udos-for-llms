# Dimensional Standards Tables Workflow

Complete workflow for working with dimensional standards tables (Chapter 20, Tables 02-2 through 02-23).

## Overview

Dimensional standards tables define zoning district requirements (lot sizes, setbacks, heights, etc.). This workflow combines automated extraction, OCR verification, and human review to ensure accuracy.

## Complete Workflow

```
PDF → OCR (optional) → JSON → HTML → Verification → Deployment
         ↓
    external_ocr/
```

### Step 1: Extract Tables from PDF

**Automated (baseline):**
```bash
npm run bench:tables:pymupdf -- --pdf sources/bloomington/2026-02-21/city_pdf/udo.pdf \
  --out-dir corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/pymupdf_benchmark \
  --pages 23-65
```

**Manual with OCR (recommended for complex tables):**
1. Upload PDF pages to https://ocr.z.ai/
2. Download markdown output
3. Save as `table_XX-XX.md` in `external_ocr/`
   - Example: `table_02-2.md` for Table 02-2
4. **Critical**: Use `table_` prefix - scripts depend on pattern matching

### Step 2: Generate Normalized JSON

**From automated extraction:**
```bash
npx tsx src/normalize_pymupdf_dimensional_standards.ts
```

**From OCR markdown (corrections):**
```bash
npx tsx src/update_dimensional_standards_from_ocr.ts
```

**Output:** `corpus/.../normalized/table_XX-XX_normalized.json`

### Step 3: Generate HTML Files

```bash
npx tsx src/generate_html_from_normalized_json.ts
```

**Output:** 
- `corpus/.../normalized/table_XX-XX_normalized.html` (individual tables)
- `corpus/.../normalized/table_XX-XX_rows.jsonl` (row-by-row format)

**Features:**
- Automatically includes OCR tables when files exist in `external_ocr/`
- Default view: OCR-rendered table (blue border)
- Toggle view: Structured JSON data (green border)
- Click-to-copy: Structured cells are clickable

### Step 4: Build Comparison Page

```bash
npx tsx src/build_dimensional_standards_comparison.ts
```

**Output:** `corpus/.../normalized/dimensional_standards_comparison.html`

**Features:**
- Side-by-side: PDF images (left) + OCR/Structured (right)
- Quick navigation: Table TOC at top
- Toggle buttons: Switch between OCR and structured views
- All 22 tables: 02-2 through 02-23

### Step 5: Deploy to Public

```bash
copy corpus\bloomington\2026-02-21\city_pdf\phase2_adu_tables\normalized\*.html public\bloomington\tables\
```

**Live URL:** https://seberry.github.io/udos-for-llms/public/bloomington/tables/dimensional_standards_comparison.html

## Verification Process

### Using the Comparison Page

1. **Open comparison page** in browser
2. **Review layout:**
   - **Left panel**: PDF page images (source truth)
   - **Right panel**: OCR table (default, blue) or Structured data (green)
3. **For each table:**
   - Compare PDF image with OCR rendering
   - Look for: merged cells, missing values, formatting issues
   - Toggle to structured data to verify JSON matches OCR
4. **Debug issues:**
   - Click structured cells to copy values
   - Check JSON source: `corpus/.../normalized/table_XX-XX_normalized.json`
   - Verify OCR source: `corpus/.../external_ocr/table_XX-XX.md`

### What to Check For

**Common Issues:**
- Merged values: "25 ft [1] 30%" (footnote merged with value)
- Missing rows: Table spans multiple pages, some rows not captured
- Wrong labels: Label column misaligned with parameter column
- Formatting errors: Cell spans incorrect, headers wrong

**Verification Checklist:**
- [ ] All rows from PDF appear in table
- [ ] Values match PDF exactly (no merged footnotes)
- [ ] Labels correspond correctly (A, B, C, etc.)
- [ ] Footnotes preserved (in separate field or brackets)
- [ ] Special formatting handled (merged cells, multi-level headers)

## File Naming Conventions

**Critical:** All files must use consistent naming for scripts to find them.

### Pattern: `table_XX-XX`

| File Type | Naming Pattern | Example | Location |
|-----------|---------------|----------|----------|
| OCR Markdown | `table_XX-XX.md` | `table_02-2.md` | `external_ocr/` |
| Normalized JSON | `table_XX-XX_normalized.json` | `table_02-2_normalized.json` | `normalized/` |
| HTML Output | `table_XX-XX_normalized.html` | `table_02-2_normalized.html` | `normalized/` & `public/` |
| Row JSONL | `table_XX-XX_rows.jsonl` | `table_02-2_rows.jsonl` | `normalized/` |

**Reference format:**
- First number: Chapter (02 = Chapter 20, Zoning)
- Second number: Table order (2, 3, 4, etc.)
- No spaces, no leading zeros in second number

**Examples:**
- ✅ `table_02-2.md` - Correct
- ✅ `table_02-10.md` - Correct
- ❌ `02-2.md` - Missing `table_` prefix
- ❌ `table_02-02.md` - Leading zero in second number
- ❌ `Table_02-2.md` - Capital 'T'

**Why This Matters:**
Scripts use pattern matching (`table_02-\d+`) to find files. If naming is inconsistent, OCR won't be included in HTML generation.

## Troubleshooting

### Problem: OCR not showing in HTML

**Symptoms:**
- HTML shows only structured data (green section)
- No blue OCR section
- Comparison page shows "OCR available: ✗"

**Solutions:**
1. Check file name: Must be `table_XX-XX.md` (with `table_` prefix)
2. Check location: Must be in `external_ocr/` directory
3. Check matching: Reference must match (e.g., `table_02-2.md` for `02-2`)
4. Regenerate HTML: `npx tsx src/generate_html_from_normalized_json.ts`

### Problem: Changes not visible on webpage

**Symptoms:**
- Updated JSON but webpage shows old data
- New OCR file not appearing

**Solutions:**
1. Regenerate HTML: `npx tsx src/generate_html_from_normalized_json.ts`
2. Rebuild comparison: `npx tsx src/build_dimensional_standards_comparison.ts`
3. Copy to public: `copy corpus\... normalized\*.html public\... tables\`
4. Clear browser cache

### Problem: Merged values in structured data

**Symptoms:**
- Values like "25 ft [1] 30%" (footnote merged)
- Multiple values in single cell

**Causes:**
- Automated extraction merged adjacent cells
- OCR output had merged cells

**Solutions:**
1. Use OCR markdown as reference
2. Manually edit JSON: `corpus/.../normalized/table_XX-XX_normalized.json`
3. Split merged values into separate rows or fields
4. Regenerate HTML: `npx tsx src/generate_html_from_normalized_json.ts`

### Problem: Missing rows in table

**Symptoms:**
- Table has fewer rows than PDF
- Last page rows not captured

**Causes:**
- Table spans multiple pages, extraction missed one
- PDF extraction failed on certain pages

**Solutions:**
1. Get OCR for missing page: Upload to https://ocr.z.ai/
2. Manually add rows to JSON
3. Update `pages` array in JSON to include all pages
4. Regenerate HTML

## Best Practices

### 1. Always Start with OCR for Complex Tables
- Tables with merged cells, multi-level headers, or complex formatting benefit from OCR
- OCR provides human-verified baseline
- Use comparison page to verify accuracy

### 2. Verify Before Using Structured Data
- Structured data is for programmatic access
- Always verify against OCR and PDF first
- Use comparison page for quality control

### 3. Keep Corpus as Source of Truth
- Edit JSON files in `corpus/`, not `public/`
- HTML files are generated, not edited manually
- Regenerate HTML after any JSON changes

### 4. Document Patterns
- Add new formatting patterns to `NORMALIZATION_STYLE_PATTERNS.md`
- Document common issues for future reference
- Share troubleshooting solutions with team

### 5. Use Version Control
- Commit JSON changes with descriptive messages
- Track OCR files in git if they're valuable reference
- Keep `normalized/` and `external_ocr/` in sync

## When to Use This Workflow

**Use dimensional standards workflow for:**
- Chapter 20 tables (02-2 through 02-23)
- Tables requiring human verification
- Complex tables with merged cells or multi-level headers
- Tables where accuracy is critical for downstream use

**May not need full workflow for:**
- Simple, single-page tables
- Tables already accurately extracted
- Tables without verification requirements

## Quick Reference

| Task | Command |
|------|----------|
| Extract with OCR | Upload to https://ocr.z.ai/ |
| Normalize from OCR | `npx tsx src/update_dimensional_standards_from_ocr.ts` |
| Generate HTML | `npx tsx src/generate_html_from_normalized_json.ts` |
| Build comparison | `npx tsx src/build_dimensional_standards_comparison.ts` |
| Deploy to public | `copy corpus\...\*.html public\...\` |
| Verify tables | Open `public/bloomington/tables/dimensional_standards_comparison.html` |

## Related Documentation

- `00_SYSTEM/docs/TABLE_EXTRACTION_NOTES.md` - OCR service details
- `00_SYSTEM/docs/TABLE_NAMING_CONVENTIONS.md` - Naming rules
- `00_SYSTEM/docs/TABLE_UPDATE_TROUBLESHOOTING.md` - More troubleshooting
- `00_SYSTEM/docs/DATA_CONTRACTS.md` - Data schema
- `00_SYSTEM/docs/FILE_LOCATIONS.md` - File locations