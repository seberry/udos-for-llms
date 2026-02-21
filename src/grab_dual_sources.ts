import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  firefox,
  webkit,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Download,
  type Locator,
  type Page,
  type Response
} from "playwright";
import { ensureDir, readLines, resolveFromCwd, writeJson } from "./utils/fs.js";
import { sha256File } from "./utils/hash.js";
import { slugifyTown, titleCaseFromSlug } from "./utils/slugify.js";
import { dateStampInZone, isoWithZoneOffset } from "./utils/time.js";

type BrowserName = "chromium" | "firefox" | "webkit";
type SourceType = "municode" | "city_pdf";

interface GrabConfig {
  timezone: string;
  outputRoot: string;
  browser: BrowserName;
  headless: boolean;
  saveScreenshot: boolean;
  navigationTimeoutMs: number;
  downloadTimeoutMs: number;
  maxAttempts: number;
}

interface CliOptions {
  townSlug?: string;
  townName?: string;
  municodeUrl?: string;
  pdfUrl?: string;
  file?: string;
  dryRun: boolean;
  browser?: BrowserName;
  headless?: boolean;
}

interface JobSpec {
  townSlug?: string;
  townName?: string;
  municodeUrl?: string;
  pdfUrl?: string;
}

interface PreviousSnapshot {
  date: string;
  sha256: string;
}

interface SourceRunResult {
  sourceType: SourceType;
  sourceUrl: string;
  outputDir: string;
  userAgent: string;
  downloadUrl: string | null;
  downloadMethod: string;
  sha256?: string;
  previous?: PreviousSnapshot;
  changedSincePrevious?: boolean | null;
}

type CaptureResult =
  | { kind: "download"; download: Download; downloadUrl: string | null }
  | { kind: "buffer"; buffer: Buffer; downloadUrl: string };

const DEFAULT_CONFIG: GrabConfig = {
  timezone: "America/Indiana/Indianapolis",
  outputRoot: "sources",
  browser: "chromium",
  headless: true,
  saveScreenshot: true,
  navigationTimeoutMs: 60_000,
  downloadTimeoutMs: 45_000,
  maxAttempts: 2
};

const DOWNLOAD_NAME_REGEX = /download\s*(publication\s*)?pdf/i;
const PDF_NAME_REGEX = /\bpdf\b/i;
const MENU_NAME_REGEX = /\b(print|export|share|more|menu)\b/i;

function logStep(message: string): void {
  console.log(`[grab-both] ${message}`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--town-slug") {
      opts.townSlug = argv[i + 1];
      i += 1;
    } else if (arg === "--town-name") {
      opts.townName = argv[i + 1];
      i += 1;
    } else if (arg === "--municode-url") {
      opts.municodeUrl = argv[i + 1];
      i += 1;
    } else if (arg === "--pdf-url") {
      opts.pdfUrl = argv[i + 1];
      i += 1;
    } else if (arg === "--file") {
      opts.file = argv[i + 1];
      i += 1;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--browser") {
      const value = argv[i + 1] as BrowserName | undefined;
      if (value && ["chromium", "firefox", "webkit"].includes(value)) {
        opts.browser = value;
      }
      i += 1;
    } else if (arg === "--headless") {
      opts.headless = true;
    } else if (arg === "--headed") {
      opts.headless = false;
    }
  }
  return opts;
}

function parseManifestLine(line: string): JobSpec {
  const trimmed = line.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      townSlug: typeof parsed.town_slug === "string" ? parsed.town_slug : undefined,
      townName: typeof parsed.town_name === "string" ? parsed.town_name : undefined,
      municodeUrl: typeof parsed.municode_url === "string" ? parsed.municode_url : undefined,
      pdfUrl: typeof parsed.pdf_url === "string" ? parsed.pdf_url : undefined
    };
  }

  const pipeParts = trimmed.split("|").map((part) => part.trim());
  if (pipeParts.length === 4) {
    return {
      townSlug: pipeParts[0] || undefined,
      townName: pipeParts[1] || undefined,
      municodeUrl: pipeParts[2] || undefined,
      pdfUrl: pipeParts[3] || undefined
    };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return isValidMunicodeUrl(trimmed) ? { municodeUrl: trimmed } : { pdfUrl: trimmed };
  }

  throw new Error(
    `Invalid manifest line: "${line}". Use JSONL or pipe format: town_slug|town_name|municode_url|pdf_url`
  );
}

async function gatherJobs(cli: CliOptions): Promise<JobSpec[]> {
  const inlineJob: JobSpec = {
    townSlug: cli.townSlug,
    townName: cli.townName,
    municodeUrl: cli.municodeUrl,
    pdfUrl: cli.pdfUrl
  };

  const jobs: JobSpec[] = [];
  if (inlineJob.municodeUrl || inlineJob.pdfUrl) {
    jobs.push(inlineJob);
  }

  if (cli.file) {
    const lines = await readLines(resolveFromCwd(cli.file));
    for (const line of lines) {
      jobs.push(parseManifestLine(line));
    }
  }

  if (jobs.length === 0) {
    throw new Error("Provide --file and/or at least one source via --municode-url and/or --pdf-url.");
  }
  return jobs;
}

function validateJob(job: JobSpec): void {
  if (!job.municodeUrl && !job.pdfUrl) {
    throw new Error("Each job requires at least one source URL (municode_url and/or pdf_url).");
  }
  if (job.municodeUrl && !isValidMunicodeUrl(job.municodeUrl)) {
    throw new Error(`Invalid municode URL: ${job.municodeUrl}`);
  }
  if (job.pdfUrl && !isValidUrl(job.pdfUrl)) {
    throw new Error(`Invalid direct PDF URL: ${job.pdfUrl}`);
  }
}

async function loadConfig(): Promise<GrabConfig> {
  const configPath = resolveFromCwd("grab.config.json");
  try {
    const loaded = await import(configPath, { with: { type: "json" } });
    const parsed = loaded.default as Partial<GrabConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function mergeConfig(base: GrabConfig, cli: CliOptions): GrabConfig {
  return {
    ...base,
    ...(cli.browser ? { browser: cli.browser } : {}),
    ...(typeof cli.headless === "boolean" ? { headless: cli.headless } : {})
  };
}

function isValidUrl(input: string): boolean {
  try {
    new URL(input);
    return true;
  } catch {
    return false;
  }
}

function isValidMunicodeUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.hostname === "library.municode.com";
  } catch {
    return false;
  }
}

function deriveTownSlug(municodeUrl?: string, pdfUrl?: string): string {
  if (municodeUrl) {
    const parsed = new URL(municodeUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const candidate = segments.at(-1) ?? "unknown-town";
    return slugifyTown(candidate || "unknown-town");
  }
  if (pdfUrl) {
    const parsed = new URL(pdfUrl);
    const seg = parsed.pathname.split("/").filter(Boolean).at(-1) ?? parsed.hostname;
    return slugifyTown(seg.replace(/\.pdf$/i, "") || "unknown-town");
  }
  return "unknown-town";
}

function getBrowserLauncher(name: BrowserName) {
  if (name === "firefox") return firefox;
  if (name === "webkit") return webkit;
  return chromium;
}

function parseTownDisplayName(slug: string): string {
  return titleCaseFromSlug(slug) || "Unknown Town";
}

async function gotoLandingPage(page: Page, url: string, timeoutMs: number): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  try {
    await page.waitForLoadState("networkidle", { timeout: 8_000 });
  } catch {
    logStep("Network idle wait timed out; continuing.");
  }
}

async function firstVisibleLocator(candidates: Locator[]): Promise<Locator | null> {
  for (const locator of candidates) {
    const count = Math.min(await locator.count().catch(() => 0), 10);
    for (let i = 0; i < count; i += 1) {
      const option = locator.nth(i);
      if (await option.isVisible().catch(() => false)) {
        return option;
      }
    }
  }
  return null;
}

function buildDirectDownloadCandidates(page: Page): Locator[] {
  return [
    page.getByRole("button", { name: DOWNLOAD_NAME_REGEX }),
    page.getByRole("link", { name: DOWNLOAD_NAME_REGEX }),
    page.locator("button", { hasText: DOWNLOAD_NAME_REGEX }),
    page.locator("a", { hasText: DOWNLOAD_NAME_REGEX }),
    page.locator("[role='menuitem']", { hasText: DOWNLOAD_NAME_REGEX })
  ];
}

function buildPdfFallbackCandidates(page: Page): Locator[] {
  return [
    page.getByRole("button", { name: PDF_NAME_REGEX }),
    page.getByRole("link", { name: PDF_NAME_REGEX }),
    page.locator("[role='menuitem']", { hasText: PDF_NAME_REGEX }),
    page.locator("button", { hasText: PDF_NAME_REGEX }),
    page.locator("a", { hasText: PDF_NAME_REGEX })
  ];
}

function buildFollowupDownloadCandidates(page: Page): Locator[] {
  return [
    page.locator("button.get-pdf-download-btn"),
    page.getByRole("button", { name: /^download\s*pdf$/i }),
    page.getByRole("button", { name: /download\s*(publication\s*)?pdf/i }),
    page.locator("button", { hasText: /^download\s*pdf$/i }),
    page.locator("[role='menuitem']", { hasText: /^download\s*pdf$/i })
  ];
}

async function findMunicodeDownloadControl(page: Page): Promise<{ locator: Locator; method: string }> {
  const direct = await firstVisibleLocator(buildDirectDownloadCandidates(page));
  if (direct) {
    return { locator: direct, method: "Clicked direct 'Download PDF' control." };
  }

  const menuButtons = page.getByRole("button", { name: MENU_NAME_REGEX });
  const menuCount = Math.min(await menuButtons.count(), 6);
  for (let i = 0; i < menuCount; i += 1) {
    const menuBtn = menuButtons.nth(i);
    const visible = await menuBtn.isVisible().catch(() => false);
    if (!visible) continue;
    await menuBtn.click({ timeout: 5_000 });
    await page.waitForTimeout(400);

    const afterMenuDirect = await firstVisibleLocator(buildDirectDownloadCandidates(page));
    if (afterMenuDirect) {
      return { locator: afterMenuDirect, method: "Opened menu then clicked 'Download PDF' control." };
    }

    const afterMenuPdf = await firstVisibleLocator(buildPdfFallbackCandidates(page));
    if (afterMenuPdf) {
      const text = (await afterMenuPdf.textContent()) ?? "";
      if (!/print/i.test(text)) {
        return { locator: afterMenuPdf, method: "Opened menu then clicked PDF option." };
      }
    }

    await page.keyboard.press("Escape").catch(() => undefined);
  }

  throw new Error(
    "Could not find a Municode PDF download control. Try the city root page (e.g., /in/bloomington) instead of a deep nodeId URL."
  );
}

function looksLikePdfUrl(input: string | null | undefined): input is string {
  if (!input) return false;
  return /\.pdf(\?|$)/i.test(input) || /download/i.test(input);
}

function isLikelyPdfResponse(response: Response | APIResponse): boolean {
  const headers = response.headers();
  const contentType = headers["content-type"] ?? headers["Content-Type"] ?? "";
  return /pdf/i.test(contentType) || looksLikePdfUrl(response.url());
}

async function locatorHref(page: Page, locator: Locator): Promise<string | null> {
  const href = await locator
    .evaluate((el) => (el instanceof HTMLAnchorElement ? el.getAttribute("href") : null))
    .catch(() => null);
  if (!href) return null;
  try {
    return new URL(href, page.url()).toString();
  } catch {
    return null;
  }
}

async function fetchPdfByUrl(context: BrowserContext, url: string, timeoutMs: number): Promise<Buffer | null> {
  const response = await context.request.get(url, { timeout: timeoutMs }).catch(() => null);
  if (!response || !response.ok()) return null;
  const body = Buffer.from(await response.body());
  const looksLikePdfBytes = body.subarray(0, 4).toString("ascii") === "%PDF";
  if (isLikelyPdfResponse(response) || looksLikePdfBytes) return body;
  return null;
}

async function observeCaptureAfterClick(
  page: Page,
  locator: Locator,
  timeoutMs: number
): Promise<{ download: Download | null; response: Response | null; popup: Page | null }> {
  const pageDownloadPromise = page.waitForEvent("download", { timeout: timeoutMs }).catch(() => null);
  const responsePromise = page
    .waitForResponse((response) => isLikelyPdfResponse(response), { timeout: timeoutMs })
    .catch(() => null);
  const popupPromise = page.waitForEvent("popup", { timeout: timeoutMs }).catch(() => null);

  await locator.click({ timeout: 10_000 });
  const [download, response, popup] = await Promise.all([pageDownloadPromise, responsePromise, popupPromise]);
  return { download, response, popup };
}

async function clickAndCaptureMunicodePdf(
  page: Page,
  context: BrowserContext,
  locator: Locator,
  timeoutMs: number
): Promise<CaptureResult> {
  const hrefPromise = locatorHref(page, locator);
  let captured = await observeCaptureAfterClick(page, locator, timeoutMs);
  if (!captured.download && !captured.response) {
    const followup = await firstVisibleLocator(buildFollowupDownloadCandidates(page));
    if (followup) {
      logStep("Initial click opened secondary download control; clicking follow-up control.");
      captured = await observeCaptureAfterClick(page, followup, timeoutMs);
    }
  }

  if (captured.download) {
    return { kind: "download", download: captured.download, downloadUrl: captured.download.url() || null };
  }

  if (captured.response && captured.response.ok()) {
    return {
      kind: "buffer",
      buffer: Buffer.from(await captured.response.body()),
      downloadUrl: captured.response.url()
    };
  }

  if (captured.popup) {
    const popup = captured.popup;
    const popupDownload = await popup.waitForEvent("download", { timeout: 10_000 }).catch(() => null);
    if (popupDownload) {
      return { kind: "download", download: popupDownload, downloadUrl: popupDownload.url() || null };
    }
    const popupResponse = await popup
      .waitForResponse((resp) => isLikelyPdfResponse(resp), { timeout: 8_000 })
      .catch(() => null);
    if (popupResponse && popupResponse.ok()) {
      return {
        kind: "buffer",
        buffer: Buffer.from(await popupResponse.body()),
        downloadUrl: popupResponse.url()
      };
    }
    const popupUrl = popup.url();
    if (looksLikePdfUrl(popupUrl)) {
      const body = await fetchPdfByUrl(context, popupUrl, timeoutMs);
      if (body) return { kind: "buffer", buffer: body, downloadUrl: popupUrl };
    }
  }

  const href = await hrefPromise;
  const sameTabUrl = page.url();
  const candidates = [...new Set([href, sameTabUrl, captured.popup?.url() ?? null].filter(looksLikePdfUrl))];
  for (const candidate of candidates) {
    const body = await fetchPdfByUrl(context, candidate, timeoutMs);
    if (body) return { kind: "buffer", buffer: body, downloadUrl: candidate };
  }

  throw new Error("PDF click succeeded but no downloadable PDF payload was captured. Site flow may have changed.");
}

async function findPreviousSnapshotHash(
  outputRoot: string,
  townSlug: string,
  sourceType: SourceType,
  currentDateStamp: string
): Promise<PreviousSnapshot | null> {
  const townRoot = resolveFromCwd(outputRoot, townSlug);
  let entries: string[] = [];
  try {
    const dirEntries = await readdir(townRoot, { withFileTypes: true });
    entries = dirEntries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return null;
  }

  const dateDirs = entries
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < currentDateStamp)
    .sort((a, b) => b.localeCompare(a));

  for (const date of dateDirs) {
    const sumsPath = resolveFromCwd(outputRoot, townSlug, date, sourceType, "SHA256SUMS.txt");
    try {
      const text = await readFile(sumsPath, "utf8");
      const match = text.match(/([a-fA-F0-9]{64})\s+udo\.pdf/);
      if (match) {
        return { date, sha256: match[1].toLowerCase() };
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function runMunicodeSource(
  context: BrowserContext,
  config: GrabConfig,
  sourceUrl: string,
  outputDir: string,
  dryRun: boolean
): Promise<Omit<SourceRunResult, "sourceType" | "sourceUrl" | "outputDir" | "sha256" | "previous" | "changedSincePrevious">> {
  const page = await context.newPage();
  page.setDefaultTimeout(config.navigationTimeoutMs);
  logStep(`Navigating to Municode: ${sourceUrl}`);
  await gotoLandingPage(page, sourceUrl, config.navigationTimeoutMs);
  const userAgent = await page.evaluate(() => navigator.userAgent);

  logStep("Locating Municode PDF control.");
  const { locator, method } = await findMunicodeDownloadControl(page);
  if (dryRun) {
    logStep(`[dry-run] Would click Municode control: ${method}`);
    await page.close();
    return { userAgent, downloadUrl: null, downloadMethod: method };
  }

  await ensureDir(outputDir);
  if (config.saveScreenshot) {
    const screenshotPath = path.join(outputDir, "source_page.png");
    logStep(`Saving screenshot: ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  logStep("Capturing Municode PDF payload.");
  const capture = await clickAndCaptureMunicodePdf(page, context, locator, config.downloadTimeoutMs);
  const pdfPath = path.join(outputDir, "udo.pdf");
  let downloadUrl: string | null;
  if (capture.kind === "download") {
    await capture.download.saveAs(pdfPath);
    downloadUrl = capture.downloadUrl;
  } else {
    await writeFile(pdfPath, capture.buffer);
    downloadUrl = capture.downloadUrl;
  }
  await page.close();
  return { userAgent, downloadUrl, downloadMethod: method };
}

async function runCityPdfSource(
  context: BrowserContext,
  config: GrabConfig,
  sourceUrl: string,
  outputDir: string,
  dryRun: boolean
): Promise<Omit<SourceRunResult, "sourceType" | "sourceUrl" | "outputDir" | "sha256" | "previous" | "changedSincePrevious">> {
  const page = await context.newPage();
  const userAgent = await page.evaluate(() => navigator.userAgent);

  if (dryRun) {
    logStep("[dry-run] Would fetch direct PDF URL via Playwright API request.");
    await page.close();
    return {
      userAgent,
      downloadUrl: sourceUrl,
      downloadMethod: "Direct PDF URL fetch (dry-run, no file written)."
    };
  }

  await ensureDir(outputDir);
  if (config.saveScreenshot) {
    const screenshotPath = path.join(outputDir, "source_page.png");
    try {
      await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: config.navigationTimeoutMs });
      logStep(`Saving screenshot: ${screenshotPath}`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      logStep("Skipping city_pdf screenshot because URL triggers direct file download navigation.");
    }
  }

  const response = await context.request.get(sourceUrl, { timeout: config.downloadTimeoutMs });
  if (!response.ok()) {
    await page.close();
    throw new Error(`Direct PDF fetch failed with status ${response.status()} for ${sourceUrl}`);
  }
  const bytes = Buffer.from(await response.body());
  const contentType = response.headers()["content-type"] ?? "";
  const looksLikePdfBytes = bytes.subarray(0, 4).toString("ascii") === "%PDF";
  if (!/pdf/i.test(contentType) && !looksLikePdfBytes) {
    await page.close();
    throw new Error(`Direct URL response was not PDF-like (content-type: ${contentType || "unknown"}).`);
  }

  const pdfPath = path.join(outputDir, "udo.pdf");
  await writeFile(pdfPath, bytes);
  await page.close();
  return {
    userAgent,
    downloadUrl: response.url() || sourceUrl,
    downloadMethod: "Direct PDF URL fetch via Playwright APIRequestContext GET."
  };
}

async function finalizeSnapshot(
  config: GrabConfig,
  townSlug: string,
  townDisplayName: string,
  sourceType: SourceType,
  sourceUrl: string,
  outputDir: string,
  retrievedAtLocal: string,
  userAgent: string,
  downloadUrl: string | null,
  downloadMethod: string
): Promise<SourceRunResult> {
  const pdfPath = path.join(outputDir, "udo.pdf");
  const sha256 = await sha256File(pdfPath);
  const checksumsPath = path.join(outputDir, "SHA256SUMS.txt");
  await writeFile(checksumsPath, `${sha256}  udo.pdf\n`, "utf8");

  const currentDate = dateStampInZone(config.timezone);
  const previous = await findPreviousSnapshotHash(config.outputRoot, townSlug, sourceType, currentDate);
  const changedSincePrevious = previous ? previous.sha256 !== sha256 : null;
  if (previous) {
    logStep(
      `${sourceType}: previous snapshot ${previous.date} was ${changedSincePrevious ? "different" : "identical"} by hash.`
    );
  } else {
    logStep(`${sourceType}: no previous snapshot found for change detection.`);
  }

  await writeJson(path.join(outputDir, "source.json"), {
    town_display_name: townDisplayName,
    town_slug: townSlug,
    source_type: sourceType,
    retrieved_at_local: retrievedAtLocal,
    source_url: sourceUrl,
    download_url: downloadUrl,
    download_method: downloadMethod,
    user_agent: userAgent,
    playwright_browser: config.browser,
    previous_snapshot_date: previous?.date ?? null,
    previous_sha256: previous?.sha256 ?? null,
    content_changed_since_previous: changedSincePrevious,
    notes: "Not legal advice. Verify against official sources."
  });

  return {
    sourceType,
    sourceUrl,
    outputDir,
    userAgent,
    downloadUrl,
    downloadMethod,
    sha256,
    previous: previous ?? undefined,
    changedSincePrevious
  };
}

async function runSourceWithRetry(
  context: BrowserContext,
  config: GrabConfig,
  townSlug: string,
  townDisplayName: string,
  sourceType: SourceType,
  sourceUrl: string,
  dryRun: boolean
): Promise<SourceRunResult> {
  const dateStamp = dateStampInZone(config.timezone);
  const outputDir = resolveFromCwd(config.outputRoot, townSlug, dateStamp, sourceType);
  const retrievedAtLocal = isoWithZoneOffset(config.timezone);

  let lastError: unknown;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      logStep(`Starting ${sourceType} (attempt ${attempt}/${config.maxAttempts}): ${sourceUrl}`);
      const base =
        sourceType === "municode"
          ? await runMunicodeSource(context, config, sourceUrl, outputDir, dryRun)
          : await runCityPdfSource(context, config, sourceUrl, outputDir, dryRun);

      if (dryRun) {
        return {
          sourceType,
          sourceUrl,
          outputDir,
          userAgent: base.userAgent,
          downloadUrl: base.downloadUrl,
          downloadMethod: base.downloadMethod
        };
      }
      return await finalizeSnapshot(
        config,
        townSlug,
        townDisplayName,
        sourceType,
        sourceUrl,
        outputDir,
        retrievedAtLocal,
        base.userAgent,
        base.downloadUrl,
        base.downloadMethod
      );
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      logStep(`Attempt failed for ${sourceType}: ${message}`);
      if (attempt < config.maxAttempts) {
        logStep("Retrying after backoff.");
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const jobs = await gatherJobs(cli);
  for (const job of jobs) validateJob(job);

  const baseConfig = await loadConfig();
  const config = mergeConfig(baseConfig, cli);
  let failed = 0;
  for (let idx = 0; idx < jobs.length; idx += 1) {
    const job = jobs[idx];
    const townSlug = job.townSlug ? slugifyTown(job.townSlug) : deriveTownSlug(job.municodeUrl, job.pdfUrl);
    const townDisplayName = job.townName ?? parseTownDisplayName(townSlug);
    logStep(`Job ${idx + 1}/${jobs.length}: ${townDisplayName} (${townSlug})`);

    logStep(`Launching ${config.browser} (headless=${String(config.headless)}).`);
    const launcher = getBrowserLauncher(config.browser);
    const browser: Browser = await launcher.launch({ headless: config.headless });
    const context = await browser.newContext({ acceptDownloads: true });
    try {
      if (job.municodeUrl) {
        try {
          const result = await runSourceWithRetry(
            context,
            config,
            townSlug,
            townDisplayName,
            "municode",
            job.municodeUrl,
            cli.dryRun
          );
          logStep(`Completed municode -> ${result.outputDir}`);
        } catch (error) {
          failed += 1;
          console.error(`[grab-both] FAILED municode (${townSlug}): ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (job.pdfUrl) {
        try {
          const result = await runSourceWithRetry(
            context,
            config,
            townSlug,
            townDisplayName,
            "city_pdf",
            job.pdfUrl,
            cli.dryRun
          );
          logStep(`Completed city_pdf -> ${result.outputDir}`);
        } catch (error) {
          failed += 1;
          console.error(`[grab-both] FAILED city_pdf (${townSlug}): ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  }

  if (failed > 0) {
    throw new Error(`${failed} source(s) failed.`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[grab-both] ${message}`);
  process.exit(1);
});
