import { NextRequest, NextResponse } from 'next/server';
import {
  getKalshiMarketByTicker,
  getLatestProbabilityRun,
  getProbabilityHistory,
  getRecentIngestionLogs,
  getLatestBezelPrice,
} from '@/lib/db/queries';
import { getMappingByKalshiTicker } from '@/lib/mappings';
import { logger } from '@/lib/utils/logger';

interface RouteParams {
  params: Promise<{ ticker: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { ticker } = await params;
  const start = Date.now();

  try {
    // getKalshiMarketByTicker already includes snapshots[0] and orderbookSnaps[0]
    const market = await getKalshiMarketByTicker(ticker.toUpperCase());
    if (!market) {
      return NextResponse.json(
        { error: `Market not found: ${ticker}` },
        { status: 404 },
      );
    }

    // Use data already joined in getKalshiMarketByTicker
    const latestSnapshot = market.snapshots[0] ?? null;
    const latestOrderbook = market.orderbookSnaps[0] ?? null;

    // Filter logs relevant to this market or its Bezel entity
    const bezelSlug = market.mapping?.bezelEntity?.slug ?? null;

    // Fetch prob run, prob history, recent logs, and latest Bezel snapshot in parallel
    const [latestProbRun, probHistory, allRecentLogs, latestBezelSnap] = await Promise.all([
      getLatestProbabilityRun(market.id),
      getProbabilityHistory(market.id, 60),
      getRecentIngestionLogs(50),
      bezelSlug ? getLatestBezelPrice(bezelSlug) : Promise.resolve(null),
    ]);

    // Extract Bezel-side data timestamp from rawPayload.timestamp (Unix float seconds)
    const bezelRaw = latestBezelSnap?.rawPayload as Record<string, unknown> | null | undefined;
    const bezelDataAt =
      typeof bezelRaw?.timestamp === 'number'
        ? new Date(bezelRaw.timestamp * 1000).toISOString()
        : null;
    const marketLogs = allRecentLogs.filter(
      (l) =>
        l.entityTicker === ticker.toUpperCase() ||
        l.entityTicker === bezelSlug ||
        l.entityId === market.id ||
        (bezelSlug && l.entityId === market.mapping?.bezelEntityId),
    );

    // Static mapping config for supplementary metadata
    const mappingConfig = getMappingByKalshiTicker(ticker);

    const responseData = {
      market: {
        id: market.id,
        ticker: market.ticker,
        eventTicker: market.eventTicker,
        seriesTicker: market.seriesTicker,
        title: market.title,
        subtitle: market.subtitle,
        status: market.status,
        expirationDate: market.expirationDate?.toISOString() ?? null,
        closeDate: market.closeDate?.toISOString() ?? null,
        rulesText: market.rulesText,
        resolvedStrike: market.resolvedStrike,
        strikeDirection: market.strikeDirection,
        strikeCondition: market.strikeCondition,
        kalshiUrl: market.kalshiUrl,
        createdAt: market.createdAt.toISOString(),
        updatedAt: market.updatedAt.toISOString(),
      },
      snapshot: latestSnapshot
        ? {
            yesBid: latestSnapshot.yesBid,
            yesAsk: latestSnapshot.yesAsk,
            yesPrice: latestSnapshot.yesPrice,
            noPrice: latestSnapshot.noPrice,
            volume: latestSnapshot.volume,
            openInterest: latestSnapshot.openInterest,
            lastPrice: latestSnapshot.lastPrice,
            impliedProb: latestSnapshot.impliedProb,
            status: latestSnapshot.status,
            capturedAt: latestSnapshot.capturedAt.toISOString(),
          }
        : null,
      orderbook: latestOrderbook
        ? {
            yesBids: latestOrderbook.yesBids,
            noBids: latestOrderbook.noBids,
            bestYesBid: latestOrderbook.bestYesBid,
            bestNoBid: latestOrderbook.bestNoBid,
            spread: latestOrderbook.spread,
            midpoint: latestOrderbook.midpoint,
            capturedAt: latestOrderbook.capturedAt.toISOString(),
          }
        : null,
      probability: latestProbRun
        ? {
            currentLevel: latestProbRun.currentLevel,
            strike: latestProbRun.strike,
            strikeDirection: latestProbRun.strikeDirection,
            probabilityAbove: latestProbRun.probabilityAbove,
            probabilityBelow: latestProbRun.probabilityBelow,
            modelType: latestProbRun.modelType,
            confidenceScore: latestProbRun.confidenceScore,
            modelEdge: latestProbRun.modelEdge,
            kalshiImpliedProb: latestProbRun.kalshiImpliedProb,
            annualizedVol: latestProbRun.annualizedVol,
            oneSigmaMove: latestProbRun.oneSigmaMove,
            expectedPriceAtExpiry: latestProbRun.expectedPriceAtExpiry,
            daysToExpiry: latestProbRun.daysToExpiry,
            percentileBands: latestProbRun.percentileBands,
            scenarioTable: latestProbRun.scenarioTable,
            runAt: latestProbRun.runAt.toISOString(),
          }
        : null,
      // Last 60 probability model runs — used for the backtest chart in the Trading tab
      probHistory: probHistory.map((r) => ({
        runAt: r.runAt.toISOString(),
        modelType: r.modelType,
        currentLevel: r.currentLevel,
        strike: r.strike,
        strikeDirection: r.strikeDirection,
        probabilityAbove: r.probabilityAbove,
        probabilityBelow: r.probabilityBelow,
        kalshiImpliedProb: r.kalshiImpliedProb,
        modelEdge: r.modelEdge,
        confidenceScore: r.confidenceScore,
        annualizedVol: r.annualizedVol,
        oneSigmaMove: r.oneSigmaMove,
        daysToExpiry: r.daysToExpiry,
      })),
      mapping: market.mapping
        ? {
            bezelSlug: mappingConfig?.bezelSlug ?? bezelSlug ?? market.mapping.kalshiTicker,
            bezelUrl: mappingConfig?.bezelUrl ?? market.mapping.bezelEntity?.bezelUrl ?? null,
            bezelEntityType: mappingConfig?.bezelEntityType ?? market.mapping.bezelEntity?.entityType ?? null,
            brand: mappingConfig?.brand ?? market.mapping.bezelEntity?.brand ?? null,
            strikeValue: market.mapping.strikeValue ?? mappingConfig?.strikeValue ?? null,
            strikeDirection: market.mapping.strikeDirection ?? mappingConfig?.strikeDirection ?? null,
            notes: market.mapping.notes,
            bezelDataAt,
          }
        : null,
      logs: marketLogs.map((log) => ({
        id: log.id,
        timestamp: log.startedAt.toISOString(),
        jobName: log.jobName,
        status: log.status,
        source: log.sourceType,
        recordsProcessed: log.recordsWritten,
        errorMessage: log.errorMessage,
        durationMs:
          log.finishedAt
            ? log.finishedAt.getTime() - log.startedAt.getTime()
            : null,
      })),
    };

    return NextResponse.json(
      {
        data: responseData,
        meta: {
          timestamp: new Date().toISOString(),
          responseTimeMs: Date.now() - start,
        },
      },
      {
        headers: { 'X-Response-Time': `${Date.now() - start}ms` },
      },
    );
  } catch (err) {
    logger.error(`GET /api/kalshi/market/${ticker} failed`, { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
