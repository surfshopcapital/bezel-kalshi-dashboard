/**
 * Kalshi API v2 — TypeScript types.
 */

export class KalshiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly kalshiCode: string | null = null,
  ) {
    super(message);
    this.name = 'KalshiClientError';
  }
}

export interface KalshiApiMarket {
  ticker: string;
  event_ticker: string;
  series_ticker?: string;
  title: string;
  subtitle?: string;
  status: string; // "open" | "closed" | "settled"
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  volume_24h?: number;
  open_interest?: number;
  close_time?: string; // ISO timestamp
  expiration_time?: string; // ISO timestamp
  rules_primary?: string;
  rules_secondary?: string;
  result?: string;
  can_close_early?: boolean;
  // Internal: set by client after fetch
  _fetchedAt?: number;
}

export interface KalshiApiOrderbook {
  market_ticker: string;
  orderbook: {
    yes: [number, number][]; // [price, quantity]
    no: [number, number][];
  };
}

export interface KalshiApiTrade {
  trade_id: string;
  ticker: string;
  count: number;
  yes_price: number;
  no_price: number;
  taker_side: string;
  created_time: string;
}

export interface KalshiApiMarketHistoryResponse {
  history: KalshiApiTrade[];
  cursor?: string;
}

export interface KalshiMarketsResponse {
  markets: KalshiApiMarket[];
  cursor?: string;
}

export interface KalshiMarketResponse {
  market: KalshiApiMarket;
}

export interface GetMarketsParams {
  status?: string;
  limit?: number;
  cursor?: string;
  event_ticker?: string;
  series_ticker?: string;
  category?: string;
  tickers?: string[];
}

export interface GetMarketHistoryParams {
  limit?: number;
  cursor?: string;
  min_ts?: number;
  max_ts?: number;
}
