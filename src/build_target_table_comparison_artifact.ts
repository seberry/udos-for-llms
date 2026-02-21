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
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const phase2Dir = resolveFromCwd(opts.outputRoot, opts.townSlug, opts.date, opts.sourceType, "phase2_adu_tables");
  const normalizedDir = path.join(phase2Dir, "normalized");
  const benchmarkDir = path.join(phase2Dir, "pymupdf_benchmark");
  const outPath = path.join(normalizedDir, "target_tables_comparison.html");

  const table03_4 = JSON.parse(await readFile(path.join(normalizedDir, "table_03-4_normalized.json"), "utf8")) as {
    rows: Array<Record<string, unknown>>;
  };
  const table04_9 = JSON.parse(await readFile(path.join(normalizedDir, "table_04-9_normalized.json"), "utf8")) as {
    rows: Array<Record<string, unknown>>;
  };
  const table04_10 = JSON.parse(await readFile(path.join(normalizedDir, "table_04-10_normalized.json"), "utf8")) as {
    rows: Array<Record<string, unknown>>;
  };

  const images03_4 = [117];
  const images04_9 = [177];
  const images04_10 = [178, 179, 180, 181, 182];

  const imageHtml = (pages: number[]) =>
    pages
      .map((page) => {
        const rel = `../pymupdf_benchmark/images/page_${String(page).padStart(4, "0")}.png`;
        return `<figure><figcaption>PDF page ${page}</figcaption><img loading="lazy" src="${rel}" alt="PDF page ${page}" /></figure>`;
      })
      .join("\n");

  const rows03_4 = table03_4.rows
    .map((r) => {
      const inferred = Boolean(r.inferred_maximum_number);
      return `<tr><td>${esc(String(r.zoning_district ?? ""))}</td><td class="${
        inferred ? "inferred" : ""
      }">${esc(String(r.maximum_number ?? ""))}</td><td>${esc(String(r.maximum_footprint ?? ""))}</td><td>${esc(
        String((r.inference_notes as string[] | undefined)?.join("; ") ?? "")
      )}</td></tr>`;
    })
    .join("\n");

  const rows04_9 = table04_9.rows
    .map((r) => {
      const infA = Boolean(r.inferred_all_other);
      const infM = Boolean(r.inferred_md);
      return `<tr><td>${esc(String(r.type ?? ""))}</td><td>${esc(String(r.use_label ?? ""))}</td><td class="${
        infA ? "inferred" : ""
      }">${esc(String(r.all_other_zoning_districts ?? ""))}</td><td class="${infM ? "inferred" : ""}">${esc(
        String(r.md_zoning_district ?? "")
      )}</td><td>${esc(String((r.inference_notes as string[] | undefined)?.join("; ") ?? ""))}</td></tr>`;
    })
    .join("\n");

  const rows04_10 = table04_10.rows
    .map((r) => {
      const inf = Boolean(r.inferred_allowance);
      return `<tr><td>${esc(String(r.type ?? ""))}</td><td>${esc(String(r.use_label ?? ""))}</td><td class="${
        inf ? "inferred" : ""
      }">${esc(String(r.maximum_vehicle_parking_allowance ?? ""))}</td><td>${esc(
        String((r.inference_notes as string[] | undefined)?.join("; ") ?? "")
      )}</td></tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Target Tables Comparison</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;margin:16px;color:#1a1a1a}
section{border:1px solid #d7d7d7;border-radius:8px;padding:12px;margin:16px 0}
.split{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pdfs{display:grid;grid-template-columns:1fr;gap:10px}
figure{margin:0;border:1px solid #ddd;border-radius:6px;overflow:hidden}
figcaption{background:#f4f6f8;padding:6px 8px;border-bottom:1px solid #ddd}
img{width:100%;height:auto;display:block}
.scroll{overflow:auto;border:1px solid #ddd;border-radius:6px}
table{border-collapse:collapse;min-width:900px}
th,td{border:1px solid #ddd;padding:5px 7px;vertical-align:top;white-space:pre-wrap}
th{position:sticky;top:0;background:#f1f5f9}
.inferred{background:#fff6db}
@media (max-width:1100px){.split{grid-template-columns:1fr}}
</style></head><body>
<h1>Target Tables Comparison: PDF vs Final Normalized</h1>
<p>Highlighted cells are inferred fills (auditable via notes).</p>

<section>
<h2>Table 03-4</h2>
<div class="split">
  <div class="pdfs">${imageHtml(images03_4)}</div>
  <div class="scroll"><table><thead><tr><th>Zoning District</th><th>Maximum Number</th><th>Maximum Footprint</th><th>Inference Notes</th></tr></thead><tbody>${rows03_4}</tbody></table></div>
</div>
</section>

<section>
<h2>Table 04-9</h2>
<div class="split">
  <div class="pdfs">${imageHtml(images04_9)}</div>
  <div class="scroll"><table><thead><tr><th>Type</th><th>Use</th><th>All Other Zoning Districts</th><th>MD Zoning District</th><th>Inference Notes</th></tr></thead><tbody>${rows04_9}</tbody></table></div>
</div>
</section>

<section>
<h2>Table 04-10</h2>
<div class="split">
  <div class="pdfs">${imageHtml(images04_10)}</div>
  <div class="scroll"><table><thead><tr><th>Type</th><th>Use</th><th>Maximum Vehicle Parking Allowance</th><th>Inference Notes</th></tr></thead><tbody>${rows04_10}</tbody></table></div>
</div>
</section>

</body></html>`;

  await writeFile(outPath, html, "utf8");
  // eslint-disable-next-line no-console
  console.log(`[phase2-target-compare] Wrote ${outPath}`);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`[phase2-target-compare] ${msg}`);
  process.exit(1);
});
