/**
 * Static mapping configuration: Kalshi market ↔ Bezel entity.
 *
 * Add new markets here — the seed script and ingestion jobs read from this list.
 *
 * All 8 active markets (March 2026):
 *
 * === 4 INDEXES ===
 *   KXROLEX-MAR-12937         → Bezel Rolex Index,   index ID 1,  strike $12,937, expires 2026-04-01
 *   KXTUDOR-MAR-3662          → Bezel Tudor Index,   index ID 2,  strike $3,662,  expires 2026-04-01
 *   KXOMEGA-MAR-5507          → Bezel Omega Index,   index ID 3,  strike $5,507,  expires 2026-04-01
 *   KXCARTIER-MAR-5729        → Bezel Cartier Index, index ID 4,  strike $5,729,  expires 2026-04-01
 *
 * === 4 INDIVIDUAL MODELS ===
 *   KXBEZELRSUB41LV-MAR-14026 → Rolex Sub 41 "Starbucks" 126610LV,  modelId 197,  strike $14,026, expires 2026-03-31
 *   KXBEZELRSUB41D-MAR-13129  → Rolex Sub 41 Date 126610LN,          modelId 61,   strike $13,129, expires 2026-04-01
 *   KXBEZELTBBGMT-MAR-3309    → Tudor Black Bay GMT M79830RB-0001,    modelId 846,  strike $3,309,  expires 2026-03-31
 *   KXBEZELOMOON-MAR-6831     → Omega Speedmaster Moonwatch 3861,     modelId 1001, strike $6,831,  expires 2026-03-31
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
  // =========================================================================
  // INDEXES
  // =========================================================================
  {
    kalshiTicker: 'KXROLEX-MAR-12937',
    kalshiEventTicker: 'KXROLEX-MAR',
    kalshiUrl: 'https://kalshi.com/markets/kxrolex/will-the-rolex-index-be-up-or-down-this-month-bezel/kxrolex-mar',
    bezelSlug: 'rolex-index',
    bezelEntityType: 'index',
    bezelUrl: 'https://markets.getbezel.com/indexes',
    // Bezel internal API — index ID 1 = Rolex; returns { timestamp, valueCents }
    bezelApiUrl: 'https://api.bezel.cloud/beztimate/indexes/1/value',
    bezelHistoryApiUrl: 'https://api.bezel.cloud/beztimate/indexes/1/data',
    brand: 'Rolex',
    strikeValue: 12937,
    strikeDirection: 'above',
    notes: 'Rolex Watch Index monthly contract — resolves against Bezel Rolex index; strike $12,937',
  },
  {
    kalshiTicker: 'KXTUDOR-MAR-3662',
    kalshiEventTicker: 'KXTUDOR-MAR',
    kalshiUrl: 'https://kalshi.com/markets/kxtudor/tudor-index/kxtudor-mar',
    bezelSlug: 'tudor-index',
    bezelEntityType: 'index',
    bezelUrl: 'https://markets.getbezel.com/indexes',
    // Bezel internal API — index ID 2 = Tudor; returns { timestamp, valueCents }
    bezelApiUrl: 'https://api.bezel.cloud/beztimate/indexes/2/value',
    bezelHistoryApiUrl: 'https://api.bezel.cloud/beztimate/indexes/2/data',
    brand: 'Tudor',
    strikeValue: 3662,
    strikeDirection: 'above',
    notes: 'Tudor Watch Index monthly contract — resolves against Bezel Tudor index; strike $3,662',
  },
  {
    kalshiTicker: 'KXOMEGA-MAR-5507',
    kalshiEventTicker: 'KXOMEGA-MAR',
    kalshiUrl: 'https://kalshi.com/markets/kxomega/omega-index/kxomega-mar',
    bezelSlug: 'omega-index',
    bezelEntityType: 'index',
    bezelUrl: 'https://markets.getbezel.com/indexes',
    // Bezel internal API — index ID 3 = Omega; returns { timestamp, valueCents }
    bezelApiUrl: 'https://api.bezel.cloud/beztimate/indexes/3/value',
    bezelHistoryApiUrl: 'https://api.bezel.cloud/beztimate/indexes/3/data',
    brand: 'Omega',
    strikeValue: 5507,
    strikeDirection: 'above',
    notes: 'Omega Watch Index monthly contract — resolves against Bezel Omega index; strike $5,507',
  },
  {
    kalshiTicker: 'KXCARTIER-MAR-5729',
    kalshiEventTicker: 'KXCARTIER-MAR',
    kalshiUrl: 'https://kalshi.com/markets/kxcartier/cartier-index/kxcartier-mar',
    bezelSlug: 'cartier-index',
    bezelEntityType: 'index',
    bezelUrl: 'https://markets.getbezel.com/indexes',
    // Bezel internal API — index ID 4 = Cartier; returns { timestamp, valueCents }
    bezelApiUrl: 'https://api.bezel.cloud/beztimate/indexes/4/value',
    bezelHistoryApiUrl: 'https://api.bezel.cloud/beztimate/indexes/4/data',
    brand: 'Cartier',
    strikeValue: 5729,
    strikeDirection: 'above',
    notes: 'Cartier Watch Index monthly contract — resolves against Bezel Cartier index; strike $5,729',
  },

  // =========================================================================
  // INDIVIDUAL MODELS
  // =========================================================================
  {
    kalshiTicker: 'KXBEZELRSUB41LV-MAR-14026',
    kalshiEventTicker: 'KXBEZELRSUB41LV-MAR',
    kalshiUrl: 'https://kalshi.com/markets/kxbezelrsub41lv/rolex-submariner-date-41-starbucks/kxbezelrsub41lv-mar',
    bezelSlug: 'rolex-submariner-date-41-starbucks',
    bezelEntityType: 'model',
    bezelUrl: 'https://markets.getbezel.com/models/rolex-submariner-date-41-starbucks',
    // Bezel internal API — composite modelId 197 = Submariner Date 41 "Starbucks" 126610LV-0002
    bezelApiUrl:
      'https://api.bezel.cloud/beztimate/composites/1/value?modelId=197&condition=PREOWNED&withBox=true&withPapers=true',
    bezelHistoryApiUrl:
      'https://api.bezel.cloud/beztimate/composites/1/data?modelId=197&condition=PREOWNED&withBox=true&withPapers=true',
    brand: 'Rolex',
    strikeValue: 14026,
    strikeDirection: 'above',
    referenceNumber: '126610LV',
    notes: 'Rolex Submariner Date 41 "Starbucks" (green bezel, ref 126610LV-0002); strike $14,026',
  },
  {
    kalshiTicker: 'KXBEZELRSUB41D-MAR-13129',
    kalshiEventTicker: 'KXBEZELRSUB41D-MAR',
    kalshiUrl: 'https://kalshi.com/markets/kxbezelrsub41d/rolex-submariner-41-date/kxbezelrsub41d-mar',
    bezelSlug: 'rolex-submariner-date-41',
    bezelEntityType: 'model',
    bezelUrl: 'https://markets.getbezel.com/models/rolex-submariner-date-41',
    // Bezel internal API — composite modelId 61 = Submariner Date 41 126610LN-0001 (black bezel)
    bezelApiUrl:
      'https://api.bezel.cloud/beztimate/composites/1/value?modelId=61&condition=PREOWNED&withBox=true&withPapers=true',
    bezelHistoryApiUrl:
      'https://api.bezel.cloud/beztimate/composites/1/data?modelId=61&condition=PREOWNED&withBox=true&withPapers=true',
    brand: 'Rolex',
    strikeValue: 13129,
    strikeDirection: 'above',
    referenceNumber: '126610LN',
    notes: 'Rolex Submariner Date 41 (black bezel, ref 126610LN-0001); strike $13,129',
  },
  {
    kalshiTicker: 'KXBEZELTBBGMT-MAR-3309',
    kalshiEventTicker: 'KXBEZELTBBGMT-MAR',
    kalshiUrl: 'https://kalshi.com/markets/kxbezeltbbgmt/tudor-black-bay-gmt--bracelet/kxbezeltbbgmt-mar',
    bezelSlug: 'tudor-black-bay-gmt',
    bezelEntityType: 'model',
    bezelUrl: 'https://markets.getbezel.com/models/tudor-black-bay-gmt',
    // Bezel internal API — composite modelId 846 = Tudor Black Bay GMT / Bracelet M79830RB-0001
    bezelApiUrl:
      'https://api.bezel.cloud/beztimate/composites/1/value?modelId=846&condition=PREOWNED&withBox=true&withPapers=true',
    bezelHistoryApiUrl:
      'https://api.bezel.cloud/beztimate/composites/1/data?modelId=846&condition=PREOWNED&withBox=true&withPapers=true',
    brand: 'Tudor',
    strikeValue: 3309,
    strikeDirection: 'above',
    referenceNumber: 'M79830RB',
    notes: 'Tudor Black Bay GMT / Bracelet (ref M79830RB-0001); strike $3,309',
  },
  {
    kalshiTicker: 'KXBEZELOMOON-MAR-6831',
    kalshiEventTicker: 'KXBEZELOMOON-MAR',
    kalshiUrl: 'https://kalshi.com/markets/kxbezelomoon/speedmaster-professional-moonwatch-/kxbezelomoon-mar',
    bezelSlug: 'omega-speedmaster-moonwatch',
    bezelEntityType: 'model',
    bezelUrl: 'https://markets.getbezel.com/models/omega-speedmaster-moonwatch',
    // Bezel internal API — composite modelId 11695 = Speedmaster Professional Moonwatch 3861
    // Steel / Black / Sapphire / Bracelet 310.30.42.50.01.002 (confirmed via live API, March 2026).
    // modelId 1001 was wrong (~$5,852); 11695 matches Bezel site price of ~$6,575.
    bezelApiUrl:
      'https://api.bezel.cloud/beztimate/composites/1/value?modelId=11695&condition=PREOWNED&withBox=true&withPapers=true',
    bezelHistoryApiUrl:
      'https://api.bezel.cloud/beztimate/composites/1/data?modelId=11695&condition=PREOWNED&withBox=true&withPapers=true',
    brand: 'Omega',
    strikeValue: 6831,
    strikeDirection: 'above',
    referenceNumber: '310.30.42.50.01.002',
    notes: 'Omega Speedmaster Professional Moonwatch 3861 Steel/Sapphire/Bracelet; strike $6,831',
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
