import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, resolveFromCwd, writeJson } from "./utils/fs.js";

type SourceType = "city_pdf" | "municode";

interface CliOptions {
  townSlug: string;
  sourceType: SourceType;
  date?: string;
  outputRoot: string;
  topK: number;
  goldFile?: string;
  writeGoldTemplate: boolean;
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
  town_slug: string;
  source_type: SourceType;
  source_url: string | null;
  source_sha256: string | null;
  snapshot_date: string;
}

interface TablesFile {
  town_slug: string;
  source_type: SourceType;
  snapshot_date: string;
  tables: TableRecord[];
}

interface EvalItem {
  id: string;
  question: string;
  required_terms: string[];
  optional_terms: string[];
}

interface RetrievalDocument {
  doc_id: string;
  kind: "chunk" | "table_row";
  text: string;
  chunk_id: string | null;
  table_id: string | null;
  table_ref: string | null;
  page_start: number;
  page_end: number;
  source_url: string | null;
  source_sha256: string | null;
}

interface ScoredDoc extends RetrievalDocument {
  score: number;
}

interface GoldItem {
  id: string;
  relevant_doc_ids: string[];
}

interface GoldFile {
  town_slug: string;
  source_type: SourceType;
  snapshot_date: string;
  items: GoldItem[];
}

function logStep(message: string): void {
  console.log(`[phase2-eval] ${message}`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    townSlug: "bloomington",
    sourceType: "city_pdf",
    outputRoot: "corpus",
    topK: 6,
    writeGoldTemplate: true
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
    } else if (arg === "--top-k") {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 20) opts.topK = parsed;
      i += 1;
    } else if (arg === "--gold-file") {
      opts.goldFile = argv[i + 1];
      i += 1;
    } else if (arg === "--no-gold-template") {
      opts.writeGoldTemplate = false;
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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function buildEvalItems(): EvalItem[] {
  return [
    {
      id: "adu_q001",
      question: "Where is ADU use permission described across zoning districts?",
      required_terms: ["dwelling", "accessory", "table", "use"],
      optional_terms: ["20.03.030", "allowed use table"]
    },
    {
      id: "adu_q002",
      question: "What standards govern accessory dwelling units (ADUs)?",
      required_terms: ["accessory", "dwelling", "unit", "standards"],
      optional_terms: ["owner occupancy", "utilities"]
    },
    {
      id: "adu_q003",
      question: "What detached ADU dimensional or setback constraints are listed?",
      required_terms: ["detached", "adu", "setback"],
      optional_terms: ["height", "foot", "dimensional standards"]
    },
    {
      id: "adu_q004",
      question: "What attached ADU limits are listed?",
      required_terms: ["attached", "adu", "maximum"],
      optional_terms: ["square footage", "height"]
    },
    {
      id: "adu_q005",
      question: "What owner-occupancy and recording requirements are listed for ADUs?",
      required_terms: ["owner", "occupancy", "adu"],
      optional_terms: ["affidavit", "recorded documents"]
    },
    {
      id: "adu_q006",
      question: "Where are parking requirements relevant to ADUs or dwelling units listed?",
      required_terms: ["parking", "dwelling", "requirements"],
      optional_terms: ["table 04", "loading"]
    },
    {
      id: "adu_q007",
      question: "Where are accessory structure limits that may bound detached ADUs listed?",
      required_terms: ["accessory", "structures", "maximum"],
      optional_terms: ["number and size", "table 03-4"]
    },
    {
      id: "adu_q008",
      question: "Which citations ground ADU utilities and connection rules?",
      required_terms: ["adu", "utilities", "water", "sewer"],
      optional_terms: ["public water", "sanitary sewer"]
    }
  ];
}

function buildDocuments(chunks: ChunkRecord[], tables: TableRecord[]): RetrievalDocument[] {
  const docs: RetrievalDocument[] = [];

  for (const chunk of chunks) {
    docs.push({
      doc_id: `chunk:${chunk.chunk_id}`,
      kind: "chunk",
      text: chunk.text,
      chunk_id: chunk.chunk_id,
      table_id: null,
      table_ref: null,
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      source_url: chunk.source_url,
      source_sha256: chunk.source_sha256
    });
  }

  for (const table of tables) {
    for (const row of table.rows) {
      const rowText = `${table.table_title} ${row.row_text}`.trim();
      docs.push({
        doc_id: `table:${table.table_id}:r${row.row_index}`,
        kind: "table_row",
        text: rowText,
        chunk_id: table.chunk_ids[0] ?? null,
        table_id: table.table_id,
        table_ref: table.table_ref,
        page_start: table.page_start,
        page_end: table.page_end,
        source_url: table.source_url,
        source_sha256: table.source_sha256
      });
    }
  }

  return docs;
}

function buildTermFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  return tf;
}

function buildIdf(docs: RetrievalDocument[]): Map<string, number> {
  const docFreq = new Map<string, number>();
  for (const doc of docs) {
    const unique = new Set(tokenize(doc.text));
    for (const token of unique) {
      docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  const n = docs.length;
  for (const [token, df] of docFreq.entries()) {
    idf.set(token, Math.log((n + 1) / (df + 1)) + 1);
  }
  return idf;
}

function scoreDoc(queryTokens: string[], doc: RetrievalDocument, idf: Map<string, number>): number {
  const tf = buildTermFrequencies(tokenize(doc.text));
  let score = 0;
  for (const token of queryTokens) {
    const termFreq = tf.get(token) ?? 0;
    if (termFreq === 0) continue;
    score += termFreq * (idf.get(token) ?? 1);
  }
  if (doc.kind === "table_row") score *= 1.05;
  return score;
}

function getExpectedDocIds(item: EvalItem, docs: RetrievalDocument[]): Set<string> {
  const expected = new Set<string>();
  for (const doc of docs) {
    const text = doc.text.toLowerCase();
    const requiredOk = item.required_terms.every((term) => text.includes(term.toLowerCase()));
    const optionalOk = item.optional_terms.some((term) => text.includes(term.toLowerCase()));
    if (requiredOk || (item.required_terms.slice(0, 2).every((term) => text.includes(term)) && optionalOk)) {
      expected.add(doc.doc_id);
    }
  }
  return expected;
}

function groundingScore(doc: RetrievalDocument): number {
  let score = 0;
  if (doc.page_start > 0 && doc.page_end >= doc.page_start) score += 0.4;
  if (doc.chunk_id) score += 0.3;
  if (doc.source_url) score += 0.15;
  if (doc.source_sha256) score += 0.15;
  return score;
}

async function loadGoldMap(filePath: string): Promise<Map<string, Set<string>>> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as GoldFile;
  const map = new Map<string, Set<string>>();
  for (const item of parsed.items ?? []) {
    map.set(item.id, new Set(item.relevant_doc_ids ?? []));
  }
  return map;
}

function precisionAtK(topDocIds: string[], gold: Set<string>, k: number): number {
  if (k <= 0) return 0;
  let relevant = 0;
  for (let i = 0; i < Math.min(k, topDocIds.length); i += 1) {
    if (gold.has(topDocIds[i])) relevant += 1;
  }
  return relevant / k;
}

function mrr(topDocIds: string[], gold: Set<string>, k: number): number {
  for (let i = 0; i < Math.min(k, topDocIds.length); i += 1) {
    if (gold.has(topDocIds[i])) return 1 / (i + 1);
  }
  return 0;
}

function ndcgAtK(topDocIds: string[], gold: Set<string>, k: number): number {
  let dcg = 0;
  const limit = Math.min(k, topDocIds.length);
  for (let i = 0; i < limit; i += 1) {
    const rel = gold.has(topDocIds[i]) ? 1 : 0;
    if (rel > 0) {
      dcg += 1 / Math.log2(i + 2);
    }
  }
  const idealRelevant = Math.min(k, gold.size);
  if (idealRelevant === 0) return 0;
  let idcg = 0;
  for (let i = 0; i < idealRelevant; i += 1) {
    idcg += 1 / Math.log2(i + 2);
  }
  return idcg === 0 ? 0 : dcg / idcg;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const snapshotDate = await resolveSnapshotDate(opts.townSlug, opts.date);
  const phase1Dir = resolveFromCwd(opts.outputRoot, opts.townSlug, snapshotDate, opts.sourceType, "phase1");
  const phase2TablesDir = resolveFromCwd(
    opts.outputRoot,
    opts.townSlug,
    snapshotDate,
    opts.sourceType,
    "phase2_adu_tables"
  );
  const outDir = resolveFromCwd(opts.outputRoot, opts.townSlug, snapshotDate, opts.sourceType, "phase2_adu_eval");
  const goldPath =
    opts.goldFile !== undefined ? resolveFromCwd(opts.goldFile) : path.join(outDir, "gold_citations.json");

  logStep(`Using Phase 1 input: ${phase1Dir}`);
  const chunks = await readJsonlFile<ChunkRecord>(path.join(phase1Dir, "chunks_all.jsonl"));
  if (chunks.length === 0) {
    throw new Error("No chunks found. Re-run build:corpus first.");
  }

  let tables: TableRecord[] = [];
  try {
    const tablesJson = JSON.parse(await readFile(path.join(phase2TablesDir, "adu_tables.json"), "utf8")) as TablesFile;
    tables = tablesJson.tables ?? [];
  } catch {
    logStep("No phase2_adu_tables/adu_tables.json found. Running evaluation on chunks only.");
  }

  const docs = buildDocuments(chunks, tables);
  if (docs.length === 0) {
    throw new Error("No retrieval documents available for evaluation.");
  }

  let goldMap = new Map<string, Set<string>>();
  let goldLoaded = false;
  try {
    goldMap = await loadGoldMap(goldPath);
    goldLoaded = true;
    logStep(`Loaded gold citations from ${goldPath}`);
  } catch {
    logStep(`No usable gold file at ${goldPath}. Gold metrics will be null.`);
  }

  const evalItems = buildEvalItems();
  const idf = buildIdf(docs);
  const results: Array<{
    id: string;
    question: string;
    hit: boolean;
    expected_doc_count: number;
    top_k: number;
    citation_quality_avg: number;
    gold_relevant_count: number;
    precision_at_k: number | null;
    mrr_at_k: number | null;
    ndcg_at_k: number | null;
    top_results: Array<{
      rank: number;
      doc_id: string;
      kind: string;
      score: number;
      page_start: number;
      page_end: number;
      chunk_id: string | null;
      table_id: string | null;
      table_ref: string | null;
      grounding_score: number;
      is_gold_relevant: boolean | null;
    }>;
  }> = [];

  for (const item of evalItems) {
    const query = `${item.question} ${item.required_terms.join(" ")} ${item.optional_terms.join(" ")}`.trim();
    const queryTokens = tokenize(query);
    const scored: ScoredDoc[] = docs
      .map((doc) => ({ ...doc, score: scoreDoc(queryTokens, doc, idf) }))
      .filter((doc) => doc.score > 0)
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, opts.topK);
    const expectedDocIds = getExpectedDocIds(item, docs);
    const hit = top.some((doc) => expectedDocIds.has(doc.doc_id));
    const qualityAvg =
      top.length > 0
        ? Number((top.reduce((sum, doc) => sum + groundingScore(doc), 0) / top.length).toFixed(3))
        : 0;

    const goldRelevant = goldMap.get(item.id) ?? new Set<string>();
    const topDocIds = top.map((doc) => doc.doc_id);
    const precision = goldRelevant.size > 0 ? precisionAtK(topDocIds, goldRelevant, opts.topK) : null;
    const mrrValue = goldRelevant.size > 0 ? mrr(topDocIds, goldRelevant, opts.topK) : null;
    const ndcgValue = goldRelevant.size > 0 ? ndcgAtK(topDocIds, goldRelevant, opts.topK) : null;

    results.push({
      id: item.id,
      question: item.question,
      hit,
      expected_doc_count: expectedDocIds.size,
      top_k: opts.topK,
      citation_quality_avg: qualityAvg,
      gold_relevant_count: goldRelevant.size,
      precision_at_k: precision !== null ? Number(precision.toFixed(4)) : null,
      mrr_at_k: mrrValue !== null ? Number(mrrValue.toFixed(4)) : null,
      ndcg_at_k: ndcgValue !== null ? Number(ndcgValue.toFixed(4)) : null,
      top_results: top.map((doc, index) => ({
        rank: index + 1,
        doc_id: doc.doc_id,
        kind: doc.kind,
        score: Number(doc.score.toFixed(4)),
        page_start: doc.page_start,
        page_end: doc.page_end,
        chunk_id: doc.chunk_id,
        table_id: doc.table_id,
        table_ref: doc.table_ref,
        grounding_score: Number(groundingScore(doc).toFixed(3)),
        is_gold_relevant: goldRelevant.size > 0 ? goldRelevant.has(doc.doc_id) : null
      }))
    });
  }

  const hitCount = results.filter((result) => result.hit).length;
  const citationQualityAvg =
    results.length > 0
      ? Number((results.reduce((sum, result) => sum + result.citation_quality_avg, 0) / results.length).toFixed(3))
      : 0;

  const goldEligible = results.filter((result) => result.gold_relevant_count > 0);
  const meanPrecisionAtK =
    goldEligible.length > 0
      ? Number(
          (
            goldEligible.reduce((sum, result) => sum + (result.precision_at_k ?? 0), 0) / goldEligible.length
          ).toFixed(4)
        )
      : null;
  const meanMrrAtK =
    goldEligible.length > 0
      ? Number((goldEligible.reduce((sum, result) => sum + (result.mrr_at_k ?? 0), 0) / goldEligible.length).toFixed(4))
      : null;
  const meanNdcgAtK =
    goldEligible.length > 0
      ? Number(
          (goldEligible.reduce((sum, result) => sum + (result.ndcg_at_k ?? 0), 0) / goldEligible.length).toFixed(4)
        )
      : null;

  await ensureDir(outDir);
  await writeJson(path.join(outDir, "eval_set.json"), {
    town_slug: opts.townSlug,
    source_type: opts.sourceType,
    snapshot_date: snapshotDate,
    generation_method:
      "Programmatic ADU-oriented prompts with expected grounding derived from corpus term constraints (no manual ordinance annotation).",
    items: evalItems
  });
  await writeFile(
    path.join(outDir, "retrieval_results.jsonl"),
    results.map((result) => JSON.stringify(result)).join("\n") + "\n",
    "utf8"
  );

  if (opts.writeGoldTemplate) {
    await writeJson(path.join(outDir, "gold_citations.template.json"), {
      town_slug: opts.townSlug,
      source_type: opts.sourceType,
      snapshot_date: snapshotDate,
      instructions:
        "For each item, copy accepted doc_ids from candidate_doc_ids into relevant_doc_ids after human verification.",
      items: results.map((result) => ({
        id: result.id,
        question: result.question,
        relevant_doc_ids: [],
        candidate_doc_ids: result.top_results.map((top) => top.doc_id)
      }))
    });
  }

  await writeJson(path.join(outDir, "scored_report.json"), {
    town_slug: opts.townSlug,
    source_type: opts.sourceType,
    snapshot_date: snapshotDate,
    retrieval_documents_total: docs.length,
    chunk_documents: chunks.length,
    table_documents: docs.filter((doc) => doc.kind === "table_row").length,
    question_count: results.length,
    retrieval_hits: hitCount,
    retrieval_hit_rate: Number((hitCount / results.length).toFixed(3)),
    citation_quality_avg: citationQualityAvg,
    top_k: opts.topK,
    gold_file: goldLoaded ? goldPath : null,
    gold_questions_labeled: goldEligible.length,
    mean_precision_at_k: meanPrecisionAtK,
    mean_mrr_at_k: meanMrrAtK,
    mean_ndcg_at_k: meanNdcgAtK
  });

  logStep(
    `Done. questions=${results.length}, hit_rate=${Number((hitCount / results.length).toFixed(3))}, citation_quality_avg=${citationQualityAvg}, gold_labeled=${goldEligible.length}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase2-eval] ${message}`);
  process.exit(1);
});
