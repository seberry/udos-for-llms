# Table Naming Conventions

Critical guide for consistent file naming across the UDOsforLLMs project. Scripts use pattern matching to find files, so naming must be precise.

## Why Naming Conventions Matter

Scripts use pattern matching (`table_02-\d+`) to automatically locate and process files. If naming is inconsistent:
- OCR files won't be included in HTML generation
- Comparison pages won't find tables
- Automated workflows will fail silently
- Debugging becomes difficult

## Universal Pattern: `table_XX-XX`

All table-related files use this pattern, with different suffixes.

### Structure Breakdown

```
table_XX-XX{.extension}
 │     │  └─ Table number (e.g., 2, 3, 10)
 │     └─ Chapter number (e.g., 02 = Chapter 20)
 └─ Prefix (always "table_", lowercase)
```

**Components:**
1. **Prefix**: `table_` (lowercase, underscore)
2. **Chapter**: Two digits (e.g., `02`, `03`, `04`)
3. **Separator**: Hyphen `-`
4. **Table Number**: Digits without leading zeros (e.g., `2`, `10`, `23`)
5. **Extension**: File type (`.md`, `.json`, `.html`, `.jsonl`)

## File Types and Naming

### OCR Markdown Files

**Purpose**: Human-verified OCR output from external services

**Naming**: `table_XX-XX.md`

**Examples:**
- ✅ `table_02-2.md` - Table 02-2 (R1 District)
- ✅ `table_02-10.md` - Table 02-10 (R9 District)
- ✅ `table_03-1.md` - Table 03-1 (Allowed Uses)

**Location**: `corpus/<town>/<date>/<source>/phase2_adu_tables/external_ocr/`

**Critical Requirements:**
- Must have `table_` prefix
- Must match JSON table reference exactly
- File extension: `.md` (markdown)

### Normalized JSON Files

**Purpose**: Machine-readable table data for programmatic access

**Naming**: `table_XX-XX_normalized.json`

**Examples:**
- ✅ `table_02-2_normalized.json`
- ✅ `table_03-1_normalized.json`
- ✅ `table_04-9_normalized.json`

**Location**: `corpus/<town>/<date>/<source>/phase2_adu_tables/normalized/`

**Schema**: See `00_SYSTEM/docs/DATA_CONTRACTS.md`

### HTML Output Files

**Purpose**: Human-readable HTML for review and publication

**Naming**: `table_XX-XX_normalized.html`

**Examples:**
- ✅ `table_02-2_normalized.html`
- ✅ `table_03-4_normalized.html`
- ✅ `table_04-10_normalized.html`

**Locations:**
- Generated: `corpus/<town>/<date>/<source>/phase2_adu_tables/normalized/`
- Published: `public/<town>/tables/`

### Row JSONL Files

**Purpose**: Row-by-row format for training data

**Naming**: `table_XX-XX_rows.jsonl`

**Examples:**
- ✅ `table_02-2_rows.jsonl`
- ✅ `table_03-1_rows.jsonl`

**Location**: `corpus/<town>/<date>/<source>/phase2_adu_tables/normalized/`

## Common Naming Mistakes

### Missing Prefix

❌ `02-2.md` - Missing `table_` prefix
✅ `table_02-2.md` - Correct

**Impact**: Scripts won't find OCR file, HTML generation won't include it

### Leading Zeros in Table Number

❌ `table_02-02.md` - Leading zero in second number
✅ `table_02-2.md` - Correct

**Impact**: Pattern matching fails, file not found

### Capitalized Prefix

❌ `Table_02-2.md` - Capital 'T'
✅ `table_02-2.md` - All lowercase

**Impact**: Pattern matching is case-sensitive, file not found

### Wrong Extension

❌ `table_02-2.txt` - Wrong extension
✅ `table_02-2.md` - Correct markdown extension

**Impact**: Scripts expect `.md` for OCR files

### Missing Separator

❌ `table_02_2.md` - Underscore instead of hyphen
✅ `table_02-2.md` - Hyphen separator

**Impact**: Pattern matching fails, file not found

### Spaces in Name

❌ `table 02-2.md` - Space in name
✅ `table_02-2.md` - No spaces

**Impact**: Pattern matching fails, file not found

## Reference Format Examples

### Dimensional Standards (Chapter 20)

| Table Name | Reference | JSON | OCR | HTML |
|-----------|-----------|------|-----|------|
| R1 District | 02-2 | `table_02-2_normalized.json` | `table_02-2.md` | `table_02-2_normalized.html` |
| R2 District | 02-3 | `table_02-3_normalized.json` | `table_02-3.md` | `table_02-3_normalized.html` |
| R9 District | 02-10 | `table_02-10_normalized.json` | `table_02-10.md` | `table_02-10_normalized.html` |
| ... | 02-23 | `table_02-23_normalized.json` | `table_02-23.md` | `table_02-23_normalized.html` |

### ADU Tables (Chapter 3, 4)

| Table Name | Reference | JSON | HTML |
|-----------|-----------|------|------|
| Allowed Uses | 03-1 | `table_03-1_normalized.json` | `table_03-1_normalized.html` |
| Accessory Structures | 03-4 | `table_03-4_normalized.json` | `table_03-4_normalized.html` |
| Parking Requirements | 04-9 | `table_04-9_normalized.json` | `table_04-9_normalized.html` |
| Parking Allowance | 04-10 | `table_04-10_normalized.json` | `table_04-10_normalized.html` |

## How Files Link Together

```
┌─────────────────────────────────────────────────────────────────┐
│                    Table Reference: 02-2                    │
└─────────────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│ table_02-2 │  │table_02-2_  │  │table_02-2_  │
│ .md (OCR)   │  │normalized.json│  │normalized.html│
│             │  │ (data)      │  │ (display)    │
│ Human view  │  │ Machine view │  │ Published    │
└─────────────┘  └──────────────┘  └──────────────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
              ┌──────────────────┐
              │table_02-2_     │
              │rows.jsonl       │
              │(training data)  │
              └──────────────────┘
```

## Script Pattern Matching

### How Scripts Find Files

**Example Pattern:**
```typescript
const jsonFiles = fs.readdirSync(dir)
  .filter(f => f.match(/^table_02-\d+_normalized\.json$/));
```

**Pattern breakdown:**
- `^table_` - Must start with "table_"
- `02-` - Must be chapter 02
- `\d+` - One or more digits (table number)
- `_normalized\.json$` - Must end with "_normalized.json"

**What this matches:**
- ✅ `table_02-2_normalized.json`
- ✅ `table_02-10_normalized.json`
- ✅ `table_02-23_normalized.json`

**What this doesn't match:**
- ❌ `02-2_normalized.json` - Missing prefix
- ❌ `table_02-02_normalized.json` - Leading zero
- ❌ `Table_02-2_normalized.json` - Capital T
- ❌ `table_03-1_normalized.json` - Wrong chapter

## Verification Checklist

When adding or renaming files, verify:

- [ ] Prefix is `table_` (lowercase, underscore)
- [ ] Chapter number is correct (02, 03, 04, etc.)
- [ ] Separator is hyphen `-`
- [ ] Table number has no leading zeros
- [ ] Extension is correct (`.md`, `.json`, `.html`, `.jsonl`)
- [ ] No spaces in filename
- [ ] All files for same table use same reference
- [ ] JSON reference matches OCR filename (without extension)

## Debugging Naming Issues

### Problem: File not found by script

**Checklist:**
1. Verify filename matches pattern exactly
2. Check for typos (capitalization, spaces)
3. Confirm file is in correct directory
4. Check pattern matching in script source code

**Debug command:**
```bash
ls corpus/bloomington/.../external_ocr/ | grep "table_02-2"
```

### Problem: OCR not showing in HTML

**Symptoms:**
- HTML shows only structured data
- Comparison page shows "OCR available: ✗"

**Solutions:**
1. Check OCR filename: Must be `table_XX-XX.md`
2. Check JSON reference: Must match OCR name (e.g., `02-2`)
3. Check file location: Must be in `external_ocr/`
4. Regenerate HTML: `npx tsx src/generate_html_from_normalized_json.ts`

## Related Documentation

- `00_SYSTEM/docs/DIMENSIONAL_STANDARDS_WORKFLOW.md` - Complete workflow
- `00_SYSTEM/docs/TABLE_EXTRACTION_NOTES.md` - OCR integration
- `00_SYSTEM/docs/FILE_LOCATIONS.md` - Where files live
- `00_SYSTEM/docs/DATA_CONTRACTS.md` - Data schemas