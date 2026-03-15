# Housing Code First Pass

A public legibility layer for local zoning and building rules: date-stamped, chunked, and table-translated so humans and AI assistants can do a first-pass feasibility scan.

- Not legal advice
- Verify with official sources
- Expect ambiguity

## View the site

This repo is set up for GitHub Pages from the repository root so the published site can link directly to `sources/` and `corpus/`.

- Landing page: `index.html`
- Bloomington demo page: `cities/bloomington/index.html`

## Current public dataset

- Bloomington, Indiana: dated source snapshots plus Phase 1 chunks, Phase 2 ADU-focused tables, and retrieval evaluation artifacts

## Project internals

System documentation lives under `00_SYSTEM/`.

Start here:
- `00_SYSTEM/README.md`
- `00_SYSTEM/README_USAGE.md`
- `00_SYSTEM/README_PHASE1.md`
- `00_SYSTEM/docs/COLLABORATION_NOTES.md`
- `00_SYSTEM/docs/JURISDICTION_INVENTORY_WORKFLOW.md`
- `00_SYSTEM/docs/SESSION_RESUME.md`
- `00_SYSTEM/docs/OPERATIONS.md`
- `00_SYSTEM/docs/DATA_CONTRACTS.md`

Core commands:
- `npm run grab -- --url "<municode city url>"`
- `npm run grab:both -- --town-slug <slug> --municode-url <url> --pdf-url <url>`
- `npm run build:corpus -- --town-slug <slug> --source-type city_pdf|municode`
- `npm run build:adu-tables -- --town-slug <slug> --source-type city_pdf|municode`
- `npm run eval:adu -- --town-slug <slug> --source-type city_pdf|municode`

## Contributing

See `CONTRIBUTING.md` for how to add a jurisdiction, report a correction, or publish a new dated packet.

## License

Repository content is released under CC BY 4.0 unless a file says otherwise. See `LICENSE`.
