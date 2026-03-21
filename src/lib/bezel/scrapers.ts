/**
 * Bezel DOM scrapers — Playwright-based HTML extraction.
 *
 * These scrapers are the Tier 3 fallback: when XHR interception yields nothing,
 * we parse the rendered DOM with CSS selectors. Selectors are listed as comma-
 * separated alternatives; the first match in the DOM wins.
 *
 * Design contract:
 *  - Never throws. Returns empty array / null on failure.
 *  - Logs which selectors matched so we can update them when Bezel redesigns.
 *  - Always closes the browser in a finally block.
 */

import { chromium } from 'playwright';
import type { BezelNormalizedPrice } from './types';
import { parseBezelPrice, parseBezelChange } from './normalizer';

// ---------------------------------------------------------------------------
// Selector configuration
// ---------------------------------------------------------------------------

/**
 * CSS selector sets for the Bezel UI.
 * Multiple selectors separated by ", " are tried in document order;
 * whichever one matches first in the DOM is used.
 *
 * Update these when Bezel ships a frontend redesign — the ingestion log
 * will show "no match" warnings that surface broken selectors.
 */
const SCRAPER_SELECTORS = {
  indexes: {
    /**
     * Each row / card that represents one watch index.
     * Try data-testid attributes first (most stable), then class patterns.
     */
    container:
      '[data-testid="index-row"], .index-row, tr[class*="index"], [class*="IndexRow"], [class*="index-item"]',
    /** The index name inside a container. */
    name: '[data-testid="index-name"], .index-name, td:first-child, [class*="name"]',
    /** The current index value / price inside a container. */
    value:
      '[data-testid="index-value"], [class*="price"], [class*="value"], [class*="Price"]',
    /** The day-over-day change inside a container. */
    change:
      '[data-testid="index-change"], [class*="change"], [class*="Change"]',
  },
  model: {
    /** The primary price displayed on a model detail page. */
    price:
      '[data-testid="price"], [class*="current-price"], [class*="market-price"], [class*="Price"]:first-of-type',
    /** The price change / delta on a model detail page. */
    change:
      '[data-testid="change"], [class*="price-change"], [class*="change"]:first-of-type',
    /** The watch model name / title. */
    name: 'h1, [data-testid="model-name"], [class*="model-title"]',
  },
} as const;

// ---------------------------------------------------------------------------
// Shared browser helpers
// ---------------------------------------------------------------------------

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Create a browser context with a realistic desktop fingerprint. */
async function createContext(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  return browser.newContext({
    userAgent: USER_AGENT,
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
}

/**
 * Navigate a Playwright page to `url` and wait for network to settle.
 * Falls through on timeout so we can still scrape whatever loaded.
 */
async function navigatePage(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>,
  url: string,
): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
  } catch (err) {
    console.warn(`[BezelScraper] Navigation warning for ${url}:`, (err as Error).message);
  }
}

/**
 * Given a comma-separated selector string, try each selector in order and
 * return the text content of the first match found inside `scope`, or null.
 *
 * @param scope  - A Playwright ElementHandle to search within
 * @param selectors - CSS selector string (possibly comma-separated alternatives)
 * @param label  - Human-readable label used in log messages
 */
async function trySelectors(
  scope: Parameters<typeof scope.$(string)>[0] extends never ? never : Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>> | import('playwright').ElementHandle,
  selectors: string,
  label: string,
): Promise<string | null> {
  const parts = selectors.split(',').map((s) => s.trim()).filter(Boolean);
  for (const selector of parts) {
    try {
      // We cast scope to `any` once here to avoid Playwright generic complexity;
      // the selector is always a string and the method signature is stable.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el = await (scope as any).$(selector);
      if (el) {
        const text: string | null = await el.textContent();
        if (text && text.trim() !== '') {
          console.log(`[BezelScraper] ${label}: matched selector "${selector}" → "${text.trim()}"`);
          return text.trim();
        }
      }
    } catch {
      // Selector may be unsupported in the current browser context — continue
    }
  }
  console.warn(`[BezelScraper] ${label}: no selector matched in "${selectors}"`);
  return null;
}

// ---------------------------------------------------------------------------
// Public scrapers
// ---------------------------------------------------------------------------

/**
 * Scrape the Bezel indexes page (e.g. https://markets.getbezel.com/indexes).
 *
 * Iterates over all index container elements found on the page. For each one,
 * extracts the name, value, and change using the configured selectors. Returns
 * a BezelNormalizedPrice for every container that yields a parseable price.
 *
 * Falls back gracefully (empty array) when no containers or prices are found.
 */
export async function scrapeBezelIndexPage(url: string): Promise<BezelNormalizedPrice[]> {
  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  console.log(`[BezelScraper] scrapeBezelIndexPage: ${url} (headless=${headless})`);

  const browser = await chromium.launch({ headless });
  const results: BezelNormalizedPrice[] = [];

  try {
    const context = await createContext(browser);
    const page = await context.newPage();
    await navigatePage(page, url);

    // Find all index container elements using the multi-selector string
    const containerSelectors = SCRAPER_SELECTORS.indexes.container
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let containers: import('playwright').ElementHandle[] = [];

    for (const selector of containerSelectors) {
      try {
        const found = await page.$$(selector);
        if (found.length > 0) {
          console.log(`[BezelScraper] Index containers: matched "${selector}" (${found.length} items)`);
          containers = found;
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    if (containers.length === 0) {
      console.warn(`[BezelScraper] scrapeBezelIndexPage: no containers found on ${url}`);
      return [];
    }

    const capturedAt = new Date().toISOString();

    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];

      const nameText = await trySelectors(container, SCRAPER_SELECTORS.indexes.name, `container[${i}].name`);
      const valueText = await trySelectors(container, SCRAPER_SELECTORS.indexes.value, `container[${i}].value`);
      const changeText = await trySelectors(container, SCRAPER_SELECTORS.indexes.change, `container[${i}].change`);

      const price = parseBezelPrice(valueText ?? undefined);
      if (price === null) {
        console.warn(`[BezelScraper] container[${i}]: could not parse price from "${valueText}" — skipping`);
        continue;
      }

      const { change, changePct } = parseBezelChange(changeText ?? undefined);

      // Derive a slug from the name (lowercase, replace spaces with dashes)
      const rawName = nameText ?? `index-${i}`;
      const slug = rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-index';

      results.push({
        slug,
        entityType: 'index',
        name: rawName,
        price,
        dailyChange: change,
        dailyChangePct: changePct,
        volume: null,
        capturedAt,
        dataSourceQuality: 'html_scrape',
        rawPayload: { nameText, valueText, changeText },
      });
    }

    console.log(`[BezelScraper] scrapeBezelIndexPage: extracted ${results.length} index price(s)`);
    return results;
  } catch (err) {
    console.warn('[BezelScraper] scrapeBezelIndexPage failed:', err);
    return [];
  } finally {
    await browser.close();
  }
}

/**
 * Scrape a specific Bezel model page (e.g. https://markets.getbezel.com/models/rolex-submariner-date-41-starbucks).
 *
 * Extracts the current market price, day-over-day change, and model name from
 * the rendered DOM. Returns null when no parseable price is found.
 *
 * @param url  - Full URL of the model page
 * @param slug - Canonical slug for this model (e.g. "rolex-submariner-date-41-starbucks")
 */
export async function scrapeBezelModelPage(
  url: string,
  slug: string,
): Promise<BezelNormalizedPrice | null> {
  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  console.log(`[BezelScraper] scrapeBezelModelPage: ${url} slug=${slug} (headless=${headless})`);

  const browser = await chromium.launch({ headless });

  try {
    const context = await createContext(browser);
    const page = await context.newPage();
    await navigatePage(page, url);

    // Extract the three key data points from the model page
    const priceText = await trySelectors(page, SCRAPER_SELECTORS.model.price, 'model.price');
    const changeText = await trySelectors(page, SCRAPER_SELECTORS.model.change, 'model.change');
    const nameText = await trySelectors(page, SCRAPER_SELECTORS.model.name, 'model.name');

    const price = parseBezelPrice(priceText ?? undefined);
    if (price === null) {
      console.warn(
        `[BezelScraper] scrapeBezelModelPage: could not parse price from "${priceText}" for slug=${slug}`,
      );
      return null;
    }

    const { change, changePct } = parseBezelChange(changeText ?? undefined);

    const result: BezelNormalizedPrice = {
      slug,
      entityType: 'model',
      name: nameText ?? slug,
      price,
      dailyChange: change,
      dailyChangePct: changePct,
      volume: null,
      capturedAt: new Date().toISOString(),
      dataSourceQuality: 'html_scrape',
      rawPayload: { priceText, changeText, nameText },
    };

    console.log(
      `[BezelScraper] scrapeBezelModelPage: extracted price=$${price} change=${change} for slug=${slug}`,
    );
    return result;
  } catch (err) {
    console.warn(`[BezelScraper] scrapeBezelModelPage failed for slug=${slug}:`, err);
    return null;
  } finally {
    await browser.close();
  }
}
