/**
 * Bezel data provider.
 *
 * Attempts to fetch price data for a given Bezel entity slug using a
 * tiered strategy:
 *   1. Undocumented Bezel JSON API (frontend_network_capture quality)
 *   2. HTML scraping via fetch + regex (html_scrape quality)
 *   3. Fallback: returns a manual_mapping_fallback result with null price
 *
 * The caller is responsible for persisting the result to the database.
 */

import type { BezelNormalizedPrice, BezelIngestionResult, BezelEntityType } from './types';
import { MARKET_MAPPINGS } from '@/lib/mappings';

// ---------------------------------------------------------------------------
// Bezel API endpoint templates
// ---------------------------------------------------------------------------

const BEZEL_INDEXES_API = 'https://markets.getbezel.com/api/indexes';
const BEZEL_MODEL_API_BASE = 'https://markets.getbezel.com/api/models';

// Fallback page URLs for HTML scraping
const BEZEL_INDEXES_PAGE = 'https://markets.getbezel.com/indexes';
const BEZEL_MODEL_PAGE_BASE = 'https://markets.getbezel.com/models';

const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface BezelIndexApiEntry {
  name?: string;
  label?: string;
  slug?: string;
  value?: number;
  price?: number;
  change?: number;
  change_pct?: number;
  changePct?: number;
  daily_change?: number;
  daily_change_pct?: number;
  date?: string;
  updated_at?: string;
}

interface BezelModelApiEntry {
  name?: string;
  title?: string;
  slug?: string;
  price?: number;
  value?: number;
  daily_change?: number;
  change?: number;
  daily_change_pct?: number;
  change_pct?: number;
  changePct?: number;
  updated_at?: string;
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/html',
        'User-Agent':
          'Mozilla/5.0 (compatible; BezelWatchesDashboard/1.0)',
        ...((opts.headers as Record<string, string>) ?? {}),
      },
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Strategy 1: Bezel JSON API for indexes
// ---------------------------------------------------------------------------

async function fetchIndexFromApi(slug: string): Promise<BezelNormalizedPrice | null> {
  try {
    const response = await fetchWithTimeout(BEZEL_INDEXES_API, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;

    const raw = (await response.json()) as BezelIndexApiEntry[] | { indexes?: BezelIndexApiEntry[]; data?: BezelIndexApiEntry[] };

    const entries: BezelIndexApiEntry[] = Array.isArray(raw)
      ? raw
      : (raw as { indexes?: BezelIndexApiEntry[]; data?: BezelIndexApiEntry[] }).indexes ??
        (raw as { data?: BezelIndexApiEntry[] }).data ??
        [];

    // Find the entry matching our slug
    const entry = entries.find(
      (e) =>
        (e.slug ?? slugify(e.name ?? e.label ?? '')).toLowerCase() === slug.toLowerCase(),
    );

    if (!entry) return null;

    const price = entry.value ?? entry.price;
    if (price == null || !Number.isFinite(price)) return null;

    const dailyChange = entry.daily_change ?? entry.change ?? null;
    const dailyChangePct =
      entry.daily_change_pct ?? entry.change_pct ?? entry.changePct ?? null;

    return {
      slug,
      entityType: 'index',
      name: entry.name ?? entry.label ?? slug,
      price,
      dailyChange: dailyChange !== undefined ? dailyChange : null,
      dailyChangePct: dailyChangePct !== undefined ? dailyChangePct : null,
      volume: null,
      capturedAt: new Date().toISOString(),
      dataSourceQuality: 'frontend_network_capture',
      rawPayload: entry,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy 1b: Bezel JSON API for individual models
// ---------------------------------------------------------------------------

async function fetchModelFromApi(slug: string): Promise<BezelNormalizedPrice | null> {
  try {
    const url = `${BEZEL_MODEL_API_BASE}/${encodeURIComponent(slug)}`;
    const response = await fetchWithTimeout(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;

    const raw = (await response.json()) as BezelModelApiEntry | { model?: BezelModelApiEntry; data?: BezelModelApiEntry };

    const entry: BezelModelApiEntry = 'price' in raw || 'value' in raw
      ? (raw as BezelModelApiEntry)
      : (raw as { model?: BezelModelApiEntry }).model ??
        (raw as { data?: BezelModelApiEntry }).data ??
        (raw as BezelModelApiEntry);

    const price = entry.price ?? entry.value;
    if (price == null || !Number.isFinite(price)) return null;

    const dailyChange = entry.daily_change ?? entry.change ?? null;
    const dailyChangePct =
      entry.daily_change_pct ?? entry.change_pct ?? entry.changePct ?? null;

    return {
      slug,
      entityType: 'model',
      name: entry.name ?? entry.title ?? slug,
      price,
      dailyChange: dailyChange !== undefined ? dailyChange : null,
      dailyChangePct: dailyChangePct !== undefined ? dailyChangePct : null,
      volume: null,
      capturedAt: new Date().toISOString(),
      dataSourceQuality: 'frontend_network_capture',
      rawPayload: entry,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy 2: HTML scraping
// ---------------------------------------------------------------------------

function extractPriceFromHtml(html: string, slug: string): number | null {
  // Try various patterns for price text in the HTML
  const patterns = [
    /\$\s*([\d,]+(?:\.\d{2})?)/g,
    /"price"\s*:\s*([\d.]+)/g,
    /"value"\s*:\s*([\d.]+)/g,
    /data-price="([\d.]+)"/g,
    /class="[^"]*price[^"]*"[^>]*>\$?\s*([\d,]+(?:\.\d{2})?)/gi,
  ];

  const candidates: number[] = [];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((match = re.exec(html)) !== null) {
      const raw = match[1].replace(/,/g, '');
      const val = parseFloat(raw);
      // Bezel prices are typically in the $100–$100,000 range
      if (Number.isFinite(val) && val > 50 && val < 1_000_000) {
        candidates.push(val);
      }
    }
  }

  if (candidates.length === 0) return null;
  // Use the median to avoid outliers
  candidates.sort((a, b) => a - b);
  return candidates[Math.floor(candidates.length / 2)];
}

async function fetchFromHtml(slug: string, entityType: BezelEntityType): Promise<BezelNormalizedPrice | null> {
  try {
    const pageUrl =
      entityType === 'index'
        ? BEZEL_INDEXES_PAGE
        : `${BEZEL_MODEL_PAGE_BASE}/${encodeURIComponent(slug)}`;

    const response = await fetchWithTimeout(pageUrl, {
      headers: { Accept: 'text/html' },
    });
    if (!response.ok) return null;

    const html = await response.text();
    const price = extractPriceFromHtml(html, slug);
    if (price == null) return null;

    return {
      slug,
      entityType,
      name: slug,
      price,
      dailyChange: null,
      dailyChangePct: null,
      volume: null,
      capturedAt: new Date().toISOString(),
      dataSourceQuality: 'html_scrape',
      rawPayload: { source: pageUrl, priceExtracted: price },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Resolve entity metadata from MARKET_MAPPINGS
// ---------------------------------------------------------------------------

function resolveEntityMeta(slug: string): {
  entityType: BezelEntityType;
  brand: string | null;
  referenceNumber: string | null;
  bezelUrl: string;
} {
  const mapping = MARKET_MAPPINGS.find((m) => m.bezelSlug === slug);
  return {
    entityType: mapping?.bezelEntityType ?? 'model',
    brand: mapping?.brand ?? null,
    referenceNumber: mapping?.referenceNumber ?? null,
    bezelUrl:
      mapping?.bezelUrl ??
      (mapping?.bezelEntityType === 'index'
        ? BEZEL_INDEXES_PAGE
        : `${BEZEL_MODEL_PAGE_BASE}/${slug}`),
  };
}

// ---------------------------------------------------------------------------
// Public: fetchEntityPrice
// ---------------------------------------------------------------------------

/**
 * Fetch the latest price for a single Bezel entity by slug.
 * Tries the JSON API first, then falls back to HTML scraping.
 * Always returns a result (never throws); on total failure returns success=false.
 */
export async function fetchEntityPrice(slug: string): Promise<BezelIngestionResult> {
  const { entityType, brand: _brand, referenceNumber: _ref, bezelUrl: _url } = resolveEntityMeta(slug);

  // Strategy 1: JSON API
  let normalized: BezelNormalizedPrice | null = null;

  if (entityType === 'index') {
    normalized = await fetchIndexFromApi(slug);
  } else {
    normalized = await fetchModelFromApi(slug);
  }

  // Strategy 2: HTML scraping
  if (!normalized) {
    normalized = await fetchFromHtml(slug, entityType);
  }

  // Strategy 3: Manual fallback
  if (!normalized) {
    return {
      success: false,
      slug,
      quality: 'manual_mapping_fallback',
      price: null,
      error: `No price data found for slug: ${slug}`,
    };
  }

  return {
    success: true,
    slug,
    quality: normalized.dataSourceQuality,
    price: normalized,
  };
}

// ---------------------------------------------------------------------------
// Public: BezelProvider class (optional OOP interface)
// ---------------------------------------------------------------------------

export class BezelProvider {
  async fetchEntityPrice(slug: string): Promise<BezelIngestionResult> {
    return fetchEntityPrice(slug);
  }
}

export function createBezelProvider(): BezelProvider {
  return new BezelProvider();
}
