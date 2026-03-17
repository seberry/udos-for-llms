This is just public for testing. NOT READY FOR HUMAN CONSUMPTION


# LLM-Readable UDO Corpus

System documentation now lives under `00_SYSTEM/`.

Start here:
- `00_SYSTEM/README.md`
- `00_SYSTEM/README_USAGE.md`
- `00_SYSTEM/README_PHASE1.md`
- `00_SYSTEM/docs/COLLABORATION_NOTES.md`
- `00_SYSTEM/docs/JURISDICTION_INVENTORY_WORKFLOW.md`
- `00_SYSTEM/docs/OPERATIONS.md`
- `00_SYSTEM/docs/DATA_CONTRACTS.md`

## Dimensional Standards Tables

Tables include OCR-based verification system for accuracy. Compare PDF images, OCR rendering, and structured data side-by-side.

**Live comparison page:** https://seberry.github.io/udos-for-llms/public/bloomington/tables/dimensional_standards_comparison.html

**Features:**
- PDF page images (source truth)
- OCR-rendered tables (human-verified)
- Structured JSON data (programmatic access)
- Toggle between views for verification

**Documentation:**
- `00_SYSTEM/docs/DIMENSIONAL_STANDARDS_WORKFLOW.md` - Complete workflow
- `00_SYSTEM/docs/TABLE_NAMING_CONVENTIONS.md` - File naming rules
- `00_SYSTEM/docs/TABLE_EXTRACTION_NOTES.md` - OCR integration guide

Core commands:
- `npm run grab -- --url "<municode city url>"`
- `npm run grab:both -- --town-slug <slug> --municode-url <url> --pdf-url <url>`
- `npm run build:corpus -- --town-slug <slug> --source-type city_pdf|municode`
- `npm run build:adu-tables -- --town-slug <slug> --source-type city_pdf|municode`
- `npm run eval:adu -- --town-slug <slug> --source-type city_pdf|municode`
