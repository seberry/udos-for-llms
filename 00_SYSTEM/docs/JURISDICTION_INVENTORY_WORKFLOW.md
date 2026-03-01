# Jurisdiction Inventory Workflow

This workflow adds a discovery layer for Indiana municipalities and counties before we try to process their ordinances deeply.

## Why This Exists

The project already has a place for immutable dated source snapshots:

- `sources/` for official PDFs and provenance metadata

It also already has a place for derived processing outputs:

- `corpus/` for extracted text, chunks, and later structured artifacts

What was missing is a working list of jurisdictions we want to track over time:

- what place it is
- what kind of jurisdiction it is
- what source system it appears to use
- whether we have enough information to try a grab

That working list is the **jurisdiction inventory**.

## Basic Mental Model

- `inventory/` is mutable planning and tracking data
- `sources/` is immutable fetched source material
- `corpus/` is derived processing output

So:

- if we are deciding what to fetch next, that belongs in `inventory/`
- if we fetched an official PDF on a date, that belongs in `sources/`
- if we extracted text or built tables from a snapshot, that belongs in `corpus/`

## Inventory Files

Primary file:

- `inventory/jurisdictions.jsonl`

One JSON object per line, one jurisdiction per record.

Supporting folders:

- `inventory/batches/` for generated batch files used by grab commands
- `inventory/discovery_notes/` for ad hoc notes, research dumps, or source-finding scratch work
- `inventory/discovery_attempts.jsonl` for short structured notes about failed or non-obvious source-discovery attempts

## Recommended Status Flow

- `discovered`: we know the jurisdiction should be tracked, but source details are weak or missing
- `source_found`: we found at least one plausible source URL
- `grab_ready`: we have enough supported URL information to try the current grabber
- `grabbed`: at least one successful snapshot exists in `sources/`
- `needs_review`: source exists but needs a human check before grabbing
- `failed`: a grab or verification attempt failed and needs follow-up

## Current Scope

This first version is intentionally simple:

- one inventory record per jurisdiction
- one preferred landing URL
- one preferred PDF URL if known
- one source-system classification

That is enough to:

- build a representative Indiana backlog
- sort jurisdictions by readiness
- generate input files for the existing `grab:both` workflow when possible

If later we need multiple source candidates per jurisdiction, we can extend the schema additively.

## Practical Lessons So Far

These are time-saving patterns observed during the first Indiana source-finding pass.

- Many official Indiana city and county sites expose ordinance PDFs through website document systems such as CivicPlus `DocumentCenter/View/...` links.
- A direct PDF endpoint does not always end in `.pdf`. Some official document links still return a PDF cleanly and should remain valid `direct_pdf` candidates.
- Good candidates often have a dedicated planning or zoning page that says `Unified Development Ordinance`, `Zoning Ordinance`, or `Codes & Ordinances`, plus a link labeled `Full UDO`, `Complete UDO`, or similar.
- Some jurisdictions expose an online ordinance viewer, Laserfiche folder, or section-by-section HTML pages instead of a single compiled PDF. Those should usually be marked `needs_review` and logged in `inventory/discovery_attempts.jsonl` rather than repeatedly retried with the current PDF grabber.
- Counties are viable from the beginning. At least one county-level official site already fits the same simple direct-PDF workflow as municipalities.

## Fast Discovery Heuristics

When taking another "bite" at source discovery, the quickest first checks are:

1. Official planning/zoning/codes page on the jurisdiction's own site.
2. Look for `Full UDO`, `Complete UDO`, or `Unified Development Ordinance (PDF)`.
3. Accept official document-center links even when they do not end in `.pdf`.
4. If the obvious source is an online-only viewer or HTML chapter set, stop and log it instead of retrying the same PDF assumption.

## Common Terms

- `manifest`: a structured list of jurisdictions and source details that we update over time
- `inventory schema`: the fields each jurisdiction record is expected to contain
- `batch file`: a generated file containing ready-to-grab records for the downloader

## Typical Workflow

1. Add or update records in `inventory/jurisdictions.jsonl`.
2. Validate the file structure.
3. Review a summary of statuses and source-system mix.
4. Export supported `grab:both` input for records that are ready.
5. Run the existing grab pipeline using the generated batch file.
6. Update inventory statuses as grabs succeed or fail.
7. If the obvious next step fails, log it in `inventory/discovery_attempts.jsonl` so we do not keep retrying the same simple move.

## Discovery Attempt Log

Use `inventory/discovery_attempts.jsonl` when a place is not ready for the current downloader but you learned something worth preserving.

Suggested fields:

- `attempted_at`
- `jurisdiction_slug`
- `step`
- `outcome`
- `result`
- `landing_url`
- `next_action`
- `notes`

This file is deliberately lightweight. It preserves "we tried the obvious thing and here is why it did not fit" without forcing that detail into every inventory record.

## Commands

Validate inventory:

```bash
npm run inventory:jurisdictions:validate
```

Show a summary:

```bash
npm run inventory:jurisdictions:summary
```

Generate a batch file for the existing grabber:

```bash
npm run inventory:jurisdictions:build-batch -- --out inventory/batches/indiana-ready.jsonl
```

Add a newly discovered jurisdiction without editing JSONL by hand:

```bash
npm run inventory:jurisdictions:add -- --name "Logansport" --type city --county Cass --tags seed,city,indiana
```

Then run:

```bash
npm run grab:both -- --file inventory/batches/indiana-ready.jsonl
```
