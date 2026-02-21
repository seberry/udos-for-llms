import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, resolveFromCwd, writeJson } from "./utils/fs.js";

type SourceType = "city_pdf" | "municode";

interface CliOptions {
  townSlug: string;
  sourceType: SourceType;
  date: string;
  outputRoot: string;
  benchmarkInput?: string;
}

interface BenchmarkTable {
  table_index: number;
  bbox: number[];
  row_count: number;
  col_count: number;
  header: string[];
  rows: Array<Array<string | null>>;
}

interface BenchmarkPage {
  page: number;
  table_count: number;
  tables: BenchmarkTable[];
}

interface NormalizedRow {
  row_id: string;
  type: "data" | "section";
  use_label: string;
  permissions: Record<string, string>;
  use_specific_standards: string | null;
  provenance: {
    page: number;
    table_index: number;
    source_row_index: number;
  };
}

const ZONES = ["R1", "R2", "R3", "R4", "RM", "RH", "RMH", "MS", "MN", "MM", "MC", "ME", "MI", "MD", "MH", "EM", "PO"];

function logStep(message: string): void {
  console.log(`[phase2-table03-normalize] ${message}`);
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
    } else if (arg === "--benchmark-input") {
      opts.benchmarkInput = argv[i + 1];
      i += 1;
    }
  }
  return opts;
}

function cleanCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value.replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

function findZoneHeaderIndex(rows: Array<Array<string | null>>): number {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i].map(cleanCell);
    const hits = row.filter((cell) => ZONES.includes(cell)).length;
    if (hits >= 10) return i;
  }
  return -1;
}

function findLikelyTable03_1(page: BenchmarkPage): BenchmarkTable | null {
  const candidates = page.tables.filter((table) => table.col_count >= 18);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.row_count - a.row_count);
  return candidates[0];
}

function normalizeTableRows(pages: BenchmarkPage[]): NormalizedRow[] {
  const out: NormalizedRow[] = [];
  let rowSeq = 1;

  for (const page of pages) {
    const table = findLikelyTable03_1(page);
    if (!table) continue;

    const zoneHeaderIndex = findZoneHeaderIndex(table.rows);
    if (zoneHeaderIndex < 0) continue;
    const zoneHeader = table.rows[zoneHeaderIndex].map(cleanCell);

    const zoneColIndex = new Map<string, number>();
    zoneHeader.forEach((cell, idx) => {
      if (ZONES.includes(cell)) zoneColIndex.set(cell, idx);
    });

    const standardsColIdx =
      table.rows[Math.max(0, zoneHeaderIndex - 1)]
        .map(cleanCell)
        .findIndex((cell) => /Use-Specific Standards/i.test(cell)) || table.col_count - 1;
    const useColIdx = 0;

    for (let ri = zoneHeaderIndex + 1; ri < table.rows.length; ri += 1) {
      const row = table.rows[ri];
      const useLabel = cleanCell(row[useColIdx]);
      const standards = cleanCell(row[standardsColIdx]);

      const permissions: Record<string, string> = {};
      let permissionCount = 0;
      for (const zone of ZONES) {
        const idx = zoneColIndex.get(zone);
        if (idx === undefined) continue;
        const value = cleanCell(row[idx]);
        if (value) {
          permissions[zone] = value;
          permissionCount += 1;
        }
      }

      const isBlank = !useLabel && !standards && permissionCount === 0;
      if (isBlank) continue;

      const last = out[out.length - 1];
      const looksLikeSectionLabel =
        !!useLabel &&
        !permissionCount &&
        !standards &&
        (/^[A-Z0-9 ,/&-]+$/.test(useLabel) || /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$/.test(useLabel));
      const looksLikeContinuation =
        !looksLikeSectionLabel && !permissionCount && !standards && !!useLabel && !!last && last.type === "data";
      if (looksLikeContinuation) {
        last.use_label = `${last.use_label} ${useLabel}`.replace(/\s+/g, " ").trim();
        continue;
      }

      const type: "data" | "section" = permissionCount > 0 || standards ? "data" : "section";
      out.push({
        row_id: `t03_1_r${String(rowSeq).padStart(4, "0")}`,
        type,
        use_label: useLabel,
        permissions,
        use_specific_standards: standards || null,
        provenance: {
          page: page.page,
          table_index: table.table_index,
          source_row_index: ri + 1
        }
      });
      rowSeq += 1;
    }
  }

  const seen = new Set<string>();
  const deduped: NormalizedRow[] = [];
  for (const row of out) {
    if (row.type === "section") {
      deduped.push(row);
      continue;
    }
    const key = `${row.use_label}|${row.use_specific_standards ?? ""}|${JSON.stringify(row.permissions)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

function toReviewHtml(rows: NormalizedRow[]): string {
  const headers = ["Use", ...ZONES, "Use-Specific Standards"];
  const headerHtml = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows
    .filter((r) => r.type === "data")
    .map((row) => {
      const zoneCells = ZONES.map((zone) => `<td>${row.permissions[zone] ?? ""}</td>`).join("");
      return `<tr><td>${row.use_label}</td>${zoneCells}<td>${row.use_specific_standards ?? ""}</td></tr>`;
    })
    .join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Table 03-1 Normalized</title>
<style>
body { font-family: Segoe UI, Arial, sans-serif; margin: 16px; }
table { border-collapse: collapse; min-width: 1300px; }
th, td { border: 1px solid #ddd; padding: 5px 7px; vertical-align: top; white-space: pre-wrap; }
th { position: sticky; top: 0; background: #f1f5f9; }
.scroll { overflow: auto; border: 1px solid #ddd; }
</style></head><body>
<h1>Normalized Table 03-1 (PyMuPDF-based)</h1>
<p>Rows: ${rows.filter((r) => r.type === "data").length}</p>
<div class="scroll"><table><thead><tr>${headerHtml}</tr></thead><tbody>${body}</tbody></table></div>
</body></html>`;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const phase2Dir = resolveFromCwd(opts.outputRoot, opts.townSlug, opts.date, opts.sourceType, "phase2_adu_tables");
  const benchDir = path.join(phase2Dir, "pymupdf_benchmark");
  const inputPath =
    opts.benchmarkInput ??
    path.join(benchDir, "tables_pages_91_92_93_94_95.json");
  const outDir = path.join(phase2Dir, "normalized");
  await ensureDir(outDir);

  logStep(`Reading benchmark input: ${inputPath}`);
  const pages = JSON.parse(await readFile(inputPath, "utf8")) as BenchmarkPage[];
  const normalizedRows = normalizeTableRows(pages);

  const outJsonPath = path.join(outDir, "table_03-1_normalized.json");
  const outHtmlPath = path.join(outDir, "table_03-1_normalized.html");
  const outJsonlPath = path.join(outDir, "table_03-1_rows.jsonl");

  await writeJson(outJsonPath, {
    table_ref: "03-1",
    town_slug: opts.townSlug,
    source_type: opts.sourceType,
    snapshot_date: opts.date,
    method: "pymupdf.find_tables + rule-based header/continuation normalization",
    columns: {
      use: "Use",
      zones: ZONES,
      use_specific_standards: "Use-Specific Standards"
    },
    row_count: normalizedRows.length,
    rows: normalizedRows
  });
  await writeFile(outJsonlPath, normalizedRows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  await writeFile(outHtmlPath, toReviewHtml(normalizedRows), "utf8");

  const dataRows = normalizedRows.filter((r) => r.type === "data").length;
  logStep(`Done. rows_total=${normalizedRows.length}, data_rows=${dataRows}, out=${outDir}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase2-table03-normalize] ${message}`);
  process.exit(1);
});
