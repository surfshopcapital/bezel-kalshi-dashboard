/**
 * Kalshi API response normalizers.
 * Converts raw KalshiApiMarket / KalshiApiOrderbook objects into the
 * application-internal KalshiNormalizedMarket / KalshiNormalizedOrderbook
 * shapes defined in @/types.
 */
import type { KalshiApiMarket, KalshiApiOrderbook } from './types';
import type {
  KalshiNormalizedMarket,
  KalshiNormalizedOrderbook,
  KalshiOrderbookLevel,
} from '@/types';

// ---------------------------------------------------------------------------
// Strike parsing
// ---------------------------------------------------------------------------

export interface StrikeParseResult {
  strikeValue: number | null;
  strikeDirection: 'above' | 'below' | null;
  strikeCondition: string | null;
}

/**
 * Parse a strike value and direction from a Kalshi market title or rules text.
 * Checks the title first, then falls back to the rules string.
 * Returns null fields if no recognizable pattern is found. Never throws.
 */
export function parseStrikeFromTitle(
  title: string,
  rules?: string,
): StrikeParseResult {
  const nullResult: StrikeParseResult = {
    strikeValue: null,
    strikeDirection: null,
    strikeCondition: null,
  };

  // Ordered pattern list — each entry: [regex, direction]
  const patterns: Array<[RegExp, 'above' | 'below']> = [
    [/(?:at or above|above|exceeds?|greater than|over)\s+\$?([\d,]+(?:\.\d+)?)/i, 'above'],
    [/(?:at or below|below|under|less than)\s+\$?([\d,]+(?:\.\d+)?)/i, 'below'],
    [/(?:finish(?:es)? above|end(?:s)? above|close(?:s)? above)\s+\$?([\d,]+(?:\.\d+)?)/i, 'above'],
    [/\$?([\d,]+(?:\.\d+)?)\s+(?:or more|and above)/i, 'above'],
    [/\$?([\d,]+(?:\.\d+)?)\s+(?:or less|and below)/i, 'below'],
  ];

  function tryParse(text: string): StrikeParseResult | null {
    for (const [pattern, direction] of patterns) {
      const match = text.match(pattern);
      if (match) {
        const raw = match[1].replace(/,/g, '');
        const value = parseFloat(raw);
        if (!Number.isFinite(value)) continue;
        return {
          strikeValue: value,
          strikeDirection: direction,
          strikeCondition: match[0].trim(),
        };
      }
    }
    return null;
  }

  try {
    // Title takes priority
    const fromTitle = tryParse(title);
    if (fromTitle) return fromTitle;

    // Fall back to rules text
    if (rules) {
      const fromRules = tryParse(rules);
      if (fromRules) return fromRules;
    }
  } catch {
    // Never throw — return nulls on any unexpected error
  }

  return nullResult;
}

// ---------------------------------------------------------------------------
// Market normalization
// ---------------------------------------------------------------------------

const KALSHI_BASE_URL = 'https://kalshi.com/markets';

/**
 * Normalize a raw KalshiApiMarket into the internal KalshiNormalizedMarket type.
 *
 * The Kalshi v2 API now returns prices as string dollar amounts (_dollars suffix,
 * e.g. yes_bid_dollars="0.5300" = 53¢) and volumes as string floats (_fp suffix).
 * We convert those to integer cents (0–100) for internal use, falling back to
 * the legacy integer-cent fields when the new fields are absent.
 *
 * - yesPrice  = midpoint of yes_bid and yes_ask in cents (0–100)
 * - noPrice   = midpoint of no_bid and no_ask in cents
 * - impliedProb = yesPrice / 100  → [0, 1]
 * - Strike fields are parsed from title + rules_primary
 */
export function normalizeKalshiMarket(raw: KalshiApiMarket): KalshiNormalizedMarket {
  // Extract prices — prefer new _dollars string fields (multiply by 100 for cents),
  // fall back to legacy integer-cent fields.
  const yesBid = parseDollarsField(raw.yes_bid_dollars) ?? raw.yes_bid ?? 0;
  const yesAsk = parseDollarsField(raw.yes_ask_dollars) ?? raw.yes_ask ?? 0;
  const noBid  = parseDollarsField(raw.no_bid_dollars)  ?? raw.no_bid  ?? 0;
  const noAsk  = parseDollarsField(raw.no_ask_dollars)  ?? raw.no_ask  ?? 0;
  const lastPriceRaw = parseDollarsField(raw.last_price_dollars) ?? raw.last_price ?? null;

  // Midpoint prices — clamp to [0, 100]
  const yesPrice = clampPrice(midpoint(yesBid, yesAsk));
  const noPrice  = clampPrice(midpoint(noBid,  noAsk));

  // Volume / open interest — prefer _fp string fields
  const volume       = parseFpField(raw.volume_fp)       ?? raw.volume       ?? 0;
  const openInterest = parseFpField(raw.open_interest_fp) ?? raw.open_interest ?? null;

  // Parse strike
  const rulesText = raw.rules_primary ?? raw.rules_secondary ?? undefined;
  const { strikeValue, strikeDirection, strikeCondition } = parseStrikeFromTitle(
    raw.title,
    rulesText,
  );

  // Parse dates safely
  const expirationDate = parseIsoDate(raw.expiration_time ?? raw.close_time);
  const closeDate = parseIsoDate(raw.close_time ?? raw.expiration_time);

  // Build canonical Kalshi market URL from event_ticker + ticker
  const kalshiUrl = buildKalshiUrl(raw.event_ticker, raw.ticker);

  return {
    ticker: raw.ticker,
    eventTicker: raw.event_ticker ?? null,
    seriesTicker: raw.series_ticker ?? null,
    title: raw.title,
    subtitle: raw.subtitle ?? null,
    status: raw.status,
    expirationDate,
    closeDate,
    rulesText: rulesText ?? null,
    yesBid,
    yesAsk,
    yesPrice,
    noPrice,
    volume,
    openInterest,
    lastPrice: lastPriceRaw,
    impliedProb: yesPrice / 100,
    resolvedStrike: strikeValue,
    strikeDirection,
    strikeCondition,
    kalshiUrl,
  };
}

// ---------------------------------------------------------------------------
// Orderbook normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a raw KalshiApiOrderbook.
 *
 * - Sorts YES bids descending by price (highest bid first)
 * - Sorts NO bids descending by price
 * - Computes: bestYesBid, bestNoBid, impliedYesAsk = 100 - bestNoBid, spread, midpoint
 */
export function normalizeOrderbook(raw: KalshiApiOrderbook): KalshiNormalizedOrderbook {
  const yesBids: KalshiOrderbookLevel[] = (raw.orderbook.yes ?? [])
    .map(([price, quantity]) => ({ price, quantity }))
    .sort((a, b) => b.price - a.price);

  const noBids: KalshiOrderbookLevel[] = (raw.orderbook.no ?? [])
    .map(([price, quantity]) => ({ price, quantity }))
    .sort((a, b) => b.price - a.price);

  const bestYesBid: number | null = yesBids.length > 0 ? yesBids[0].price : null;
  const bestNoBid: number | null = noBids.length > 0 ? noBids[0].price : null;

  // impliedYesAsk = 100 - bestNoBid (since NO and YES are complementary)
  const impliedYesAsk: number | null =
    bestNoBid !== null ? clampPrice(100 - bestNoBid) : null;

  // Spread = best ask - best bid for YES
  const spread: number | null =
    bestYesBid !== null && impliedYesAsk !== null
      ? impliedYesAsk - bestYesBid
      : null;

  // Midpoint between best YES bid and implied YES ask
  const mid: number | null =
    bestYesBid !== null && impliedYesAsk !== null
      ? (bestYesBid + impliedYesAsk) / 2
      : null;

  return {
    marketTicker: raw.market_ticker,
    yesBids,
    noBids,
    bestYesBid,
    bestNoBid,
    impliedYesAsk,
    spread,
    midpoint: mid,
    capturedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function midpoint(bid: number, ask: number): number {
  // If both are 0, return 0. Guard against undefined/NaN.
  const b = Number.isFinite(bid) ? bid : 0;
  const a = Number.isFinite(ask) ? ask : 0;
  if (b === 0 && a === 0) return 0;
  if (b === 0) return a;
  if (a === 0) return b;
  return (b + a) / 2;
}

function clampPrice(p: number): number {
  return Math.min(100, Math.max(0, p));
}

function parseIsoDate(iso?: string): Date | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Parse a Kalshi `_dollars` string field into integer cents.
 * E.g. "0.5300" → 53  |  "1.0000" → 100  |  undefined → null
 */
function parseDollarsField(val: string | undefined): number | null {
  if (val === undefined || val === null) return null;
  const f = parseFloat(val);
  if (!Number.isFinite(f)) return null;
  return Math.round(f * 100); // dollars → cents
}

/**
 * Parse a Kalshi `_fp` string field into a number.
 * E.g. "19938.00" → 19938  |  undefined → null
 */
function parseFpField(val: string | undefined): number | null {
  if (val === undefined || val === null) return null;
  const f = parseFloat(val);
  return Number.isFinite(f) ? f : null;
}

function buildKalshiUrl(eventTicker: string, ticker: string): string {
  // Kalshi URLs follow the pattern: /markets/{event_ticker}/{market_ticker}
  // If event_ticker is not available, fall back to just ticker
  if (eventTicker) {
    return `${KALSHI_BASE_URL}/${encodeURIComponent(eventTicker)}/${encodeURIComponent(ticker)}`;
  }
  return `${KALSHI_BASE_URL}/${encodeURIComponent(ticker)}`;
}
