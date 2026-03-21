/**
 * Static mapping configuration: Kalshi market ↔ Bezel entity.
 *
 * Add new markets here — the seed script and ingestion jobs read from this list.
 */

export interface MarketMappingConfig {
  kalshiTicker: string;
  kalshiEventTicker: string;
  kalshiUrl: string;
  bezelSlug: string;
  bezelEntityType: 'index' | 'model';
  bezelUrl: string;
  brand: string;
  /** Pre-configured strike value; null = parse dynamically from title/rules. */
  strikeValue: number | null;
  strikeDirection: 'above' | 'below' | null;
  referenceNumber?: string;
  notes?: string;
}

export const MARKET_MAPPINGS: MarketMappingConfig[] = [
  {
    kalshiTicker: 'KXCARTIER-MAR',
    kalshiEventTicker: 'KXCARTIER',
    kalshiUrl: 'https://kalshi.com/markets/kxcartier/cartier-index/kxcartier-mar',
    bezelSlug: 'cartier-index',
    bezelEntityType: 'index',
    bezelUrl: 'https://markets.getbezel.com/indexes',
    brand: 'Cartier',
    strikeValue: null,
    strikeDirection: null,
    notes: 'Cartier Watch Index monthly contract — resolves against Bezel Cartier index',
  },
  {
    kalshiTicker: 'KXROLEX-MAR',
    kalshiEventTicker: 'KXROLEX',
    kalshiUrl:
      'https://kalshi.com/markets/kxrolex/will-the-rolex-index-be-up-or-down-this-month-bezel/kxrolex-mar',
    bezelSlug: 'rolex-index',
    bezelEntityType: 'index',
    bezelUrl: 'https://markets.getbezel.com/indexes',
    brand: 'Rolex',
    strikeValue: null,
    strikeDirection: null,
    notes: 'Rolex Watch Index monthly contract — resolves against Bezel Rolex index',
  },
  {
    kalshiTicker: 'KXBEZELRSUB41LV-MAR',
    kalshiEventTicker: 'KXBEZELRSUB41LV',
    kalshiUrl:
      'https://kalshi.com/markets/kxbezelrsub41lv/rolex-submariner-date-41-starbucks/kxbezelrsub41lv-mar',
    bezelSlug: 'rolex-submariner-date-41-starbucks',
    bezelEntityType: 'model',
    bezelUrl: 'https://markets.getbezel.com/models/rolex-submariner-date-41-starbucks',
    brand: 'Rolex',
    strikeValue: null,
    strikeDirection: null,
    referenceNumber: '126610LV',
    notes:
      'Rolex Submariner Date 41 "Starbucks" (green bezel, ref 126610LV) — resolves against Bezel model page',
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
