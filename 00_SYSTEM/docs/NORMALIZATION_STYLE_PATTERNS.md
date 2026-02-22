# Normalization Style Patterns (Living Registry)

This file tracks recurring ordinance formatting conventions that affect table extraction and normalization.

Purpose:
- reduce repeated one-off judgment calls
- make inference behavior auditable
- improve consistency across towns and future snapshots

## How to use this registry
1. When you discover a formatting convention that changes parsing meaning, add a new pattern entry.
2. Reference the `pattern_id` in:
   - review notes
   - normalization rule notes
   - future code comments/tests where relevant
3. Mark confidence and risk to separate deterministic transforms from heuristic transforms.

## Pattern entry template

```yaml
pattern_id: P-XXXX
name: Short descriptive name
status: active | deprecated
scope:
  towns: [bloomington]
  source_types: [city_pdf]
  tables: ["03-4", "04-9", "04-10"]
visual_cue: >
  What this looks like in the PDF (for example: square-bracket footnote markers like [1], [3]).
observed_examples:
  - snapshot_date: "2026-02-21"
    table_ref: "04-9"
    page: 177
    source_row_index: 6
semantic_interpretation: >
  What this pattern means for normalized content.
normalization_policy:
  transform_type: deterministic | heuristic
  rule: >
    Rule description.
  confidence: high | medium | low
  fallback_behavior: >
    What to do when uncertain (prefer conservative null, needs_review, etc.).
review_impact:
  requires_human_review: true | false
  typical_verification_status: needs_review | inferred_verified | verified
risks:
  - risk statement
```

---

## Active patterns

### P-0001: Square-bracket footnote markers
- `status`: active
- `scope`: Bloomington `city_pdf` target tables (`03-4`, `04-9`, `04-10`)
- `visual_cue`: inline footnote markers in cells (for example `[1]`, `[2]`, `[3]`)
- `observed_examples`:
  - `snapshot_date`: `2026-02-21`
  - `table_ref`: `03-4`
  - `page`: `117`
  - `source_row_index`: `4` (example includes `[1]`)
  - `table_ref`: `04-9`
  - `page`: `177`
  - `source_row_index`: `6` (example includes `[1]`) and duplex/triplex/fourplex rows include `[3]`
- `semantic_interpretation`:
  - marker points to external note text in ordinance context
  - marker must be preserved in normalized value text; do not strip by default
- `normalization_policy`:
  - `transform_type`: deterministic
  - `rule`: preserve marker text inline in normalized cell values
  - `confidence`: high
  - `fallback_behavior`: if marker appears without recoverable note text, keep marker and mark row for human review when interpretation affects inference
- `review_impact`:
  - `requires_human_review`: true when marker could change inferred fills
  - `typical_verification_status`: `needs_review` or `inferred_verified` until checked
- `risks`:
  - markers can be dropped by aggressive cleanup
  - markers can be mistaken as list/enum tokens

### P-0002: Grouped-row fill-down semantics
- `status`: active
- `scope`: Bloomington `city_pdf` target tables (`03-4`, `04-9`, `04-10`)
- `visual_cue`: first row in a logical group has value; subsequent grouped rows are blank
- `observed_examples`:
  - `snapshot_date`: `2026-02-21`
  - `table_ref`: `04-10`
  - grouped rows for `duplex/triplex/fourplex`, FHAA/related uses, supportive housing
- `semantic_interpretation`:
  - blanks may inherit prior grouped value depending on table conventions
- `normalization_policy`:
  - `transform_type`: heuristic
  - `rule`: apply explicit allowlisted fill-down rules only
  - `confidence`: medium
  - `fallback_behavior`: leave conservative null and mark for review if not allowlisted
- `review_impact`:
  - `requires_human_review`: true
  - `typical_verification_status`: `inferred_verified` initially
- `risks`:
  - over-propagation of values into rows where ordinance intends exceptions

### P-0003: Split rows across extraction boundaries
- `status`: active
- `scope`: Bloomington `city_pdf` target tables (`03-4`, `04-10`)
- `visual_cue`: row text split across adjacent extracted rows or pages
- `observed_examples`:
  - `snapshot_date`: `2026-02-21`
  - `table_ref`: `03-4` split zoning-group row (`MS...MH`)
- `semantic_interpretation`:
  - text fragments belong to one logical row
- `normalization_policy`:
  - `transform_type`: heuristic
  - `rule`: merge only when pattern signature is explicit and reproducible
  - `confidence`: medium
  - `fallback_behavior`: do not merge when ambiguous; keep rows separate and flag for review
- `review_impact`:
  - `requires_human_review`: true
  - `typical_verification_status`: `inferred_verified` or `needs_review`
- `risks`:
  - accidental merge of distinct legal rows
