# Operations Runbook

This runbook is for ongoing maintenance of ordinance snapshots and corpus outputs.

## Standard Monthly Cycle

1. Pull latest sources for each town:
```bash
npm run grab:both -- --file towns.dual.txt
```
2. Build corpus for required source types:
```bash
npm run build:corpus -- --town-slug bloomington --source-type city_pdf
npm run build:corpus -- --town-slug bloomington --source-type municode
```
3. Check reports:
- `low_text_pages` spikes
- unexpectedly low `chunk_count`
- extraction failures in logs
4. Log differences from previous snapshot (`content_changed_since_previous`).
5. Update QA evaluation set if major ordinance changes landed.

## Before Merging Changes

Run:
```bash
npm run typecheck
```
Then smoke-test at least one downloader path:
```bash
npm run grab -- --url "https://library.municode.com/in/bloomington" --dry-run
```

## Suggested Cadence

- Monthly automated archival run.
- Additional ad hoc run after major local ordinance updates.

## Troubleshooting

### Playwright browser missing
Run:
```bash
npx playwright install chromium
```

### Municode download control not found
- Use city root URL, not deep nodeId pages.
- Re-run with `--headed` to observe UI behavior.
- If flow changed, update selectors in `src/grab_municode_pdf.ts` and `src/grab_dual_sources.ts`.

### Direct PDF URL fails with non-PDF response
- Confirm the URL is a direct `.pdf` endpoint.
- If URL redirects to HTML gate pages, adjust source acquisition strategy.

### High count of low-text pages
- Indicates scanned/image pages or extraction issues.
- Add OCR fallback in a subsequent phase for flagged pages.

## Data Retention Guidance

- Keep all dated snapshots immutable.
- Never overwrite prior snapshots.
- Use SHA-256 files for change tracking and integrity checks.

## Release Discipline

- Commit pipeline/code changes separately from data snapshots.
- Keep generated corpora ignored unless explicitly versioning an artifact release.
