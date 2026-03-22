/**
 * Database query layer — all typed Prisma helpers for the Bezel-Kalshi dashboard.
 *
 * Conventions:
 *  - All functions are async and use await (no raw promise chains).
 *  - Write helpers: upsert*, append*, update*, start*, finish*.
 *  - Read helpers:  get*, getAll*, getLatest*, getRecent*.
 *  - Unexpected DB errors bubble up so the caller can log them via IngestionLog.
 *  - "Not found" cases return null / [] rather than throwing.
 *  - Input types are defined inline or as named interfaces in this file.
 *
 * Import the prisma singleton from '@/lib/db'; never construct PrismaClient here.
 */

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type {
  KalshiMarket,
  KalshiMarketSnapshot,
  KalshiOrderbookSnapshot,
  BezelEntity,
  BezelPriceSnapshot,
  MarketMapping,
  ProbabilityRun,
  CorrelationMetric,
  IngestionLog,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Re-export Prisma model types for convenient use by callers
// ---------------------------------------------------------------------------

export type {
  KalshiMarket,
  KalshiMarketSnapshot,
  KalshiOrderbookSnapshot,
  BezelEntity,
  BezelPriceSnapshot,
  MarketMapping,
  ProbabilityRun,
  CorrelationMetric,
  IngestionLog,
};

// ===========================================================================
// KalshiMarket — input types
// ===========================================================================

/**
 * Normalised market record built from the Kalshi API response.
 * Used as the input to upsertKalshiMarket.
 */
export interface KalshiNormalizedMarket {
  ticker: string;
  eventTicker?: string | null;
  seriesTicker?: string | null;
  title: string;
  subtitle?: string | null;
  status?: string;
  expirationDate?: Date | null;
  closeDate?: Date | null;
  rulesText?: string | null;
  resolvedStrike?: number | null;
  strikeDirection?: string | null;
  strikeCondition?: string | null;
  kalshiUrl: string;
}

/** Input for appending a KalshiMarketSnapshot row. */
export interface KalshiSnapshotData {
  yesBid?: number | null;
  yesAsk?: number | null;
  yesPrice: number;
  noPrice: number;
  volume: number;
  openInterest?: number | null;
  lastPrice?: number | null;
  impliedProb: number;
  status: string;
}

/** Input for appending a KalshiOrderbookSnapshot row. */
export interface OrderbookSnapshotData {
  yesBids: Prisma.InputJsonValue;
  noBids: Prisma.InputJsonValue;
  bestYesBid?: number | null;
  bestNoBid?: number | null;
  spread?: number | null;
  midpoint?: number | null;
}

// ===========================================================================
// KalshiMarket queries
// ===========================================================================

/**
 * Upsert a KalshiMarket row. Matches on the unique `ticker` field.
 * Creates a new row on first encounter; updates all mutable fields on
 * subsequent calls (status, prices, dates, etc.).
 *
 * @param data - Normalised market data from the Kalshi API
 */
export async function upsertKalshiMarket(
  data: KalshiNormalizedMarket,
): Promise<KalshiMarket> {
  const shared: Omit<Prisma.KalshiMarketCreateInput, 'ticker'> = {
    eventTicker: data.eventTicker ?? null,
    seriesTicker: data.seriesTicker ?? null,
    title: data.title,
    subtitle: data.subtitle ?? null,
    status: data.status ?? 'open',
    expirationDate: data.expirationDate ?? null,
    closeDate: data.closeDate ?? null,
    rulesText: data.rulesText ?? null,
    resolvedStrike: data.resolvedStrike ?? null,
    strikeDirection: data.strikeDirection ?? null,
    strikeCondition: data.strikeCondition ?? null,
    kalshiUrl: data.kalshiUrl,
  };

  return prisma.kalshiMarket.upsert({
    where: { ticker: data.ticker },
    create: { ticker: data.ticker, ...shared },
    update: shared,
  });
}

/**
 * Append a point-in-time price/volume snapshot for a Kalshi market.
 *
 * @param marketId - KalshiMarket primary key (cuid)
 * @param data     - Snapshot values from the latest API poll
 */
export async function appendKalshiSnapshot(
  marketId: string,
  data: KalshiSnapshotData,
): Promise<KalshiMarketSnapshot> {
  return prisma.kalshiMarketSnapshot.create({
    data: {
      marketId,
      yesBid: data.yesBid ?? null,
      yesAsk: data.yesAsk ?? null,
      yesPrice: data.yesPrice,
      noPrice: data.noPrice,
      volume: data.volume,
      openInterest: data.openInterest ?? null,
      lastPrice: data.lastPrice ?? null,
      impliedProb: data.impliedProb,
      status: data.status,
    },
  });
}

/**
 * Append a point-in-time orderbook depth snapshot for a Kalshi market.
 *
 * @param marketId - KalshiMarket primary key (cuid)
 * @param data     - Orderbook depth data (bid arrays stored as JSON)
 */
export async function appendOrderbookSnapshot(
  marketId: string,
  data: OrderbookSnapshotData,
): Promise<KalshiOrderbookSnapshot> {
  return prisma.kalshiOrderbookSnapshot.create({
    data: {
      marketId,
      yesBids: data.yesBids,
      noBids: data.noBids,
      bestYesBid: data.bestYesBid ?? null,
      bestNoBid: data.bestNoBid ?? null,
      spread: data.spread ?? null,
      midpoint: data.midpoint ?? null,
    },
  });
}

/**
 * Retrieve the most recent KalshiMarketSnapshot for a market identified
 * by its Kalshi ticker string (e.g. "KXROLEX-MAR").
 *
 * Returns null when the market does not exist or has no snapshots yet.
 *
 * @param ticker - Kalshi market ticker
 */
export async function getLatestKalshiSnapshot(
  ticker: string,
): Promise<KalshiMarketSnapshot | null> {
  const market = await prisma.kalshiMarket.findUnique({
    where: { ticker },
    select: { id: true },
  });
  if (!market) return null;

  return prisma.kalshiMarketSnapshot.findFirst({
    where: { marketId: market.id },
    orderBy: { capturedAt: 'desc' },
  });
}

/**
 * Retrieve a time-series of KalshiMarketSnapshots for a given ticker.
 * Results are ordered newest-first.
 *
 * @param ticker - Kalshi market ticker
 * @param limit  - Maximum rows to return (default 100)
 */
export async function getKalshiSnapshotHistory(
  ticker: string,
  limit = 100,
): Promise<KalshiMarketSnapshot[]> {
  const market = await prisma.kalshiMarket.findUnique({
    where: { ticker },
    select: { id: true },
  });
  if (!market) return [];

  return prisma.kalshiMarketSnapshot.findMany({
    where: { marketId: market.id },
    orderBy: { capturedAt: 'desc' },
    take: limit,
  });
}

/**
 * Retrieve a single KalshiMarket with its latest snapshot, including the full
 * detail data (orderbook, probability runs, mapping).
 *
 * @param ticker - Kalshi market ticker
 */
export async function getKalshiMarketByTicker(
  ticker: string,
): Promise<
  | (KalshiMarket & {
      mapping: (MarketMapping & { bezelEntity: BezelEntity }) | null;
      snapshots: KalshiMarketSnapshot[];
      orderbookSnaps: KalshiOrderbookSnapshot[];
      probabilityRuns: ProbabilityRun[];
    })
  | null
> {
  return prisma.kalshiMarket.findUnique({
    where: { ticker },
    include: {
      mapping: { include: { bezelEntity: true } },
      snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 },
      orderbookSnaps: { orderBy: { capturedAt: 'desc' }, take: 1 },
      probabilityRuns: { orderBy: { runAt: 'desc' }, take: 1 },
    },
  });
}

/**
 * Retrieve all KalshiMarket rows with their MarketMapping (including the
 * linked BezelEntity) and the single most recent KalshiMarketSnapshot each.
 *
 * Used by the dashboard API route to populate the market table.
 *
 * Return type is explicit so callers get full TypeScript inference without
 * having to import Prisma's deep nested types separately.
 */
export async function getAllKalshiMarkets(): Promise<
  Array<
    KalshiMarket & {
      mapping: (MarketMapping & { bezelEntity: BezelEntity }) | null;
      snapshots: KalshiMarketSnapshot[];
    }
  >
> {
  return prisma.kalshiMarket.findMany({
    include: {
      mapping: { include: { bezelEntity: true } },
      snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

// ===========================================================================
// BezelEntity — input types
// ===========================================================================

/** Input for getOrCreateBezelEntity (upsert on slug). */
export interface BezelEntityInput {
  entityType: string;
  name: string;
  brand?: string | null;
  referenceNumber?: string | null;
  bezelUrl: string;
  discoveredEndpoint?: string | null;
  scraperConfig?: Prisma.InputJsonValue | null;
}

/** Input for appendBezelPriceSnapshot. */
export interface BezelPriceSnapshotInput {
  price: number;
  dailyChange?: number | null;
  dailyChangePct?: number | null;
  volume?: number | null;
  dataSourceQuality: string;
  rawPayload?: Prisma.InputJsonValue | null;
}

// ===========================================================================
// BezelEntity queries
// ===========================================================================

/**
 * Upsert a BezelEntity record. Matches on the unique `slug` field.
 * Creates on first encounter; updates mutable fields (name, URL, endpoint, etc.)
 * on subsequent calls.
 *
 * @param slug - URL-safe slug, e.g. "cartier-index" or "rolex-submariner-date-41-starbucks"
 * @param data - Entity metadata to create/update
 */
export async function getOrCreateBezelEntity(
  slug: string,
  data: BezelEntityInput,
): Promise<BezelEntity> {
  const shared = {
    entityType: data.entityType,
    name: data.name,
    brand: data.brand ?? null,
    referenceNumber: data.referenceNumber ?? null,
    bezelUrl: data.bezelUrl,
    discoveredEndpoint: data.discoveredEndpoint ?? null,
    scraperConfig: data.scraperConfig ?? Prisma.JsonNull,
  };

  return prisma.bezelEntity.upsert({
    where: { slug },
    create: { slug, ...shared },
    update: shared,
  });
}

/**
 * Legacy alias for getOrCreateBezelEntity with a flat data signature.
 * Retained so existing callers (seed, jobs) don't need immediate updates.
 *
 * @deprecated Prefer getOrCreateBezelEntity.
 */
export async function upsertBezelEntity(data: {
  slug: string;
  entityType: string;
  name: string;
  brand: string | null;
  referenceNumber: string | null;
  bezelUrl: string;
}): Promise<BezelEntity> {
  return prisma.bezelEntity.upsert({
    where: { slug: data.slug },
    create: {
      slug: data.slug,
      entityType: data.entityType,
      name: data.name,
      brand: data.brand,
      referenceNumber: data.referenceNumber,
      bezelUrl: data.bezelUrl,
    },
    update: {
      name: data.name,
      brand: data.brand,
      referenceNumber: data.referenceNumber,
      bezelUrl: data.bezelUrl,
    },
  });
}

/**
 * Insert a single BezelPriceSnapshot with an explicit timestamp.
 * Used by backfill jobs to insert historical data points at their original
 * timestamps rather than the current wall-clock time.
 *
 * Deduplication: skips the insert when an existing snapshot for this entity
 * already exists within ±6 hours of `capturedAt` to prevent duplicate rows on
 * repeated backfill runs.
 *
 * @param entityId  - BezelEntity primary key (cuid)
 * @param capturedAt - Timestamp of the historical data point
 * @param data       - Price data from the Bezel history API
 * @returns The created snapshot, or null when a duplicate was detected.
 */
export async function insertBezelPriceSnapshotAtTime(
  entityId: string,
  capturedAt: Date,
  data: BezelPriceSnapshotInput,
): Promise<BezelPriceSnapshot | null> {
  // Check for existing snapshot within ±6 h of this timestamp
  const windowMs = 6 * 60 * 60 * 1000;
  const existing = await prisma.bezelPriceSnapshot.findFirst({
    where: {
      entityId,
      capturedAt: {
        gte: new Date(capturedAt.getTime() - windowMs),
        lte: new Date(capturedAt.getTime() + windowMs),
      },
    },
    select: { id: true },
  });

  if (existing) return null; // duplicate — skip

  return prisma.bezelPriceSnapshot.create({
    data: {
      entityId,
      capturedAt,
      price: data.price,
      dailyChange: data.dailyChange ?? null,
      dailyChangePct: data.dailyChangePct ?? null,
      volume: data.volume ?? null,
      dataSourceQuality: data.dataSourceQuality,
      rawPayload: data.rawPayload ?? Prisma.JsonNull,
    },
  });
}

/**
 * Append a price snapshot for a BezelEntity.
 *
 * @param entityId - BezelEntity primary key (cuid)
 * @param data     - Price data captured from the Bezel data source
 */
export async function appendBezelPriceSnapshot(
  entityId: string,
  data: BezelPriceSnapshotInput,
): Promise<BezelPriceSnapshot> {
  return prisma.bezelPriceSnapshot.create({
    data: {
      entityId,
      price: data.price,
      dailyChange: data.dailyChange ?? null,
      dailyChangePct: data.dailyChangePct ?? null,
      volume: data.volume ?? null,
      dataSourceQuality: data.dataSourceQuality,
      rawPayload: data.rawPayload ?? Prisma.JsonNull,
    },
  });
}

/**
 * Retrieve the most recent BezelPriceSnapshot for an entity identified
 * by its slug. Performs a join through BezelEntity.
 *
 * Returns null when the entity doesn't exist or has no snapshots yet.
 *
 * @param slug - Entity slug, e.g. "rolex-index"
 */
export async function getLatestBezelPrice(
  slug: string,
): Promise<BezelPriceSnapshot | null> {
  const entity = await prisma.bezelEntity.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!entity) return null;

  return prisma.bezelPriceSnapshot.findFirst({
    where: { entityId: entity.id },
    orderBy: { capturedAt: 'desc' },
  });
}

/**
 * Retrieve price history for a BezelEntity identified by slug.
 * Returns the most recent `limit` snapshots, ordered oldest-first (ascending
 * capturedAt) for chart rendering. Zero-price fallback snapshots are excluded.
 *
 * @param slug  - Entity slug
 * @param limit - Maximum rows returned (default 500)
 * @param since - Optional lower-bound filter: only rows with capturedAt >= since
 */
export async function getBezelPriceHistory(
  slug: string,
  limit = 500,
  since?: Date,
): Promise<BezelPriceSnapshot[]> {
  const entity = await prisma.bezelEntity.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!entity) return [];

  // Fetch the most recent `limit` rows (DESC), then reverse for chart order (ASC).
  // Exclude price=0 fallback rows inserted when a fetch fails.
  const rows = await prisma.bezelPriceSnapshot.findMany({
    where: {
      entityId: entity.id,
      price: { gt: 0 },
      ...(since ? { capturedAt: { gte: since } } : {}),
    },
    orderBy: { capturedAt: 'desc' },
    take: limit,
  });

  return rows.reverse(); // oldest → newest, ready for chart rendering
}

/**
 * Retrieve the latest snapshot for an entity by its primary key (cuid).
 * Used internally by ingestion jobs that already hold the entityId.
 *
 * @param entityId - BezelEntity primary key (cuid)
 */
export async function getLatestBezelPriceSnapshot(
  entityId: string,
): Promise<BezelPriceSnapshot | null> {
  return prisma.bezelPriceSnapshot.findFirst({
    where: { entityId },
    orderBy: { capturedAt: 'desc' },
  });
}

/**
 * Retrieve a single BezelEntity by slug, including its 7 most recent
 * price snapshots. Useful for the model detail API route.
 *
 * @param slug - Entity slug
 */
export async function getBezelEntityBySlug(
  slug: string,
): Promise<(BezelEntity & { priceSnapshots: BezelPriceSnapshot[] }) | null> {
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

/**
 * Retrieve all BezelEntity rows, ordered alphabetically by name.
 */
export async function getAllBezelEntities(): Promise<BezelEntity[]> {
  return prisma.bezelEntity.findMany({
    orderBy: { name: 'asc' },
  });
}

/**
 * Update the `discoveredEndpoint` field on a BezelEntity.
 * Called by the ingestion layer when XHR discovery finds a new API URL.
 *
 * @param slug     - Entity slug
 * @param endpoint - Discovered endpoint URL to persist
 */
export async function updateBezelEntityEndpoint(
  slug: string,
  endpoint: string,
): Promise<BezelEntity> {
  return prisma.bezelEntity.update({
    where: { slug },
    data: { discoveredEndpoint: endpoint },
  });
}

// ===========================================================================
// Mapping queries
// ===========================================================================

/** Input for upsertMarketMapping. */
export interface MarketMappingInput {
  kalshiTicker: string;
  kalshiMarketId: string;
  bezelEntityId: string;
  strikeValue?: number | null;
  strikeDirection?: string | null;
  strikeParsedFrom?: string | null;
  notes?: string | null;
}

/**
 * Upsert a MarketMapping row. Matches on unique `kalshiTicker`.
 *
 * @param data - Mapping data linking a Kalshi market to a Bezel entity
 */
export async function upsertMarketMapping(
  data: MarketMappingInput,
): Promise<MarketMapping> {
  const shared = {
    kalshiMarketId: data.kalshiMarketId,
    bezelEntityId: data.bezelEntityId,
    strikeValue: data.strikeValue ?? null,
    strikeDirection: data.strikeDirection ?? null,
    strikeParsedFrom: data.strikeParsedFrom ?? null,
    notes: data.notes ?? null,
  };

  return prisma.marketMapping.upsert({
    where: { kalshiTicker: data.kalshiTicker },
    create: { kalshiTicker: data.kalshiTicker, ...shared },
    update: shared,
  });
}

/**
 * Retrieve the MarketMapping for a given Kalshi ticker, including the linked
 * BezelEntity.
 *
 * Returns null when no mapping exists for the ticker.
 *
 * @param kalshiTicker - e.g. "KXCARTIER-MAR"
 */
export async function getMarketMapping(
  kalshiTicker: string,
): Promise<(MarketMapping & { bezelEntity: BezelEntity }) | null> {
  return prisma.marketMapping.findUnique({
    where: { kalshiTicker },
    include: { bezelEntity: true },
  });
}

/**
 * Retrieve the MarketMapping for a Kalshi ticker, including both the
 * KalshiMarket and BezelEntity. Legacy signature used by seed / jobs.
 *
 * @param kalshiTicker - Kalshi ticker string
 */
export async function getMarketMappingByTicker(
  kalshiTicker: string,
): Promise<
  | (MarketMapping & { kalshiMarket: KalshiMarket; bezelEntity: BezelEntity })
  | null
> {
  return prisma.marketMapping.findUnique({
    where: { kalshiTicker },
    include: { kalshiMarket: true, bezelEntity: true },
  });
}

/**
 * Retrieve all MarketMapping rows with both sides of the join included.
 * Ordered by Kalshi ticker ascending.
 */
export async function getAllMappings(): Promise<
  Array<MarketMapping & { kalshiMarket: KalshiMarket; bezelEntity: BezelEntity }>
> {
  return prisma.marketMapping.findMany({
    include: {
      kalshiMarket: true,
      bezelEntity: true,
    },
    orderBy: { kalshiTicker: 'asc' },
  });
}

// ===========================================================================
// ProbabilityRun — input type
// ===========================================================================

/** Input for appendProbabilityRun. All required columns plus nullable optionals. */
export interface ProbabilityRunData {
  marketId: string;
  mappingId?: string | null;
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
  kalshiImpliedProb?: number | null;
  modelEdge?: number | null;
  confidenceScore?: number | null;
  modelType: string;
  mcPaths?: number | null;
  percentileBands?: Prisma.InputJsonValue | null;
  scenarioTable?: Prisma.InputJsonValue | null;
  inputParams: Prisma.InputJsonValue;
}

// ===========================================================================
// ProbabilityRun queries
// ===========================================================================

/**
 * Persist the output of a probability model run.
 *
 * @param data - All required and optional probability run fields
 */
export async function appendProbabilityRun(
  data: ProbabilityRunData,
): Promise<ProbabilityRun> {
  return prisma.probabilityRun.create({
    data: {
      marketId: data.marketId,
      mappingId: data.mappingId ?? null,
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
      kalshiImpliedProb: data.kalshiImpliedProb ?? null,
      modelEdge: data.modelEdge ?? null,
      confidenceScore: data.confidenceScore ?? null,
      modelType: data.modelType,
      mcPaths: data.mcPaths ?? null,
      percentileBands: data.percentileBands ?? Prisma.JsonNull,
      scenarioTable: data.scenarioTable ?? Prisma.JsonNull,
      inputParams: data.inputParams,
    },
  });
}

/**
 * Retrieve the most recent ProbabilityRun for a given Kalshi market.
 *
 * @param marketId - KalshiMarket primary key (cuid)
 */
export async function getLatestProbabilityRun(
  marketId: string,
): Promise<ProbabilityRun | null> {
  return prisma.probabilityRun.findFirst({
    where: { marketId },
    orderBy: { runAt: 'desc' },
  });
}

/**
 * Retrieve recent ProbabilityRun rows for a Kalshi market, newest-first.
 *
 * @param marketId - KalshiMarket primary key (cuid)
 * @param limit    - Maximum rows returned (default 50)
 */
export async function getProbabilityHistory(
  marketId: string,
  limit = 50,
): Promise<ProbabilityRun[]> {
  return prisma.probabilityRun.findMany({
    where: { marketId },
    orderBy: { runAt: 'desc' },
    take: limit,
  });
}

/**
 * Retrieve the most recent ProbabilityRun for every KalshiMarket that has at
 * least one run. Used by the dashboard overview to display current model edges.
 */
export async function getAllLatestProbabilityRuns(): Promise<ProbabilityRun[]> {
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

  return runs.filter((r): r is ProbabilityRun => r !== null);
}

// ===========================================================================
// CorrelationMetric — input type
// ===========================================================================

/** Input for one row in appendCorrelationMetrics. */
export interface CorrelationMetricData {
  entity1Id: string;
  entity2Id: string;
  entity1Type: string;
  entity2Type: string;
  lookbackDays: number;
  correlation: number;
  lagDays?: number;
  regime?: string | null;
  sampleSize: number;
}

// ===========================================================================
// Correlation queries
// ===========================================================================

/**
 * Bulk-insert a batch of CorrelationMetric rows.
 * Each call represents one computation run; rows are timestamped automatically.
 * Uses createMany for efficiency — no upsert because each row is a new
 * time-stamped measurement.
 *
 * @param metrics - Array of metric objects to insert
 */
export async function appendCorrelationMetrics(
  metrics: CorrelationMetricData[],
): Promise<void> {
  if (metrics.length === 0) return;

  await prisma.correlationMetric.createMany({
    data: metrics.map((m) => ({
      entity1Id: m.entity1Id,
      entity2Id: m.entity2Id,
      entity1Type: m.entity1Type,
      entity2Type: m.entity2Type,
      lookbackDays: m.lookbackDays,
      correlation: m.correlation,
      lagDays: m.lagDays ?? 0,
      regime: m.regime ?? null,
      sampleSize: m.sampleSize,
    })),
  });
}

/**
 * Retrieve the most recent CorrelationMetric per unique (entity1Id, entity2Id)
 * pair, filtered to a specific `lookbackDays` window.
 *
 * Strategy: groupBy to find the latest computedAt per pair, then fetch those
 * specific rows. This avoids raw SQL while correctly handling the "latest per
 * group" requirement.
 *
 * @param lookbackDays - Must match a value stored in the DB (e.g. 30, 60, 90)
 */
export async function getCorrelationMatrix(
  lookbackDays: number,
): Promise<CorrelationMetric[]> {
  // Step 1: per (entity1Id, entity2Id) pair, find the latest computedAt
  const latestPerPair = await prisma.correlationMetric.groupBy({
    by: ['entity1Id', 'entity2Id', 'lookbackDays'],
    where: { lookbackDays },
    _max: { computedAt: true },
  });

  if (latestPerPair.length === 0) return [];

  // Step 2: build an OR filter for each unique (pair, timestamp) tuple
  const orConditions = latestPerPair
    .filter((g) => g._max.computedAt !== null)
    .map((g) => ({
      entity1Id: g.entity1Id,
      entity2Id: g.entity2Id,
      lookbackDays: g.lookbackDays,
      computedAt: g._max.computedAt as Date,
    }));

  if (orConditions.length === 0) return [];

  return prisma.correlationMetric.findMany({
    where: { lookbackDays, OR: orConditions },
    orderBy: [{ entity1Id: 'asc' }, { entity2Id: 'asc' }],
  });
}

/**
 * Retrieve all CorrelationMetric rows with an optional lookback filter.
 * Returns the most recent batch (rows within 60 s of the latest computedAt).
 *
 * @param lookbackDays - Optional lookback filter
 */
export async function getLatestCorrelationMetrics(
  lookbackDays?: number,
): Promise<CorrelationMetric[]> {
  const latest = await prisma.correlationMetric.findFirst({
    orderBy: { computedAt: 'desc' },
    where: lookbackDays ? { lookbackDays } : undefined,
  });
  if (!latest) return [];

  // Return all metrics from the same computation batch (within 1 minute)
  const batchStart = new Date(latest.computedAt.getTime() - 60_000);
  return prisma.correlationMetric.findMany({
    where: {
      computedAt: { gte: batchStart },
      ...(lookbackDays ? { lookbackDays } : {}),
    },
    orderBy: [{ entity1Id: 'asc' }, { entity2Id: 'asc' }],
  });
}

// ===========================================================================
// IngestionLog queries
// ===========================================================================

/**
 * Create an IngestionLog row with status='running' at the start of a job.
 * Call finishIngestionLog with the returned id once the job completes.
 *
 * @param jobName      - Human-readable job name, e.g. "bezel-ingestion"
 * @param sourceType   - Data source category, e.g. "bezel" | "kalshi"
 * @param entityId     - Optional BezelEntity or KalshiMarket id being processed
 * @param entityTicker - Optional Kalshi ticker string for easier log filtering
 */
export async function startIngestionLog(
  jobName: string,
  sourceType: string,
  entityId?: string,
  entityTicker?: string,
): Promise<IngestionLog> {
  return prisma.ingestionLog.create({
    data: {
      jobName,
      sourceType,
      status: 'running',
      entityId: entityId ?? null,
      entityTicker: entityTicker ?? null,
    },
  });
}

/**
 * Update an IngestionLog row to its final state. Sets finishedAt to the
 * current timestamp. Call this after startIngestionLog in a try/finally block.
 *
 * @param id             - Primary key of the IngestionLog row
 * @param status         - Final status: 'success' | 'partial' | 'failed'
 * @param recordsWritten - Number of DB rows written during the job (optional)
 * @param errorMessage   - Error message / stack trace if the job failed (optional)
 * @param metadata       - Arbitrary JSON object for additional debugging context (optional)
 */
export async function finishIngestionLog(
  id: string,
  status: 'success' | 'partial' | 'failed',
  recordsWritten?: number,
  errorMessage?: string,
  metadata?: object,
): Promise<IngestionLog> {
  return prisma.ingestionLog.update({
    where: { id },
    data: {
      status,
      finishedAt: new Date(),
      recordsWritten: recordsWritten ?? null,
      errorMessage: errorMessage ?? null,
      metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
}

/**
 * Retrieve recent IngestionLog rows with optional filters.
 * Ordered by startedAt descending (most recent first).
 *
 * @param limit   - Maximum rows returned (default 50)
 * @param jobName - Filter to a specific job name (optional)
 * @param status  - Filter to a specific status string (optional)
 */
export async function getRecentIngestionLogs(
  limit = 50,
  jobName?: string,
  status?: string,
): Promise<IngestionLog[]> {
  return prisma.ingestionLog.findMany({
    where: {
      ...(jobName ? { jobName } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

/**
 * Legacy alias for getRecentIngestionLogs with an options-object signature.
 * Retained so existing callers do not need immediate updates.
 *
 * @deprecated Prefer getRecentIngestionLogs.
 */
export async function getIngestionLogs(
  opts: { limit?: number; jobName?: string; status?: string } = {},
): Promise<IngestionLog[]> {
  return getRecentIngestionLogs(opts.limit, opts.jobName, opts.status);
}
