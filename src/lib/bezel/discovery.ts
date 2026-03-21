/**
 * Bezel endpoint discovery — Playwright-based XHR/fetch interception.
 *
 * Launches a headless Chromium browser, navigates to a Bezel page, and
 * intercepts all network responses. Responses are scored for how likely they
 * contain watch price / index data. The top-scoring endpoints are returned and
 * cached for 1 hour so that subsequent calls skip the browser launch.
 */

import { chromium } from 'playwright';
import type { BezelDiscoveredEndpoint } from './types';

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  endpoints: BezelDiscoveredEndpoint[];
  cachedAt: number; // Date.now()
}

const endpointCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Scoring constants
// ---------------------------------------------------------------------------

/** URL fragments that suggest a network request carries market data. */
const PRICE_URL_KEYWORDS = ['api', 'data', 'price', 'index', 'market', 'watch'] as const;

/** Payload keys that award score points when present. */
const VALUE_KEYS = ['value', 'price', 'currentPrice', 'current_price', 'marketPrice'] as const;
const CHANGE_KEYS = ['change', 'changePct', 'dailyChange', 'delta'] as const;
const NAME_KEYS = ['name', 'title', 'label', 'brand'] as const;
const INDEX_MODEL_URL_KEYWORDS = ['index', 'model'] as const;

/**
 * Score a discovered endpoint (0–100) based on URL shape and response body
 * structure. Higher score = more likely to contain watch price data.
 */
function scoreEndpoint(
  url: string,
  body: Record<string, unknown> | unknown[],
): number {
  let score = 0;

  // Flatten array root to first element for key inspection
  const obj: Record<string, unknown> = Array.isArray(body)
    ? (typeof body[0] === 'object' && body[0] !== null ? (body[0] as Record<string, unknown>) : {})
    : (body as Record<string, unknown>);

  // +20 if payload has a price/value key
  if (VALUE_KEYS.some((k) => k in obj)) score += 20;

  // +20 if payload has a change key
  if (CHANGE_KEYS.some((k) => k in obj)) score += 20;

  // +10 if root is an array (index list response)
  if (Array.isArray(body)) score += 10;

  // +10 if payload has a name key
  if (NAME_KEYS.some((k) => k in obj)) score += 10;

  // +5 if URL contains "index" or "model"
  const urlLower = url.toLowerCase();
  if (INDEX_MODEL_URL_KEYWORDS.some((k) => urlLower.includes(k))) score += 5;

  // Bonus: nested data array shape { data: [...] }
  if ('data' in obj && Array.isArray(obj['data'])) score += 15;
  if ('indexes' in obj && Array.isArray(obj['indexes'])) score += 15;
  if ('results' in obj && Array.isArray(obj['results'])) score += 10;

  return Math.min(score, 100);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Launch headless Chromium, navigate to `pageUrl`, intercept all XHR / fetch
 * responses, and return up to 5 endpoints most likely to contain price data.
 *
 * Results are cached per `pageUrl` for 1 hour. Set PLAYWRIGHT_HEADLESS=false
 * in the environment to run with a visible browser (debugging).
 *
 * @param pageUrl  - The Bezel page to render (e.g. "https://markets.getbezel.com/indexes")
 * @param entitySlug - Slug used to annotate discovered endpoints
 */
export async function discoverBezelEndpoints(
  pageUrl: string,
  entitySlug: string,
): Promise<BezelDiscoveredEndpoint[]> {
  // --- Cache check ---
  const cached = endpointCache.get(pageUrl);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    console.log(`[BezelDiscovery] Cache hit for ${pageUrl} (${cached.endpoints.length} endpoints)`);
    return cached.endpoints;
  }

  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  console.log(`[BezelDiscovery] Launching Chromium (headless=${headless}) for ${pageUrl}`);

  const browser = await chromium.launch({ headless });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // Accept language / viewport that mimic a real desktop browser
      locale: 'en-US',
      viewport: { width: 1440, height: 900 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const page = await context.newPage();

    interface InterceptedResponse {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: Record<string, unknown> | unknown[] | null;
    }

    const intercepted: InterceptedResponse[] = [];

    // Intercept all responses and collect those that look like JSON API calls
    page.on('response', async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()['content-type'] ?? '';

        // Only inspect JSON-ish responses from URLs that match price-data keywords
        const urlLower = url.toLowerCase();
        const urlLooksRelevant = PRICE_URL_KEYWORDS.some((kw) => urlLower.includes(kw));

        if (!urlLooksRelevant) return;
        if (!contentType.includes('application/json') && !contentType.includes('text/plain')) return;

        // Attempt to read the body; responses may already be consumed
        let body: Record<string, unknown> | unknown[] | null = null;
        try {
          const json = await response.json();
          if (json !== null && typeof json === 'object') {
            body = json as Record<string, unknown> | unknown[];
          }
        } catch {
          // Body not JSON or already consumed — skip
          return;
        }

        intercepted.push({
          url,
          method: response.request().method() as string,
          headers: response.request().headers() as Record<string, string>,
          body,
        });
      } catch {
        // Individual response failures are non-fatal
      }
    });

    // Navigate and wait for network to settle
    try {
      await page.goto(pageUrl, {
        waitUntil: 'networkidle',
        timeout: 15_000,
      });
    } catch (navErr) {
      // networkidle may time out on SPAs; that's acceptable — we still process
      // whatever responses we collected before the timeout
      console.warn(`[BezelDiscovery] Navigation warning for ${pageUrl}:`, navErr);
    }

    // Give any deferred API calls a little extra time
    await page.waitForTimeout(2_000);

    // --- Score and rank discovered endpoints ---
    const discovered: BezelDiscoveredEndpoint[] = [];
    const now = new Date().toISOString();

    for (const item of intercepted) {
      if (item.body === null) continue;

      const score = scoreEndpoint(item.url, item.body);

      // Only track endpoints with at least a minimal relevance score
      if (score < 10) continue;

      discovered.push({
        url: item.url,
        method: (item.method === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST',
        headers: sanitizeHeaders(item.headers),
        responseFormat: 'json',
        discoveredAt: now,
        entitySlug,
        score,
      });
    }

    // Sort descending by score, keep top 5
    discovered.sort((a, b) => b.score - a.score);
    const top5 = discovered.slice(0, 5);

    console.log(
      `[BezelDiscovery] Discovered ${top5.length} endpoint(s) for ${entitySlug}:`,
      top5.map((e) => `${e.url} (score=${e.score})`),
    );

    // Cache results
    endpointCache.set(pageUrl, { endpoints: top5, cachedAt: Date.now() });

    return top5;
  } finally {
    await browser.close();
  }
}

/**
 * Test a previously discovered endpoint with a direct HTTP fetch (no browser).
 * Returns the parsed JSON body if the endpoint responds with status 200 and
 * a valid JSON body, or null if the endpoint is gone / no longer returns JSON.
 *
 * @param endpoint - A BezelDiscoveredEndpoint obtained from discoverBezelEndpoints
 */
export async function validateDiscoveredEndpoint(
  endpoint: BezelDiscoveredEndpoint,
): Promise<unknown | null> {
  try {
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        ...endpoint.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(
        `[BezelDiscovery] validateDiscoveredEndpoint: ${endpoint.url} returned HTTP ${response.status}`,
      );
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
      console.warn(
        `[BezelDiscovery] validateDiscoveredEndpoint: ${endpoint.url} content-type changed to "${contentType}"`,
      );
      return null;
    }

    const body = await response.json();
    return body ?? null;
  } catch (err) {
    console.warn(`[BezelDiscovery] validateDiscoveredEndpoint failed for ${endpoint.url}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Remove request headers that should not be stored or replayed
 * (e.g. cookies, authorisation tokens, host-specific values).
 */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const BLOCKED = new Set([
    'cookie',
    'authorization',
    'x-auth-token',
    'x-csrf-token',
    'host',
    'content-length',
    ':authority',
    ':method',
    ':path',
    ':scheme',
  ]);

  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!BLOCKED.has(key.toLowerCase())) {
      safe[key] = value;
    }
  }
  return safe;
}
