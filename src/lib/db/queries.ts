/**
 * Database query helpers — all Prisma operations for the Bezel-Kalshi dashboard.
 * Wraps prisma calls with typed inputs/outputs aligned to the schema.
 */
import prisma from '@/lib/db';
import type { KalshiNormalizedMarket } from '@/types';
import type { BezelNormalizedPrice } from '@/lib/bezel/types';

// ---------------------------------------------------------------------------
// KalshiMarket
// ---------------------------------------------------------------------------

export async function upsertKalshiMarket(normalized: KalshiNormalizedMarket) {
  return prisma.kalshiMarket.upsert({
    where: { ticker: normalized.ticker },
    update: {
      eventTicker: normalized.eventTicker,
      seriesTicker: normalized.seriesTicker,
      title: normalized.title,
      subtitle: normalized.subtitle,
      status: normalized.status,
      expirationDate: normalized.expirationDate,
      closeDate: normalized.closeDate,
      rulesText: normalized.rulesText,
      resolvedStrike: normalized.resolvedStrike,
      strikeDirection: normalized.strikeDirection,
      strikeCondition: normalized.strikeCondition,
      kalshiUrl: normalized.kalshiUrl,
    },
    create: {
      ticker: normalized.ticker,
      eventTicker: normalized.eventTicker,
      seriesTicker: normalized.seriesTicker,
      title: normalized.title,
      subtitle: normalized.subtitle,
      status: normalized.status,
      expirationDate: normalized.expirationDate,
      closeDate: normalized.closeDate,
      rulesText: normalized.rulesText,
      resolvedStrike: normalized.resolvedStrike,
      strikeDirection: normalized.strikeDirection,
      strikeCondition: normalized.strikeCondition,
      kalshiUrl: normalized.kalshiUrl,
    },
  });
}

export async function getAllKalshiMarkets() {
  return prisma.kalshiMarket.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      mapping: {
        include: { bezelEntity: true },
      },
      snapshots: {
        orderBy: { capturedAt: 'desc' },
        take: 1,
      },
    },
  });
}

export async function getKalshiMarketByTicker(ticker: string) {
  return prisma.kalshiMarket.findUnique({
    where: { ticker },
    include: {
      mapping: {
        include: { bezelEntity: true },
      },
      snapshots: {
        orderBy: { capturedAt: 'desc' },
        take: 1,
      },
      orderbookSnaps: {
        orderBy: { capturedAt: 'desc' },
        take: 1,
      },
      probabilityRuns: {
        orderBy: { runAt: 'desc' },
        take: 1,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// KalshiMarketSnapshot
// ---------------------------------------------------------------------------

export interface KalshiSnapshotData {
  yesPrice: number;
  noPrice: number;
  volume: number;
  openInterest: number | null;
  lastPrice: number | null;
  impliedProb: number;
  status: string;
}

export async function appendKalshiSnapshot(marketId: string, data: KalshiSnapshotData) {
  return prisma.kalshiMarketSnapshot.create({
    data: {
      marketId,
      yesPrice: data.yesPrice,
      noPrice: data.noPrice,
      volume: data.volume,
      openInterest: data.openInterest,
      lastPrice: data.lastPrice,
      impliedProb: data.impliedProb,
      status: data.status,
    },
  });
}

export async function getLatestKalshiSnapshot(marketId: string) {
  return prisma.kalshiMarketSnapshot.findFirst({
    where: { marketId },
    orderBy: { capturedAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// KalshiOrderbookSnapshot
// ---------------------------------------------------------------------------

export interface OrderbookSnapshotData {
  yesBids: unknown;
  noBids: unknown;
  bestYesBid: number | null;
  bestNoBid: number | null;
  spread: number | null;
  midpoint: number | null;
}

export async function appendOrderbookSnapshot(marketId: string, data: OrderbookSnapshotData) {
  return prisma.kalshiOrderbookSnapshot.create({
    data: {
      marketId,
      yesBids: data.yesBids as never,
      noBids: data.noBids as never,
      bestYesBid: data.bestYesBid,
      bestNoBid: data.bestNoBid,
      spread: data.spread,
      midpoint: data.midpoint,
    },
  });
}

export async function getLatestOrderbookSnapshot(marketId: string) {
  return prisma.kalshiOrderbookSnapshot.findFirst({
    where: { marketId },
    orderBy: { capturedAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// BezelEntity
// ---------------------------------------------------------------------------

export async function upsertBezelEntity(data: {
  slug: string;
  entityType: string;
  name: string;
  brand: string | null;
  referenceNumber: string | null;
  bezelUrl: string;
}) {
  return prisma.bezelEntity.upsert({
    where: { slug: data.slug },
    update: {
      name: data.name,
      brand: data.brand,
      referenceNumber: data.referenceNumber,
      bezelUrl: data.bezelUrl,
    },
    create: {
      slug: data.slug,
      entityType: data.entityType,
      name: data.name,
      brand: data.brand,
      referenceNumber: data.referenceNumber,
      bezelUrl: data.bezelUrl,
    },
  });
}

export async function getBezelEntityBySlug(slug: string) {
  return prisma.bezelEntity.findUnique({
    where: { slug },
    include: {
      priceSnapshots: {
        orderBy: { capturedAt: 'desc' },
        take: 7,
      },
    },
  });
}

export async function getAllBezelEntities() {
  return prisma.bezelEntity.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      priceSnapshots: {
        orderBy: { capturedAt: 'desc' },
        take: 1,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// BezelPriceSnapshot
// ---------------------------------------------------------------------------

export async function appendBezelPriceSnapshot(entityId: string, normalized: BezelNormalizedPrice) {
  return prisma.bezelPriceSnapshot.create({
    data: {
      entityId,
      price: normalized.price,
      dailyChange: normalized.dailyChange,
      dailyChangePct: normalized.dailyChangePct,
      volume: normalized.volume,
      dataSourceQuality: normalized.dataSourceQuality,
      rawPayload: normalized.rawPayload as never,
    },
  });
}

export async function getBezelPriceHistory(
  entityId: string,
  opts: { limit?: number; since?: Date } = {},
): Promise<{ capturedAt: Date; price: number; dailyChange: number | null; dailyChangePct: number | null; dataSourceQuality: string }[]> {
  return prisma.bezelPriceSnapshot.findMany({
    where: {
      entityId,
      ...(opts.since ? { capturedAt: { gte: opts.since } } : {}),
    },
    orderBy: { capturedAt: 'asc' },
    take: opts.limit,
    select: {
      capturedAt: true,
      price: true,
      dailyChange: true,
      dailyChangePct: true,
      dataSourceQuality: true,
    },
  });
}

export async function getLatestBezelPriceSnapshot(entityId: string) {
  return prisma.bezelPriceSnapshot.findFirst({
    where: { entityId },
    orderBy: { capturedAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// MarketMapping
// ---------------------------------------------------------------------------

export async function upsertMarketMapping(data: {
  kalshiTicker: string;
  kalshiMarketId: string;
  bezelEntityId: string;
  strikeValue: number | null;
  strikeDirection: string | null;
  notes: string | null;
}) {
  return prisma.marketMapping.upsert({
    where: { kalshiTicker: data.kalshiTicker },
    update: {
      kalshiMarketId: data.kalshiMarketId,
      bezelEntityId: data.bezelEntityId,
      strikeValue: data.strikeValue,
      strikeDirection: data.strikeDirection,
      notes: data.notes,
    },
    create: {
      kalshiTicker: data.kalshiTicker,
      kalshiMarketId: data.kalshiMarketId,
      bezelEntityId: data.bezelEntityId,
      strikeValue: data.strikeValue,
      strikeDirection: data.strikeDirection,
      notes: data.notes,
    },
  });
}

export async function getMarketMappingByTicker(kalshiTicker: string) {
  return prisma.marketMapping.findUnique({
    where: { kalshiTicker },
    include: {
      kalshiMarket: true,
      bezelEntity: true,
    },
  });
}

// ---------------------------------------------------------------------------
// ProbabilityRun
// ---------------------------------------------------------------------------

export interface ProbabilityRunData {
  marketId: string;
  mappingId?: string;
  currentLevel: number;
  strike: number;
  strikeDirection: string;
  daysToExpiry: number;
  volWindow: number;
  realizedVol: number;
  annualizedVol: number;
  probabilityAbove: number;
  probabilityBelow: number;
  expectedPriceAtExpiry: number;
  oneSigmaMove: number;
  kalshiImpliedProb: number | null;
  modelEdge: number | null;
  confidenceScore: number | null;
  modelType: string;
  mcPaths: number | null;
  percentileBands: unknown;
  scenarioTable: unknown;
  inputParams: unknown;
}

export async function appendProbabilityRun(data: ProbabilityRunData) {
  return prisma.probabilityRun.create({
    data: {
      marketId: data.marketId,
      mappingId: data.mappingId,
      currentLevel: data.currentLevel,
      strike: data.strike,
      strikeDirection: data.strikeDirection,
      daysToExpiry: data.daysToExpiry,
      volWindow: data.volWindow,
      realizedVol: data.realizedVol,
      annualizedVol: data.annualizedVol,
      probabilityAbove: data.probabilityAbove,
      probabilityBelow: data.probabilityBelow,
      expectedPriceAtExpiry: data.expectedPriceAtExpiry,
      oneSigmaMove: data.oneSigmaMove,
      kalshiImpliedProb: data.kalshiImpliedProb,
      modelEdge: data.modelEdge,
      confidenceScore: data.confidenceScore,
      modelType: data.modelType,
      mcPaths: data.mcPaths,
      percentileBands: data.percentileBands as never,
      scenarioTable: data.scenarioTable as never,
      inputParams: data.inputParams as never,
    },
  });
}

export async function getLatestProbabilityRun(marketId: string) {
  return prisma.probabilityRun.findFirst({
    where: { marketId },
    orderBy: { runAt: 'desc' },
  });
}

export async function getAllLatestProbabilityRuns() {
  // Get the most recent run for each market using a subquery approach
  const allMarkets = await prisma.kalshiMarket.findMany({
    select: { id: true },
  });

  const runs = await Promise.all(
    allMarkets.map((m) =>
      prisma.probabilityRun.findFirst({
        where: { marketId: m.id },
        orderBy: { runAt: 'desc' },
      }),
    ),
  );

  return runs.filter((r): r is NonNullable<typeof r> => r !== null);
}

// ---------------------------------------------------------------------------
// CorrelationMetric
// ---------------------------------------------------------------------------

export interface CorrelationMetricData {
  entity1Id: string;
  entity2Id: string;
  entity1Type: string;
  entity2Type: string;
  lookbackDays: number;
  correlation: number;
  lagDays: number;
  regime: string | null;
  sampleSize: number;
}

export async function appendCorrelationMetrics(metrics: CorrelationMetricData[]) {
  return prisma.correlationMetric.createMany({
    data: metrics.map((m) => ({
      entity1Id: m.entity1Id,
      entity2Id: m.entity2Id,
      entity1Type: m.entity1Type,
      entity2Type: m.entity2Type,
      lookbackDays: m.lookbackDays,
      correlation: m.correlation,
      lagDays: m.lagDays,
      regime: m.regime,
      sampleSize: m.sampleSize,
    })),
  });
}

export async function getCorrelationMetrics(opts: {
  lookbackDays?: number;
  limit?: number;
} = {}) {
  return prisma.correlationMetric.findMany({
    where: opts.lookbackDays ? { lookbackDays: opts.lookbackDays } : undefined,
    orderBy: { computedAt: 'desc' },
    take: opts.limit ?? 500,
  });
}

export async function getLatestCorrelationMetrics(lookbackDays?: number) {
  // Get the most recent batch by finding the latest computedAt
  const latest = await prisma.correlationMetric.findFirst({
    orderBy: { computedAt: 'desc' },
    where: lookbackDays ? { lookbackDays } : undefined,
  });

  if (!latest) return [];

  // Return all metrics from the same batch (within 1 minute of the latest)
  const batchStart = new Date(latest.computedAt.getTime() - 60_000);
  return prisma.correlationMetric.findMany({
    where: {
      computedAt: { gte: batchStart },
      ...(lookbackDays ? { lookbackDays } : {}),
    },
    orderBy: [{ entity1Id: 'asc' }, { entity2Id: 'asc' }],
  });
}

// ---------------------------------------------------------------------------
// IngestionLog
// ---------------------------------------------------------------------------

export async function startIngestionLog(
  jobName: string,
  sourceType: string,
  entityId?: string,
  entityTicker?: string,
) {
  return prisma.ingestionLog.create({
    data: {
      jobName,
      sourceType,
      entityId,
      entityTicker,
      status: 'running',
    },
  });
}

export async function finishIngestionLog(
  id: string,
  status: 'success' | 'partial' | 'failed',
  recordsWritten: number,
  errorMessage?: string,
) {
  return prisma.ingestionLog.update({
    where: { id },
    data: {
      status,
      finishedAt: new Date(),
      recordsWritten,
      errorMessage: errorMessage ?? null,
    },
  });
}

export async function getIngestionLogs(opts: {
  limit?: number;
  jobName?: string;
  status?: string;
} = {}) {
  return prisma.ingestionLog.findMany({
    where: {
      ...(opts.jobName ? { jobName: opts.jobName } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: opts.limit ?? 50,
  });
}
