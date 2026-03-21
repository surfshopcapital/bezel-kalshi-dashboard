/**
 * Fetch and persist latest Kalshi market data for all tracked markets.
 */
import { createKalshiClient } from '@/lib/kalshi/client';
import { normalizeKalshiMarket, normalizeOrderbook } from '@/lib/kalshi/normalizer';
import {
  upsertKalshiMarket,
  appendKalshiSnapshot,
  appendOrderbookSnapshot,
  startIngestionLog,
  finishIngestionLog,
} from '@/lib/db/queries';
import { MARKET_MAPPINGS } from '@/lib/mappings';
import { createChildLogger } from '@/lib/utils/logger';
import { withRetry } from '@/lib/utils/retry';

const log = createChildLogger({ job: 'refreshKalshi' });

export interface RefreshResult {
  success: number;
  failed: number;
  errors: string[];
}

export async function refreshKalshiJob(): Promise<RefreshResult> {
  const client = createKalshiClient();
  const result: RefreshResult = { success: 0, failed: 0, errors: [] };

  for (const mapping of MARKET_MAPPINGS) {
    const ingestionLog = await startIngestionLog(
      'refreshKalshi',
      'kalshi_api',
      undefined,
      mapping.kalshiTicker,
    );

    try {
      log.info('Fetching market', { ticker: mapping.kalshiTicker });

      const rawMarket = await withRetry(
        () => client.getMarketByTicker(mapping.kalshiTicker),
        { maxAttempts: 3 },
      );
      const normalized = normalizeKalshiMarket(rawMarket);
      const market = await upsertKalshiMarket(normalized);

      await appendKalshiSnapshot(market.id, {
        yesPrice: normalized.yesPrice,
        noPrice: normalized.noPrice,
        volume: normalized.volume,
        openInterest: normalized.openInterest ?? null,
        lastPrice: normalized.lastPrice ?? null,
        impliedProb: normalized.impliedProb,
        status: normalized.status,
      });

      const rawOrderbook = await withRetry(
        () => client.getMarketOrderbook(mapping.kalshiTicker),
        { maxAttempts: 3 },
      );
      const orderbook = normalizeOrderbook(rawOrderbook);

      await appendOrderbookSnapshot(market.id, {
        yesBids: orderbook.yesBids,
        noBids: orderbook.noBids,
        bestYesBid: orderbook.bestYesBid,
        bestNoBid: orderbook.bestNoBid,
        spread: orderbook.spread,
        midpoint: orderbook.midpoint,
      });

      await finishIngestionLog(ingestionLog.id, 'success', 2);
      result.success++;
      log.info('Market refreshed OK', { ticker: mapping.kalshiTicker });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Failed to refresh market', { ticker: mapping.kalshiTicker, error: msg });
      await finishIngestionLog(ingestionLog.id, 'failed', 0, msg);
      result.failed++;
      result.errors.push(`${mapping.kalshiTicker}: ${msg}`);
    }
  }

  return result;
}
