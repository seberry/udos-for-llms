import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveFromCwd } from "./utils/fs.js";

type SourceType = "city_pdf" | "municode";

interface CliOptions {
  townSlug: string;
  sourceType: SourceType;
  date: string;
  outputRoot: string;
}

interface TableBlock {
  table_ref: string;
  table_title: string;
  page_start: number;
  page_end: number;
}

interface NormalizedTable {
  table_ref: string;
  table_title: string;
  pages: number[];
  normalized_at: string;
  rows: NormalizedRow[];
}

interface NormalizedRow {
  source_row_index: number;
  label: string;
  parameter: string;
  value: string;
  notes?: string;
  is_inferred?: boolean;
  is_header?: boolean;
  page: number;
  table_ref: string;
  source_text: string;
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
      const v = argv[i + 1];
      if (v === "city_pdf" || v === "municode") opts.sourceType = v;
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
  return v.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

function loadImageHtml(page: number, benchmarkDir: string): string {
  const rel = `pymupdf_benchmark/images/page_${String(page).padStart(4, "0")}.png`;
  return `<figure><figcaption>PDF page ${page}</figcaption><img loading="lazy" src="${rel}" alt="PDF page ${page}" /></figure>`;
}

function loadTableBlocks(benchmarkPath: string): Map<string, TableBlock> {
  const content = require("fs").readFileSync(benchmarkPath, 'utf-8');
  const lines = content.trim().split('\n');
  const tables = new Map<string, TableBlock>();
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const table = JSON.parse(line) as TableBlock;
      tables.set(table.table_ref, table);
    } catch (e) {
      console.error(`Error parsing line: ${line.substring(0, 100)}...`);
    }
  }
  
  return tables;
}

async function loadNormalizedTables(dir: string): Promise<Map<string, NormalizedTable>> {
  const tables = new Map<string, NormalizedTable>();
  const files = require("fs").readdirSync(dir);
  
  for (const file of files) {
    if (file.match(/^table_02-\d+_normalized\.json$/)) {
      const filePath = path.join(dir, file);
      const content = await readFile(filePath, 'utf-8');
      const table = JSON.parse(content) as NormalizedTable;
      tables.set(table.table_ref, table);
    }
  }
  
  return tables;
}

function generateTableRows(rows: NormalizedRow[]): string {
  return rows
    .map((r) => {
      const isNote = r.label === 'Notes';
      const inferredClass = r.is_inferred ? 'inferred' : '';
      
      if (isNote) {
        return `<tr class="notes-row"><td colspan="3">${esc(r.value)}</td></tr>`;
      }
      
      return `<tr>
        <td class="label-cell">${esc(r.label || '')}</td>
        <td class="parameter-cell">${esc(r.parameter || '')}</td>
        <td class="value-cell ${inferredClass}">${esc(r.value || '')}</td>
      </tr>`;
    })
    .join('\n');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const phase2Dir = resolveFromCwd(opts.outputRoot, opts.townSlug, opts.date, opts.sourceType, "phase2_adu_tables");
  const normalizedDir = path.join(phase2Dir, "normalized");
  const benchmarkPath = path.join(phase2Dir, "table_blocks.jsonl");
  const outPath = path.join(normalizedDir, "dimensional_standards_comparison.html");

  // Load table blocks for page numbers
  const tableBlocks = loadTableBlocks(benchmarkPath);
  
  // Load normalized dimensional standards tables
  const normalizedTables = await loadNormalizedTables(normalizedDir);
  
  // Filter for dimensional standards (02-2 through 02-23)
  const dimensionalRefs = new Set<string>();
  for (let i = 2; i <= 23; i++) {
    dimensionalRefs.add(`02-${i}`);
  }
  
  const sortedRefs = Array.from(dimensionalRefs)
    .filter(ref => normalizedTables.has(ref) && tableBlocks.has(ref))
    .sort();
  
  if (sortedRefs.length === 0) {
    console.error('No dimensional standards tables found!');
    process.exit(1);
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Dimensional Standards Comparison: PDF vs Normalized</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;margin:16px;color:#1a1a1a;background:#f5f5f5}
h1{color:#1a1a1a;border-bottom:3px solid #3b82f6;padding-bottom:10px;margin-bottom:20px}
h2{color:#1e40af;margin-top:0}
section{border:1px solid #d7d7d7;border-radius:8px;padding:20px;margin:20px 0;background:#fff}
.toc{background:#fff;border:1px solid #d7d7d7;border-radius:8px;padding:20px;margin:20px 0}
.toc ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;list-style:none;padding:0}
.toc li a{display:block;padding:12px;background:#f8f9fa;border-radius:4px;text-decoration:none;color:#1a1a1a;transition:all 0.2s}
.toc li a:hover{background:#e5e7eb;transform:translateX(5px)}
.toc li a .ref{font-weight:600;color:#3b82f6}
.split{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:15px}
.pdfs{display:grid;grid-template-columns:1fr;gap:10px}
figure{margin:0;border:1px solid #ddd;border-radius:6px;overflow:0;background:#fff}
figcaption{background:#f4f6f8;padding:8px 12px;border-bottom:1px solid #ddd;font-weight:600;font-size:0.9em;color:#4b5563}
img{width:100%;height:auto;display:block}
.scroll{overflow:auto;border:1px solid #ddd;border-radius:6px;background:#fff}
table{border-collapse:collapse;min-width:800px;width:100%}
th,td{border:1px solid #ddd;padding:10px;text-align:left;vertical-align:top;white-space:normal}
th{position:sticky;top:0;background:#f1f5f9;font-weight:600;color:#1a1a1a;text-transform:uppercase;font-size:0.85em;letter-spacing:0.5px}
tr:hover{background:#f9fafb}
.label-cell{background:#f3f4f6;font-weight:600;width:80px;text-align:center;font-size:1.1em}
.parameter-cell{background:#fefce8;font-weight:500;width:280px}
.value-cell{background:#fff;min-width:300px}
.inferred{background:#fef3c7;border-left:3px solid #f59e0b}
.notes-row{background:#fffbeb;font-style:italic;font-size:0.95em}
.metadata{background:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;padding:10px 15px;margin-bottom:15px;font-size:0.9em;color:#4b5563}
.metadata strong{color:#1a1a1a}
@media (max-width:1200px){.split{grid-template-columns:1fr}}
@media print{
  body{background:#fff}
  .toc{display:none}
  .split{grid-template-columns:1fr}
  .pdfs{display:none}
}
</style></head><body>
<h1>Dimensional Standards Tables: PDF vs Normalized</h1>
<p>Compare PDF images (left) with extracted data (right) for verification. Scroll to review all 17 tables.</p>

<div class="toc">
  <h2>Quick Navigation</h2>
  <ul>
${sortedRefs.map(ref => {
  const table = normalizedTables.get(ref)!;
  const title = table.table_title.split(':')[1]?.trim() || table.table_title;
  return `    <li><a href="#${ref}"><span class="ref">${ref}</span> - ${esc(title)}</a></li>`;
}).join('\n')}
  </ul>
</div>
${sortedRefs.map(ref => {
  const table = normalizedTables.get(ref)!;
  const block = tableBlocks.get(ref)!;
  const page = block.page_start;
  const title = table.table_title;
  
  // Generate images for all pages this table spans
  const pages = Array.from({length: (block.page_end - block.page_start) + 1}, (_, i) => block.page_start + i);
  const imageHtml = pages.map(p => loadImageHtml(p, phase2Dir)).join('\n');
  const rowsHtml = generateTableRows(table.rows);
  
  return `  <section id="${ref}">
    <h2>${esc(title)}</h2>
    <div class="metadata">
      <strong>Table Ref:</strong> ${ref} | 
      <strong>Pages:</strong> ${block.page_start}-${block.page_end} | 
      <strong>Rows extracted:</strong> ${table.rows.length}
    </div>
    <div class="split">
      <div class="pdfs">${imageHtml}</div>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Parameter</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  </section>`;
}).join('\n')}
</body></html>`;

  await writeFile(outPath, html, 'utf8');
  console.log(`Generated dimensional standards comparison: ${outPath}`);
  console.log(`Tables included: ${sortedRefs.length}`);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${msg}`);
  process.exit(1);
});