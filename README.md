# LLM-Readable UDO Corpus

This repository builds and maintains a reproducible corpus of local ordinance PDFs and LLM-ready text artifacts.

Current implementation status:
- Phase 0: Municode PDF archival with provenance (`grab`)
- Phase 0.5: Dual-source archival (Municode + city direct PDF) (`grab:both`)
- Phase 1: PDF-to-text normalization and chunking pipeline (`build:corpus`)

## Quick Start

```bash
npm install
npx playwright install chromium
```

Run archival for Bloomington (both sources):

```bash
npm run grab:both -- --town-slug bloomington --town-name "Bloomington" --municode-url "https://library.municode.com/in/bloomington" --pdf-url "https://bloomington.in.gov/sites/default/files/2026-01/UDO_November_2025%20APPROVED.pdf"
```

Build Phase 1 corpus from latest city snapshot:

```bash
npm run build:corpus -- --town-slug bloomington --source-type city_pdf
```

## Core Commands

- `npm run grab -- --url "<municode city url>"`
- `npm run grab -- --file towns.txt`
- `npm run grab:both -- --town-slug <slug> --municode-url <url> --pdf-url <url>`
- `npm run grab:both -- --file towns.dual.txt`
- `npm run build:corpus -- --town-slug <slug> --source-type city_pdf|municode`
- `npm run typecheck`

## Repository Structure

```text
sources/<town_slug>/<YYYY-MM-DD>/...     # archived source PDFs + provenance
corpus/<town_slug>/<YYYY-MM-DD>/...      # derived LLM-ready artifacts (ignored in git)
src/                                     # TypeScript pipelines
README_USAGE.md                          # archival ingestion docs
README_PHASE1.md                         # corpus build docs
docs/OPERATIONS.md                       # routine operation + maintenance runbook
docs/MAINTENANCE_CHECKLIST.md            # quick recurring checklist
docs/DATA_CONTRACTS.md                   # file formats and schema expectations
docs/ROADMAP.md                          # phased plan for next milestones
```

## Workflow Summary

1. Archive fresh source PDFs (`grab:both`).
2. Verify hashes and source metadata.
3. Build normalized chunk corpus (`build:corpus`).
4. Maintain and evaluate QA regression set.
5. Promote validated outputs to downstream retrieval/QA systems.

## Safety and Scope Notes

- This repository is for technical/document archival and structured processing.
- Do not treat outputs as legal advice.
- Always verify legal interpretations against official sources.
