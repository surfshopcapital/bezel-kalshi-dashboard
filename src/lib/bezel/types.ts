/**
 * Bezel data layer — shared types.
 *
 * DataSourceQuality describes how confidently we obtained a price:
 *   official_api            – Bezel publishes a documented public API endpoint
 *   frontend_network_capture – XHR/fetch intercepted by Playwright while the
 *                              browser rendered the page (undocumented but stable)
 *   html_scrape             – Price parsed from rendered DOM with CSS selectors
 *   manual_mapping_fallback – No automated source found; row written with null
 *                              price so the mapping still exists in the DB
 */
export type DataSourceQuality =
  | 'official_api'
  | 'frontend_network_capture'
  | 'html_scrape'
  | 'manual_mapping_fallback';

export type BezelEntityType = 'index' | 'model';

// ---------------------------------------------------------------------------
// Raw shapes returned directly by Bezel (before normalisation)
// ---------------------------------------------------------------------------

/** One row from the Bezel index list page / API. */
export interface BezelRawIndexEntry {
  name: string;
  value: number;
  change?: number;
  changePct?: number;
  date?: string;
}

// ---------------------------------------------------------------------------
// Endpoint discovery
// ---------------------------------------------------------------------------

/**
 * An XHR / Fetch endpoint discovered while Playwright rendered a Bezel page.
 * `score` (0-100) is a heuristic estimate of how likely the response contains
 * price data — higher is better.
 */
export interface BezelDiscoveredEndpoint {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  responseFormat: 'json' | 'html';
  discoveredAt: string; // ISO-8601
  entitySlug: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Normalised output
// ---------------------------------------------------------------------------

/** Canonical price record written to BezelPriceSnapshot. */
export interface BezelNormalizedPrice {
  slug: string;
  entityType: BezelEntityType;
  name: string;
  price: number;
  dailyChange: number | null;
  dailyChangePct: number | null;
  volume: number | null;
  capturedAt: string; // ISO-8601
  dataSourceQuality: DataSourceQuality;
  rawPayload: unknown;
}

/** One point in a price-history series. */
export interface BezelHistoryPoint {
  date: string; // ISO-8601 date string, e.g. "2024-11-15"
  price: number;
  change?: number;
  changePct?: number;
}

/** Result returned by BezelProvider.fetchEntityPrice for one slug. */
export interface BezelIngestionResult {
  success: boolean;
  slug: string;
  quality: DataSourceQuality;
  price: BezelNormalizedPrice | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Scraper configuration
// ---------------------------------------------------------------------------

/**
 * CSS-selector sets used by the DOM scraper.
 * Multiple selectors separated by ", " are tried in order (first match wins).
 */
export interface BezelScraperSelectors {
  indexes: {
    container: string;
    name: string;
    value: string;
    change: string;
  };
  model: {
    price: string;
    change: string;
    name: string;
  };
}
