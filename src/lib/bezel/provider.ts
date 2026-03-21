/**
 * BezelProvider — 4-tier price fetching with automatic fallback.
 *
 * Tier 1 — Direct fetch to a cached/known endpoint (fastest, no browser).
 * Tier 2 — XHR discovery via Playwright, then direct fetch to each candidate.
 * Tier 3 — Full DOM scrape via Playwright (slowest browser path).
 * Tier 4 — Manual fallback: write null price row so the mapping is preserved.
 *
 * Design contract:
 *  - No public method throws. All errors are caught, logged, and trigger the
 *    next tier (or a null result).
 *  - History methods return [] when no data is available (future API stub).
 *  - The singleton `bezelProvider` is exported for use by ingestion jobs.
 */

import { discoverBezelEndpoints, validateDiscoveredEndpoint } from './discovery';
import { scrapeBezelIndexPage, scrapeBezelModelPage } from './scrapers';
import { normalizeBezelIndexResponse, normalizeBezelModelResponse } from './normalizer';
import type {
  BezelEntityType,
  BezelIngestionResult,
  BezelNormalizedPrice,
  BezelHistoryPoint,
  BezelDiscoveredEndpoint,
} from './types';

// ---------------------------------------------------------------------------
// BezelProvider class
// ---------------------------------------------------------------------------

export class BezelProvider {
  /** Base URL for Bezel Markets (overridable via env). */
  private readonly bezelBaseUrl: string;

  /**
   * Per-slug cache of discovered endpoints.
   * Key: entity slug. Value: endpoints found during the last discovery run.
   * This is an in-memory cache (process lifetime); the discovery module also
   * maintains its own 1-hour cache keyed by page URL.
   */
  private endpointCache: Map<string, BezelDiscoveredEndpoint[]>;

  constructor(baseUrl = process.env.BEZEL_BASE_URL ?? 'https://markets.getbezel.com') {
    this.bezelBaseUrl = baseUrl;
    this.endpointCache = new Map();
  }

  // -------------------------------------------------------------------------
  // Public: main entry point
  // -------------------------------------------------------------------------

  /**
   * Fetch the current price for a Bezel entity using a 4-tier fallback chain.
   *
   * @param slug       - Entity slug, e.g. "cartier-index"
   * @param entityType - "index" or "model"
   * @param url        - Canonical Bezel URL for this entity
   */
  async fetchEntityPrice(
    slug: string,
    entityType: BezelEntityType,
    url: string,
  ): Promise<BezelIngestionResult> {
    // Tier 1 — direct fetch to a previously discovered/cached endpoint
    const tier1 = await this.tryDirectFetch(slug, entityType);
    if (tier1 !== null) {
      console.log(`[BezelProvider] Tier 1 SUCCESS slug=${slug} quality=${tier1.dataSourceQuality}`);
      return this.buildSuccessResult(slug, tier1);
    }
    console.log(`[BezelProvider] Tier 1 MISS slug=${slug} → trying Tier 2`);

    // Tier 2 — Playwright XHR discovery, then direct fetch
    const tier2 = await this.tryDiscoveryAndFetch(url, slug, entityType);
    if (tier2 !== null) {
      console.log(`[BezelProvider] Tier 2 SUCCESS slug=${slug} quality=${tier2.dataSourceQuality}`);
      return this.buildSuccessResult(slug, tier2);
    }
    console.log(`[BezelProvider] Tier 2 MISS slug=${slug} → trying Tier 3`);

    // Tier 3 — DOM scrape via Playwright
    const tier3 = await this.tryScrape(url, slug, entityType);
    if (tier3 !== null) {
      console.log(`[BezelProvider] Tier 3 SUCCESS slug=${slug} quality=${tier3.dataSourceQuality}`);
      return this.buildSuccessResult(slug, tier3);
    }
    console.log(`[BezelProvider] Tier 3 MISS slug=${slug} → Tier 4 fallback`);

    // Tier 4 — manual fallback; price is null but the row is still written so
    // the mapping continues to appear in the dashboard
    console.warn(
      `[BezelProvider] All tiers exhausted for slug=${slug}. Writing null-price fallback row.`,
    );
    return {
      success: false,
      slug,
      quality: 'manual_mapping_fallback',
      price: null,
      error: `All fetch tiers failed for slug="${slug}". Manual intervention required.`,
    };
  }

  // -------------------------------------------------------------------------
  // Public: history stubs
  // -------------------------------------------------------------------------

  /**
   * Fetch index price history for a slug.
   *
   * Currently returns [] — the DB is the preferred source of truth for history
   * data, populated by repeated ingestion runs. If Bezel ever exposes a public
   * history endpoint, implement the fetch here and cache the response.
   */
  async fetchIndexHistory(_slug: string): Promise<BezelHistoryPoint[]> {
    // TODO: implement when Bezel exposes a /api/indexes/:slug/history endpoint
    return [];
  }

  /**
   * Fetch model price history for a slug / URL.
   * Same rationale as fetchIndexHistory.
   */
  async fetchModelHistory(_slug: string, _url: string): Promise<BezelHistoryPoint[]> {
    // TODO: implement when Bezel exposes a /api/models/:slug/history endpoint
    return [];
  }

  // -------------------------------------------------------------------------
  // Tier 1 — direct fetch to a cached/known endpoint
  // -------------------------------------------------------------------------

  /**
   * Look up any previously discovered endpoints for this slug in the in-memory
   * cache. For each one, attempt a direct HTTP fetch and normalise the response.
   * Returns the first successfully normalised price, or null.
   */
  private async tryDirectFetch(
    slug: string,
    entityType: BezelEntityType,
  ): Promise<BezelNormalizedPrice | null> {
    const cached = this.endpointCache.get(slug);
    if (!cached || cached.length === 0) return null;

    console.log(
      `[BezelProvider] Tier 1: trying ${cached.length} cached endpoint(s) for slug=${slug}`,
    );

    for (const endpoint of cached) {
      try {
        const result = await this.fetchAndNormalize(endpoint, slug, entityType);
        if (result !== null) return result;
      } catch (err) {
        console.warn(
          `[BezelProvider] Tier 1: fetchAndNormalize failed for ${endpoint.url}:`,
          err,
        );
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Tier 2 — XHR discovery, then fetch
  // -------------------------------------------------------------------------

  /**
   * Run Playwright XHR discovery against `url`, store the discovered endpoints
   * in the in-memory cache (making them available for Tier 1 next run), then
   * attempt a direct HTTP fetch to each discovered endpoint in score order.
   * Returns the first successfully normalised price, or null.
   */
  private async tryDiscoveryAndFetch(
    url: string,
    slug: string,
    entityType: BezelEntityType,
  ): Promise<BezelNormalizedPrice | null> {
    try {
      console.log(`[BezelProvider] Tier 2: running XHR discovery on ${url}`);
      const endpoints = await discoverBezelEndpoints(url, slug);

      if (endpoints.length === 0) {
        console.log(`[BezelProvider] Tier 2: no endpoints discovered for ${url}`);
        return null;
      }

      // Persist in cache so Tier 1 can skip the browser on the next call
      this.endpointCache.set(slug, endpoints);

      for (const endpoint of endpoints) {
        try {
          const result = await this.fetchAndNormalize(endpoint, slug, entityType);
          if (result !== null) return result;
        } catch (err) {
          console.warn(
            `[BezelProvider] Tier 2: fetchAndNormalize failed for ${endpoint.url}:`,
            err,
          );
        }
      }
    } catch (err) {
      console.warn(
        `[BezelProvider] Tier 2: discoverBezelEndpoints threw for url=${url}:`,
        err,
      );
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Tier 3 — DOM scrape
  // -------------------------------------------------------------------------

  /**
   * Fall back to full Playwright DOM scraping.
   *
   * For indexes: scrapes the index list page and finds the entry matching slug.
   * For models:  scrapes the model detail page directly.
   */
  private async tryScrape(
    url: string,
    slug: string,
    entityType: BezelEntityType,
  ): Promise<BezelNormalizedPrice | null> {
    try {
      if (entityType === 'index') {
        // Navigate to the index listing page — normalise the URL
        const indexUrl = url.includes('/indexes')
          ? url
          : `${this.bezelBaseUrl}/indexes`;

        console.log(`[BezelProvider] Tier 3: scraping index page ${indexUrl}`);
        const all = await scrapeBezelIndexPage(indexUrl);

        if (all.length === 0) {
          console.warn(`[BezelProvider] Tier 3: index scrape returned 0 entries`);
          return null;
        }

        // Match by first slug keyword, e.g. "cartier" from "cartier-index"
        const keyword = slug.split('-')[0].toLowerCase();

        const match = all.find(
          (p) =>
            p.slug.toLowerCase().includes(keyword) ||
            p.name.toLowerCase().includes(keyword),
        );

        if (match) {
          // Re-stamp with the canonical slug so it maps correctly in the DB
          return { ...match, slug };
        }

        // If only one entry was found, use it regardless (single-index pages)
        if (all.length === 1) {
          console.log(
            `[BezelProvider] Tier 3: single index entry found; assigning slug=${slug}`,
          );
          return { ...all[0], slug };
        }

        console.warn(
          `[BezelProvider] Tier 3: ${all.length} index entries scraped but none matched slug=${slug}`,
        );
        return null;
      } else {
        // Model page — direct scrape
        console.log(`[BezelProvider] Tier 3: scraping model page ${url}`);
        return await scrapeBezelModelPage(url, slug);
      }
    } catch (err) {
      console.warn(`[BezelProvider] Tier 3: scrape threw for slug=${slug}:`, err);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Perform a direct HTTP fetch to a discovered endpoint (no browser), parse
   * the JSON body, and normalise it into a BezelNormalizedPrice.
   *
   * Uses validateDiscoveredEndpoint which handles timeout, status check, and
   * content-type validation. Returns null on any failure.
   */
  private async fetchAndNormalize(
    endpoint: BezelDiscoveredEndpoint,
    slug: string,
    entityType: BezelEntityType,
  ): Promise<BezelNormalizedPrice | null> {
    const body = await validateDiscoveredEndpoint(endpoint);
    if (body === null) {
      console.log(
        `[BezelProvider] fetchAndNormalize: endpoint no longer valid — ${endpoint.url}`,
      );
      return null;
    }

    const normalized =
      entityType === 'index'
        ? normalizeBezelIndexResponse(body, slug)
        : normalizeBezelModelResponse(body, slug);

    if (normalized !== null) {
      // Tag as network-captured (we fetched a real JSON endpoint, not DOM)
      return { ...normalized, dataSourceQuality: 'frontend_network_capture' };
    }

    console.log(
      `[BezelProvider] fetchAndNormalize: normalizer returned null for ${endpoint.url} slug=${slug}`,
    );
    return null;
  }

  /** Build a successful BezelIngestionResult from a normalised price. */
  private buildSuccessResult(
    slug: string,
    price: BezelNormalizedPrice,
  ): BezelIngestionResult {
    return {
      success: true,
      slug,
      quality: price.dataSourceQuality,
      price,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/**
 * Shared singleton instance of BezelProvider.
 * Import this in ingestion jobs rather than constructing a new instance,
 * so that the in-memory endpoint cache is reused across calls within the
 * same process lifetime.
 */
export const bezelProvider = new BezelProvider();
