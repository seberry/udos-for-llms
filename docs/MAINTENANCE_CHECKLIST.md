# Maintenance Checklist

Use this as the short checklist for routine upkeep.

## Monthly

- [ ] `npm run typecheck`
- [ ] `npm run grab:both -- --file towns.dual.txt`
- [ ] `npm run build:corpus -- --town-slug bloomington --source-type city_pdf`
- [ ] `npm run build:corpus -- --town-slug bloomington --source-type municode`
- [ ] Review `report.json` for low-text-page spikes
- [ ] Compare `content_changed_since_previous` and note substantive updates
- [ ] Refresh QA regression prompts if ordinance changed

## When Breakage Happens

- [ ] Reproduce with `--dry-run`
- [ ] Run in `--headed` mode to inspect UI changes
- [ ] Update selectors/fallbacks
- [ ] Re-run one real capture and verify `source.json`, `SHA256SUMS.txt`, and `udo.pdf`

## Before Release or Sharing

- [ ] Confirm source URLs and timestamps are present in provenance
- [ ] Confirm chunk outputs include page citations
- [ ] Confirm no generated `sources/` or `corpus/` artifacts are accidentally staged unless intended
