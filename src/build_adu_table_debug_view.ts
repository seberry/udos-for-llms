import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { resolveFromCwd } from "./utils/fs.js";

type SourceType = "city_pdf" | "municode";
const execFileAsync = promisify(execFile);

interface CliOptions {
  townSlug: string;
  sourceType: SourceType;
  date?: string;
  outputRoot: string;
  limit: number;
  tableRefs?: string[];
  renderPdfImages: boolean;
  imageDpi: number;
  page?: number;
}

interface RawPageRecord {
  page: number;
  raw_text: string;
}

interface TableRowRecord {
  row_index: number;
  row_text: string;
  columns: string[];
}

interface TableRecord {
  table_id: string;
  table_ref: string;
  table_title: string;
  category: string;
  relevance_score: number;
  page_start: number;
  page_end: number;
  rows: TableRowRecord[];
  column_count_guess: number;
  chunk_ids: string[];
  section_guess: string | null;
}

interface TablesFile {
  tables: TableRecord[];
}

function logStep(message: string): void {
  console.log(`[phase2-tables-debug] ${message}`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    townSlug: "bloomington",
    sourceType: "city_pdf",
    outputRoot: "corpus",
    limit: 6,
    renderPdfImages: true,
    imageDpi: 180
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
      opts.date = argv[i + 1];
      i += 1;
    } else if (arg === "--output-root") {
      opts.outputRoot = argv[i + 1] ?? opts.outputRoot;
      i += 1;
    } else if (arg === "--limit") {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 30) opts.limit = parsed;
      i += 1;
    } else if (arg === "--table-refs") {
      const value = argv[i + 1] ?? "";
      opts.tableRefs = value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      i += 1;
    } else if (arg === "--no-pdf-images") {
      opts.renderPdfImages = false;
    } else if (arg === "--image-dpi") {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 72 && parsed <= 400) opts.imageDpi = parsed;
      i += 1;
    } else if (arg === "--page") {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 1) opts.page = parsed;
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
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderParsedGrid(rows: TableRowRecord[]): string {
  let maxCols = 1;
  for (const row of rows) {
    maxCols = Math.max(maxCols, row.columns.length || 1);
  }

  const headCells = Array.from({ length: maxCols }, (_, idx) => `<th>col_${idx + 1}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells: string[] = [];
      for (let i = 0; i < maxCols; i += 1) {
        cells.push(`<td>${escapeHtml(row.columns[i] ?? "")}</td>`);
      }
      return `<tr><td class="rownum">${row.row_index}</td>${cells.join("")}</tr>`;
    })
    .join("\n");

  return `<table class="parsed-grid">
    <thead><tr><th>#</th>${headCells}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

async function renderPdfPageImage(
  pdfPath: string,
  outPrefix: string,
  page: number,
  dpi: number
): Promise<string | null> {
  try {
    await execFileAsync("pdftoppm", ["-png", "-r", String(dpi), "-f", String(page), "-singlefile", pdfPath, outPrefix]);
    return `${outPrefix}.png`;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const snapshotDate = await resolveSnapshotDate(opts.townSlug, opts.date);
  const phase1Dir = resolveFromCwd(opts.outputRoot, opts.townSlug, snapshotDate, opts.sourceType, "phase1");
  const phase2Dir = resolveFromCwd(opts.outputRoot, opts.townSlug, snapshotDate, opts.sourceType, "phase2_adu_tables");
  const sourcePdfPath = resolveFromCwd("sources", opts.townSlug, snapshotDate, opts.sourceType, "udo.pdf");
  const tablesPath = path.join(phase2Dir, "adu_tables.json");
  const pagesRawPath = path.join(phase1Dir, "pages_raw.jsonl");
  const outPath = path.join(phase2Dir, "debug_review.html");
  const imagesDir = path.join(phase2Dir, "debug_images");

  const tablesJson = JSON.parse(await readFile(tablesPath, "utf8")) as TablesFile;
  const rawPages = await readJsonlFile<RawPageRecord>(pagesRawPath);
  const pageMap = new Map(rawPages.map((r) => [r.page, r.raw_text]));

  let tables = [...(tablesJson.tables ?? [])];
  if (opts.tableRefs && opts.tableRefs.length > 0) {
    const refSet = new Set(opts.tableRefs.map((ref) => ref.toLowerCase()));
    tables = tables.filter((table) => refSet.has(table.table_ref.toLowerCase()));
  } else {
    tables = tables
      .filter((table) =>
        ["use_permissions", "dimensional_standards", "parking_loading", "accessory_structures"].includes(table.category)
      )
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, opts.limit);
  }

  if (opts.page !== undefined) {
    tables = tables.filter((table) => table.page_start <= opts.page! && table.page_end >= opts.page!);
  }

  if (tables.length === 0) {
    throw new Error("No tables selected for debug view.");
  }

  const imageRelByPage = new Map<number, string>();
  let imageRenderingEnabled = opts.renderPdfImages;
  if (opts.renderPdfImages) {
    try {
      await execFileAsync("pdftoppm", ["-v"]);
      await mkdir(imagesDir, { recursive: true });
    } catch {
      imageRenderingEnabled = false;
      logStep("pdftoppm not available; continuing without PDF images.");
    }
  }

  if (imageRenderingEnabled) {
    const pagesToRender = new Set<number>();
    for (const table of tables) {
      for (let page = table.page_start; page <= table.page_end; page += 1) pagesToRender.add(page);
    }
    for (const page of [...pagesToRender].sort((a, b) => a - b)) {
      const prefix = path.join(imagesDir, `page_${String(page).padStart(4, "0")}`);
      const rendered = await renderPdfPageImage(sourcePdfPath, prefix, page, opts.imageDpi);
      if (rendered) {
        imageRelByPage.set(page, `debug_images/${path.basename(rendered)}`);
      }
    }
  }

  const sections = tables
    .map((table) => {
      const rawTextParts: string[] = [];
      for (let page = table.page_start; page <= table.page_end; page += 1) {
        if (opts.page !== undefined && page !== opts.page) continue;
        const raw = pageMap.get(page) ?? "";
        rawTextParts.push(`--- PAGE ${page} ---\n${raw}`);
      }
      const rawText = rawTextParts.join("\n\n");
      const rowsJson = JSON.stringify(table.rows, null, 2);
      const parsedGrid = renderParsedGrid(table.rows);
      const imageHtml = Array.from({ length: table.page_end - table.page_start + 1 }, (_, idx) => table.page_start + idx)
        .filter((page) => (opts.page !== undefined ? page === opts.page : true))
        .map((page) => {
          const rel = imageRelByPage.get(page);
          if (!rel) return `<p class="meta">No rendered image for page ${page}.</p>`;
          return `<figure><figcaption class="meta">PDF page ${page}</figcaption><img loading="lazy" src="${escapeHtml(
            rel
          )}" alt="PDF page ${page} image" /></figure>`;
        })
        .join("\n");
      return `
        <section class="table-card" id="${escapeHtml(table.table_id)}">
          <h2>${escapeHtml(table.table_title)} <span class="meta">(${escapeHtml(table.table_ref)})</span></h2>
          <p class="meta">pages ${table.page_start}-${table.page_end} | category=${escapeHtml(table.category)} | rows=${table.rows.length} | col_guess=${table.column_count_guess}</p>
          <h3>Actual PDF Page Image(s)</h3>
          <div class="pdf-images">${imageHtml}</div>
          <p class="meta">Citation anchors: chunk_ids=${escapeHtml(table.chunk_ids.join(", "))}</p>
          <div class="grid">
            <div>
              <h3>Source (raw page text)</h3>
              <pre>${escapeHtml(rawText)}</pre>
            </div>
            <div>
              <h3>Parsed JSON Rows</h3>
              <pre>${escapeHtml(rowsJson)}</pre>
            </div>
          </div>
          <h3>Interpreted Grid View</h3>
          <div class="grid-wrap">
            ${parsedGrid}
          </div>
        </section>
      `;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ADU Table Debug Review</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 16px; color: #1a1a1a; }
    h1 { margin-top: 0; }
    .meta { color: #555; font-size: 0.95rem; }
    .table-card { border: 1px solid #d6d6d6; border-radius: 8px; padding: 12px; margin: 16px 0; }
    .grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
    pre { background: #f7f7f7; border: 1px solid #e3e3e3; padding: 10px; border-radius: 6px; overflow: auto; max-height: 420px; white-space: pre-wrap; }
    .grid-wrap { overflow: auto; border: 1px solid #e3e3e3; border-radius: 6px; background: #fff; }
    .parsed-grid { border-collapse: collapse; width: 100%; min-width: 720px; }
    .parsed-grid th, .parsed-grid td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
    .parsed-grid th { background: #f0f4f8; position: sticky; top: 0; }
    .rownum { background: #fafafa; font-weight: 600; width: 44px; }
    .pdf-images { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); margin-bottom: 10px; }
    figure { margin: 0; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; background: #fafafa; }
    img { width: 100%; height: auto; display: block; }
    figcaption { padding: 6px 8px; border-bottom: 1px solid #ddd; background: #f3f5f7; }
    @media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>ADU Table Debug Review</h1>
  <p class="meta">town=${escapeHtml(opts.townSlug)} | source=${escapeHtml(opts.sourceType)} | snapshot=${escapeHtml(snapshotDate)} | selected_tables=${tables.length}${
    opts.page !== undefined ? ` | page=${opts.page}` : ""
  }</p>
  ${sections}
</body>
</html>`;

  if (opts.page !== undefined) {
    const pageOut = path.join(phase2Dir, `debug_review_page_${String(opts.page).padStart(4, "0")}.html`);
    await writeFile(pageOut, html, "utf8");
    logStep(`Wrote ${pageOut}`);
  } else {
    await writeFile(outPath, html, "utf8");
    logStep(`Wrote ${outPath}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase2-tables-debug] ${message}`);
  process.exit(1);
});
