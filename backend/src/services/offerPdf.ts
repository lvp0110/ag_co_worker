import puppeteer, { type Browser } from "puppeteer";
import { buildConstructionCatalog, type ConstructionCatalogEntry } from "./catalogData.js";
import { buildConstructionDetailsHtml } from "./offerKpConstructionDetails.js";
import { buildPriceLookup } from "./priceData.js";
import {
  buildFooterHtml,
  KP_HEADER_TEMPLATE,
  renderOfferKpHtml,
  type OfferForRender,
} from "../templates/offerKp.js";

/**
 * Singleton Puppeteer-браузер на процесс backend'а. Запуск Chromium —
 * самая дорогая операция (200-500ms холодный старт), на каждой генерации
 * PDF делать заново не имеет смысла. Закрываем на SIGTERM / SIGINT.
 *
 * Chromium иногда падает (Connection closed) — тогда сбрасываем singleton
 * и при следующем запросе поднимаем браузер заново.
 */

let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;
let shutdownHooksInstalled = false;

const resetBrowserState = (): void => {
  browserInstance = null;
  browserLaunchPromise = null;
};

const isBrowserConnectionError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === "ConnectionClosedError" ||
    msg.includes("connection closed") ||
    msg.includes("target closed") ||
    msg.includes("session closed") ||
    msg.includes("browser has disconnected")
  );
};

const installShutdownHooks = () => {
  if (shutdownHooksInstalled) return;
  shutdownHooksInstalled = true;
  const close = () => {
    void closeBrowser();
  };
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
};

export class OfferPdfError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "OfferPdfError";
  }
}

const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--font-render-hinting=none",
] as const;

const isMissingBundledChromeError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("could not find chrome") || msg.includes("could not find chromium");
};

/**
 * Локально после `npm install` bundled Chromium часто не скачан (в Docker он
 * кладётся в PUPPETEER_CACHE_DIR на build-стадии). Сначала пробуем bundled /
 * PUPPETEER_EXECUTABLE_PATH, затем установленный Google Chrome (`channel`).
 */
const launchBrowser = async (): Promise<Browser> => {
  const baseOpts = {
    headless: true as const,
    args: [...PUPPETEER_ARGS],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH
      ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : {}),
  };

  let browser: Browser;
  try {
    browser = await puppeteer.launch(baseOpts);
  } catch (first) {
    if (process.env.PUPPETEER_EXECUTABLE_PATH || !isMissingBundledChromeError(first)) {
      throw first;
    }
    try {
      browser = await puppeteer.launch({ ...baseOpts, channel: "chrome" });
    } catch {
      throw new OfferPdfError(
        "Chromium для PDF не найден. В каталоге backend выполните: npx puppeteer browsers install chrome — или установите Google Chrome.",
        first
      );
    }
  }

  browserInstance = browser;
  browser.on("disconnected", () => {
    if (browserInstance === browser) {
      resetBrowserState();
    }
  });
  return browser;
};

const getBrowser = async (): Promise<Browser> => {
  if (browserInstance?.connected) return browserInstance;

  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // ignore — процесс уже мог завершиться
    }
    resetBrowserState();
  }

  if (!browserLaunchPromise) {
    installShutdownHooks();
    browserLaunchPromise = launchBrowser().catch((err) => {
      resetBrowserState();
      throw err;
    });
  }

  return browserLaunchPromise;
};

export const closeBrowser = async (): Promise<void> => {
  const browser = browserInstance;
  resetBrowserState();
  if (!browser) return;
  try {
    await browser.close();
  } catch {
    // ignore — процесс завершается
  }
};

const renderPdfFromHtml = async (
  html: string,
  footerHtml: string
): Promise<Buffer> => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(120_000);
    page.setDefaultNavigationTimeout(120_000);
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const pdf = await page.pdf({
      format: "A4",
      margin: { top: "20mm", bottom: "28mm", left: "12mm", right: "12mm" },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: KP_HEADER_TEMPLATE,
      footerTemplate: footerHtml,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {
      // ignore
    });
  }
};

/**
 * Генерирует PDF-байты КП для уже загруженного оффер-DTO. Подгружает
 * каталог конструкций и прайс из внешнего calc-сервиса (через общий
 * upstreamCache — повторные запросы не бьют по dev3).
 */
export const renderOfferPdf = async (offer: OfferForRender): Promise<Buffer> => {
  const catalog = await buildConstructionCatalog().catch(
    () => new Map<string, ConstructionCatalogEntry>()
  );
  const [priceLookup, constructionDetailsHtml] = await Promise.all([
    buildPriceLookup(offer.region),
    buildConstructionDetailsHtml(offer, catalog).catch(() => ""),
  ]);

  let html: string;
  try {
    html = renderOfferKpHtml({ offer, priceLookup, catalog, constructionDetailsHtml });
  } catch (err) {
    throw new OfferPdfError(
      err instanceof Error ? `PDF template failed: ${err.message}` : "PDF template failed",
      err
    );
  }
  const footerHtml = buildFooterHtml(offer);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await renderPdfFromHtml(html, footerHtml);
    } catch (err) {
      lastError = err;
      if (attempt === 0 && isBrowserConnectionError(err)) {
        await closeBrowser();
        continue;
      }
      break;
    }
  }

  throw new OfferPdfError(
    lastError instanceof Error
      ? `Puppeteer failed: ${lastError.message}`
      : "Puppeteer failed",
    lastError
  );
};
