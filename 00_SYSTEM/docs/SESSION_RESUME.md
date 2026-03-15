# Session Resume Notes

This file is a compact restart point for future sessions.

## Current Mental Model

The project now has three distinct layers:

- `inventory/`: mutable planning and discovery data
- `sources/`: immutable dated snapshots of official source materials
- `corpus/`: derived processing outputs built from dated snapshots

Use them like this:

- if the work is "what places do we know about and what source pattern do they use?" it belongs in `inventory/`
- if the work is "fetch the official ordinance as it existed on a retrieval date" it belongs in `sources/`
- if the work is "extract text, chunks, tables, or eval artifacts from a snapshot" it belongs in `corpus/`

## Inventory Files

Primary files:

- `inventory/jurisdictions.jsonl`: one record per jurisdiction
- `inventory/discovery_attempts.jsonl`: short structured notes for source patterns that did not fit the current simple downloader

Helper tool:

- `src/manage_jurisdiction_inventory.ts`

Useful commands:

```bash
npm run inventory:jurisdictions:validate
npm run inventory:jurisdictions:summary
npm run inventory:jurisdictions:build-batch -- --out inventory/batches/some-batch.jsonl
```

## Acquisition Pattern That Has Worked

The most reliable discovery path so far is:

1. official planning, zoning, or codes page
2. official document-center or direct document link
3. batch into `grab:both`
4. archive dated snapshot under `sources/`

Important practical note:

- many valid official PDF endpoints do not literally end in `.pdf`

That is already accounted for in the inventory helper and downloader.

## Source Patterns Seen So Far

Good current-tool fits:

- Municode landing page with downloadable publication PDF
- official direct document links
- official CivicPlus `DocumentCenter/View/...` links

Needs-review patterns:

- Laserfiche document sets
- EncodePlus / online ordinance viewers
- section-by-section HTML ordinance pages
- official pages that clearly reference a UDO but do not expose a compiled downloadable document in the obvious path

When one of those shows up:

- do not keep retrying the same basic PDF assumption
- record the result in `inventory/discovery_attempts.jsonl`

## Current Project State

As of `2026-02-28`:

- inventory records: `44`
- grabbed jurisdictions: `10`
- needs-review jurisdictions: `5`

Grabbed examples currently include:

- Bloomington
- Westfield
- Carmel
- Noble County
- Johnson County
- Porter County
- Brownsburg
- Columbus
- Clark
- Richmond

This is a useful first representative pile because it includes:

- cities
- a town
- counties
- Municode
- several different official direct-document systems

## Meaning Of `needs_review`

`needs_review` does **not** usually mean "this is probably irrelevant."

It usually means:

- the jurisdiction appears to have a real official UDO or zoning source
- but the obvious acquisition path is not a simple downloadable PDF
- so the current downloader is not the right first move

Examples already seen:

- South Bend: official zoning source, but Laserfiche-style document browsing
- St. Joseph County: official zoning source, but HTML/section-oriented structure
- Noblesville: official UDO references, but not yet a clean compiled document URL
- Valparaiso: official UDO viewer via EncodePlus
- Fishers: official planning/UDO references, but no clear compiled PDF found in the quick pass

## Immediate Candidate Next Steps

Strong next directions:

1. connect the repo to GitHub and push the current commit history
2. build a Bloomington demo page with warnings, provenance, and source-linked outputs to test whether LLMs can really use the extracted data
3. investigate one `needs_review` source pattern and decide whether the project needs an HTML/viewer acquisition path
4. run Phase 1 on a couple of non-Bloomington snapshots to test downstream generalization

## Current Commit

Inventory/discovery workflow commit:

- `c1512d6 Add jurisdiction inventory and discovery workflow`
