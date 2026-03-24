/**
 * GET /api/dashboard
 *
 * Returns an array of DashboardMarketCard objects — one per tracked Kalshi
 * market — aggregated from KalshiMarket, BezelEntity, BezelPriceSnapshot, and
 * ProbabilityRun tables.
 */
import { NextResponse } from 'next/server';
import {
  getAllKalshiMarkets,
  getBezelPriceHistory,
  getLatestProbabilityRun,
} from '@/lib/db/queries';
import { getMappingByKalshiTicker } from '@/lib/mappings';
import { logger } from '@/lib/utils/logger';
import type { DashboardMarketCard, BezelEntityType, DataSourceQuality, StrikeDirection } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();

  try {
    // Load all markets with their mapping → bezelEntity and latest snapshot in one query
    const markets = await getAllKalshiMarkets();

    const cards: DashboardMarketCard[] = await Promise.all(
      markets.map(async (market) => {
        const latestSnap = market.snapshots[0] ?? null;
        const bezelEntity = market.mapping?.bezelEntity ?? null;

        // Fetch Bezel history (sparkline + latest price) and probability run in parallel
        let bezelPriceHistory: number[] = [];
        let latestBezelSnap: { price: number; dailyChange: number | null; dailyChangePct: number | null; dataSourceQuality: string; capturedAt: Date; rawPayload?: unknown } | null = null;
        let latestProbRun = null;

        if (bezelEntity) {
          // Over-fetch raw rows (30 days × 200 = 6,000) so that we get at least
          // 30 DAILY prices even with 15-min polling (96 snapshots/day).
          // Then deduplicate to one price per calendar day for the sparkline.
          const [rawHistory, probRun] = await Promise.all([
            getBezelPriceHistory(bezelEntity.slug, 6_000),
            getLatestProbabilityRun(market.id),
          ]);
          const seenDates = new Set<string>();
          const history = rawHistory.filter((h) => {
            const key = h.capturedAt.toISOString().slice(0, 10);
            if (seenDates.has(key)) return false;
            seenDates.add(key);
            return true;
          }).slice(-30); // keep the 30 most recent daily prices for the sparkline

          if (history.length > 0) {
            bezelPriceHistory = history.map((h) => h.price);
            latestBezelSnap = history[history.length - 1];
          }
          latestProbRun = probRun;
        } else {
          latestProbRun = await getLatestProbabilityRun(market.id);
        }

        // Resolve strike from DB mapping → static config → market parsed strike
        const mappingConfig = getMappingByKalshiTicker(market.ticker);
        const strikeValue =
          (market.mapping?.strikeValue ?? null) ??
          (mappingConfig?.strikeValue ?? null) ??
          (market.resolvedStrike ?? null);
        const strikeDirection = (
          market.mapping?.strikeDirection ??
          mappingConfig?.strikeDirection ??
          market.strikeDirection ??
          null
        ) as StrikeDirection | null;

        const currentBezelPrice = latestBezelSnap?.price ?? null;

        // Extract the Bezel-side data timestamp from rawPayload.timestamp (Unix float seconds)
        // This is when Bezel computed the price (~8:24 AM ET daily), distinct from our fetch time.
        const bezelRaw = latestBezelSnap?.rawPayload as Record<string, unknown> | null | undefined;
        const bezelDataAt =
          typeof bezelRaw?.timestamp === 'number'
            ? new Date(bezelRaw.timestamp * 1000).toISOString()
            : null;

        // Distance to strike
        let distanceToStrike: number | null = null;
        let distanceToStrikeSigmas: number | null = null;
        if (latestProbRun) {
          distanceToStrike = latestProbRun.currentLevel - latestProbRun.strike;
          distanceToStrikeSigmas =
            latestProbRun.oneSigmaMove > 0
              ? distanceToStrike / latestProbRun.oneSigmaMove
              : null;
        } else if (currentBezelPrice != null && strikeValue != null) {
          distanceToStrike = currentBezelPrice - strikeValue;
        }

        // Model probability in the direction of the contract (as percentage 0-100)
        const modeledProbability =
          latestProbRun != null
            ? (strikeDirection === 'above'
                ? latestProbRun.probabilityAbove
                : latestProbRun.probabilityBelow) * 100
            : null;

        return {
          ticker: market.ticker,
          title: market.title,
          status: market.status,
          kalshiUrl: market.kalshiUrl,
          expirationDate: market.expirationDate?.toISOString() ?? null,
          // Kalshi prices stored in cents [0-100], implied prob stored [0-1]
          yesBid: latestSnap?.yesBid ?? null,
          yesAsk: latestSnap?.yesAsk ?? null,
          yesPrice: latestSnap?.yesPrice ?? null,
          noPrice: latestSnap?.noPrice ?? null,
          volume: latestSnap?.volume ?? null,
          impliedProb: latestSnap != null ? latestSnap.impliedProb * 100 : null,
          // Bezel entity
          bezelSlug: bezelEntity?.slug ?? null,
          bezelUrl:
            bezelEntity?.bezelUrl ?? mappingConfig?.bezelUrl ?? null,
          bezelEntityType: (bezelEntity?.entityType ??
            mappingConfig?.bezelEntityType ??
            null) as BezelEntityType | null,
          brand: bezelEntity?.brand ?? mappingConfig?.brand ?? null,
          currentBezelPrice,
          bezelDailyChange: latestBezelSnap?.dailyChange ?? null,
          bezelDailyChangePct: latestBezelSnap?.dailyChangePct ?? null,
          bezelPriceHistory,
          dataSourceQuality: (latestBezelSnap?.dataSourceQuality ??
            null) as DataSourceQuality | null,
          lastBezelUpdate:
            latestBezelSnap?.capturedAt.toISOString() ?? null,
          bezelDataAt,
          // Strike
          strikeValue,
          strikeDirection,
          distanceToStrike,
          distanceToStrikeSigmas,
          // Model
          modeledProbability,
          kalshiImpliedProb: latestProbRun?.kalshiImpliedProb ?? null,
          modelEdge:
            latestProbRun?.modelEdge != null
              ? latestProbRun.modelEdge * 100
              : null,
          confidenceScore: latestProbRun?.confidenceScore ?? null,
          lastModelRun: latestProbRun?.runAt.toISOString() ?? null,
        } satisfies DashboardMarketCard;
      }),
    );

    return NextResponse.json(
      {
        data: cards,
        meta: {
          count: cards.length,
          timestamp: new Date().toISOString(),
          responseTimeMs: Date.now() - start,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Response-Time': `${Date.now() - start}ms`,
        },
      },
    );
  } catch (err) {
    logger.error('GET /api/dashboard failed', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
