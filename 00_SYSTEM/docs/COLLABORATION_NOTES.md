# Collaboration Notes

This file records how solution proposals should be presented during this project.

## Proposal Style

When proposing a solution, explain enough plain-language context that a hobbyist programmer returning after time away can rebuild the mental model quickly.

In practice, that means:

- explain technical terms briefly when first using them in a discussion
- say what a proposed artifact is for, not just its name
- connect a local change to the larger project architecture when relevant
- prefer concrete examples over abstract labels when that will reduce ambiguity

Examples:

- `manifest`: a structured list of known jurisdictions and source links that we can update over time
- `inventory schema`: the set of fields each jurisdiction record should have
- `script scaffold`: a small starter script that wires up inputs/outputs and gives us a clean place to add logic later

## Architecture Refresh Expectation

When relevant, include a short reminder of where the current task fits in the overall system.

Usually this should mean a brief recap like:

- `sources/` stores immutable dated snapshots from official sources
- `corpus/` stores derived processing outputs built from those snapshots
- `00_SYSTEM/` stores docs, contracts, runbooks, and workflow notes
- future inventory/discovery data should stay separate from immutable source snapshots

The goal is not to repeat all project docs every time. The goal is to keep the working mental model alive, especially after breaks between sessions.

## Preferred Communication Tradeoff

Bias toward:

- concise but not cryptic
- technically correct but not jargon-heavy
- architectural reminders when they help decision-making

Avoid:

- unexplained shorthand
- introducing new terms without saying what role they play
- discussing implementation details without reminding how they fit the pipeline
