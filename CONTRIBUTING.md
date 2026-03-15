# Contributing

Thanks for helping make public civic rules more legible.

## Ground rules

- This project is for first-pass screening only.
- Always include official source links and a last-updated date.
- If you edit or transform tables, keep a clear audit trail.
- Keep public-facing warnings intact. Do not present derived artifacts as authoritative law.

## Repository model

- `sources/` stores immutable dated snapshots of official source material.
- `corpus/` stores derived processing outputs built from a dated snapshot.
- `cities/` stores lightweight public-facing jurisdiction pages and placeholders.

## How to add a new jurisdiction

1. Create a folder at `cities/<jurisdiction-slug>/`.
2. Add:
   - `provenance.md` or `provenance.html`: official links, ordinance identifiers, retrieval date, notes
   - `CHANGELOG.md`: what changed, when, and why
   - `chunks/`: public notes or links for chunked outputs
   - `tables/`: public notes or links for cleaned table outputs
3. If the jurisdiction has real source snapshots, archive them under `sources/<jurisdiction-slug>/<YYYY-MM-DD>/`.
4. If the jurisdiction has derived outputs, place them under `corpus/<jurisdiction-slug>/<YYYY-MM-DD>/<source_type>/`.
5. Add the jurisdiction to `index.html` with coverage notes, last-updated date, and provenance links.

## Required metadata for chunk files

Put this at the top of each public chunk file or chunk index:

- Jurisdiction:
- Source:
- Source retrieval date:
- Dataset last updated:
- Scope notes:
- Known gaps / warnings:

## Reporting an error

Open a GitHub issue with:

- Jurisdiction
- File path or public page
- What seems wrong
- Official source link plus page or section reference
- Optional suggested correction

## Style conventions

- Use short files rather than one huge document.
- Prefer plain markdown or simple HTML over complex formatting.
- Keep headings stable over time.
- Always preserve a link back to the authoritative source.
- Label anything inferred, normalized, or manually repaired.
