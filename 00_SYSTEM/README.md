You are working in a new Git repo that contains 00_SYSTEM/README.md describing the “LLM-Readable UDO Corpus” project.

TASK (Phase 0 only): Build a robust, repeatable downloader that archives official-ish UDO PDFs from Municode (library.municode.com) with provenance.

GOAL:
Given a Municode city landing page URL (example: https://library.municode.com/in/bloomington),
the tool should:
1) Open the page in a real browser context (JS enabled).
2) Find and click the “Download Publication PDF” (or equivalent “Download PDF”) action.
   - If the button is not visible, try opening the site’s print/export menu if present.
3) Capture the resulting PDF download and save it to:
   sources/<town_slug>/<YYYY-MM-DD>/udo.pdf
4) Write a provenance file:
   sources/<town_slug>/<YYYY-MM-DD>/source.json
   containing:
   - town_display_name (string)
   - town_slug (string)
   - retrieved_at_local (America/Indiana/Indianapolis ISO string)
   - source_url (the input URL)
   - download_url (final URL if discoverable; else null)
   - download_method (string description of clicks taken)
   - user_agent (string)
   - playwright_browser (chromium/firefox/webkit)
   - notes (include “Not legal advice. Verify against official sources.”)
5) Compute SHA-256 of the saved PDF and write:
   sources/<town_slug>/<YYYY-MM-DD>/SHA256SUMS.txt
6) (Optional but recommended) Save a screenshot for provenance:
   sources/<town_slug>/<YYYY-MM-DD>/source_page.png
   capturing the page state right before download click.

IMPLEMENTATION CONSTRAINTS:
- Use Playwright (prefer Node/TypeScript). If repo has no Node setup, create it.
- Provide a single command:
  npm run grab -- --url "<municode city url>"
  Optionally also support:
  npm run grab -- --file towns.txt
  where towns.txt contains one URL per line.
- Create a config file for defaults (timezone, output root, browser type, headless=true by default).
- Be careful about OS-native print dialogs: do NOT rely on OS print; use site PDF download link.
- Be resilient: add retries and clear error messages if the site flow changes.
- Do not scrape HTML content; this is only PDF capture + provenance for archival.

DELIVERABLES:
- package.json with scripts
- src/grab_municode_pdf.ts (or similar)
- src/utils/{slugify.ts,time.ts,hash.ts,fs.ts}
- README_USAGE.md explaining how to run it and the expected directory output
- A small “smoke test” mode: if run with --dry-run, it should navigate and report what it would click without saving.

QUALITY BAR:
- Code should be readable, documented, and robust to minor UI variation.
- Log each step (navigate, locate download control, click, wait for download, save, hash, write metadata).
- If the download button is not found, print suggestions (e.g., “Try the city root page rather than a specific nodeId page”).

FIRST STEP:
Inspect the repo, read 00_SYSTEM/README.md, then scaffold Node/TS + Playwright, then implement the downloader.

After implementation, output:
- a short summary of files created
- how to run one example command for Bloomington.