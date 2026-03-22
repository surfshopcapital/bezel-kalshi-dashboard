/**
 * Static mapping configuration: Kalshi market ↔ Bezel entity.
 *
 * Add new markets here — the seed script and ingestion jobs read from this list.
 *
 * Real tickers discovered from Kalshi API (March 2026):
 *   KXCARTIER-MAR-5729     → Bezel Cartier Index,  strike $5,729,  expires 2026-04-01
 *   KXROLEX-MAR-12937      → Bezel Rolex Index,    strike $12,937, expires 2026-04-01
 *   KXBEZELRSUB41LV-MAR-14026 → Rolex Sub 126610LV, strike $14,026, expires 2026-03-31
 */

export interface MarketMappingConfig {
  kalshiTicker: string;
  kalshiEventTicker: string;
  kalshiUrl: string;
  bezelSlug: string;
  bezelEntityType: 'index' | 'model';
  bezelUrl: string;
  /**
   * Known direct API endpoint on api.bezel.cloud (current price, single point).
   * When set, BezelProvider seeds its in-memory cache with this URL so that
   * Tier 1 (direct HTTP fetch, no Playwright) succeeds immediately.
   * Format: responds with { timestamp: float_seconds, valueCents: integer }.
   */
  bezelApiUrl?: string;
  /**
   * Base URL for the historical time-series endpoint on api.bezel.cloud.
   * Append `?start=ISO8601&end=ISO8601` (or `&start=...&end=...` if the base
   * URL already contains a `?`) to fetch an array of { timestamp, valueCents }.
   * Example: "https://api.bezel.cloud/beztimate/indexes/4/data"
   */
  bezelHistoryApiUrl?: string;
  brand: string;
  /** Pre-configured strike value; null = parse dynamically from title/rules. */
  strikeValue: number | null;
  strikeDirection: 'above' | 'below' | null;
  referenceNumber?: string;
  notes?: string;
}

export const MARKET_MAPPINGS: MarketMappingConfig[] = [
  {
    kalshiTicker: 'KXCARTIER-MAR-5729',
    kalshiEventTicker: 'KXCARTIER-MAR',
    kalshiUrl: 'https://kalshi.com/markets/kxcartier-mar/kxcartier-mar-5729',
    bezelSlug: 'cartier-index',
    bezelEntityType: 'index',
    bezelUrl: 'https://markets.getbezel.com/indexes',
    // Bezel internal API — index ID 4 = Cartier; returns { timestamp, valueCents }
    bezelApiUrl: 'https://api.bezel.cloud/beztimate/indexes/4/value',
    // Historical time-series: append ?start=ISO8601&end=ISO8601
    bezelHistoryApiUrl: 'https://api.bezel.cloud/beztimate/indexes/4/data',
    brand: 'Cartier',
    strikeValue: 5729,
    strikeDirection: 'above',
    notes: 'Cartier Watch Index monthly contract — resolves against Bezel Cartier index; strike $5,729',
  },
  {
    kalshiTicker: 'KXROLEX-MAR-12937',
    kalshiEventTicker: 'KXROLEX-MAR',
    kalshiUrl: 'https://kalshi.com/markets/kxrolex-mar/kxrolex-mar-12937',
    bezelSlug: 'rolex-index',
    bezelEntityType: 'index',
    bezelUrl: 'https://markets.getbezel.com/indexes',
    // Bezel internal API — index ID 1 = Rolex; returns { timestamp, valueCents }
    bezelApiUrl: 'https://api.bezel.cloud/beztimate/indexes/1/value',
    // Historical time-series: append ?start=ISO8601&end=ISO8601
    bezelHistoryApiUrl: 'https://api.bezel.cloud/beztimate/indexes/1/data',
    brand: 'Rolex',
    strikeValue: 12937,
    strikeDirection: 'above',
    notes: 'Rolex Watch Index monthly contract — resolves against Bezel Rolex index; strike $12,937',
  },
  {
    kalshiTicker: 'KXBEZELRSUB41LV-MAR-14026',
    kalshiEventTicker: 'KXBEZELRSUB41LV-MAR',
    kalshiUrl: 'https://kalshi.com/markets/kxbezelrsub41lv-mar/kxbezelrsub41lv-mar-14026',
    bezelSlug: 'rolex-submariner-date-41-starbucks',
    bezelEntityType: 'model',
    bezelUrl: 'https://markets.getbezel.com/models/rolex-submariner-date-41-starbucks',
    // Bezel internal API — composite modelId 197 = Submariner Date 41 "Starbucks" 126610LV-0002
    bezelApiUrl:
      'https://api.bezel.cloud/beztimate/composites/1/value?modelId=197&condition=PREOWNED&withBox=true&withPapers=true',
    // Historical time-series: append &start=ISO8601&end=ISO8601
    bezelHistoryApiUrl:
      'https://api.bezel.cloud/beztimate/composites/1/data?modelId=197&condition=PREOWNED&withBox=true&withPapers=true',
    brand: 'Rolex',
    strikeValue: 14026,
    strikeDirection: 'above',
    referenceNumber: '126610LV',
    notes:
      'Rolex Submariner Date 41 "Starbucks" (green bezel, ref 126610LV) — resolves against Bezel model page; strike $14,026',
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Find a mapping by its Kalshi ticker. Returns undefined if not found. */
export function getMappingByKalshiTicker(ticker: string): MarketMappingConfig | undefined {
  return MARKET_MAPPINGS.find(
    (m) => m.kalshiTicker.toUpperCase() === ticker.toUpperCase(),
  );
}

/** Find a mapping by its Bezel slug. Returns undefined if not found. */
export function getMappingByBezelSlug(slug: string): MarketMappingConfig | undefined {
  return MARKET_MAPPINGS.find((m) => m.bezelSlug === slug);
}

/** Return all mappings. */
export function getAllMappings(): MarketMappingConfig[] {
  return MARKET_MAPPINGS;
}

/** Return mappings filtered by brand (case-insensitive). */
export function getMappingsByBrand(brand: string): MarketMappingConfig[] {
  return MARKET_MAPPINGS.filter(
    (m) => m.brand.toLowerCase() === brand.toLowerCase(),
  );
}

/** Return mappings filtered by Bezel entity type. */
export function getMappingsByEntityType(
  type: 'index' | 'model',
): MarketMappingConfig[] {
  return MARKET_MAPPINGS.filter((m) => m.bezelEntityType === type);
}

/** Return deduplicated list of Bezel slugs across all mappings. */
export function getUniqueBezelSlugs(): string[] {
  return [...new Set(MARKET_MAPPINGS.map((m) => m.bezelSlug))];
}
