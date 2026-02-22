import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, resolveFromCwd, writeJson } from "./utils/fs.js";

type SourceType = "city_pdf" | "municode";

interface CliOptions {
  townSlug: string;
  sourceType: SourceType;
  date: string;
  outputRoot: string;
}

interface RawPageRecord {
  page: number;
  raw_text: string;
}

interface AduTableRecord {
  table_ref: string;
  table_title: string;
  category?: string;
  relevance_score?: number;
  page_start?: number;
  page_end?: number;
}

interface AduTablesFile {
  tables: AduTableRecord[];
}

interface VerificationManifestRow {
  table_ref: string;
  verification_status: "verified" | "inferred_verified" | "needs_review";
}

interface VerificationManifest {
  rows: VerificationManifestRow[];
}

interface InventoryRow {
  table_ref: string;
  title: string;
  pages: number[];
  first_page: number;
  last_page: number;
  mention_count: number;
  category_guess: string;
  adu_extracted: boolean;
  normalized: boolean;
  normalized_file: string | null;
  verification: {
    verified_rows: number;
    inferred_verified_rows: number;
    needs_review_rows: number;
  } | null;
  backlog_status: "done" | "verify_pending" | "normalize_next";
  priority_score: number;
  priority_reason: string[];
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

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function categoryGuess(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("allowed use")) return "use_permissions";
  if (lower.includes("parking") || lower.includes("loading")) return "parking_loading";
  if (lower.includes("dimensional")) return "dimensional_standards";
  if (lower.includes("accessory")) return "accessory_structures";
  return "other";
}

function toBacklogStatus(
  normalized: boolean,
  verification: InventoryRow["verification"]
): "done" | "verify_pending" | "normalize_next" {
  if (!normalized) return "normalize_next";
  if (!verification) return "verify_pending";
  if (verification.needs_review_rows > 0 || verification.inferred_verified_rows > 0) return "verify_pending";
  return "done";
}

function scorePriority(row: Omit<InventoryRow, "priority_score" | "priority_reason" | "backlog_status">): {
  score: number;
  reason: string[];
} {
  let score = 0;
  const reason: string[] = [];
  const category = row.category_guess;
  if (category === "parking_loading" || category === "use_permissions" || category === "accessory_structures") {
    score += 4;
    reason.push("high-impact category");
  } else if (category === "dimensional_standards") {
    score += 2;
    reason.push("dimensional standards relevance");
  }
  if (!row.normalized) {
    score += 5;
    reason.push("not yet normalized");
  }
  if (row.normalized && row.verification && row.verification.needs_review_rows > 0) {
    score += 3;
    reason.push("has unresolved review rows");
  }
  if (row.adu_extracted) {
    score += 2;
    reason.push("already detected in ADU extraction");
  }
  if (row.first_page >= 80 && row.first_page <= 210) {
    score += 1;
    reason.push("in chapter range near current target tables");
  }
  return { score, reason };
}

function toMarkdown(rows: InventoryRow[]): string {
  const header = [
    "# Table Inventory Backlog",
    "",
    "| table_ref | pages | category | status | normalized | verify (v/i/n) | priority | title |",
    "|---|---:|---|---|---|---|---:|---|"
  ];
  const lines = rows.map((row) => {
    const verification = row.verification
      ? `${row.verification.verified_rows}/${row.verification.inferred_verified_rows}/${row.verification.needs_review_rows}`
      : "-";
    const pages = `${row.first_page}-${row.last_page}`;
    return `| ${row.table_ref} | ${pages} | ${row.category_guess} | ${row.backlog_status} | ${row.normalized ? "yes" : "no"} | ${verification} | ${row.priority_score} | ${row.title.replace(/\|/g, "\\|")} |`;
  });
  return [...header, ...lines, ""].join("\n");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const baseDir = resolveFromCwd(opts.outputRoot, opts.townSlug, opts.date, opts.sourceType);
  const phase1Dir = path.join(baseDir, "phase1");
  const phase2Dir = path.join(baseDir, "phase2_adu_tables");
  const normalizedDir = path.join(phase2Dir, "normalized");
  const outDir = path.join(phase2Dir, "inventory");
  await ensureDir(outDir);

  const rawPages = await readJsonl<RawPageRecord>(path.join(phase1Dir, "pages_raw.jsonl"));
  let aduTables: AduTablesFile | null = null;
  try {
    aduTables = await readJson<AduTablesFile>(path.join(phase2Dir, "adu_tables.json"));
  } catch {
    aduTables = null;
  }
  let manifest: VerificationManifest | null = null;
  try {
    manifest = await readJson<VerificationManifest>(path.join(normalizedDir, "target_tables_verification_manifest.json"));
  } catch {
    manifest = null;
  }

  const refs = new Map<
    string,
    {
      titles: string[];
      pages: number[];
      mention_count: number;
    }
  >();

  const tableRegex = /\bTable\s+(\d{2}-\d+)\s*:?([^\n\r]*)/gi;
  for (const page of rawPages) {
    let match = tableRegex.exec(page.raw_text);
    while (match) {
      const tableRef = clean(match[1] ?? "");
      const suffix = clean(match[2] ?? "");
      const title = clean(`Table ${tableRef}${suffix ? `: ${suffix}` : ""}`);
      if (tableRef) {
        const entry = refs.get(tableRef) ?? { titles: [], pages: [], mention_count: 0 };
        entry.mention_count += 1;
        entry.pages.push(page.page);
        if (title && !entry.titles.includes(title)) entry.titles.push(title);
        refs.set(tableRef, entry);
      }
      match = tableRegex.exec(page.raw_text);
    }
  }

  const aduRefs = new Set<string>((aduTables?.tables ?? []).map((t) => t.table_ref));
  const normalizedByRef = new Map<string, string>();
  for (const ref of refs.keys()) {
    const candidate = path.join(normalizedDir, `table_${ref}_normalized.json`);
    try {
      await readFile(candidate, "utf8");
      normalizedByRef.set(ref, candidate);
    } catch {
      // ignore missing file
    }
  }

  const verifyByRef = new Map<string, { verified_rows: number; inferred_verified_rows: number; needs_review_rows: number }>();
  for (const row of manifest?.rows ?? []) {
    const bucket = verifyByRef.get(row.table_ref) ?? { verified_rows: 0, inferred_verified_rows: 0, needs_review_rows: 0 };
    if (row.verification_status === "verified") bucket.verified_rows += 1;
    else if (row.verification_status === "inferred_verified") bucket.inferred_verified_rows += 1;
    else bucket.needs_review_rows += 1;
    verifyByRef.set(row.table_ref, bucket);
  }

  const rows: InventoryRow[] = [];
  for (const [tableRef, entry] of refs.entries()) {
    const sortedPages = Array.from(new Set(entry.pages)).sort((a, b) => a - b);
    const title = entry.titles.sort((a, b) => b.length - a.length)[0] ?? `Table ${tableRef}`;
    const baseRow = {
      table_ref: tableRef,
      title,
      pages: sortedPages,
      first_page: sortedPages[0] ?? -1,
      last_page: sortedPages[sortedPages.length - 1] ?? -1,
      mention_count: entry.mention_count,
      category_guess: categoryGuess(title),
      adu_extracted: aduRefs.has(tableRef),
      normalized: normalizedByRef.has(tableRef),
      normalized_file: normalizedByRef.get(tableRef) ?? null,
      verification: verifyByRef.get(tableRef) ?? null
    };
    const { score, reason } = scorePriority(baseRow);
    const status = toBacklogStatus(baseRow.normalized, baseRow.verification);
    rows.push({
      ...baseRow,
      backlog_status: status,
      priority_score: score,
      priority_reason: reason
    });
  }

  rows.sort((a, b) => b.priority_score - a.priority_score || a.first_page - b.first_page || a.table_ref.localeCompare(b.table_ref));

  const summary = {
    town_slug: opts.townSlug,
    source_type: opts.sourceType,
    snapshot_date: opts.date,
    generated_at: new Date().toISOString(),
    totals: {
      discovered_table_refs: rows.length,
      normalized_table_refs: rows.filter((r) => r.normalized).length,
      adu_extracted_table_refs: rows.filter((r) => r.adu_extracted).length,
      done: rows.filter((r) => r.backlog_status === "done").length,
      verify_pending: rows.filter((r) => r.backlog_status === "verify_pending").length,
      normalize_next: rows.filter((r) => r.backlog_status === "normalize_next").length
    },
    rows
  };

  await writeJson(path.join(outDir, "table_inventory_backlog.json"), summary);
  await writeJson(
    path.join(outDir, "table_inventory_next_targets.json"),
    rows.filter((r) => r.backlog_status !== "done").slice(0, 25)
  );
  await writeFile(path.join(outDir, "table_inventory_backlog.md"), toMarkdown(rows), "utf8");

  console.log(
    `[phase2-table-inventory] discovered=${summary.totals.discovered_table_refs} normalized=${summary.totals.normalized_table_refs} verify_pending=${summary.totals.verify_pending} normalize_next=${summary.totals.normalize_next} out=${outDir}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase2-table-inventory] ${message}`);
  process.exit(1);
});
