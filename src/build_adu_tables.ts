import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeJson, resolveFromCwd } from "./utils/fs.js";

type SourceType = "city_pdf" | "municode";

interface CliOptions {
  townSlug: string;
  sourceType: SourceType;
  date?: string;
  outputRoot: string;
  aduPageWindow: number;
}

interface Phase1ChunkRecord {
  chunk_id: string;
  text: string;
  town_slug: string;
  source_type: SourceType;
  source_url: string | null;
  source_sha256: string | null;
  snapshot_date: string;
  page_start: number;
  page_end: number;
  section_guess: string | null;
  is_likely_chapter20: boolean;
}

interface RawPageRecord {
  page: number;
  raw_text: string;
}

interface NormalizedPageRecord {
  page: number;
  normalized_text: string;
  section_guess: string | null;
  is_likely_chapter20: boolean;
}

type TableCategory =
  | "use_permissions"
  | "dimensional_standards"
  | "parking_loading"
  | "accessory_structures"
  | "other";

interface TableRowRecord {
  row_index: number;
  row_text: string;
  columns: string[];
}

interface TableBlockRecord {
  table_id: string;
  table_ref: string;
  table_title: string;
  category: TableCategory;
  relevance_score: number;
  page_start: number;
  page_end: number;
  rows: TableRowRecord[];
  column_count_guess: number;
  chunk_ids: string[];
  section_guess: string | null;
  town_slug: string;
  source_type: SourceType;
  source_url: string | null;
  source_sha256: string | null;
  snapshot_date: string;
}

function logStep(message: string): void {
  console.log(`[phase2-tables] ${message}`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    townSlug: "bloomington",
    sourceType: "city_pdf",
    outputRoot: "corpus",
    aduPageWindow: 20
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--town-slug") {
      opts.townSlug = argv[i + 1] ?? opts.townSlug;
      i += 1;
    } else if (arg === "--source-type") {
      const value = argv[i + 1];
      if (value === "city_pdf" || value === "municode") {
        opts.sourceType = value;
      }
      i += 1;
    } else if (arg === "--date") {
      opts.date = argv[i + 1];
      i += 1;
    } else if (arg === "--output-root") {
      opts.outputRoot = argv[i + 1] ?? opts.outputRoot;
      i += 1;
    } else if (arg === "--adu-page-window") {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 120) {
        opts.aduPageWindow = parsed;
      }
      i += 1;
    }
  }

  return opts;
}

async function listSnapshotDates(townSlug: string): Promise<string[]> {
  const root = resolveFromCwd("sources", townSlug);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
}

async function resolveSnapshotDate(townSlug: string, requested?: string): Promise<string> {
  if (requested) return requested;
  const dates = await listSnapshotDates(townSlug);
  if (dates.length === 0) {
    throw new Error(`No snapshots found under sources/${townSlug}`);
  }
  return dates[0];
}

async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  const text = await readFile(filePath, "utf8");
  const records: T[] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    try {
      records.push(JSON.parse(line) as T);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSONL at ${path.basename(filePath)} line ${i + 1}: ${message}`);
    }
  }
  return records;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function getAduSeedPages(pages: NormalizedPageRecord[], chunks: Phase1ChunkRecord[]): Set<number> {
  const seedSet = new Set<number>();
  const pageSignals = [
    "accessory dwelling unit",
    "dwelling, accessory unit",
    "adu",
    "owner occupancy",
    "20.03.030(g)(5)",
    "parking and loading"
  ];
  for (const page of pages) {
    const text = page.normalized_text.toLowerCase();
    if (pageSignals.some((signal) => text.includes(signal))) {
      seedSet.add(page.page);
    }
  }

  for (const chunk of chunks) {
    const text = chunk.text.toLowerCase();
    if (
      text.includes("accessory dwelling unit") ||
      text.includes("dwelling, accessory unit") ||
      text.includes("20.03.030(g)(5)")
    ) {
      for (let page = chunk.page_start; page <= chunk.page_end; page += 1) {
        seedSet.add(page);
      }
    }
  }

  return seedSet;
}

function getCandidatePages(
  pages: NormalizedPageRecord[],
  aduSeedPages: Set<number>,
  aduPageWindow: number
): Set<number> {
  const candidatePages = new Set<number>();
  const tablePageSignals = [/table\s+0[234]-\d+/i, /parking and loading/i, /dimensional standards/i];

  for (const page of pages) {
    const text = page.normalized_text;
    if (tablePageSignals.some((pattern) => pattern.test(text))) {
      candidatePages.add(page.page);
    }
  }

  if (aduSeedPages.size === 0) {
    return candidatePages;
  }

  const expandedAduPages = new Set<number>();
  for (const seedPage of aduSeedPages) {
    for (let page = Math.max(1, seedPage - aduPageWindow); page <= seedPage + aduPageWindow; page += 1) {
      expandedAduPages.add(page);
    }
  }

  const filtered = new Set<number>();
  for (const page of candidatePages) {
    if (expandedAduPages.has(page)) {
      filtered.add(page);
    }
  }
  return filtered;
}

function classifyCategory(textLower: string): TableCategory {
  if (textLower.includes("allowed use table") || textLower.includes("use-specific standards")) {
    return "use_permissions";
  }
  if (textLower.includes("parking") || textLower.includes("loading")) {
    return "parking_loading";
  }
  if (textLower.includes("accessory structures")) {
    return "accessory_structures";
  }
  if (textLower.includes("dimensional standards") || textLower.includes("setback")) {
    return "dimensional_standards";
  }
  return "other";
}

function scoreRelevance(textLower: string, category: TableCategory): number {
  let score = 0;
  if (textLower.includes("accessory dwelling") || textLower.includes("dwelling, accessory unit")) score += 5;
  if (textLower.includes("adu")) score += 2;
  if (textLower.includes("dwelling")) score += 2;
  if (textLower.includes("accessory")) score += 2;
  if (textLower.includes("parking")) score += 2;
  if (textLower.includes("setback")) score += 1;
  if (textLower.includes("dimensional")) score += 1;
  if (category === "use_permissions" || category === "parking_loading" || category === "accessory_structures") {
    score += 2;
  }
  return score;
}

function shouldSkipRawLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^Bloomington,\s*Indiana\s+–\s+Unified Development Ordinance/i.test(trimmed)) return true;
  if (/^Effective Date:/i.test(trimmed)) return true;
  if (/^Last Amended Date:/i.test(trimmed)) return true;
  if (/^\d+$/.test(trimmed)) return true;
  return false;
}

function toColumns(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  return line
    .split(/\s{2,}/)
    .map((part) => normalizeWhitespace(part))
    .filter((part) => part.length > 0);
}

function parseRows(lines: string[]): { rows: TableRowRecord[]; columnCountGuess: number } {
  const rows: TableRowRecord[] = [];
  let columnCountGuess = 1;

  for (const line of lines) {
    const rowText = normalizeWhitespace(line);
    if (!rowText) continue;
    const columns = toColumns(line);
    columnCountGuess = Math.max(columnCountGuess, columns.length || 1);
    rows.push({
      row_index: rows.length + 1,
      row_text: rowText,
      columns: columns.length > 0 ? columns : [rowText]
    });
  }

  return { rows, columnCountGuess };
}

function getChunkIdsForPageRange(chunks: Phase1ChunkRecord[], pageStart: number, pageEnd: number): string[] {
  return chunks
    .filter((chunk) => chunk.page_start <= pageEnd && chunk.page_end >= pageStart)
    .map((chunk) => chunk.chunk_id);
}

function extractSectionGuess(lines: string[]): string | null {
  for (const line of lines) {
    const normalized = normalizeWhitespace(line);
    const match = normalized.match(/\b20(?:\.\d+){1,4}\b/);
    if (match) return match[0];
  }
  return null;
}

function extractTableRef(title: string): string | null {
  const match = title.match(/Table\s+(\d{2}-\d+)/i);
  return match ? match[1] : null;
}

function extractTableBlocksFromRawPage(page: RawPageRecord): Array<{ tableTitle: string; lines: string[]; page: number }> {
  const lines = page.raw_text.split(/\r?\n/);
  const blocks: Array<{ tableTitle: string; lines: string[]; page: number }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!/^Table\s+\d{2}-\d+:/i.test(trimmed)) continue;

    const blockLines: string[] = [trimmed];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      const lineTrimmed = line.trim();
      if (/^Table\s+\d{2}-\d+:/i.test(lineTrimmed)) break;
      if (/^Figure\s+\d+:/i.test(lineTrimmed)) break;
      if (/^Chapter\s+20\./i.test(lineTrimmed) && blockLines.length > 4) break;
      if (/^20\.\d{2}\.\d{3}/.test(lineTrimmed) && blockLines.length > 4) break;
      if (shouldSkipRawLine(line)) continue;
      blockLines.push(line);
    }

    blocks.push({ tableTitle: trimmed, lines: blockLines, page: page.page });
  }

  return blocks;
}

function mergeAdjacentTableBlocks(
  blocks: Array<{ tableTitle: string; lines: string[]; page: number }>
): Array<{ tableTitle: string; lines: string[]; pageStart: number; pageEnd: number }> {
  const sorted = [...blocks].sort((a, b) => a.page - b.page);
  const merged: Array<{ tableTitle: string; lines: string[]; pageStart: number; pageEnd: number }> = [];

  for (const block of sorted) {
    const blockRef = extractTableRef(block.tableTitle);
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({
        tableTitle: block.tableTitle,
        lines: [...block.lines],
        pageStart: block.page,
        pageEnd: block.page
      });
      continue;
    }

    const lastRef = extractTableRef(last.tableTitle);
    const canMerge = blockRef && lastRef && blockRef === lastRef && block.page <= last.pageEnd + 1;
    if (canMerge) {
      last.pageEnd = Math.max(last.pageEnd, block.page);
      for (const line of block.lines) {
        if (line.trim().length > 0) {
          last.lines.push(line);
        }
      }
    } else {
      merged.push({
        tableTitle: block.tableTitle,
        lines: [...block.lines],
        pageStart: block.page,
        pageEnd: block.page
      });
    }
  }

  return merged;
}

function dedupeRows(rows: TableRowRecord[]): TableRowRecord[] {
  const seen = new Set<string>();
  const deduped: TableRowRecord[] = [];
  for (const row of rows) {
    const key = row.row_text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...row, row_index: deduped.length + 1 });
  }
  return deduped;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const snapshotDate = await resolveSnapshotDate(opts.townSlug, opts.date);
  const phase1Dir = resolveFromCwd(opts.outputRoot, opts.townSlug, snapshotDate, opts.sourceType, "phase1");

  const chunksPath = path.join(phase1Dir, "chunks_all.jsonl");
  const pagesRawPath = path.join(phase1Dir, "pages_raw.jsonl");
  const pagesNormalizedPath = path.join(phase1Dir, "pages_normalized.jsonl");

  logStep(`Using Phase 1 input: ${phase1Dir}`);
  const [chunks, rawPages, normalizedPages] = await Promise.all([
    readJsonlFile<Phase1ChunkRecord>(chunksPath),
    readJsonlFile<RawPageRecord>(pagesRawPath),
    readJsonlFile<NormalizedPageRecord>(pagesNormalizedPath)
  ]);

  if (chunks.length === 0 || rawPages.length === 0 || normalizedPages.length === 0) {
    throw new Error("Phase 1 inputs are missing or empty. Re-run build:corpus first.");
  }

  const aduSeedPages = getAduSeedPages(normalizedPages, chunks);
  const candidatePages = getCandidatePages(normalizedPages, aduSeedPages, opts.aduPageWindow);
  logStep(
    `Candidate pages: ${candidatePages.size} (adu_seeds=${aduSeedPages.size}, window=${opts.aduPageWindow} pages)`
  );

  const rawPageMap = new Map(rawPages.map((page) => [page.page, page]));
  const extractedBlocks: Array<{ tableTitle: string; lines: string[]; page: number }> = [];
  for (const page of candidatePages) {
    const rawPage = rawPageMap.get(page);
    if (!rawPage) continue;
    extractedBlocks.push(...extractTableBlocksFromRawPage(rawPage));
  }

  const mergedBlocks = mergeAdjacentTableBlocks(extractedBlocks);
  const selectedTables: TableBlockRecord[] = [];

  const sourceUrl = chunks[0].source_url ?? null;
  const sourceSha = chunks[0].source_sha256 ?? null;
  const snapshot = chunks[0].snapshot_date;
  const sourceType = chunks[0].source_type;
  const townSlug = chunks[0].town_slug;

  for (const merged of mergedBlocks) {
    const tableRef = extractTableRef(merged.tableTitle) ?? "unknown";
    const tableTextLower = normalizeWhitespace(merged.lines.join("\n")).toLowerCase();
    const category = classifyCategory(tableTextLower);
    const relevance = scoreRelevance(tableTextLower, category);
    if (relevance < 3) continue;

    const { rows, columnCountGuess } = parseRows(merged.lines);
    const dedupedRows = dedupeRows(rows);
    const chunkIds = getChunkIdsForPageRange(chunks, merged.pageStart, merged.pageEnd);
    const sectionGuess = extractSectionGuess(merged.lines);
    const tableId = `${townSlug}_${sourceType}_${snapshot}_${tableRef.replace(/[^a-zA-Z0-9-]/g, "")}_p${String(
      merged.pageStart
    ).padStart(3, "0")}`;

    selectedTables.push({
      table_id: tableId,
      table_ref: tableRef,
      table_title: normalizeWhitespace(merged.tableTitle),
      category,
      relevance_score: relevance,
      page_start: merged.pageStart,
      page_end: merged.pageEnd,
      rows: dedupedRows,
      column_count_guess: columnCountGuess,
      chunk_ids: chunkIds,
      section_guess: sectionGuess,
      town_slug: townSlug,
      source_type: sourceType,
      source_url: sourceUrl,
      source_sha256: sourceSha,
      snapshot_date: snapshot
    });
  }

  const outDir = resolveFromCwd(opts.outputRoot, opts.townSlug, snapshotDate, opts.sourceType, "phase2_adu_tables");
  await ensureDir(outDir);

  await writeFile(
    path.join(outDir, "table_blocks.jsonl"),
    selectedTables.map((table) => JSON.stringify(table)).join("\n") + (selectedTables.length > 0 ? "\n" : ""),
    "utf8"
  );
  await writeJson(path.join(outDir, "adu_tables.json"), {
    town_slug: townSlug,
    source_type: sourceType,
    snapshot_date: snapshot,
    generated_at: new Date().toISOString(),
    extraction_notes:
      "Heuristic table extraction from phase1/pages_raw.jsonl. Intended for ADU-relevant use, dimensional, accessory-structure, and parking table grounding.",
    adu_seed_page_count: aduSeedPages.size,
    candidate_page_count: candidatePages.size,
    table_count: selectedTables.length,
    tables: selectedTables
  });

  const categoryCounts = selectedTables.reduce<Record<string, number>>((acc, table) => {
    acc[table.category] = (acc[table.category] ?? 0) + 1;
    return acc;
  }, {});
  await writeJson(path.join(outDir, "report.json"), {
    town_slug: townSlug,
    source_type: sourceType,
    snapshot_date: snapshot,
    adu_seed_page_count: aduSeedPages.size,
    candidate_page_count: candidatePages.size,
    extracted_blocks_before_filter: mergedBlocks.length,
    selected_table_count: selectedTables.length,
    selected_by_category: categoryCounts,
    avg_rows_per_table:
      selectedTables.length > 0
        ? Number(
            (
              selectedTables.reduce((sum, table) => sum + table.rows.length, 0) / selectedTables.length
            ).toFixed(2)
          )
        : 0
  });

  logStep(
    `Done. selected_tables=${selectedTables.length}, categories=${Object.keys(categoryCounts).length}, out=${outDir}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase2-tables] ${message}`);
  process.exit(1);
});
