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

Core commands:
- `npm run grab -- --url "<municode city url>"`
- `npm run grab:both -- --town-slug <slug> --municode-url <url> --pdf-url <url>`
- `npm run build:corpus -- --town-slug <slug> --source-type city_pdf|municode`
- `npm run build:adu-tables -- --town-slug <slug> --source-type city_pdf|municode`
- `npm run eval:adu -- --town-slug <slug> --source-type city_pdf|municode`
