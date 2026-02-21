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

interface RowProvenance {
  page: number;
  table_index: number;
  source_row_index: number;
}

interface Table03_4Row {
  row_id: string;
  zoning_district: string;
  maximum_number: string | null;
  maximum_footprint: string | null;
  inferred_maximum_number: boolean;
  inference_notes: string[];
  provenance: RowProvenance;
}

interface Table04_9Row {
  row_id: string;
  type: "data" | "section";
  use_label: string;
  all_other_zoning_districts: string | null;
  md_zoning_district: string | null;
  inferred_all_other: boolean;
  inferred_md: boolean;
  inference_notes: string[];
  provenance: RowProvenance;
}

interface Table04_10Row {
  row_id: string;
  type: "data" | "section";
  use_label: string;
  maximum_vehicle_parking_allowance: string | null;
  inferred_allowance: boolean;
  inference_notes: string[];
  provenance: RowProvenance;
}

function logStep(message: string): void {
  console.log(`[phase2-target-normalize] ${message}`);
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

function clean(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value.replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

function isSectionLabel(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^[A-Z0-9 ,/&-]+$/.test(v) && !/[a-z]/.test(v)) return true;
  if (/^(Household Living|Group Living|Community and Cultural Facilities|Educational Facilities|Healthcare Facilities|Agricultural and Animal Uses|Entertainment and Recreation|Food, Beverage, and Lodging|Office, Business, and Professional Services|Retail Sales|Vehicles and Equipment|Manufacturing and Processing|Storage, Distribution, or Warehousing|Resource and Extraction|ACCESSORY USES|TEMPORARY USES)$/i.test(v))
    return true;
  return false;
}

function toHtmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function find03_4Table(pages: BenchmarkPage[]): { page: number; table: BenchmarkTable } | null {
  const page = pages.find((p) => p.page === 117);
  if (!page) return null;
  for (const table of page.tables) {
    const joined = table.rows.flat().map(clean).join(" ");
    if (table.col_count >= 8 && /Zoning District/i.test(joined) && /Maximum Footprint/i.test(joined)) {
      return { page: page.page, table };
    }
  }
  return null;
}

function normalize03_4(pages: BenchmarkPage[]): Table03_4Row[] {
  const target = find03_4Table(pages);
  if (!target) return [];

  const rows: Table03_4Row[] = [];
  let rowSeq = 1;
  let last: Table03_4Row | null = null;
  const zonePattern = /\b(R1|R2|R3|R4|RMH|RM|RH|MS|MN|MM|MD|MC|ME|MH|MI|EM|PO)\b/;

  for (let ri = 0; ri < target.table.rows.length; ri += 1) {
    const source = target.table.rows[ri].map(clean).filter((v) => v.length > 0);
    if (source.length === 0) continue;
    if (source.some((v) => /^Notes:/i.test(v))) break;
    if (source.some((v) => /^Zoning District$/i.test(v)) || source.some((v) => /^Maximum Number$/i.test(v))) continue;

    const full = source.join(" ");
    if (!zonePattern.test(full)) {
      if (last && full) {
        last.maximum_footprint = [last.maximum_footprint ?? "", full].join(" ").trim();
      }
      continue;
    }

    const zoneValue = source.find((v) => zonePattern.test(v)) ?? source[0];
    const maxNumToken = source.find((v) => /^(\d+|None)$/i.test(v)) ?? null;
    let footprint = source
      .filter((v) => v !== zoneValue && v !== maxNumToken)
      .join(" ")
      .trim();
    if (!footprint) footprint = null as unknown as string;

    let inferred = false;
    let maximumNumber: string | null = maxNumToken ? maxNumToken : null;
    if (!maximumNumber && /^R[2-4]$/.test(zoneValue) && last && /^R[1-4]$/.test(last.zoning_district) && last.maximum_number) {
      maximumNumber = last.maximum_number;
      inferred = true;
    }

    const record: Table03_4Row = {
      row_id: `t03_4_r${String(rowSeq).padStart(4, "0")}`,
      zoning_district: zoneValue,
      maximum_number: maximumNumber,
      maximum_footprint: footprint,
      inferred_maximum_number: inferred,
      inference_notes: inferred ? ["maximum_number carried from previous grouped row"] : [],
      provenance: { page: target.page, table_index: target.table.table_index, source_row_index: ri + 1 }
    };
    rows.push(record);
    last = record;
    rowSeq += 1;
  }

  // Merge split zoning-group rows for MS...MH, and ensure missing max values are explicit "None".
  for (let i = 0; i < rows.length - 1; i += 1) {
    const current = rows[i];
    const next = rows[i + 1];
    const looksLikeSplitGroup =
      current.zoning_district.endsWith(",") &&
      !current.maximum_number &&
      !next.maximum_number &&
      !!current.maximum_footprint &&
      !!next.maximum_footprint &&
      /MS,\s*MN,\s*MM,\s*MD,\s*MC,/i.test(current.zoning_district) &&
      /ME,\s*MH/i.test(next.zoning_district) &&
      /15 percent of the cumulative square footage/i.test(
        `${current.maximum_footprint} ${next.maximum_footprint}`
      );
    if (looksLikeSplitGroup) {
      current.zoning_district = `${current.zoning_district} ${next.zoning_district}`.replace(/\s+/g, " ").trim();
      current.maximum_number = "None";
      current.inferred_maximum_number = true;
      current.inference_notes.push("merged split zoning-group row and set explicit maximum_number=None");
      current.maximum_footprint = `${current.maximum_footprint} ${next.maximum_footprint}`.replace(/\s+/g, " ").trim();
      rows.splice(i + 1, 1);
      i -= 1;
    }
  }

  for (const row of rows) {
    if (!row.maximum_number) {
      row.maximum_number = "None";
      row.inferred_maximum_number = true;
      row.inference_notes.push("filled blank maximum_number as None");
    }
    if (/^MI,\s*EM,\s*PO$/i.test(row.zoning_district) && !row.maximum_footprint) {
      row.maximum_footprint = "None";
      row.inference_notes.push("filled blank maximum_footprint as None");
    }
  }

  return rows;
}

function find04_9Table(pages: BenchmarkPage[]): { page: number; table: BenchmarkTable } | null {
  const page = pages.find((p) => p.page === 177);
  if (!page) return null;
  for (const table of page.tables) {
    const joined = table.rows.flat().map(clean).join(" ");
    if (table.col_count === 3 && /All Other Zoning Districts/i.test(joined) && /MD Zoning District/i.test(joined)) {
      return { page: page.page, table };
    }
  }
  return null;
}

function normalize04_9(pages: BenchmarkPage[]): Table04_9Row[] {
  const target = find04_9Table(pages);
  if (!target) return [];

  const out: Table04_9Row[] = [];
  let rowSeq = 1;
  let lastData: Table04_9Row | null = null;

  for (let ri = 0; ri < target.table.rows.length; ri += 1) {
    const row = target.table.rows[ri].map(clean);
    const use = row[0] ?? "";
    const allOther = row[1] ?? "";
    const md = row[2] ?? "";
    if (!use && !allOther && !md) continue;
    if (/All Other Zoning Districts|MD Zoning District/i.test(`${use} ${allOther} ${md}`)) continue;

    if (!use && (allOther || md) && lastData) {
      if (allOther) lastData.all_other_zoning_districts = [lastData.all_other_zoning_districts ?? "", allOther].join(" ").trim();
      if (md) lastData.md_zoning_district = [lastData.md_zoning_district ?? "", md].join(" ").trim();
      continue;
    }

    const type: "data" | "section" = isSectionLabel(use) && !allOther && !md ? "section" : "data";
    const rec: Table04_9Row = {
      row_id: `t04_9_r${String(rowSeq).padStart(4, "0")}`,
      type,
      use_label: use,
      all_other_zoning_districts: allOther || null,
      md_zoning_district: md || null,
      inferred_all_other: false,
      inferred_md: false,
      inference_notes: [],
      provenance: { page: target.page, table_index: target.table.table_index, source_row_index: ri + 1 }
    };
    out.push(rec);
    if (type === "data") lastData = rec;
    rowSeq += 1;
  }
  const byUse = new Map(out.map((r) => [r.use_label, r]));

  const copyFrom = (toUse: string, fromUse: string, fields: Array<"all_other" | "md">, note: string): void => {
    const to = byUse.get(toUse);
    const from = byUse.get(fromUse);
    if (!to || !from) return;
    if (to.type !== "data" || from.type !== "data") return;
    if (fields.includes("all_other") && !to.all_other_zoning_districts && from.all_other_zoning_districts) {
      to.all_other_zoning_districts = from.all_other_zoning_districts;
      to.inferred_all_other = true;
    }
    if (fields.includes("md") && !to.md_zoning_district && from.md_zoning_district) {
      to.md_zoning_district = from.md_zoning_district;
      to.inferred_md = true;
    }
    if (to.inferred_all_other || to.inferred_md) to.inference_notes.push(note);
  };

  copyFrom(
    "Dwelling, single-family (attached)",
    "Dwelling, single-family (detached)",
    ["all_other", "md"],
    "filled from single-family detached grouped row"
  );
  copyFrom("Dwelling, triplex [3]", "Dwelling, duplex [3]", ["all_other", "md"], "filled from duplex grouped row");
  copyFrom("Dwelling, fourplex [3]", "Dwelling, duplex [3]", ["all_other", "md"], "filled from duplex grouped row");
  copyFrom("Manufactured home park", "Dwelling, mobile home", ["all_other"], "filled from mobile home grouped row");

  // For Table 04-9, MD differs only for duplex/triplex/fourplex group.
  for (const row of out) {
    if (row.type !== "data") continue;
    const isDuplexFamily = /Dwelling,\s*(duplex|triplex|fourplex)/i.test(row.use_label);
    if (!isDuplexFamily && !row.md_zoning_district && row.all_other_zoning_districts) {
      row.md_zoning_district = row.all_other_zoning_districts;
      row.inferred_md = true;
      row.inference_notes.push("filled MD value from All Other per table pattern");
    }
  }

  return out;
}

function normalize04_10(pages: BenchmarkPage[]): Table04_10Row[] {
  const out: Table04_10Row[] = [];
  let rowSeq = 1;
  let lastData: Table04_10Row | null = null;

  const targetPages = pages.filter((p) => p.page >= 178 && p.page <= 182).sort((a, b) => a.page - b.page);
  for (const page of targetPages) {
    const tables = page.tables.filter((t) => t.col_count === 2);
    if (tables.length === 0) continue;
    tables.sort((a, b) => b.row_count - a.row_count);
    const table = tables[0];

    for (let ri = 0; ri < table.rows.length; ri += 1) {
      const row = table.rows[ri].map(clean);
      const use = row[0] ?? "";
      const max = row[1] ?? "";
      if (!use && !max) continue;
      if (/Use\s+Maximum Vehicle Parking Allowance|DU = dwelling unit/i.test(`${use} ${max}`)) continue;

      if (!use && max && lastData) {
        lastData.maximum_vehicle_parking_allowance = [
          lastData.maximum_vehicle_parking_allowance ?? "",
          max
        ]
          .join(" ")
          .trim();
        continue;
      }

      const type: "data" | "section" = isSectionLabel(use) && !max ? "section" : "data";
      const rec: Table04_10Row = {
        row_id: `t04_10_r${String(rowSeq).padStart(4, "0")}`,
        type,
        use_label: use,
        maximum_vehicle_parking_allowance: max || null,
        inferred_allowance: false,
        inference_notes: [],
        provenance: { page: page.page, table_index: table.table_index, source_row_index: ri + 1 }
      };
      out.push(rec);
      if (type === "data") lastData = rec;
      rowSeq += 1;
    }
  }

  const byUse = new Map(out.map((r) => [r.use_label, r]));
  const fillAllowanceFrom = (toUse: string, fromUse: string, note: string): void => {
    const to = byUse.get(toUse);
    const from = byUse.get(fromUse);
    if (!to || !from) return;
    if (to.type !== "data" || from.type !== "data") return;
    if (!to.maximum_vehicle_parking_allowance && from.maximum_vehicle_parking_allowance) {
      to.maximum_vehicle_parking_allowance = from.maximum_vehicle_parking_allowance;
      to.inferred_allowance = true;
      to.inference_notes.push(note);
    }
  };

  fillAllowanceFrom(
    "Dwelling, single-family (attached)",
    "Dwelling, single-family (detached)",
    "filled from detached single-family grouped row"
  );
  fillAllowanceFrom("Dwelling, triplex", "Dwelling, duplex", "filled from duplex grouped row");
  fillAllowanceFrom("Dwelling, fourplex", "Dwelling, duplex", "filled from duplex grouped row");
  fillAllowanceFrom(
    "Continuing care retirement facility",
    "Assisted living facility",
    "filled from assisted-living grouped row"
  );
  fillAllowanceFrom(
    "Group care facility, FHAA large",
    "Group care home, FHAA small",
    "filled from FHAA small grouped row"
  );
  fillAllowanceFrom(
    "Nursing or convalescent home",
    "Group care home, FHAA small",
    "filled from FHAA small grouped row"
  );
  fillAllowanceFrom(
    "Opioid rehabilitation home, small",
    "Group care home, FHAA small",
    "filled from FHAA small grouped row"
  );
  fillAllowanceFrom(
    "Opioid rehabilitation home, large",
    "Group care home, FHAA small",
    "filled from FHAA small grouped row"
  );
  fillAllowanceFrom(
    "Supportive housing, large",
    "Supportive housing, small",
    "filled from supportive-housing grouped row"
  );

  const deduped: Table04_10Row[] = [];
  const seen = new Set<string>();
  for (const row of out) {
    if (row.type === "section") {
      deduped.push(row);
      continue;
    }
    const key = `${row.use_label}|${row.maximum_vehicle_parking_allowance ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

function render03_4Html(rows: Table03_4Row[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td>${toHtmlEscape(r.zoning_district)}</td><td${r.inferred_maximum_number ? ' class="inferred"' : ""}>${toHtmlEscape(
          r.maximum_number ?? ""
        )}</td><td>${toHtmlEscape(r.maximum_footprint ?? "")}</td><td>${toHtmlEscape(r.inference_notes.join("; "))}</td></tr>`
    )
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Table 03-4 Normalized</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:16px}table{border-collapse:collapse;min-width:900px}th,td{border:1px solid #ddd;padding:5px 7px;vertical-align:top}th{background:#f1f5f9;position:sticky;top:0}.scroll{overflow:auto;border:1px solid #ddd}.inferred{background:#fff6db}</style>
</head><body><h1>Table 03-4 Normalized</h1><div class="scroll"><table><thead><tr><th>Zoning District</th><th>Maximum Number</th><th>Maximum Footprint</th><th>Inference Notes</th></tr></thead><tbody>${body}</tbody></table></div></body></html>`;
}

function render04_9Html(rows: Table04_9Row[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td>${r.type}</td><td>${toHtmlEscape(r.use_label)}</td><td${r.inferred_all_other ? ' class="inferred"' : ""}>${toHtmlEscape(
          r.all_other_zoning_districts ?? ""
        )}</td><td${r.inferred_md ? ' class="inferred"' : ""}>${toHtmlEscape(
          r.md_zoning_district ?? ""
        )}</td><td>${toHtmlEscape(r.inference_notes.join("; "))}</td></tr>`
    )
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Table 04-9 Normalized</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:16px}table{border-collapse:collapse;min-width:1000px}th,td{border:1px solid #ddd;padding:5px 7px;vertical-align:top}th{background:#f1f5f9;position:sticky;top:0}.scroll{overflow:auto;border:1px solid #ddd}.inferred{background:#fff6db}</style>
</head><body><h1>Table 04-9 Normalized</h1><div class="scroll"><table><thead><tr><th>Type</th><th>Use</th><th>All Other Zoning Districts</th><th>MD Zoning District</th><th>Inference Notes</th></tr></thead><tbody>${body}</tbody></table></div></body></html>`;
}

function render04_10Html(rows: Table04_10Row[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td>${r.type}</td><td>${toHtmlEscape(r.use_label)}</td><td${r.inferred_allowance ? ' class="inferred"' : ""}>${toHtmlEscape(
          r.maximum_vehicle_parking_allowance ?? ""
        )}</td><td>${toHtmlEscape(r.inference_notes.join("; "))}</td></tr>`
    )
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Table 04-10 Normalized</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:16px}table{border-collapse:collapse;min-width:1000px}th,td{border:1px solid #ddd;padding:5px 7px;vertical-align:top}th{background:#f1f5f9;position:sticky;top:0}.scroll{overflow:auto;border:1px solid #ddd}.inferred{background:#fff6db}</style>
</head><body><h1>Table 04-10 Normalized</h1><div class="scroll"><table><thead><tr><th>Type</th><th>Use</th><th>Maximum Vehicle Parking Allowance</th><th>Inference Notes</th></tr></thead><tbody>${body}</tbody></table></div></body></html>`;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const phase2Dir = resolveFromCwd(opts.outputRoot, opts.townSlug, opts.date, opts.sourceType, "phase2_adu_tables");
  const benchmarkPath =
    opts.benchmarkInput ??
    path.join(phase2Dir, "pymupdf_benchmark", "tables_pages_117_177_178_179_180_181_182.json");
  const outDir = path.join(phase2Dir, "normalized");
  await ensureDir(outDir);

  logStep(`Reading benchmark input: ${benchmarkPath}`);
  const pages = JSON.parse(await readFile(benchmarkPath, "utf8")) as BenchmarkPage[];

  const rows03_4 = normalize03_4(pages);
  const rows04_9 = normalize04_9(pages);
  const rows04_10 = normalize04_10(pages);

  await writeJson(path.join(outDir, "table_03-4_normalized.json"), {
    table_ref: "03-4",
    row_count: rows03_4.length,
    rows: rows03_4,
    method: "pymupdf.find_tables + conservative normalization"
  });
  await writeFile(path.join(outDir, "table_03-4_rows.jsonl"), rows03_4.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  await writeFile(path.join(outDir, "table_03-4_normalized.html"), render03_4Html(rows03_4), "utf8");

  await writeJson(path.join(outDir, "table_04-9_normalized.json"), {
    table_ref: "04-9",
    row_count: rows04_9.length,
    rows: rows04_9,
    method: "pymupdf.find_tables + conservative normalization"
  });
  await writeFile(path.join(outDir, "table_04-9_rows.jsonl"), rows04_9.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  await writeFile(path.join(outDir, "table_04-9_normalized.html"), render04_9Html(rows04_9), "utf8");

  await writeJson(path.join(outDir, "table_04-10_normalized.json"), {
    table_ref: "04-10",
    row_count: rows04_10.length,
    rows: rows04_10,
    method: "pymupdf.find_tables + conservative normalization"
  });
  await writeFile(path.join(outDir, "table_04-10_rows.jsonl"), rows04_10.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  await writeFile(path.join(outDir, "table_04-10_normalized.html"), render04_10Html(rows04_10), "utf8");

  await writeJson(path.join(outDir, "target_tables_report.json"), {
    town_slug: opts.townSlug,
    source_type: opts.sourceType,
    snapshot_date: opts.date,
    benchmark_input: benchmarkPath,
    tables: {
      "03-4": { rows: rows03_4.length, null_max_number: rows03_4.filter((r) => !r.maximum_number).length },
      "04-9": {
        rows: rows04_9.length,
        data_rows: rows04_9.filter((r) => r.type === "data").length,
        null_all_other: rows04_9.filter((r) => r.type === "data" && !r.all_other_zoning_districts).length
      },
      "04-10": {
        rows: rows04_10.length,
        data_rows: rows04_10.filter((r) => r.type === "data").length,
        null_allowance: rows04_10.filter((r) => r.type === "data" && !r.maximum_vehicle_parking_allowance).length
      }
    }
  });

  logStep(
    `Done. 03-4_rows=${rows03_4.length}, 04-9_rows=${rows04_9.length}, 04-10_rows=${rows04_10.length}, out=${outDir}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase2-target-normalize] ${message}`);
  process.exit(1);
});
