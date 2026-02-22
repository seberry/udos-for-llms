import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, resolveFromCwd, writeJson } from "./utils/fs.js";

type SourceType = "city_pdf" | "municode";
type TableRef = "03-4" | "04-9" | "04-10";
type VerificationStatus = "verified" | "inferred_verified" | "needs_review";

interface CliOptions {
  townSlug: string;
  sourceType: SourceType;
  date: string;
  outputRoot: string;
}

interface RowProvenance {
  page: number;
  table_index: number;
  source_row_index: number;
  bbox?: number[];
}

interface NormalizedRowBase {
  row_id: string;
  type?: "data" | "section";
  inference_notes?: string[];
  provenance: RowProvenance;
  [key: string]: unknown;
}

interface NormalizedTableFile {
  table_ref: TableRef;
  row_count: number;
  rows: NormalizedRowBase[];
  method?: string;
}

interface VerificationManifestRow {
  manifest_row_id: string;
  table_ref: TableRef;
  row_id: string;
  verification_status: VerificationStatus;
  reviewed_by_human: boolean;
  reviewer_note: string;
  review_reason: string[];
  inferred: boolean;
  type: "data" | "section";
  provenance: RowProvenance;
  row_snapshot: Record<string, unknown>;
}

interface VerificationManifest {
  schema_version: "2026-02-22";
  generated_at: string;
  town_slug: string;
  source_type: SourceType;
  snapshot_date: string;
  workflow: {
    name: string;
    policy: string;
    target_tables: TableRef[];
  };
  rows: VerificationManifestRow[];
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    townSlug: "bloomington",
    sourceType: "city_pdf",
    date: "2026-02-21",
    outputRoot: "corpus"
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--town-slug") {
      opts.townSlug = argv[i + 1] ?? opts.townSlug;
      i += 1;
    } else if (arg === "--source-type") {
      const value = argv[i + 1];
      if (value === "city_pdf" || value === "municode") opts.sourceType = value;
      i += 1;
    } else if (arg === "--date") {
      opts.date = argv[i + 1] ?? opts.date;
      i += 1;
    } else if (arg === "--output-root") {
      opts.outputRoot = argv[i + 1] ?? opts.outputRoot;
      i += 1;
    }
  }
  return opts;
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  return value.trim().length === 0;
}

function hasAnyInferredFlag(row: NormalizedRowBase): boolean {
  return Object.entries(row).some(([key, value]) => key.startsWith("inferred_") && value === true);
}

function toComparableSnapshot(row: NormalizedRowBase): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "row_id") continue;
    out[key] = value;
  }
  return out;
}

function requiredFieldGaps(tableRef: TableRef, row: NormalizedRowBase): string[] {
  const rowType = (row.type ?? "data") as "data" | "section";
  if (rowType === "section") return [];

  const gaps: string[] = [];
  if (tableRef === "03-4") {
    if (isMissing(row.maximum_number)) gaps.push("maximum_number missing");
    if (isMissing(row.maximum_footprint)) gaps.push("maximum_footprint missing");
  } else if (tableRef === "04-9") {
    if (isMissing(row.all_other_zoning_districts)) gaps.push("all_other_zoning_districts missing");
    if (isMissing(row.md_zoning_district)) gaps.push("md_zoning_district missing");
  } else if (tableRef === "04-10") {
    if (isMissing(row.maximum_vehicle_parking_allowance)) gaps.push("maximum_vehicle_parking_allowance missing");
  }
  return gaps;
}

function defaultStatusForRow(tableRef: TableRef, row: NormalizedRowBase): { status: VerificationStatus; reasons: string[] } {
  const reasons = requiredFieldGaps(tableRef, row);
  if (reasons.length > 0) return { status: "needs_review", reasons };
  if (hasAnyInferredFlag(row)) return { status: "inferred_verified", reasons: ["contains inferred value(s)"] };
  return { status: "needs_review", reasons: ["pending human review"] };
}

function toManifestRow(tableRef: TableRef, row: NormalizedRowBase): VerificationManifestRow {
  const fallback = defaultStatusForRow(tableRef, row);
  return {
    manifest_row_id: `${tableRef}:${row.row_id}`,
    table_ref: tableRef,
    row_id: row.row_id,
    verification_status: fallback.status,
    reviewed_by_human: false,
    reviewer_note: "",
    review_reason: fallback.reasons,
    inferred: hasAnyInferredFlag(row),
    type: (row.type ?? "data") as "data" | "section",
    provenance: row.provenance,
    row_snapshot: toComparableSnapshot(row)
  };
}

function mergeExisting(
  defaults: VerificationManifestRow[],
  existingRows: VerificationManifestRow[] | undefined
): VerificationManifestRow[] {
  if (!existingRows || existingRows.length === 0) return defaults;
  const existingMap = new Map(existingRows.map((row) => [row.manifest_row_id, row]));
  return defaults.map((row) => {
    const prior = existingMap.get(row.manifest_row_id);
    if (!prior) return row;
    const priorReviewedByHuman = prior.reviewed_by_human === true;
    const keepVerified = priorReviewedByHuman && prior.verification_status === "verified";
    const mergedStatus: VerificationStatus = keepVerified ? "verified" : row.verification_status;
    return {
      ...row,
      verification_status: mergedStatus,
      reviewed_by_human: keepVerified,
      reviewer_note: prior.reviewer_note ?? "",
      review_reason: row.review_reason,
      inferred: row.inferred,
      provenance: row.provenance,
      row_snapshot: row.row_snapshot
    };
  });
}

function summarizeRow(tableRef: TableRef, row: VerificationManifestRow): string {
  const snapshot = row.row_snapshot;
  if (tableRef === "03-4") {
    return `${toText(snapshot.zoning_district)} | maximum_number=${toText(snapshot.maximum_number)} | maximum_footprint=${toText(snapshot.maximum_footprint)}`;
  }
  if (tableRef === "04-9") {
    return `${toText(snapshot.use_label)} | all_other=${toText(snapshot.all_other_zoning_districts)} | md=${toText(snapshot.md_zoning_district)}`;
  }
  return `${toText(snapshot.use_label)} | max_allowance=${toText(snapshot.maximum_vehicle_parking_allowance)}`;
}

function reviewRowsHtml(
  rows: VerificationManifestRow[],
  benchmarkImageRelPath: (page: number) => string
): string {
  const body = rows
    .map((row) => {
      const page = row.provenance.page;
      const imageRel = benchmarkImageRelPath(page);
      const reason = row.review_reason.join("; ");
      return `<tr>
<td>${esc(row.table_ref)}</td>
<td>${esc(row.row_id)}</td>
<td>${esc(row.verification_status)}</td>
<td>${esc(reason)}</td>
<td>${esc(row.reviewer_note)}</td>
<td>${esc(String(page))}</td>
<td>${esc(String(row.provenance.table_index))}</td>
<td>${esc(String(row.provenance.source_row_index))}</td>
<td>${esc(summarizeRow(row.table_ref, row))}</td>
<td><a href="${esc(imageRel)}" target="_blank" rel="noreferrer">page image</a></td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Target Tables Rows Needing Review</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;margin:16px;color:#1a1a1a}
h1{margin:0 0 8px}
p{margin:0 0 12px}
.scroll{overflow:auto;border:1px solid #d7d7d7;border-radius:6px}
table{border-collapse:collapse;min-width:1300px}
th,td{border:1px solid #ddd;padding:6px 8px;vertical-align:top;white-space:pre-wrap}
th{position:sticky;top:0;background:#f1f5f9}
.badge{display:inline-block;background:#fff2cf;border:1px solid #ebd48b;border-radius:999px;padding:2px 10px}
</style></head><body>
<h1>Target Table Rows Needing Review</h1>
<p><span class="badge">needs_review only</span></p>
<div class="scroll"><table>
<thead><tr>
<th>table_ref</th><th>row_id</th><th>status</th><th>review_reason</th><th>reviewer_note</th>
<th>page</th><th>table_index</th><th>source_row_index</th><th>row_summary</th><th>pdf_context</th>
</tr></thead>
<tbody>${body}</tbody></table></div>
</body></html>`;
}

async function readNormalizedTable(normalizedDir: string, tableRef: TableRef): Promise<NormalizedTableFile> {
  const filePath = path.join(normalizedDir, `table_${tableRef}_normalized.json`);
  return JSON.parse(await readFile(filePath, "utf8")) as NormalizedTableFile;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const phase2Dir = resolveFromCwd(opts.outputRoot, opts.townSlug, opts.date, opts.sourceType, "phase2_adu_tables");
  const normalizedDir = path.join(phase2Dir, "normalized");
  await ensureDir(normalizedDir);

  const tableRefs: TableRef[] = ["03-4", "04-9", "04-10"];
  const normalizedTables = await Promise.all(tableRefs.map((tableRef) => readNormalizedTable(normalizedDir, tableRef)));

  const defaultRows: VerificationManifestRow[] = normalizedTables.flatMap((table) =>
    table.rows.map((row) => toManifestRow(table.table_ref, row))
  );

  const manifestPath = path.join(normalizedDir, "target_tables_verification_manifest.json");
  let existingRows: VerificationManifestRow[] | undefined;
  try {
    const existing = JSON.parse(await readFile(manifestPath, "utf8")) as VerificationManifest;
    existingRows = Array.isArray(existing.rows) ? existing.rows : undefined;
  } catch {
    existingRows = undefined;
  }

  const mergedRows = mergeExisting(defaultRows, existingRows);
  const manifest: VerificationManifest = {
    schema_version: "2026-02-22",
    generated_at: new Date().toISOString(),
    town_slug: opts.townSlug,
    source_type: opts.sourceType,
    snapshot_date: opts.date,
    workflow: {
      name: "phase2_target_table_row_verification",
      policy:
        "verified is human-only (requires reviewed_by_human=true); row data/provenance are refreshed from normalized artifacts",
      target_tables: tableRefs
    },
    rows: mergedRows
  };
  await writeJson(manifestPath, manifest);

  const reviewRows = mergedRows.filter((row) => row.verification_status === "needs_review");
  const reviewHtmlPath = path.join(normalizedDir, "target_tables_review_needed.html");
  const html = reviewRowsHtml(reviewRows, (page) => `../pymupdf_benchmark/images/page_${String(page).padStart(4, "0")}.png`);
  await writeFile(reviewHtmlPath, html, "utf8");

  const counts = {
    verified: mergedRows.filter((row) => row.verification_status === "verified").length,
    inferred_verified: mergedRows.filter((row) => row.verification_status === "inferred_verified").length,
    needs_review: reviewRows.length
  };
  console.log(
    `[phase2-target-verify] Wrote manifest=${manifestPath} review_html=${reviewHtmlPath} counts=${JSON.stringify(counts)}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase2-target-verify] ${message}`);
  process.exit(1);
});
