import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, resolveFromCwd } from "./utils/fs.js";
import { slugifyTown } from "./utils/slugify.js";

type Command = "validate" | "summary" | "build-batch" | "add-discovered";

type JurisdictionType = "city" | "town" | "county" | "village" | "other";
type SourceSystem = "municode" | "direct_pdf" | "ecode" | "other" | "unknown";
type DocumentKind = "udo" | "zoning_ordinance" | "land_development_code" | "code_of_ordinances" | "unknown";
type InventoryStatus = "discovered" | "source_found" | "grab_ready" | "grabbed" | "failed" | "needs_review";

interface CliOptions {
  command: Command;
  file: string;
  out?: string;
  includeGrabbed: boolean;
  jurisdictionName?: string;
  jurisdictionType?: JurisdictionType;
  state: string;
  countyName?: string;
  notes: string;
  tags: string[];
  discoveredAt?: string;
}

interface JurisdictionRecord {
  jurisdiction_slug: string;
  jurisdiction_name: string;
  jurisdiction_type: JurisdictionType;
  state: string;
  county_name: string | null;
  source_system: SourceSystem;
  landing_url: string | null;
  pdf_url: string | null;
  document_kind: DocumentKind;
  status: InventoryStatus;
  notes: string;
  discovered_at: string | null;
  last_checked_at: string | null;
  last_successful_snapshot_date: string | null;
  tags: string[];
}

interface GrabBothJob {
  town_slug: string;
  town_name: string;
  municode_url?: string;
  pdf_url?: string;
}

const JURISDICTION_TYPES = new Set<JurisdictionType>(["city", "town", "county", "village", "other"]);
const SOURCE_SYSTEMS = new Set<SourceSystem>(["municode", "direct_pdf", "ecode", "other", "unknown"]);
const DOCUMENT_KINDS = new Set<DocumentKind>([
  "udo",
  "zoning_ordinance",
  "land_development_code",
  "code_of_ordinances",
  "unknown"
]);
const INVENTORY_STATUSES = new Set<InventoryStatus>([
  "discovered",
  "source_found",
  "grab_ready",
  "grabbed",
  "failed",
  "needs_review"
]);
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function logStep(message: string): void {
  console.log(`[inventory] ${message}`);
}

function parseArgs(argv: string[]): CliOptions {
  let command: Command = "summary";
  const opts: CliOptions = {
    command,
    file: "inventory/jurisdictions.jsonl",
    includeGrabbed: false,
    state: "IN",
    notes: "",
    tags: []
  };

  if (argv.length > 0 && !argv[0].startsWith("--")) {
    const value = argv[0];
    if (value === "validate" || value === "summary" || value === "build-batch" || value === "add-discovered") {
      command = value;
      opts.command = value;
    }
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") {
      opts.file = argv[i + 1] ?? opts.file;
      i += 1;
    } else if (arg === "--out") {
      opts.out = argv[i + 1];
      i += 1;
    } else if (arg === "--include-grabbed") {
      opts.includeGrabbed = true;
    } else if (arg === "--name") {
      opts.jurisdictionName = argv[i + 1];
      i += 1;
    } else if (arg === "--type") {
      const value = argv[i + 1] as JurisdictionType | undefined;
      if (value && JURISDICTION_TYPES.has(value)) {
        opts.jurisdictionType = value;
      }
      i += 1;
    } else if (arg === "--state") {
      opts.state = argv[i + 1] ?? opts.state;
      i += 1;
    } else if (arg === "--county") {
      opts.countyName = argv[i + 1];
      i += 1;
    } else if (arg === "--notes") {
      opts.notes = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--tags") {
      opts.tags = (argv[i + 1] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      i += 1;
    } else if (arg === "--discovered-at") {
      opts.discoveredAt = argv[i + 1];
      i += 1;
    }
  }

  return opts;
}

async function readJsonlFile(filePath: string): Promise<JurisdictionRecord[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const records: JurisdictionRecord[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    try {
      records.push(JSON.parse(line) as JurisdictionRecord);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON on line ${i + 1}: ${message}`);
    }
  }

  return records;
}

async function writeJsonlFile(filePath: string, records: JurisdictionRecord[]): Promise<void> {
  const body = records.map((record) => JSON.stringify(record)).join("\n");
  await writeFile(filePath, body.length > 0 ? `${body}\n` : "", "utf8");
}

function isValidUrl(value: string | null): boolean {
  if (value === null) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isMunicodeUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    return new URL(value).hostname === "library.municode.com";
  } catch {
    return false;
  }
}

function looksLikePdfUrl(value: string | null): boolean {
  return value !== null && /\.pdf(\?|$)/i.test(value);
}

function supportsDirectPdfFetch(record: JurisdictionRecord): boolean {
  return record.source_system === "direct_pdf" && record.pdf_url !== null;
}

function validateDateField(value: string | null, fieldName: string, problems: string[]): void {
  if (value === null) return;
  if (!DATE_REGEX.test(value)) {
    problems.push(`${fieldName} must use YYYY-MM-DD or null`);
  }
}

function validateRecord(record: JurisdictionRecord, index: number): string[] {
  const problems: string[] = [];
  const prefix = `record ${index + 1} (${record.jurisdiction_name || "unknown"})`;

  if (!record.jurisdiction_slug || slugifyTown(record.jurisdiction_slug) !== record.jurisdiction_slug) {
    problems.push(`${prefix}: jurisdiction_slug must be lowercase slug text`);
  }
  if (!record.jurisdiction_name?.trim()) problems.push(`${prefix}: jurisdiction_name is required`);
  if (!JURISDICTION_TYPES.has(record.jurisdiction_type)) {
    problems.push(`${prefix}: invalid jurisdiction_type`);
  }
  if (!record.state?.trim()) problems.push(`${prefix}: state is required`);
  if (!SOURCE_SYSTEMS.has(record.source_system)) problems.push(`${prefix}: invalid source_system`);
  if (!DOCUMENT_KINDS.has(record.document_kind)) problems.push(`${prefix}: invalid document_kind`);
  if (!INVENTORY_STATUSES.has(record.status)) problems.push(`${prefix}: invalid status`);
  if (!Array.isArray(record.tags)) problems.push(`${prefix}: tags must be an array`);
  if (!isValidUrl(record.landing_url)) problems.push(`${prefix}: landing_url must be a valid URL or null`);
  if (!isValidUrl(record.pdf_url)) problems.push(`${prefix}: pdf_url must be a valid URL or null`);
  if (record.pdf_url && !looksLikePdfUrl(record.pdf_url) && !supportsDirectPdfFetch(record)) {
    problems.push(`${prefix}: pdf_url should look like a direct PDF URL`);
  }

  validateDateField(record.discovered_at, `${prefix}: discovered_at`, problems);
  validateDateField(record.last_checked_at, `${prefix}: last_checked_at`, problems);
  validateDateField(
    record.last_successful_snapshot_date,
    `${prefix}: last_successful_snapshot_date`,
    problems
  );

  if (record.status === "grabbed" && !record.last_successful_snapshot_date) {
    problems.push(`${prefix}: grabbed records should include last_successful_snapshot_date`);
  }
  if (record.source_system === "municode" && record.landing_url && !isMunicodeUrl(record.landing_url)) {
    problems.push(`${prefix}: source_system=municode but landing_url is not a Municode URL`);
  }
  if (record.status === "grab_ready" && !buildGrabJob(record)) {
    problems.push(`${prefix}: grab_ready record does not have supported grab URLs yet`);
  }

  return problems;
}

function buildGrabJob(record: JurisdictionRecord): GrabBothJob | null {
  const municodeUrl = isMunicodeUrl(record.landing_url) ? record.landing_url ?? undefined : undefined;
  const pdfUrl =
    (looksLikePdfUrl(record.pdf_url) || supportsDirectPdfFetch(record)) && record.pdf_url
      ? record.pdf_url
      : undefined;

  if (!municodeUrl && !pdfUrl) {
    return null;
  }

  return {
    town_slug: record.jurisdiction_slug,
    town_name: record.jurisdiction_name,
    ...(municodeUrl ? { municode_url: municodeUrl } : {}),
    ...(pdfUrl ? { pdf_url: pdfUrl } : {})
  };
}

function summarize(records: JurisdictionRecord[]): void {
  const byStatus = new Map<string, number>();
  const byType = new Map<string, number>();
  const bySourceSystem = new Map<string, number>();
  let supportedGrabCount = 0;

  for (const record of records) {
    byStatus.set(record.status, (byStatus.get(record.status) ?? 0) + 1);
    byType.set(record.jurisdiction_type, (byType.get(record.jurisdiction_type) ?? 0) + 1);
    bySourceSystem.set(record.source_system, (bySourceSystem.get(record.source_system) ?? 0) + 1);
    if (buildGrabJob(record)) supportedGrabCount += 1;
  }

  logStep(`records=${records.length}`);
  logStep(`supported_by_current_grabber=${supportedGrabCount}`);
  logStep(`status_breakdown=${JSON.stringify(Object.fromEntries([...byStatus.entries()].sort()))}`);
  logStep(`type_breakdown=${JSON.stringify(Object.fromEntries([...byType.entries()].sort()))}`);
  logStep(`source_system_breakdown=${JSON.stringify(Object.fromEntries([...bySourceSystem.entries()].sort()))}`);
}

async function buildBatch(records: JurisdictionRecord[], opts: CliOptions): Promise<void> {
  const selectedStatuses = new Set<InventoryStatus>(
    opts.includeGrabbed ? ["grab_ready", "grabbed"] : ["grab_ready"]
  );

  const jobs = records
    .filter((record) => selectedStatuses.has(record.status))
    .map((record) => buildGrabJob(record))
    .filter((job): job is GrabBothJob => job !== null);

  const outPath = resolveFromCwd(opts.out ?? "inventory/batches/jurisdictions-ready.jsonl");
  await ensureDir(path.dirname(outPath));
  await writeFile(outPath, jobs.map((job) => JSON.stringify(job)).join("\n") + (jobs.length > 0 ? "\n" : ""), "utf8");
  logStep(`Wrote ${jobs.length} ready grab record(s) to ${outPath}`);
}

function buildDiscoveredRecord(opts: CliOptions): JurisdictionRecord {
  if (!opts.jurisdictionName?.trim()) {
    throw new Error("add-discovered requires --name");
  }
  if (!opts.jurisdictionType) {
    throw new Error("add-discovered requires --type city|town|county|village|other");
  }

  const discoveredAt = opts.discoveredAt ?? new Date().toISOString().slice(0, 10);
  if (!DATE_REGEX.test(discoveredAt)) {
    throw new Error("--discovered-at must use YYYY-MM-DD");
  }

  return {
    jurisdiction_slug: slugifyTown(opts.jurisdictionName),
    jurisdiction_name: opts.jurisdictionName.trim(),
    jurisdiction_type: opts.jurisdictionType,
    state: opts.state.trim(),
    county_name: opts.countyName?.trim() || null,
    source_system: "unknown",
    landing_url: null,
    pdf_url: null,
    document_kind: "unknown",
    status: "discovered",
    notes: opts.notes,
    discovered_at: discoveredAt,
    last_checked_at: null,
    last_successful_snapshot_date: null,
    tags: opts.tags
  };
}

async function addDiscoveredRecord(records: JurisdictionRecord[], opts: CliOptions): Promise<void> {
  const record = buildDiscoveredRecord(opts);
  const existing = records.find((item) => item.jurisdiction_slug === record.jurisdiction_slug);
  if (existing) {
    throw new Error(`A record with slug "${record.jurisdiction_slug}" already exists.`);
  }

  const outPath = resolveFromCwd(opts.file);
  const next = [...records, record].sort((a, b) => a.jurisdiction_slug.localeCompare(b.jurisdiction_slug));
  await ensureDir(path.dirname(outPath));
  await writeJsonlFile(outPath, next);
  logStep(`Added discovered jurisdiction ${record.jurisdiction_name} (${record.jurisdiction_slug}) to ${outPath}`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const filePath = resolveFromCwd(opts.file);
  const records = await readJsonlFile(filePath);

  if (opts.command === "add-discovered") {
    await addDiscoveredRecord(records, opts);
    return;
  }

  const problems = records.flatMap((record, index) => validateRecord(record, index));
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`[inventory] ${problem}`);
    }
    throw new Error(`Validation failed with ${problems.length} problem(s).`);
  }

  if (opts.command === "validate") {
    logStep(`Validation passed for ${records.length} record(s).`);
    return;
  }

  if (opts.command === "summary") {
    summarize(records);
    return;
  }

  await buildBatch(records, opts);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[inventory] ${message}`);
  process.exit(1);
});
