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

function interactiveReviewAppHtml(
  manifest: VerificationManifest,
  benchmarkImageRelPath: (page: number) => string
): string {
  const tableOrder: TableRef[] = ["03-4", "04-9", "04-10"];
  const byTable = new Map<TableRef, VerificationManifestRow[]>();
  for (const tableRef of tableOrder) byTable.set(tableRef, []);
  for (const row of manifest.rows) {
    const list = byTable.get(row.table_ref);
    if (list) list.push(row);
  }

  const groups = tableOrder.map((tableRef) => {
    const rows = byTable.get(tableRef) ?? [];
    const pages = Array.from(new Set(rows.map((row) => row.provenance.page))).sort((a, b) => a - b);
    return {
      table_ref: tableRef,
      pages,
      rows: rows.map((row) => ({
        manifest_row_id: row.manifest_row_id,
        row_id: row.row_id,
        verification_status: row.verification_status,
        reviewed_by_human: row.reviewed_by_human,
        reviewer_note: row.reviewer_note,
        review_reason: row.review_reason,
        inferred: row.inferred,
        type: row.type,
        provenance: row.provenance,
        row_summary: summarizeRow(row.table_ref, row),
        row_snapshot: row.row_snapshot
      }))
    };
  });

  const appPayload = {
    meta: {
      town_slug: manifest.town_slug,
      source_type: manifest.source_type,
      snapshot_date: manifest.snapshot_date,
      generated_at: manifest.generated_at
    },
    groups: groups.map((group) => ({
      ...group,
      image_srcs: group.pages.map((page) => ({
        page,
        src: benchmarkImageRelPath(page)
      }))
    })),
    manifest_rows: manifest.rows
  };

  const encodedPayload = JSON.stringify(appPayload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Target Tables Review App</title>
<style>
:root{
  --bg:#f7f8fb; --panel:#ffffff; --border:#d7dbe2; --ink:#1a1d24; --muted:#5f6877;
  --warn:#b45309; --bad:#b91c1c; --ok:#166534;
}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:var(--bg);color:var(--ink)}
header{position:sticky;top:0;z-index:30;background:#f0f3f8;border-bottom:1px solid var(--border);padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
header .meta{font-size:12px;color:var(--muted);margin-left:auto}
button{border:1px solid #bac5d6;background:#fff;padding:8px 10px;border-radius:8px;cursor:pointer}
button.primary{background:#134e4a;color:#fff;border-color:#0f766e}
button.warn{background:#fff7ed;border-color:#f1c28b;color:#9a3412}
button.ghost{background:#eef3fb}
main{padding:12px;display:grid;gap:12px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--border)}
.badge{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:2px 10px;font-size:12px;background:#f8fafc}
.badge.needs{border-color:#fecaca;background:#fff1f2;color:var(--bad)}
.badge.inferred{border-color:#fde68a;background:#fffbeb;color:#92400e}
.badge.ok{border-color:#bbf7d0;background:#f0fdf4;color:#166534}
.panel{position:sticky;top:58px;z-index:20;border-bottom:1px solid var(--border);padding:10px 12px;background:#f9fbff;display:grid;gap:8px}
.imgwrap{border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fff}
.imgtools{display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border);background:#f8fbff}
.imgtools button{padding:4px 8px;border-radius:6px;font-size:12px}
.imgpane{overflow:auto;max-height:72vh;background:#fff}
.imgwrap img{width:100%;height:auto;display:block;transform-origin:top left}
.imgcap{font-size:12px;padding:6px 8px;border-top:1px solid var(--border);color:var(--muted)}
.line{font-size:13px}
.line b{color:#111827}
textarea{width:100%;min-height:84px;resize:vertical;border:1px solid #c7cedb;border-radius:8px;padding:8px;font:inherit}
.rowcontrols{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.small{font-size:12px;color:var(--muted)}
.pageblock{padding:10px;border-top:1px solid #eef2f7}
.split{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
.pagetitle{font-size:12px;color:var(--muted);margin-bottom:8px}
.scroll{overflow:auto;border:1px solid var(--border);border-radius:8px}
table{border-collapse:collapse;min-width:760px;width:100%}
th,td{border:1px solid #d7dbe2;padding:6px 7px;vertical-align:top}
th{background:#f2f6fc;position:sticky;top:0;z-index:1}
tr.flag-needs td{background:#fff1f2}
tr.flag-inferred td{background:#fffbeb}
@media (max-width:1100px){.split{grid-template-columns:1fr}}
</style></head>
<body>
<header>
  <button class="primary" id="save-comments">Save Comments So Far</button>
  <button class="warn" id="approve-without-comment">Approve All Without Comment</button>
  <button class="ghost" id="export-manifest">Apply Comments + Approvals</button>
  <span id="stats" class="small"></span>
  <span class="meta" id="meta"></span>
</header>
<main id="rows"></main>
<script id="app-data" type="application/json">${encodedPayload}</script>
<script>
(() => {
  const payload = JSON.parse(document.getElementById("app-data").textContent);
  const groups = payload.groups;
  const fullManifestRows = payload.manifest_rows;
  const root = document.getElementById("rows");
  const stats = document.getElementById("stats");
  const meta = document.getElementById("meta");
  meta.textContent = payload.meta.town_slug + " | " + payload.meta.source_type + " | " + payload.meta.snapshot_date;

  const tableNotes = new Map();
  for (const group of groups) tableNotes.set(group.table_ref, "");
  const imageZoom = new Map();

  function tableColumns(tableRef) {
    if (tableRef === "03-4") return ["row_id", "type", "zoning_district", "maximum_number", "maximum_footprint"];
    if (tableRef === "04-9") return ["row_id", "type", "use_label", "all_other_zoning_districts", "md_zoning_district"];
    return ["row_id", "type", "use_label", "maximum_vehicle_parking_allowance"];
  }

  function value(row, key) {
    if (key === "row_id") return row.row_id;
    if (key === "type") return row.type || "";
    return (row.row_snapshot && row.row_snapshot[key]) || "";
  }

  function rowClass(row) {
    if (row.verification_status === "needs_review") return "flag-needs";
    if (row.verification_status === "inferred_verified") return "flag-inferred";
    return "";
  }

  function pagesForGroup(group) {
    const rowsByPage = new Map();
    for (const row of group.rows) {
      const page = row.provenance.page;
      if (!rowsByPage.has(page)) rowsByPage.set(page, []);
      rowsByPage.get(page).push(row);
    }
    return group.image_srcs.map((img) => ({
      page: img.page,
      src: img.src,
      rows: rowsByPage.get(img.page) || []
    }));
  }

  function groupCounts(group) {
    let verified = 0;
    let inferred = 0;
    let needs = 0;
    for (const row of group.rows) {
      if (row.verification_status === "verified") verified += 1;
      else if (row.verification_status === "inferred_verified") inferred += 1;
      else needs += 1;
    }
    return { verified, inferred, needs };
  }

  function updateStats() {
    let totalRows = 0;
    let verified = 0;
    let inferred = 0;
    let needs = 0;
    for (const group of groups) {
      for (const row of group.rows) {
        totalRows += 1;
        if (row.verification_status === "verified") verified += 1;
        else if (row.verification_status === "inferred_verified") inferred += 1;
        else needs += 1;
      }
    }
    stats.textContent = "Rows: " + totalRows + " | verified: " + verified + " | inferred_verified: " + inferred + " | needs_review: " + needs;
  }

  function render() {
    root.innerHTML = groups.map((group) => {
      const counts = groupCounts(group);
      const note = tableNotes.get(group.table_ref) || "";
      const columns = tableColumns(group.table_ref);
      const header = columns.map((col) => "<th>" + col + "</th>").join("");
      const pageBlocks = pagesForGroup(group).map((pageBlock) => {
        const zoomKey = group.table_ref + ":" + pageBlock.page;
        const zoom = imageZoom.get(zoomKey) || 1;
        const rowsHtml = pageBlock.rows.map((row) => {
          const cells = columns.map((col) => "<td>" + String(value(row, col)).replace(/</g, "&lt;") + "</td>").join("");
          return \`<tr id="\${group.table_ref}-\${row.row_id}" class="\${rowClass(row)}">\${cells}</tr>\`;
        }).join("");
        return \`<section class="pageblock">
          <div class="pagetitle">Source page \${pageBlock.page}</div>
          <div class="split">
            <figure class="imgwrap" data-zoom-key="\${zoomKey}">
          <div class="imgtools">
            <button class="zoom-out" data-zoom-key="\${zoomKey}">-</button>
            <button class="zoom-in" data-zoom-key="\${zoomKey}">+</button>
            <button class="zoom-reset" data-zoom-key="\${zoomKey}">Reset</button>
            <span class="small">zoom \${Math.round(zoom * 100)}%</span>
          </div>
          <div class="imgpane">
            <img loading="lazy" src="\${pageBlock.src}" alt="PDF page \${pageBlock.page}" style="transform:scale(\${zoom});"/>
          </div>
          <figcaption class="imgcap">PDF page \${pageBlock.page}</figcaption>
            </figure>
            <div class="scroll"><table><thead><tr>\${header}</tr></thead><tbody>\${rowsHtml}</tbody></table></div>
          </div>
        </section>\`;
      }).join("");

      return \`<section class="card" data-table="\${group.table_ref}">
        <div class="top">
          <span class="badge">\${group.table_ref}</span>
          <span class="badge">verified: \${counts.verified}</span>
          <span class="badge inferred">inferred_verified: \${counts.inferred}</span>
          <span class="badge needs">needs_review: \${counts.needs}</span>
        </div>
        <div class="panel">
          <div class="rowcontrols">
            <button class="approve-table">Looks Good: Approve This Table</button>
            <button class="mark-needs-table">Keep/Set Needs Review</button>
          </div>
          <label>
            <div class="line"><b>Table-level reviewer note (natural language):</b></div>
            <textarea class="table-note" placeholder="Describe fixes/fill rules for this table. This note is applied to rows when you click a table action.">\${note.replace(/</g, "&lt;")}</textarea>
          </label>
        </div>
        \${pageBlocks}
      </section>\`;
    }).join("");

    root.querySelectorAll(".card").forEach((card) => {
      const tableRef = card.getAttribute("data-table");
      const group = groups.find((g) => g.table_ref === tableRef);
      if (!group) return;
      const noteBox = card.querySelector(".table-note");
      const approve = card.querySelector(".approve-table");
      const needs = card.querySelector(".mark-needs-table");
      const zoomInButtons = card.querySelectorAll(".zoom-in");
      const zoomOutButtons = card.querySelectorAll(".zoom-out");
      const zoomResetButtons = card.querySelectorAll(".zoom-reset");

      noteBox.addEventListener("input", () => {
        tableNotes.set(group.table_ref, noteBox.value);
      });
      approve.addEventListener("click", () => {
        const note = (tableNotes.get(group.table_ref) || "").trim();
        for (const row of group.rows) {
          if (row.verification_status === "verified" && row.reviewed_by_human) continue;
          row.verification_status = "verified";
          row.reviewed_by_human = true;
          if (note) row.reviewer_note = note;
        }
        render();
      });
      needs.addEventListener("click", () => {
        const note = (tableNotes.get(group.table_ref) || "").trim();
        for (const row of group.rows) {
          if (row.verification_status === "verified" && row.reviewed_by_human) continue;
          row.verification_status = row.inferred ? "inferred_verified" : "needs_review";
          row.reviewed_by_human = false;
          if (note) row.reviewer_note = note;
        }
        render();
      });
      zoomInButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.getAttribute("data-zoom-key");
          if (!key) return;
          const current = imageZoom.get(key) || 1;
          imageZoom.set(key, Math.min(4, Math.round((current + 0.2) * 100) / 100));
          render();
        });
      });
      zoomOutButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.getAttribute("data-zoom-key");
          if (!key) return;
          const current = imageZoom.get(key) || 1;
          imageZoom.set(key, Math.max(0.4, Math.round((current - 0.2) * 100) / 100));
          render();
        });
      });
      zoomResetButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.getAttribute("data-zoom-key");
          if (!key) return;
          imageZoom.set(key, 1);
          render();
        });
      });
    });
    updateStats();
  }

  function mergedManifestRows() {
    const rowOverrides = [];
    for (const group of groups) {
      for (const row of group.rows) rowOverrides.push(row);
    }
    const byId = new Map(rowOverrides.map((row) => [row.manifest_row_id, row]));
    return fullManifestRows.map((row) => {
      const override = byId.get(row.manifest_row_id);
      if (!override) return row;
      return {
        ...row,
        verification_status: override.verification_status,
        reviewed_by_human: override.reviewed_by_human,
        reviewer_note: override.reviewer_note || ""
      };
    });
  }

  async function saveTextToFile(filename, text) {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "JSON file", accept: { "application/json": [".json"] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    }
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportManifest() {
    const out = {
      schema_version: "2026-02-22",
      generated_at: new Date().toISOString(),
      town_slug: payload.meta.town_slug,
      source_type: payload.meta.source_type,
      snapshot_date: payload.meta.snapshot_date,
      workflow: {
        name: "phase2_target_table_row_verification",
        policy: "verified is human-only (requires reviewed_by_human=true); row data/provenance are refreshed from normalized artifacts",
        target_tables: ["03-4", "04-9", "04-10"]
      },
      rows: mergedManifestRows()
    };
    await saveTextToFile("target_tables_verification_manifest.updated.json", JSON.stringify(out, null, 2) + "\\n");
  }

  async function exportDraft() {
    const draftRows = [];
    for (const group of groups) {
      for (const row of group.rows) {
        draftRows.push({
          manifest_row_id: row.manifest_row_id,
          table_ref: group.table_ref,
          verification_status: row.verification_status,
          reviewed_by_human: row.reviewed_by_human,
          reviewer_note: row.reviewer_note || ""
        });
      }
    }
    const table_note_entries = [];
    for (const [table_ref, note] of tableNotes.entries()) {
      table_note_entries.push({ table_ref, note });
    }
    const draft = {
      exported_at: new Date().toISOString(),
      table_notes: table_note_entries,
      rows: draftRows
    };
    await saveTextToFile("target_tables_review_draft.json", JSON.stringify(draft, null, 2) + "\\n");
  }

  document.getElementById("approve-without-comment").addEventListener("click", () => {
    for (const group of groups) {
      for (const row of group.rows) {
        if ((row.reviewer_note || "").trim() !== "") continue;
        row.verification_status = "verified";
        row.reviewed_by_human = true;
      }
    }
    render();
  });
  document.getElementById("save-comments").addEventListener("click", exportDraft);
  document.getElementById("export-manifest").addEventListener("click", exportManifest);

  render();
})();
</script>
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
  const reviewAppPath = path.join(normalizedDir, "target_tables_review_app.html");
  const reviewAppHtml = interactiveReviewAppHtml(
    manifest,
    (page) => `../pymupdf_benchmark/images/page_${String(page).padStart(4, "0")}.png`
  );
  await writeFile(reviewAppPath, reviewAppHtml, "utf8");

  const counts = {
    verified: mergedRows.filter((row) => row.verification_status === "verified").length,
    inferred_verified: mergedRows.filter((row) => row.verification_status === "inferred_verified").length,
    needs_review: reviewRows.length
  };
  console.log(
    `[phase2-target-verify] Wrote manifest=${manifestPath} review_html=${reviewHtmlPath} review_app=${reviewAppPath} counts=${JSON.stringify(counts)}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase2-target-verify] ${message}`);
  process.exit(1);
});
