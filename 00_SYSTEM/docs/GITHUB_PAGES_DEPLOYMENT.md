# GitHub Pages Deployment Guide

This guide covers deploying HTML artifacts to GitHub Pages from the corpus data.

## Overview

GitHub Pages hosts the public-facing website at `https://seberry.github.io/udos-for-llms/`. To make corpus artifacts accessible via this site, they must be copied from the gitignored `corpus/` directory to the tracked `public/` directory.

## Directory Structure

```
├── corpus/                          # Gitignored - derived processing outputs
│   └── bloomington/
│       └── 2026-02-21/
│           └── city_pdf/
│               └── phase2_adu_tables/
│                   └── normalized/
│                       ├── table_03-1_normalized.html
│                       ├── table_03-4_normalized.html
│                       ├── table_04-9_normalized.html
│                       ├── table_04-10_normalized.html
│                       └── target_tables_*.html
├── public/                           # Tracked - deployable artifacts
│   └── bloomington/
│       └── tables/
│           ├── table_03-1_normalized.html
│           ├── table_03-4_normalized.html
│           ├── table_04-9_normalized.html
│           ├── table_04-10_normalized.html
│           └── target_tables_*.html
└── cities/
    └── bloomington/
        └── tables/
            └── index.html    # Links to public/ artifacts
```

## Why Two Directories?

**`corpus/`** - Contains all derived outputs (JSON, JSONL, HTML, etc.)
- Gitignored to keep repository size manageable
- Not deployed to GitHub Pages
- Used for local processing and development

**`public/`** - Contains only deployable artifacts (HTML files)
- Not gitignored, so files are committed and deployed
- Accessed via GitHub Pages at `https://seberry.github.io/udos-for-llms/public/...`
- Subset of corpus files that should be publicly accessible

## Deployment Workflow

### Step 1: Generate HTML Files

Run the table normalization scripts to create HTML files in corpus:

```bash
# Generate table 03-1
npm run normalize:table03:pymupdf -- --town-slug bloomington --source-type city_pdf --date 2026-02-21

# Generate tables 03-4, 04-9, 04-10
npm run normalize:targets:pymupdf -- --town-slug bloomington --source-type city_pdf --date 2026-02-21

# Generate comparison and review artifacts
npm run compare:targets:pymupdf -- --town-slug bloomington --source-type city_pdf
npm run verify:targets:pymupdf -- --town-slug bloomington --source-type city_pdf
```

Output location: `corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/normalized/`

### Step 2: Copy to Public Directory

Copy HTML files from corpus to public directory:

**Windows:**
```bash
copy corpus\bloomington\2026-02-21\city_pdf\phase2_adu_tables\normalized\*.html public\bloomington\tables\
```

**Linux/macOS:**
```bash
cp corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/normalized/*.html public/bloomington/tables/
```

### Step 3: Verify Links

Check that `cities/bloomington/tables/index.html` links point to the correct locations:

- From: `cities/bloomington/tables/index.html`
- To: `../../public/bloomington/tables/table_XX-XX_normalized.html`

The relative path goes up 3 levels from `cities/bloomington/tables/` to reach the repository root, then forward to `public/bloomington/tables/`.

### Step 4: Commit and Push

Commit the changes and push to deploy:

```bash
# Add public directory
git add public/

# Add any updated index files
git add cities/bloomington/tables/index.html

# Commit
git commit -m "Update public table artifacts for Bloomington"

# Push to trigger GitHub Pages deployment
git push
```

GitHub Pages will automatically rebuild and deploy within a few minutes.

## URL Resolution

After deployment, files are accessible at:

```
https://seberry.github.io/udos-for-llms/public/bloomington/tables/table_03-1_normalized.html
https://seberry.github.io/udos-for-llms/public/bloomington/tables/table_03-4_normalized.html
https://seberry.github.io/udos-for-llms/public/bloomington/tables/table_04-9_normalized.html
https://seberry.github.io/udos-for-llms/public/bloomington/tables/table_04-10_normalized.html
```

The navigation page is at:
```
https://seberry.github.io/udos-for-llms/cities/bloomington/tables/index.html
```

## HTML Generation Scripts

### Table 03-1
- **Script:** `src/normalize_pymupdf_table03.ts`
- **NPM command:** `npm run normalize:table03:pymupdf`
- **Output:** `table_03-1_normalized.html`
- **Features:**
  - 17 columns (use + 16 zoning districts)
  - Section headers and data rows
  - Use-specific standards column
  - Sticky headers, scrollable table

### Tables 03-4, 04-9, 04-10
- **Script:** `src/normalize_pymupdf_target_tables.ts`
- **NPM command:** `npm run normalize:targets:pymupdf`
- **Outputs:**
  - `table_03-4_normalized.html` - Accessory structure requirements
  - `table_04-9_normalized.html` - Minimum parking requirements
  - `table_04-10_normalized.html` - Maximum parking allowances
- **Features:**
  - Inferred values highlighted with yellow background
  - Inference notes column
  - Type markers (data vs section)
  - Sticky headers, scrollable table

### Comparison Artifact
- **Script:** `src/build_target_table_comparison_artifact.ts`
- **NPM command:** `npm run compare:targets:pymupdf`
- **Output:** `target_tables_comparison.html`
- **Features:**
  - Side-by-side PDF image vs normalized table
  - Inferred cells highlighted
  - Visual verification tool

### Review Artifacts
- **Script:** `src/build_target_table_verification_artifacts.ts`
- **NPM command:** `npm run verify:targets:pymupdf`
- **Outputs:**
  - `target_tables_review_needed.html` - List of rows requiring review
  - `target_tables_review_app.html` - Interactive review application
  - `target_tables_verification_manifest.json` - Verification state
- **Features:**
  - Zoom controls for PDF images
  - In-place editing capability
  - Approval workflow
  - Natural language review notes

## Troubleshooting

### 404 Errors After Deployment

If links return 404 errors:

1. **Check file exists in public/:**
   ```bash
   ls public/bloomington/tables/
   ```

2. **Verify relative path in index.html:**
   - Current file: `cities/bloomington/tables/index.html`
   - Target file: `public/bloomington/tables/XX.html`
   - Correct path: `../../public/bloomington/tables/XX.html` (3 levels up, then forward)

3. **Confirm files are committed:**
   ```bash
   git status public/
   git log --oneline -1
   ```

4. **Check GitHub Pages status:**
   - Visit: `https://github.com/seberry/udos-for-llms/actions`
   - Look for recent deployment workflow
   - Check for errors in deployment logs

### Files Not Updated After Regeneration

If regenerated files aren't visible:

1. **Verify copy command executed:**
   ```bash
   # Check if corpus files are newer than public files
   ls -lt corpus/bloomington/*/city_pdf/phase2_adu_tables/normalized/*.html
   ls -lt public/bloomington/tables/*.html
   ```

2. **Force overwrite if needed:**
   - Delete files in `public/bloomington/tables/` first, then copy
   - Or use copy command that overwrites by default

3. **Check git status:**
   ```bash
   git status
   ```
   Ensure files show as "modified" before committing

### Link Resolution Issues

If local file opens but GitHub Pages link fails:

1. **Test local path:**
   - Open `file:///C:/Users/seber/UDOsforLLMs/public/bloomington/tables/XX.html`
   - If this works, file exists and is valid

2. **Check GitHub repository:**
   - Visit `https://github.com/seberry/udos-for-llms/tree/main/public/bloomington/tables/`
   - Verify files are present in repository

3. **Wait for deployment:**
   - GitHub Pages typically deploys within 1-5 minutes
   - Check Actions tab for deployment status

## Best Practices

1. **Commit code and data separately:**
   - One commit for script changes
   - One commit for regenerated public artifacts

2. **Use descriptive commit messages:**
   - "Update public table artifacts for Bloomington 2026-03-15"
   - "Fix broken links in tables/index.html"
   - "Add comparison and review artifacts"

3. **Test locally before pushing:**
   - Open `cities/bloomington/tables/index.html` in browser
   - Click each link to verify it opens correctly
   - Check that files display properly

4. **Keep corpus and public in sync:**
   - After regenerating HTML files, always copy to public/
   - Update index.html links if file names change
   - Document any changes in CHANGELOG.md

5. **Monitor file size:**
   - Public directory should contain only necessary HTML files
   - Large JSON/JSONL files stay in corpus/
   - This keeps GitHub Pages deployment fast

## Related Documentation

- [Operations Runbook](OPERATIONS.md) - Standard monthly cycle including deployment step
- [Table Extraction Notes](TABLE_EXTRACTION_NOTES.md) - HTML generation script details
- [Contributing Guide](../../CONTRIBUTING.md) - Repository model and conventions
- [Bloomington Changelog](../../cities/bloomington/CHANGELOG.md) - Change history