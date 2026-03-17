# Quick Start Guide

Get started quickly with the right documentation for your task.

## First Time Here?

1. **Read project overview:** `00_SYSTEM/README.md`
2. **Understand data structure:** `00_SYSTEM/docs/DATA_CONTRACTS.md`
3. **Find files:** `00_SYSTEM/docs/FILE_LOCATIONS.md`

## Task-Specific Guides

### I want to update dimensional standards tables
**Start with:** `00_SYSTEM/README.md` → "Common Workflows" section

**Quick steps:**
```bash
npx tsx src/update_dimensional_standards_from_ocr.ts
npx tsx src/generate_html_from_normalized_json.ts
npx tsx src/build_dimensional_standards_comparison.ts
copy corpus\bloomington\...\*.html public\bloomington\tables\
```

**Having issues?** `00_SYSTEM/docs/TABLE_UPDATE_TROUBLESHOOTING.md`

### I need to understand the data schema
**Read:** `00_SYSTEM/docs/DATA_CONTRACTS.md`

Key sections:
- Dimensional Standards Tables (schema, rules, workflow)
- Phase 2 ADU Table Artifacts (if working with ADU tables)
- Phase 1 Corpus Artifacts (if working with text chunks)

### I can't find a file
**Use:** `00_SYSTEM/docs/TABLE_UPDATE_TROUBLESHOOTING.md` → "Problem: Changes not visible on webpage"

**Quick lookup table:** `00_SYSTEM/docs/FILE_LOCATIONS.md`

### Tables show wrong/merged data
**Read:** `00_SYSTEM/docs/TABLE_UPDATE_TROUBLESHOOTING.md`

Common issues:
- Merged values like "25 ft [1] 30%"
- Missing rows
- Wrong labels

### I'm building something new (new town, new feature)
**Start with:** `00_SYSTEM/docs/OPERATIONS.md`

Then check:
- `00_SYSTEM/docs/ROADMAP.md` - Project phases
- `00_SYSTEM/docs/JURISDICTION_INVENTORY_WORKFLOW.md` - Adding towns

## Documentation Index

### Core Documentation
| File | Purpose |
|-------|---------|
| `00_SYSTEM/README.md` | Project overview and workflows |
| `00_SYSTEM/docs/DATA_CONTRACTS.md` | Data schemas and formats |
| `00_SYSTEM/docs/FILE_LOCATIONS.md` | Where files live |

### Task-Specific
| File | Purpose |
|-------|---------|
| `00_SYSTEM/docs/TABLE_UPDATE_TROUBLESHOOTING.md` | Fix table update issues |
| `00_SYSTEM/docs/OPERATIONS.md` | General operations guide |
| `00_SYSTEM/docs/TABLE_EXTRACTION_NOTES.md` | Table extraction details |

### Advanced Topics
| File | Purpose |
|-------|---------|
| `00_SYSTEM/docs/NORMALIZATION_STYLE_PATTERNS.md` | Table normalization patterns |
| `00_SYSTEM/docs/GITHUB_PAGES_DEPLOYMENT.md` | Deploy to GitHub Pages |
| `00_SYSTEM/docs/JURISDICTION_INVENTORY_WORKFLOW.md` | Manage jurisdictions |
| `00_SYSTEM/docs/ADU_EVAL_WORKFLOW.md` | ADU retrieval evaluation |

## Common Workflows

### Update tables with corrected data
```
1. Format data as markdown tables
   ↓
2. Run: npx tsx src/update_dimensional_standards_from_ocr.ts
   ↓
3. Run: npx tsx src/generate_html_from_normalized_json.ts
   ↓
4. Run: npx tsx src/build_dimensional_standards_comparison.ts
   ↓
5. Copy: corpus/... → public/...
```

### Debug table issues
```
1. Check: 00_SYSTEM/docs/TABLE_UPDATE_TROUBLESHOOTING.md
   ↓
2. Verify schema: 00_SYSTEM/docs/DATA_CONTRACTS.md
   ↓
3. Compare examples: corpus/.../normalized/table_02-2_normalized.json
   ↓
4. Check workflow: 00_SYSTEM/README.md → Common Workflows
```

## Decision Tree

```
What do you want to do?

├─ Update existing tables
│  ├─ Have corrected OCR data? → update_dimensional_standards_from_ocr.ts
│  └─ Have JSON edits? → generate_html_from_normalized_json.ts
│
├─ Fix table problems
│  └─ See TABLE_UPDATE_TROUBLESHOOTING.md
│
├─ Add new town/jurisdiction
│  └─ See JURISDICTION_INVENTORY_WORKFLOW.md
│
├─ Understand data structure
│  └─ See DATA_CONTRACTS.md
│
└─ Find specific files
   └─ See FILE_LOCATIONS.md
```

## Key Concepts

### Corpus vs Public
- **Corpus (`corpus/`)**: Source of truth, authoritative data
- **Public (`public/`)**: Published files, mirrors corpus
- **Workflow**: Edit corpus → Generate HTML → Copy to public

### Source Scripts
All scripts in `src/` directory:
- `normalize_*.ts` - Auto-extraction from OCR
- `update_*.ts` - Manual corrections from markdown
- `generate_*.ts` - Create HTML from JSON
- `build_*.ts` - Build composite pages

### Table Reference Pattern
Tables use reference like `02-2`, `02-3`, etc.:
- First number: Chapter (02 = Chapter 20, Zoning)
- Second number: Table order within chapter

## Getting Help

If you're stuck:
1. Check relevant guide from this document
2. Look at working examples in `corpus/bloomington/.../`
3. Review scripts in `src/` directory
4. Check `00_SYSTEM/docs/` for detailed documentation

## Next Steps

After reading this guide:
- **Updating tables?** Go to `00_SYSTEM/README.md` → Common Workflows
- **Fixing issues?** Go to `00_SYSTEM/docs/TABLE_UPDATE_TROUBLESHOOTING.md`
- **Understanding data?** Go to `00_SYSTEM/docs/DATA_CONTRACTS.md`
- **Finding files?** Go to `00_SYSTEM/docs/FILE_LOCATIONS.md`