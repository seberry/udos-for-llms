import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveFromCwd, ensureDir, writeJson } from "./utils/fs.js";

const execFileAsync = promisify(execFile);

type SourceType = "city_pdf" | "municode";

interface CliOptions {
  townSlug: string;
  sourceType: SourceType;
  date?: string;
  outputRoot: string;
  maxChunkChars: number;
}

interface PageRecord {
  page: number;
  raw_text: string;
  normalized_text: string;
  char_count: number;
  section_guess: string | null;
  is_likely_chapter20: boolean;
}

interface ChunkRecord {
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

function logStep(message: string): void {
  console.log(`[phase1] ${message}`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    townSlug: "bloomington",
    sourceType: "city_pdf",
    outputRoot: "corpus",
    maxChunkChars: 1800
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
    } else if (arg === "--max-chars") {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 200) opts.maxChunkChars = parsed;
      i += 1;
    }
  }
  return opts;
}

async function listSnapshotDates(townSlug: string): Promise<string[]> {
  const root = resolveFromCwd("sources", townSlug);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
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

async function getShaFromSums(filePath: string): Promise<string | null> {
  try {
    const text = await readFile(filePath, "utf8");
    const match = text.match(/([a-fA-F0-9]{64})\s+udo\.pdf/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

async function getSourceUrlFromJson(filePath: string): Promise<string | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { source_url?: string };
    return typeof parsed.source_url === "string" ? parsed.source_url : null;
  } catch {
    return null;
  }
}

async function extractPagesWithPdftotext(pdfPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
    maxBuffer: 50 * 1024 * 1024
  });
  return stdout.split("\f").map((p) => p.replace(/\r/g, ""));
}

function getHeaderFooterCandidates(rawPages: string[]): { headers: Set<string>; footers: Set<string> } {
  const headerCounts = new Map<string, number>();
  const footerCounts = new Map<string, number>();
  const minAppearances = Math.max(4, Math.floor(rawPages.length * 0.1));

  for (const page of rawPages) {
    const lines = page
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    const first = lines[0];
    const last = lines[lines.length - 1];
    if (first.length <= 120) headerCounts.set(first, (headerCounts.get(first) ?? 0) + 1);
    if (last.length <= 120) footerCounts.set(last, (footerCounts.get(last) ?? 0) + 1);
  }

  const headers = new Set(
    [...headerCounts.entries()].filter(([, count]) => count >= minAppearances).map(([line]) => line)
  );
  const footers = new Set(
    [...footerCounts.entries()].filter(([, count]) => count >= minAppearances).map(([line]) => line)
  );
  return { headers, footers };
}

function normalizePageText(raw: string, headers: Set<string>, footers: Set<string>): string {
  const lines = raw.split("\n");
  const cleaned: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i].replace(/\t/g, " ").trimEnd();
    if (line.trim().length === 0) {
      cleaned.push("");
      continue;
    }

    const trimmed = line.trim();
    if (headers.has(trimmed) || footers.has(trimmed)) continue;
    if (/^Page\s+\d+$/i.test(trimmed)) continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (/^Bloomington,\s*IN\s+Code of Ordinances$/i.test(trimmed)) continue;

    line = trimmed.replace(/\s{2,}/g, " ");
    cleaned.push(line);
  }

  const merged = cleaned.join("\n");
  return merged
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function guessSection(text: string): string | null {
  const m = text.match(/\b20(?:\.\d+){1,4}[A-Za-z]?\b/);
  if (m) return m[0];
  const chapter = text.match(/\bCHAPTER\s+20\b/i);
  if (chapter) return "CHAPTER 20";
  return null;
}

function isLikelyChapter20(text: string): boolean {
  return /\b20(?:\.\d+){1,4}[A-Za-z]?\b/.test(text) || /\bCHAPTER\s+20\b/i.test(text);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter((p) => p.length > 0);
}

function chunkPages(
  pages: PageRecord[],
  townSlug: string,
  sourceType: SourceType,
  sourceUrl: string | null,
  sourceSha: string | null,
  snapshotDate: string,
  maxChars: number
): ChunkRecord[] {
  const chunks: ChunkRecord[] = [];
  let chunkIndex = 1;
  let accText = "";
  let accStart = 1;
  let accEnd = 1;
  let accChapter20 = false;
  let accSection: string | null = null;

  const flush = (): void => {
    const text = accText.trim();
    if (!text) return;
    chunks.push({
      chunk_id: `${townSlug}_${sourceType}_${snapshotDate}_c${String(chunkIndex).padStart(4, "0")}`,
      text,
      town_slug: townSlug,
      source_type: sourceType,
      source_url: sourceUrl,
      source_sha256: sourceSha,
      snapshot_date: snapshotDate,
      page_start: accStart,
      page_end: accEnd,
      section_guess: accSection,
      is_likely_chapter20: accChapter20
    });
    chunkIndex += 1;
    accText = "";
    accSection = null;
    accChapter20 = false;
  };

  for (const page of pages) {
    const paragraphs = splitParagraphs(page.normalized_text);
    for (const para of paragraphs) {
      if (!accText) {
        accStart = page.page;
      }
      const candidate = accText ? `${accText}\n\n${para}` : para;
      if (candidate.length > maxChars && accText.length > 0) {
        flush();
        accStart = page.page;
      }
      accText = accText ? `${accText}\n\n${para}` : para;
      accEnd = page.page;
      accChapter20 = accChapter20 || page.is_likely_chapter20 || isLikelyChapter20(para);
      if (!accSection) {
        accSection = guessSection(para) ?? page.section_guess;
      }
    }
  }
  flush();
  return chunks;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const snapshotDate = await resolveSnapshotDate(opts.townSlug, opts.date);
  const sourceDir = resolveFromCwd("sources", opts.townSlug, snapshotDate, opts.sourceType);
  const pdfPath = path.join(sourceDir, "udo.pdf");
  const sourceJsonPath = path.join(sourceDir, "source.json");
  const sumsPath = path.join(sourceDir, "SHA256SUMS.txt");

  logStep(`Using snapshot: sources/${opts.townSlug}/${snapshotDate}/${opts.sourceType}`);
  const sourceUrl = await getSourceUrlFromJson(sourceJsonPath);
  const sourceSha = await getShaFromSums(sumsPath);

  logStep("Extracting raw text with pdftotext.");
  const rawPages = await extractPagesWithPdftotext(pdfPath);
  if (rawPages.length === 0) {
    throw new Error("No pages extracted from PDF.");
  }

  const { headers, footers } = getHeaderFooterCandidates(rawPages);
  logStep(`Detected repeated boilerplate: headers=${headers.size}, footers=${footers.size}`);

  const pageRecords: PageRecord[] = rawPages.map((raw, idx) => {
    const normalized = normalizePageText(raw, headers, footers);
    return {
      page: idx + 1,
      raw_text: raw.trim(),
      normalized_text: normalized,
      char_count: normalized.length,
      section_guess: guessSection(normalized),
      is_likely_chapter20: isLikelyChapter20(normalized)
    };
  });

  const chunks = chunkPages(
    pageRecords,
    opts.townSlug,
    opts.sourceType,
    sourceUrl,
    sourceSha,
    snapshotDate,
    opts.maxChunkChars
  );
  const chapter20Chunks = chunks.filter((c) => c.is_likely_chapter20);

  const outDir = resolveFromCwd(opts.outputRoot, opts.townSlug, snapshotDate, opts.sourceType, "phase1");
  await ensureDir(outDir);
  logStep(`Writing outputs to ${outDir}`);

  await writeFile(
    path.join(outDir, "pages_raw.jsonl"),
    pageRecords.map((r) => JSON.stringify({ page: r.page, raw_text: r.raw_text })).join("\n") + "\n",
    "utf8"
  );
  await writeFile(
    path.join(outDir, "pages_normalized.jsonl"),
    pageRecords
      .map((r) =>
        JSON.stringify({
          page: r.page,
          normalized_text: r.normalized_text,
          section_guess: r.section_guess,
          is_likely_chapter20: r.is_likely_chapter20
        })
      )
      .join("\n") + "\n",
    "utf8"
  );
  await writeFile(path.join(outDir, "chunks_all.jsonl"), chunks.map((c) => JSON.stringify(c)).join("\n") + "\n", "utf8");
  await writeFile(
    path.join(outDir, "chunks_chapter20.jsonl"),
    chapter20Chunks.map((c) => JSON.stringify(c)).join("\n") + "\n",
    "utf8"
  );

  await writeJson(path.join(outDir, "qa_eval_template.json"), {
    town_slug: opts.townSlug,
    source_type: opts.sourceType,
    snapshot_date: snapshotDate,
    instructions:
      "Fill this with 20-30 real local questions. For each question, add expected citation anchors (chunk_id or page range).",
    items: [
      {
        id: "q001",
        question: "",
        expected_topics: [],
        expected_citations: []
      }
    ]
  });

  const totalChars = pageRecords.reduce((sum, p) => sum + p.char_count, 0);
  const lowTextPages = pageRecords.filter((p) => p.char_count < 80).map((p) => p.page);
  await writeJson(path.join(outDir, "report.json"), {
    town_slug: opts.townSlug,
    source_type: opts.sourceType,
    snapshot_date: snapshotDate,
    page_count: pageRecords.length,
    chunk_count: chunks.length,
    chapter20_chunk_count: chapter20Chunks.length,
    total_normalized_chars: totalChars,
    low_text_pages: lowTextPages,
    extraction_method: "pdftotext -layout",
    fallback_method: "none (pages with very low text are flagged for potential OCR pass)"
  });

  logStep(
    `Done. pages=${pageRecords.length}, chunks=${chunks.length}, chapter20_chunks=${chapter20Chunks.length}, low_text_pages=${lowTextPages.length}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase1] ${message}`);
  process.exit(1);
});
