import { writeFile } from "node:fs/promises";
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
  url?: string;
  file?: string;
  dryRun: boolean;
  browser?: BrowserName;
  headless?: boolean;
}

interface GrabResult {
  townDisplayName: string;
  townSlug: string;
  outputDir: string;
  retrievedAtLocal: string;
  downloadUrl: string | null;
  downloadMethod: string;
  userAgent: string;
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
  console.log(`[grab] ${message}`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") {
      opts.url = argv[i + 1];
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

function isValidMunicodeUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.hostname === "library.municode.com";
  } catch {
    return false;
  }
}

function deriveTownSlug(url: string): string {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const candidate = segments.at(-1) ?? "unknown-town";
  return slugifyTown(candidate || "unknown-town");
}

function parseTownDisplayName(slug: string): string {
  return titleCaseFromSlug(slug) || "Unknown Town";
}

function getBrowserLauncher(name: BrowserName) {
  if (name === "firefox") return firefox;
  if (name === "webkit") return webkit;
  return chromium;
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

async function findDownloadControl(page: Page): Promise<{ locator: Locator; method: string }> {
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
    "Could not find a Municode PDF download control. Suggestions: use the city root page (e.g., /in/bloomington), avoid nodeId-only deep links, and verify the page has a 'Download Publication PDF' action."
  );
}

function looksLikePdfUrl(input: string | null | undefined): input is string {
  if (!input) return false;
  return /\.pdf(\?|$)/i.test(input) || /download/i.test(input);
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

function isLikelyPdfResponse(response: Response | APIResponse): boolean {
  const headers = response.headers();
  const contentType = headers["content-type"] ?? headers["Content-Type"] ?? "";
  return /pdf/i.test(contentType) || looksLikePdfUrl(response.url());
}

async function fetchPdfByUrl(context: BrowserContext, url: string, timeoutMs: number): Promise<Buffer | null> {
  const response = await context.request.get(url, { timeout: timeoutMs }).catch(() => null);
  if (!response || !response.ok()) return null;
  const body = Buffer.from(await response.body());
  if (isLikelyPdfResponse(response) || body.subarray(0, 4).toString("ascii") === "%PDF") {
    return body;
  }
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

async function clickAndCapturePdf(
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
    return {
      kind: "download",
      download: captured.download,
      downloadUrl: captured.download.url() || null
    };
  }

  if (captured.response && captured.response.ok()) {
    const body = Buffer.from(await captured.response.body());
    if (body.length > 0) {
      return { kind: "buffer", buffer: body, downloadUrl: captured.response.url() };
    }
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
      const body = Buffer.from(await popupResponse.body());
      if (body.length > 0) {
        return { kind: "buffer", buffer: body, downloadUrl: popupResponse.url() };
      }
    }

    const popupDirectUrl = captured.popup.url();
    if (looksLikePdfUrl(popupDirectUrl)) {
      const body = await fetchPdfByUrl(context, popupDirectUrl, timeoutMs);
      if (body) {
        return { kind: "buffer", buffer: body, downloadUrl: popupDirectUrl };
      }
    }
  }

  const href = await hrefPromise;
  const sameTabUrl = page.url();
  const candidates = [href, sameTabUrl].filter(looksLikePdfUrl);
  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    const body = await fetchPdfByUrl(context, candidate, timeoutMs);
    if (body) {
      return { kind: "buffer", buffer: body, downloadUrl: candidate };
    }
  }

  const originalCandidates = [captured.popup?.url() ?? null, href, sameTabUrl].filter(looksLikePdfUrl);
  for (const candidate of [...new Set(originalCandidates)]) {
    const body = await fetchPdfByUrl(context, candidate, timeoutMs);
    if (body) {
      return { kind: "buffer", buffer: body, downloadUrl: candidate };
    }
  }

  logStep("Download event not observed; trying response/popup URL fallbacks.");
  throw new Error(
    "PDF click succeeded but no downloadable PDF payload was captured. The site flow may have changed."
  );
}

async function runSingle(
  sourceUrl: string,
  config: GrabConfig,
  dryRun: boolean
): Promise<GrabResult> {
  const townSlug = deriveTownSlug(sourceUrl);
  const townDisplayName = parseTownDisplayName(townSlug);
  const dateStamp = dateStampInZone(config.timezone);
  const outputDir = resolveFromCwd(config.outputRoot, townSlug, dateStamp);
  const retrievedAtLocal = isoWithZoneOffset(config.timezone);
  const launcher = getBrowserLauncher(config.browser);

  logStep(`Launching ${config.browser} (headless=${String(config.headless)}).`);
  const browser: Browser = await launcher.launch({ headless: config.headless });
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(config.navigationTimeoutMs);

    logStep(`Navigating to ${sourceUrl}`);
    await gotoLandingPage(page, sourceUrl, config.navigationTimeoutMs);

    const userAgent = await page.evaluate(() => navigator.userAgent);
    logStep("Locating PDF download control.");
    const { locator, method } = await findDownloadControl(page);

    if (dryRun) {
      logStep(`[dry-run] Would click control: ${method}`);
      return {
        townDisplayName,
        townSlug,
        outputDir,
        retrievedAtLocal,
        downloadUrl: null,
        downloadMethod: method,
        userAgent
      };
    }

    await ensureDir(outputDir);
    if (config.saveScreenshot) {
      const screenshotPath = path.join(outputDir, "source_page.png");
      logStep(`Saving screenshot: ${screenshotPath}`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    logStep("Clicking control and waiting for download event.");
    const capture = await clickAndCapturePdf(page, context, locator, config.downloadTimeoutMs);
    const pdfPath = path.join(outputDir, "udo.pdf");
    let downloadUrl: string | null;
    if (capture.kind === "download") {
      await capture.download.saveAs(pdfPath);
      downloadUrl = capture.downloadUrl;
    } else {
      await writeFile(pdfPath, capture.buffer);
      downloadUrl = capture.downloadUrl;
    }
    logStep(`Saved PDF: ${pdfPath}`);

    const checksum = await sha256File(pdfPath);
    const checksumsPath = path.join(outputDir, "SHA256SUMS.txt");
    await writeFile(checksumsPath, `${checksum}  udo.pdf\n`, "utf8");
    logStep(`Wrote SHA-256: ${checksumsPath}`);

    const sourceJsonPath = path.join(outputDir, "source.json");
    await writeJson(sourceJsonPath, {
      town_display_name: townDisplayName,
      town_slug: townSlug,
      retrieved_at_local: retrievedAtLocal,
      source_url: sourceUrl,
      download_url: downloadUrl,
      download_method: method,
      user_agent: userAgent,
      playwright_browser: config.browser,
      notes: "Not legal advice. Verify against official sources."
    });
    logStep(`Wrote provenance: ${sourceJsonPath}`);

    return {
      townDisplayName,
      townSlug,
      outputDir,
      retrievedAtLocal,
      downloadUrl,
      downloadMethod: method,
      userAgent
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function runWithRetry(
  sourceUrl: string,
  config: GrabConfig,
  dryRun: boolean
): Promise<GrabResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      logStep(`Starting ${sourceUrl} (attempt ${attempt}/${config.maxAttempts}).`);
      return await runSingle(sourceUrl, config, dryRun);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      logStep(`Attempt ${attempt} failed: ${message}`);
      if (attempt < config.maxAttempts) {
        logStep("Retrying after short backoff.");
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function gatherUrls(cli: CliOptions): Promise<string[]> {
  if (cli.url) return [cli.url];
  if (cli.file) return await readLines(resolveFromCwd(cli.file));
  throw new Error("Provide --url \"https://library.municode.com/...\" or --file towns.txt");
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const baseConfig = await loadConfig();
  const config = mergeConfig(baseConfig, cli);
  const urls = await gatherUrls(cli);

  if (urls.length === 0) {
    throw new Error("No URLs found.");
  }

  const invalid = urls.filter((url) => !isValidMunicodeUrl(url));
  if (invalid.length > 0) {
    throw new Error(`Invalid URL(s). Expected host library.municode.com: ${invalid.join(", ")}`);
  }

  let failed = 0;
  for (const url of urls) {
    try {
      const result = await runWithRetry(url, config, cli.dryRun);
      logStep(`Completed ${result.townSlug} -> ${result.outputDir}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[grab] FAILED ${url}: ${message}`);
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
    throw new Error(`${failed} URL(s) failed.`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[grab] ${message}`);
  process.exit(1);
});
