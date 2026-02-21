# LLM-Readable UDO Corpus

## Goal
Make municipal Unified Development Ordinances (UDOs) and related ordinances easier for LLMs to read, search, cite, and reason over—so LLMs can help residents/homeowners/small developers do **first-pass plausibility checks** on housing-abundance ideas (ADUs, missing middle, cottage developments, gradual self-build, factory-built/manufactured housing, etc.).

This project does **not** replace official sources. It is a navigation + reasoning aid designed to lower the cost of exploring ideas until the expected value is high enough to:
- manually confirm the relevant provisions in the official PDF,
- contact planning staff,
- consult professionals,
- and/or engage city council.

## Intended “Cautious but Encouraged” Use Model
1. Use this corpus for a first pass:
   - “Is this obviously prohibited?”
   - “Which 3–8 sections govern it?”
   - “What are the likely deal-killers?”
2. Confirm the cited sections in the official PDF (source link + page numbers).
3. Only then proceed to staff/professional consultation or political action.

**Not legal advice. Always verify against official sources before acting.**

## What we store (source-of-truth artifacts)
For each town and retrieval date:
- The official PDF(s)
- A source metadata record: retrieval date/time, official URL(s), and PDF hash

Directory example:
- `sources/<town>/<YYYY-MM-DD>/udo.pdf`
- `sources/<town>/<YYYY-MM-DD>/source.json`

## What we generate (LLM-friendly artifacts)
Primary output: Markdown files with stable citation headers.

Each section file begins with metadata (frontmatter or header), e.g.:

Town: Bloomington, IN  
Code: Unified Development Ordinance  
Section: 20.03.030(g)(5)  
Title: Accessory Dwelling Units  
As of: 2026-02-21  
Source PDF: <official link>  
Page(s): 134–138  
Status: Verbatim excerpt (authoritative text below)

Then the verbatim text with numbering and indentation preserved.

### “Inferred” helpers (guard-railed)
We may include **explicitly labeled** helper metadata that is not law:
- `inferred_tags`
- `inferred_applicable_zones`
- `inferred_key_constraints` (e.g., max size, owner-occupancy)
These must never be confused with the ordinance text.

## Minimum viable per-town packet
- `00_SYSTEM/README_PRECEDENCE.md` (how conflicts resolve, if known)
- `00_SYSTEM/definitions.md` (definitions chapter or key defs)
- `00_SYSTEM/index_with_inferences.json` (manifest)
- `02_SPECIFIC_USES/...ADU...md`
- `...` housing index bundle (see below)

## Housing Abundance Index (curated subset)
Each town should have a curated set of files that covers the typical “incremental housing” questions:
- ADUs (definition + standards + referenced design/foundation rules)
- duplex/triplex/fourplex or missing-middle provisions
- cottage development / tiny homes
- manufactured/mobile housing definitions and constraints
- use tables (prefer CSV/JSON over scraped markdown tables)
- dimensional standards (setbacks/height/coverage; JSON if feasible)
- parking and any exemptions
- nonconforming rules relevant to conversions
- administrative process basics (permits, inspections, affidavits)

## Non-goals (for now)
- We are not publishing professional legal interpretations.
- We are not guaranteeing currency; we provide timestamps + source links + hashes.

## Roadmap
Phase 0: bulk PDF archival (town-by-town)  
Phase 1: searchable text + manifest  
Phase 2: section-level markdown + housing index  
Phase 3: structured tables (CSV/JSON) + cross-reference graph + stale checks

## Contribution norms
- Preserve verbatim text exactly.
- Keep all “inferred” content clearly labeled and separate.
- Always include source link, retrieval date, and page numbers.
