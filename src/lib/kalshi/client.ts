/**
 * Kalshi REST API v2 client with:
 * - Automatic retries with full-jitter exponential back-off
 * - 100ms minimum inter-request interval (rate limiting)
 * - Authorization header injection
 * - Typed errors via KalshiClientError
 */
import type {
  KalshiApiMarket,
  KalshiApiOrderbook,
  KalshiApiMarketHistoryResponse,
  KalshiMarketsResponse,
  KalshiMarketResponse,
  GetMarketsParams,
  GetMarketHistoryParams,
} from './types';
import { KalshiClientError } from './types';

export interface KalshiClientOptions {
  baseUrl?: string;
  apiKey?: string;
  maxRetries?: number;
  minRequestIntervalMs?: number;
  retryBaseDelayMs?: number;
}

const DEFAULT_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_MIN_INTERVAL_MS = 100;
const DEFAULT_RETRY_BASE_DELAY_MS = 200;
const MAX_PAGINATION_PAGES = 50;

export class KalshiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly maxRetries: number;
  private readonly minRequestIntervalMs: number;
  private readonly retryBaseDelayMs: number;

  /** Timestamp (ms) of the last request dispatch — used for throttling */
  private lastRequestAt = 0;

  constructor(options: KalshiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private buildHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Key ${this.apiKey}`;
    }
    return headers;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /** Full-jitter exponential back-off: random in [0, min(cap, base * 2^attempt)] */
  private jitteredBackoff(attempt: number): number {
    const cap = 30_000; // 30s ceiling
    const base = this.retryBaseDelayMs;
    const ceiling = Math.min(cap, base * Math.pow(2, attempt));
    return Math.random() * ceiling;
  }

  /** Enforce the minimum inter-request interval by sleeping if necessary */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < this.minRequestIntervalMs) {
      await sleep(this.minRequestIntervalMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  private async fetchWithRetry<T>(url: string, init?: RequestInit): Promise<T> {
    let attempt = 0;

    while (true) {
      await this.throttle();

      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          headers: this.buildHeaders(),
        });
      } catch (networkErr) {
        // Network-level error (DNS failure, connection reset, etc.)
        if (attempt >= this.maxRetries) {
          throw new KalshiClientError(
            `Network error after ${attempt + 1} attempt(s): ${String(networkErr)}`,
            0,
          );
        }
        const delay = this.jitteredBackoff(attempt);
        await sleep(delay);
        attempt++;
        continue;
      }

      // Handle 429 — rate-limited
      if (response.status === 429) {
        if (attempt >= this.maxRetries) {
          throw new KalshiClientError('Rate limited (429) — max retries exceeded', 429);
        }
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterSec = retryAfterHeader ? parseFloat(retryAfterHeader) : NaN;
        const delay = Number.isFinite(retryAfterSec)
          ? retryAfterSec * 1_000
          : this.jitteredBackoff(attempt);
        await sleep(delay);
        attempt++;
        continue;
      }

      // Handle 5xx — server errors worth retrying
      if (response.status >= 500 && response.status < 600) {
        if (attempt >= this.maxRetries) {
          throw new KalshiClientError(
            `Server error (${response.status}) — max retries exceeded`,
            response.status,
          );
        }
        const delay = this.jitteredBackoff(attempt);
        await sleep(delay);
        attempt++;
        continue;
      }

      // Handle non-OK 4xx (not retried except 429 handled above)
      if (!response.ok) {
        let kalshiCode: string | null = null;
        let message = `Kalshi API error: HTTP ${response.status}`;
        try {
          const body = (await response.json()) as Record<string, unknown>;
          if (typeof body.code === 'string') kalshiCode = body.code;
          if (typeof body.message === 'string') message = body.message;
          else if (typeof body.error === 'string') message = body.error;
        } catch {
          // ignore JSON parse failure
        }
        throw new KalshiClientError(message, response.status, kalshiCode);
      }

      // Successful response
      try {
        const data = (await response.json()) as T;
        return data;
      } catch (parseErr) {
        throw new KalshiClientError(
          `Failed to parse Kalshi API response: ${String(parseErr)}`,
          response.status,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Public API methods
  // ---------------------------------------------------------------------------

  /**
   * GET /markets/{ticker}
   * Fetches a single market by its ticker symbol.
   */
  async getMarketByTicker(ticker: string): Promise<KalshiApiMarket> {
    const url = this.buildUrl(`/markets/${encodeURIComponent(ticker)}`);
    const data = await this.fetchWithRetry<KalshiMarketResponse>(url);
    const market = data.market;
    market._fetchedAt = Date.now();
    return market;
  }

  /**
   * Fetches markets. If `params.tickers` is provided, performs individual
   * per-ticker lookups. Otherwise paginates GET /markets with cursor up to
   * MAX_PAGINATION_PAGES pages.
   */
  async getMarkets(params: GetMarketsParams = {}): Promise<KalshiApiMarket[]> {
    const { tickers, ...restParams } = params;

    // --- Ticker-list mode: batch individual lookups ---
    if (tickers && tickers.length > 0) {
      const results = await Promise.allSettled(
        tickers.map((ticker) => this.getMarketByTicker(ticker)),
      );
      const markets: KalshiApiMarket[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          markets.push(result.value);
        }
        // Silently skip rejected tickers (e.g. 404 for invalid tickers)
      }
      return markets;
    }

    // --- Pagination mode ---
    const allMarkets: KalshiApiMarket[] = [];
    let cursor: string | undefined = restParams.cursor;
    let pageCount = 0;

    const queryParams: Record<string, string | number | boolean | undefined> = {
      limit: restParams.limit ?? 100,
    };
    if (restParams.status) queryParams.status = restParams.status;
    if (restParams.event_ticker) queryParams.event_ticker = restParams.event_ticker;
    if (restParams.series_ticker) queryParams.series_ticker = restParams.series_ticker;
    if (restParams.category) queryParams.category = restParams.category;

    while (pageCount < MAX_PAGINATION_PAGES) {
      if (cursor) queryParams.cursor = cursor;
      const url = this.buildUrl('/markets', queryParams);
      const data = await this.fetchWithRetry<KalshiMarketsResponse>(url);

      const fetchedAt = Date.now();
      for (const market of data.markets ?? []) {
        market._fetchedAt = fetchedAt;
        allMarkets.push(market);
      }

      // If a limit was explicitly requested, stop after first page
      if (restParams.limit !== undefined) break;

      cursor = data.cursor;
      if (!cursor) break; // No more pages
      pageCount++;
    }

    return allMarkets;
  }

  /**
   * GET /markets/{ticker}/orderbook
   */
  async getMarketOrderbook(ticker: string): Promise<KalshiApiOrderbook> {
    const url = this.buildUrl(`/markets/${encodeURIComponent(ticker)}/orderbook`);
    const data = await this.fetchWithRetry<{ orderbook: KalshiApiOrderbook['orderbook'] }>(url);
    return {
      market_ticker: ticker,
      orderbook: data.orderbook ?? { yes: [], no: [] },
    };
  }

  /**
   * GET /markets/{ticker}/trades
   * Returns trade history with optional time-range / cursor pagination.
   */
  async getMarketHistory(
    ticker: string,
    params: GetMarketHistoryParams = {},
  ): Promise<KalshiApiMarketHistoryResponse> {
    const queryParams: Record<string, string | number | boolean | undefined> = {};
    if (params.limit !== undefined) queryParams.limit = params.limit;
    if (params.cursor !== undefined) queryParams.cursor = params.cursor;
    if (params.min_ts !== undefined) queryParams.min_ts = params.min_ts;
    if (params.max_ts !== undefined) queryParams.max_ts = params.max_ts;

    const url = this.buildUrl(`/markets/${encodeURIComponent(ticker)}/trades`, queryParams);
    const data = await this.fetchWithRetry<KalshiApiMarketHistoryResponse>(url);
    return {
      history: data.history ?? [],
      cursor: data.cursor,
    };
  }

  /**
   * Lightweight liveness probe.
   * GET /markets?limit=1 → returns true if API is reachable, false otherwise.
   */
  async ping(): Promise<boolean> {
    try {
      const url = this.buildUrl('/markets', { limit: 1 });
      await this.fetchWithRetry<KalshiMarketsResponse>(url);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _singleton: KalshiClient | null = null;

/**
 * Returns (or creates) the module-level KalshiClient singleton.
 * Options are only applied on first call; subsequent calls return the existing instance.
 */
export function createKalshiClient(options?: KalshiClientOptions): KalshiClient {
  if (!_singleton) {
    _singleton = new KalshiClient({
      baseUrl: options?.baseUrl ?? process.env.KALSHI_BASE_URL ?? DEFAULT_BASE_URL,
      apiKey: options?.apiKey ?? process.env.KALSHI_API_KEY,
      maxRetries: options?.maxRetries,
      minRequestIntervalMs: options?.minRequestIntervalMs,
      retryBaseDelayMs: options?.retryBaseDelayMs,
    });
  }
  return _singleton;
}

/** Resets the singleton — primarily for use in tests. */
export function _resetKalshiClientSingleton(): void {
  _singleton = null;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
