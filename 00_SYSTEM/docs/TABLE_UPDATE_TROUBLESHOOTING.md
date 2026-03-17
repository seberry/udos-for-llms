# Dimensional Standards Tables - Troubleshooting Guide

Common issues and solutions when updating dimensional standards tables.

## Common Problems

### Problem: Tables show merged values like "25 ft [1] 30%"

**Symptoms:**
- Value column contains concatenated text with bracket markers
- Multiple values in one cell
- Row count is too low

**Cause:** OCR extraction merged adjacent cells

**Solution:**
```bash
# Use the manual update script with properly formatted markdown
npx tsx src/update_dimensional_standards_from_ocr.ts
```

Format your input markdown with each parameter on its own row:
```markdown
| Label | Parameter | Value | Notes |
|-------|-----------|-------|-------|
| A | Lot area | 20,000 sq ft (0.459 acres) | Notes here |
| B | Lot width | 100 ft | Notes here |
```

---

### Problem: Missing rows in comparison page

**Symptoms:**
- Table shows fewer rows than expected
- Some parameters are missing entirely
- Row count doesn't match source table

**Cause:** Each parameter must be its own row in the JSON

**Solution:**
Check the normalized JSON file structure. Each row in the table should have:
```json
{
  "label": "A",
  "parameter": "Lot area",
  "value": "20,000 sq ft (0.459 acres)",
  ...
}
```

If parameters are merged, reformat your markdown input so each parameter gets its own row.

---

### Problem: Changes not visible on webpage

**Symptoms:**
- Updated JSON files but webpage shows old data
- Comparison page still shows old row counts
- Individual table pages not updated

**Cause:** HTML files in `public/` directory weren't updated

**Solution:**
```bash
# Regenerate HTML from updated JSON
npx tsx src/generate_html_from_normalized_json.ts

# Copy to public directory (manual step required)
copy corpus\bloomington\2026-02-21\city_pdf\phase2_adu_tables\normalized\*.html public\bloomington\tables\

# Regenerate comparison page
npx tsx src/build_dimensional_standards_comparison.ts

# Copy comparison page
copy corpus\bloomington\2026-02-21\city_pdf\phase2_adu_tables\normalized\dimensional_standards_comparison.html public\bloomington\tables\
```

**Note:** There is no automatic deployment. You must manually copy files from `corpus/` to `public/`.

---

### Problem: "Table not found" error when running scripts

**Symptoms:**
- Script fails with "Cannot find table XX-XX"
- Table reference not recognized

**Cause:** Table reference doesn't match expected pattern or file doesn't exist

**Solution:**
1. Check file exists in: `corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/normalized/`
2. Verify filename matches pattern: `table_XX-XX_normalized.json`
3. Ensure table reference in your markdown matches the filename

---

### Problem: Wrong label letters (A, B, C, etc.)

**Symptoms:**
- Labels don't match standard pattern
- Labels repeated or skipped
- Notes rows have letter labels

**Cause:** Incorrect markdown formatting or parsing error

**Solution:**
Use standard label pattern:
- A, B: Lot dimensions (area, width)
- C, D, E: Setbacks (front, side, rear)
- F, G: Height and other standards
- H: Special cases (RMH district)

For unlabeled parameters, leave Label column empty:
```markdown
| Label | Parameter | Value |
|-------|-----------|-------|
| | Impervious surface coverage (max) | 30% |
```

---

### Problem: Multi-part values display incorrectly

**Symptoms:**
- Values like "Entire Dev: 43,560 sq ft Dwelling Site: 3,000 sq ft" appear on one line
- Should be separated but aren't

**Cause:** Missing line break markers in JSON

**Solution:**
Use `<br>` tag in value field for line breaks:
```json
{
  "value": "Entire Dev: 43,560 sq ft (1.0 acres)<br>Dwelling Site: 3,000 sq ft"
}
```

In markdown input, use separate rows or explicit formatting:
```markdown
| Label | Parameter | Value |
|-------|-----------|-------|
| A | Lot area | Entire Dev: 43,560 sq ft (1.0 acres)<br>Dwelling Site: 3,000 sq ft |
```

---

### Problem: Section headers appearing as data rows

**Symptoms:**
- Headers like "Lot Dimensions" show up as table rows
- They don't have proper styling

**Cause:** Missing `is_header: true` flag in JSON

**Solution:**
For section header rows, set:
```json
{
  "label": "",
  "parameter": "Lot Dimensions (Minimum, only for lots created after the effective date)",
  "value": "",
  "is_header": true,
  ...
}
```

---

## Verification Checklist

After updating tables, verify:

- [ ] Row count matches source table (check section headers)
- [ ] All labels present (A, B, C, D, E, F, G as applicable)
- [ ] No merged values with bracket markers ([1], [2], etc.)
- [ ] HTML files updated in `public/` directory
- [ ] Comparison page shows correct row count
- [ ] Individual table pages display correctly
- [ ] Values are clean (no concatenation artifacts)

## Quick Reference

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `update_dimensional_standards_from_ocr.ts` | Manual correction from markdown | Markdown tables | JSON files |
| `generate_html_from_normalized_json.ts` | Generate HTML from JSON | JSON files | HTML + JSONL |
| `build_dimensional_standards_comparison.ts` | Build comparison page | JSON files | HTML comparison |
| `normalize_pymupdf_dimensional_standards.ts` | Auto-normalize from OCR | PDF extraction | JSON + HTML |

## Getting Help

If you encounter an issue not covered here:

1. Check the data schema: `00_SYSTEM/docs/DATA_CONTRACTS.md`
2. Review example files in: `corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/normalized/`
3. Compare with working examples (e.g., `table_02-2_normalized.json`)
4. Check the main workflow guide: `00_SYSTEM/README.md` (Common Workflows section)