# Municode + City PDF UDO Grabber (Phase 0 / 0.5)

This tool automates archival download of Municode publication PDFs with provenance metadata.

For operations/maintenance workflow, see `00_SYSTEM/docs/OPERATIONS.md`.
For field-level schema details, see `00_SYSTEM/docs/DATA_CONTRACTS.md`.
For ADU table + retrieval scoring workflow, see `00_SYSTEM/docs/ADU_EVAL_WORKFLOW.md`.

## Setup

```bash
npm install
npx playwright install chromium
```

If you want another browser, install it and pass `--browser firefox` or `--browser webkit`.

## Commands

Single URL:

```bash
npm run grab -- --url "https://library.municode.com/in/bloomington"
```

Batch from file (`towns.txt` has one URL per line, `#` comments allowed):

```bash
npm run grab -- --file towns.txt
```

Dual-source (Municode + direct city PDF in one run):

```bash
npm run grab:both -- --town-slug bloomington --town-name "Bloomington" --municode-url "https://library.municode.com/in/bloomington" --pdf-url "https://bloomington.in.gov/sites/default/files/2026-01/UDO_November_2025%20APPROVED.pdf"
```

Dual-source batch file:

```bash
npm run grab:both -- --file towns.dual.txt
```

`towns.dual.txt` supports:
- JSONL lines, example:
```json
{"town_slug":"bloomington","town_name":"Bloomington","municode_url":"https://library.municode.com/in/bloomington","pdf_url":"https://bloomington.in.gov/sites/default/files/2026-01/UDO_November_2025%20APPROVED.pdf"}
```
- Pipe-delimited lines:
```text
bloomington|Bloomington|https://library.municode.com/in/bloomington|https://bloomington.in.gov/sites/default/files/2026-01/UDO_November_2025%20APPROVED.pdf
```
- Or single URL per line (treated as either `municode_url` or `pdf_url` automatically).

Smoke test mode (no files written):

```bash
npm run grab -- --url "https://library.municode.com/in/bloomington" --dry-run
```

Optional flags:

- `--browser chromium|firefox|webkit`
- `--headed` (overrides default headless mode)

## ADU usefulness workflow (post-Phase 1)

Build corpus:

```bash
npm run build:corpus -- --town-slug bloomington --source-type city_pdf
```

Extract ADU-relevant tables from Phase 1 page text:

```bash
npm run build:adu-tables -- --town-slug bloomington --source-type city_pdf
```

Score ADU retrieval + citation grounding:

```bash
npm run eval:adu -- --town-slug bloomington --source-type city_pdf --top-k 6
```

After human review, run with gold labels:

```bash
npm run eval:adu -- --town-slug bloomington --source-type city_pdf --top-k 6 --gold-file corpus/bloomington/2026-02-21/city_pdf/phase2_adu_eval/gold_citations.json
```

Human verification app for normalized target tables:

```bash
npm run verify:targets:pymupdf -- --town-slug bloomington --source-type city_pdf --date 2026-02-21
```

Then open:
- `corpus/<town_slug>/<YYYY-MM-DD>/<source_type>/phase2_adu_tables/normalized/target_tables_review_app.html`

Table inventory + backlog (what to normalize/verify next):

```bash
npm run inventory:tables -- --town-slug bloomington --source-type city_pdf --date 2026-02-21
```

## Config

Defaults are in `grab.config.json`:

- `timezone` (default `America/Indiana/Indianapolis`)
- `outputRoot` (default `sources`)
- `browser` (default `chromium`)
- `headless` (default `true`)
- `saveScreenshot` (default `true`)
- `navigationTimeoutMs`
- `downloadTimeoutMs`
- `maxAttempts`

## Output Layout

`npm run grab --` output:

```text
sources/<town_slug>/<YYYY-MM-DD>/
  udo.pdf
  source.json
  SHA256SUMS.txt
  source_page.png   # if saveScreenshot=true
```

`npm run grab:both --` output:

```text
sources/<town_slug>/<YYYY-MM-DD>/
  municode/
    udo.pdf
    source.json
    SHA256SUMS.txt
    source_page.png   # if saveScreenshot=true
  city_pdf/
    udo.pdf
    source.json
    SHA256SUMS.txt
    source_page.png   # if saveScreenshot=true
```

`source.json` includes:

- `town_display_name`
- `town_slug`
- `retrieved_at_local`
- `source_url`
- `download_url` (or `null`)
- `download_method`
- `user_agent`
- `playwright_browser`
- `previous_snapshot_date` (or `null`)
- `previous_sha256` (or `null`)
- `content_changed_since_previous` (`true`/`false`/`null`)
- `notes` with verification reminder

## Failure Guidance

If no download control is found, try:

- Using the city root page (`/state/city`) instead of deep `nodeId` pages.
- Verifying that a publication PDF is available in the Municode UI.
